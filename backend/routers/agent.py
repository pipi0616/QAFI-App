"""
Agent Router — Claude-powered clinical variant interpretation.
Rewritten with Claude Agent SDK.

对比:
  旧版 (agent_old_manual.py): ~200 行，手写 loop/重试/tool 分发
  新版 (这个文件):            ~120 行，SDK 处理 loop/重试/tool 调用

核心区别:
  旧版: client.messages.create() + while loop + if stop_reason == "tool_use"
  新版: query(prompt, options) → SDK 自动处理一切
"""

import asyncio
import json
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Annotated

from claude_agent_sdk import (
    query,
    tool,
    create_sdk_mcp_server,
    ClaudeAgentOptions,
    ResultMessage,
    AssistantMessage,
)

from ..services import qafi

router = APIRouter(prefix="/api/agent", tags=["agent"])


# ============================================================
# 第 1 步: 定义 Tools（用 @tool 装饰器）
#
# 旧版要写:
#   1. JSON schema 字典（~15行/tool）
#   2. execute_agent_tool() 里的 if-else（~5行/tool）
#
# 新版只要: 一个函数 + 装饰器
# SDK 自动从函数签名生成 JSON schema
# SDK 自动在 Agent loop 里调用对应函数
# ============================================================

@tool(
    "lookup_variant",
    "Look up prediction data for a specific variant. Returns QAFI score, classification, evidence from ClinVar, AlphaMissense, gnomAD, and PubMed.",
    {"protein_id": Annotated[str, "UniProt protein ID, e.g. Q9Y375"],
     "variant": Annotated[str, "Variant name, e.g. L117H"]},
)
async def lookup_variant_tool(args: dict) -> dict:
    result = qafi.lookup_variant(args["protein_id"], args["variant"])
    if result is None:
        return {"error": f"Variant {args['variant']} not found"}
    return result


@tool(
    "compare_variants",
    "Compare multiple variants by looking up each one. Returns scores and classifications side by side.",
    {"protein_id": Annotated[str, "UniProt protein ID"],
     "variants": Annotated[list[str], "List of variant names, e.g. ['M1A', 'L117H']"]},
)
async def compare_variants_tool(args: dict) -> dict:
    results = []
    for v in args["variants"]:
        r = qafi.lookup_variant(args["protein_id"], v)
        if r:
            results.append({
                "variant": r["variant"], "score": r["score"],
                "percentile": r["percentile"], "classification": r["classification"],
                "evidence_summary": [f"{e['feature']}: {e['value']} ({e['impact']})" for e in r["evidence"]],
            })
        else:
            results.append({"variant": v, "error": "not found"})
    return {"comparisons": results}


@tool(
    "get_position_summary",
    "Get all variants at a given position to understand position-level impact patterns.",
    {"protein_id": Annotated[str, "UniProt protein ID"],
     "position": Annotated[int, "Residue position number"]},
)
async def get_position_summary_tool(args: dict) -> dict:
    result = qafi.lookup_variant(args["protein_id"], str(args["position"]))
    if result is None:
        return {"error": f"Position {args['position']} not found"}
    return {
        "position": result["position"], "wt": result["wt"],
        "total_variants": result["position_context"]["total_variants"],
        "mean_score": result["position_context"]["mean_score"],
        "variants": result["position_context"]["variants"],
        "evidence": result["evidence"],
    }


# ============================================================
# 第 2 步: 创建 MCP Server（注册所有 tools）
#
# 旧版: AGENT_TOOLS = [{...}, {...}] 手写 JSON 列表
# 新版: create_sdk_mcp_server() 自动收集所有 @tool 函数
# ============================================================

qafi_mcp_server = create_sdk_mcp_server(
    name="qafi-tools",
    tools=[lookup_variant_tool, compare_variants_tool, get_position_summary_tool],
)


# ============================================================
# 第 3 步: 评估变异（核心 Agent 调用）
#
# 旧版:
#   for _ in range(10):           ← 手写 loop
#     for attempt in range(3):    ← 手写重试
#       response = client.messages.create(...)
#     if stop_reason == "tool_use":  ← 手写判断
#       execute_tool(...)
#       messages.append(...)      ← 手写消息管理
#
# 新版:
#   async for msg in query(prompt, options):  ← SDK 处理一切
#     if isinstance(msg, ResultMessage): ...
# ============================================================

ASSESS_SYSTEM = """You are a clinical genetics expert assistant. You have been given ALL available evidence about a protein variant. Synthesize it into a clear clinical assessment.

You MUST respond in valid JSON with this exact structure:
{
  "classification": "Likely Pathogenic | Possibly Pathogenic | Uncertain Significance (VUS) | Possibly Benign | Likely Benign",
  "confidence": "High | Moderate | Low",
  "summary": "2-3 sentence plain-language summary for a clinician",
  "evidence_for_pathogenic": ["bullet 1", ...],
  "evidence_for_benign": ["bullet 1", ...],
  "evidence_uncertain": ["bullet 1", ...],
  "acmg_criteria": ["PM2", "BP4", ...],
  "recommendation": "1-2 sentence clinical recommendation",
  "report": "A formal 1-paragraph clinical report for medical records"
}

Guidelines:
- Weigh all evidence sources. Note agreements AND conflicts between predictors.
- Use ACMG/AMP criteria codes where applicable.
- gnomAD absence = PM2. Common variant (>5%) = BA1.
- Be honest about uncertainty. Never overstate confidence.
- Respond in the same language as the user's query."""


def _build_evidence_prompt(variant_data: dict) -> str:
    """Build evidence text from variant data — same as old version."""
    lines = []
    lines.append(f"VARIANT: {variant_data.get('variant', 'N/A')}")
    lines.append(f"PROTEIN: {variant_data.get('protein_name', '')} ({variant_data.get('protein_id', '')})")
    lines.append(f"SUBSTITUTION: {variant_data.get('wt', '')} → {variant_data.get('mut', '')}")
    lines.append("")

    lines.append("=== QAFI PREDICTION ===")
    lines.append(f"Score: {variant_data.get('score', 'N/A')}, Percentile: {variant_data.get('percentile', 'N/A')}%")
    lines.append(f"Score range: {variant_data.get('score_range', {}).get('min', '')} - {variant_data.get('score_range', {}).get('max', '')}")
    lines.append("")

    lines.append("=== MOLECULAR FEATURES ===")
    for e in variant_data.get("evidence", []):
        lines.append(f"- {e['feature']}: {e['value']} — {e['detail']} [{e['impact']}]")
    lines.append("")

    pos = variant_data.get("position_context", {})
    lines.append(f"=== POSITION CONTEXT ===")
    lines.append(f"Rank #{pos.get('rank', '?')} of {pos.get('total_variants', '?')} substitutions, mean={pos.get('mean_score', '?')}")
    lines.append("")

    cv = variant_data.get("clinvar", {})
    lines.append("=== CLINVAR ===")
    if cv and cv.get("found") and cv.get("exact_match"):
        em = cv["exact_match"]
        lines.append(f"Exact match: {em['significance']} ({em['stars']} stars, {em['num_submissions']} submissions)")
    else:
        lines.append(f"Not found. {cv.get('same_gene_count', 0)} gene variants in ClinVar.")
    lines.append("")

    am = variant_data.get("alphamissense", {})
    lines.append("=== ALPHAMISSENSE ===")
    if am and am.get("variant"):
        lines.append(f"Score: {am['variant']['am_score']} — {am['variant']['am_class_label']}")
    else:
        lines.append("Not available")
    lines.append("")

    gn = variant_data.get("gnomad", {})
    lines.append("=== gnomAD ===")
    if gn and gn.get("variant"):
        v = gn["variant"]
        lines.append(f"AF={v['allele_freq']}, AC={v['allele_count']}, {v['freq_interpretation']}")
    else:
        lines.append("Not available")
    lines.append("")

    lit = variant_data.get("literature", {})
    lines.append(f"=== LITERATURE ===")
    lines.append(f"Variant-specific: {lit.get('variant_search_count', 0)}, Gene clinical: {lit.get('gene_search_count', 0)}, Total: {lit.get('total_gene_papers', 0)}")

    return "\n".join(lines)


class AssessRequest(BaseModel):
    variant_data: dict
    language: str = "en"


class ChatRequest(BaseModel):
    messages: list[dict]
    variant_data: dict | None = None


class ChatResponse(BaseModel):
    reply: str


async def _run_query(prompt: str, system: str) -> str:
    """Run a query using Claude Agent SDK and collect the result."""
    options = ClaudeAgentOptions(
        system_prompt=system,
        model="claude-sonnet-4-20250514",
        permission_mode="bypassPermissions",
        max_turns=5,
        mcp_servers={"qafi": qafi_mcp_server},
    )

    all_text = []
    async for message in query(prompt=prompt, options=options):
        if isinstance(message, AssistantMessage):
            for block in message.content:
                if hasattr(block, "text") and block.text:
                    all_text.append(block.text)

    return "\n".join(all_text)


@router.post("/assess")
async def assess_variant(req: AssessRequest):
    """
    核心 Agent 端点: 综合所有证据，给出临床评估。

    旧版: 60 行（手写 loop + 重试 + tool 分发 + 消息管理）
    新版: 调 _run_query()，SDK 自动处理一切
    """
    evidence = _build_evidence_prompt(req.variant_data)
    lang = "Respond in Chinese (中文)." if req.language == "zh" else "Respond in English."
    prompt = f"Please assess this variant based on ALL evidence below. {lang}\n\n{evidence}"

    try:
        reply = await _run_query(prompt, ASSESS_SYSTEM)
    except Exception as e:
        raise HTTPException(status_code=503, detail=str(e))

    # Extract JSON from reply (may contain text before/after the JSON block)
    json_str = reply.strip()

    # Try to find JSON in markdown code block
    if "```json" in json_str:
        json_str = json_str.split("```json", 1)[1]
        json_str = json_str.split("```", 1)[0]
    elif "```" in json_str:
        json_str = json_str.split("```", 1)[1]
        json_str = json_str.split("```", 1)[0]
    elif "{" in json_str:
        # Find the first { and last }
        start = json_str.index("{")
        end = json_str.rindex("}") + 1
        json_str = json_str[start:end]

    try:
        return json.loads(json_str.strip())
    except json.JSONDecodeError:
        return {
            "classification": "Unable to parse",
            "confidence": "Low",
            "summary": reply[:500],
            "evidence_for_pathogenic": [],
            "evidence_for_benign": [],
            "evidence_uncertain": [],
            "acmg_criteria": [],
            "recommendation": "Please try again.",
            "report": reply[:1000],
        }


@router.post("/chat", response_model=ChatResponse)
async def agent_chat(req: ChatRequest):
    """Follow-up chat — also uses SDK."""
    context = ""
    if req.variant_data:
        context = "\n\nVariant context:\n" + _build_evidence_prompt(req.variant_data)

    system = f"""You are a clinical genetics AI assistant. Answer follow-up questions about variant assessment.
Be concise, clinical, and honest about uncertainty. Respond in the same language as the user.{context}"""

    # Build conversation as single prompt
    conversation = ""
    for msg in req.messages:
        role = "User" if msg["role"] == "user" else "Assistant"
        conversation += f"{role}: {msg['content']}\n\n"

    try:
        reply = await _run_query(conversation, system)
    except Exception as e:
        raise HTTPException(status_code=503, detail=str(e))

    return ChatResponse(reply=reply)
