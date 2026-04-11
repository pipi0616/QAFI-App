"""
Agent Router — Claude-powered clinical variant interpretation assistant.
Designed to be embedded alongside variant lookup results.
"""

import json
import time
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

import anthropic

from ..services import qafi

router = APIRouter(prefix="/api/agent", tags=["agent"])


AGENT_TOOLS = [
    {
        "name": "lookup_variant",
        "description": "Look up prediction data for a specific variant. Returns score, classification, evidence, and position context.",
        "input_schema": {
            "type": "object",
            "properties": {
                "protein_id": {"type": "string", "description": "UniProt protein ID"},
                "variant": {"type": "string", "description": "Variant name, e.g. 'L117H'"},
            },
            "required": ["protein_id", "variant"],
        },
    },
    {
        "name": "compare_variants",
        "description": "Compare multiple variants by looking up each one. Use this when the user asks to compare or prioritize several variants.",
        "input_schema": {
            "type": "object",
            "properties": {
                "protein_id": {"type": "string"},
                "variants": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "List of variant names, e.g. ['M1A', 'L117H', 'R230W']",
                },
            },
            "required": ["protein_id", "variants"],
        },
    },
    {
        "name": "get_position_summary",
        "description": "Get all variants at a given position to understand position-level impact.",
        "input_schema": {
            "type": "object",
            "properties": {
                "protein_id": {"type": "string"},
                "position": {"type": "integer"},
            },
            "required": ["protein_id", "position"],
        },
    },
]


def execute_agent_tool(name: str, inputs: dict) -> str:
    if name == "lookup_variant":
        result = qafi.lookup_variant(inputs["protein_id"], inputs["variant"])
        if result is None:
            return json.dumps({"error": f"Variant {inputs['variant']} not found"})
        return json.dumps(result)

    elif name == "compare_variants":
        results = []
        for v in inputs["variants"]:
            r = qafi.lookup_variant(inputs["protein_id"], v)
            if r:
                results.append({
                    "variant": r["variant"],
                    "score": r["score"],
                    "percentile": r["percentile"],
                    "classification": r["classification"],
                    "evidence_summary": [f"{e['feature']}: {e['value']} ({e['impact']})" for e in r["evidence"]],
                })
            else:
                results.append({"variant": v, "error": "not found"})
        return json.dumps(results)

    elif name == "get_position_summary":
        result = qafi.lookup_variant(inputs["protein_id"], str(inputs["position"]))
        if result is None:
            return json.dumps({"error": f"Position {inputs['position']} not found"})
        return json.dumps({
            "position": result["position"],
            "wt": result["wt"],
            "total_variants": result["position_context"]["total_variants"],
            "mean_score": result["position_context"]["mean_score"],
            "variants": result["position_context"]["variants"],
            "evidence": result["evidence"],
        })

    return json.dumps({"error": f"Unknown tool: {name}"})


def build_system_prompt(variant_context: dict | None) -> str:
    """Build system prompt with current variant context embedded."""
    base = """You are a clinical genetics AI assistant embedded in the QAFI variant analysis platform.
You help clinicians interpret variant predictions and make clinical decisions.

Your capabilities:
- Explain why a variant is classified as Pathogenic/VUS/Benign in plain clinical language
- Generate clinical report text suitable for medical records
- Compare multiple variants and prioritize them
- Explain the molecular and evolutionary evidence behind predictions
- Answer questions about protein function, variant impact, and clinical significance

Guidelines:
- Use clear, clinical language. Avoid jargon unless asked.
- Always state uncertainty honestly — say "predicted" not "is pathogenic"
- When generating reports, use formal clinical genetics terminology
- Respond in the same language as the user (Chinese or English)
- Be concise but thorough. Clinicians are busy."""

    if variant_context:
        ctx = f"""

CURRENT VARIANT CONTEXT (the variant the clinician is currently looking at):
- Variant: {variant_context.get('variant', 'N/A')}
- Protein: {variant_context.get('protein_name', '')} ({variant_context.get('protein_id', '')})
- Position: {variant_context.get('position', '')}
- Wild type: {variant_context.get('wt', '')} → Mutant: {variant_context.get('mut', '')}
- QAFI Score: {variant_context.get('score', '')} (range: {variant_context.get('score_range', {}).get('min', '')}-{variant_context.get('score_range', {}).get('max', '')})
- Percentile: {variant_context.get('percentile', '')}%
- Classification: {variant_context.get('classification', '')}
- Confidence: {variant_context.get('confidence', '')}

Evidence:"""
        for e in variant_context.get("evidence", []):
            ctx += f"\n- {e['feature']}: {e['value']} — {e['detail']} [{e['impact']}]"

        pos_ctx = variant_context.get("position_context", {})
        ctx += f"""

Position context:
- {pos_ctx.get('total_variants', '?')} substitutions at position {variant_context.get('position', '')}
- This variant ranks #{pos_ctx.get('rank', '?')} of {pos_ctx.get('total_variants', '?')}
- Mean score at this position: {pos_ctx.get('mean_score', '?')}

Use this context to answer the user's questions. You do NOT need to call lookup_variant for this variant — you already have all the data."""
        base += ctx

    return base


class ChatRequest(BaseModel):
    messages: list[dict]
    variant_context: dict | None = None  # current variant data from frontend


class ChatResponse(BaseModel):
    reply: str
    tool_calls: list[dict] = []


@router.post("/chat", response_model=ChatResponse)
def agent_chat(req: ChatRequest):
    """Chat with the variant interpretation agent."""
    try:
        client = anthropic.Anthropic()
    except Exception:
        raise HTTPException(status_code=500, detail="ANTHROPIC_API_KEY not set")

    system_prompt = build_system_prompt(req.variant_context)
    messages = req.messages
    tool_calls_log = []

    for _ in range(10):
        for attempt in range(3):
            try:
                response = client.messages.create(
                    model="claude-sonnet-4-20250514",
                    max_tokens=4096,
                    system=system_prompt,
                    tools=AGENT_TOOLS,
                    messages=messages,
                )
                break
            except anthropic._exceptions.OverloadedError:
                time.sleep(2 ** attempt)
        else:
            raise HTTPException(status_code=503, detail="Claude API overloaded")

        text_parts = []
        tool_results = []

        for block in response.content:
            if block.type == "text":
                text_parts.append(block.text)
            elif block.type == "tool_use":
                result = execute_agent_tool(block.name, block.input)
                tool_calls_log.append({"tool": block.name, "input": block.input, "output": result[:500]})
                tool_results.append({"type": "tool_result", "tool_use_id": block.id, "content": result})

        messages.append({"role": "assistant", "content": response.content})

        if response.stop_reason == "tool_use":
            messages.append({"role": "user", "content": tool_results})
        else:
            return ChatResponse(reply="".join(text_parts), tool_calls=tool_calls_log)

    return ChatResponse(reply="Agent reached maximum iterations.", tool_calls=tool_calls_log)
