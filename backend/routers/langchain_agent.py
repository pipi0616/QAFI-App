"""
Agent Router — LangChain-powered variant interpretation.

Uses LangChain @tool + create_react_agent with:
- 7 tools with automatic selection
- RAG over ACMG guidelines
- Supports single variant, batch, and free-form chat
"""

import json
import time
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from langchain_anthropic import ChatAnthropic
from langgraph.prebuilt import create_react_agent

from ..langchain_tools.qafi_tool import qafi_predict
from ..langchain_tools.clinvar_tool import clinvar_lookup
from ..langchain_tools.alphamissense_tool import alphamissense_predict
from ..langchain_tools.gnomad_tool import gnomad_frequency
from ..langchain_tools.uniprot_tool import uniprot_annotate
from ..langchain_tools.pubmed_tool import pubmed_search
from ..rag.acmg_knowledge import acmg_guideline

router = APIRouter(prefix="/api/agent", tags=["agent"])

SYSTEM_PROMPT = """You are an autonomous clinical genetics expert performing variant interpretation.

You have 7 tools. Use them STRATEGICALLY based on what you learn, not mechanically. Think like a real geneticist deciding which databases to consult based on the case.

## Available tools
- **clinvar_lookup**: ClinVar clinical significance (always start here — highest evidence weight)
- **gnomad_frequency**: Population allele frequency (critical for ACMG PM2/BA1)
- **qafi_predict**: QAFI ML prediction (functional impact score + percentile)
- **alphamissense_predict**: AlphaMissense deep learning predictor
- **uniprot_annotate**: Protein function, domains, disease associations
- **pubmed_search**: Literature search (slow — only when needed)
- **acmg_guideline**: ACMG classification standards (RAG)

## Decision framework — think step by step

**Step 1: Start with ClinVar.**
- If ClinVar has a clear 3-4 star pathogenic/benign record → you already have strong evidence. Verify with gnomad_frequency, then classify.
- If ClinVar is 1-2 stars or VUS → you need more evidence.
- If ClinVar has no record → this is a novel variant, gather computational + population evidence.

**Step 2: After ClinVar, decide what's next based on what you learned.**
- Always check gnomad_frequency (PM2/BA1 are ACMG cornerstone criteria).
- If gnomAD is common (AF > 5%) → immediately BA1 benign, skip most other tools.
- Otherwise use at least one computational predictor (qafi_predict or alphamissense_predict).
- If computational predictors agree → you can classify with fewer tools.
- If they disagree → query more evidence (uniprot for functional domain context).

**Step 3: Only query these if needed:**
- **pubmed_search**: Only if you need functional study evidence OR user explicitly asks about literature.
- **uniprot_annotate**: Only if position context matters (e.g. active site = PM1).
- **acmg_guideline**: Query when you need to confirm which criteria apply.

## When NOT to call tools
- User asks "what does PM2 mean?" → only call acmg_guideline, nothing else.
- User asks "is this in ClinVar?" → only call clinvar_lookup.
- User asks about literature → only call pubmed_search.
- Follow-up questions about previous findings → don't re-query, use what you already have.

## Explain your reasoning
Before each tool call, briefly state WHY you're calling it (1 sentence).
After gathering enough evidence, explicitly state WHY you're stopping.

## Final report format
- ACMG classification with applicable criteria (PM2, BP4, etc.)
- Evidence summary: what supports pathogenic, what supports benign, what's inconclusive
- Clinical recommendation
- Brief formal report paragraph

Respond in the same language as the user. Your goal: accurate classification with the MINIMUM tool calls needed. A variant with clear ClinVar Pathogenic + Absent in gnomAD can be classified in 2-3 tool calls, not 7."""

TOOL_NAMES = {
    "qafi_predict": {"icon": "🧬", "label": "QAFI Prediction"},
    "clinvar_lookup": {"icon": "🏥", "label": "ClinVar"},
    "alphamissense_predict": {"icon": "🤖", "label": "AlphaMissense"},
    "gnomad_frequency": {"icon": "👥", "label": "gnomAD"},
    "uniprot_annotate": {"icon": "🔬", "label": "UniProt"},
    "pubmed_search": {"icon": "📚", "label": "PubMed"},
    "acmg_guideline": {"icon": "📋", "label": "ACMG Guidelines"},
}

ALL_TOOLS = [
    qafi_predict, clinvar_lookup, alphamissense_predict,
    gnomad_frequency, uniprot_annotate, pubmed_search, acmg_guideline,
]


def _get_agent():
    llm = ChatAnthropic(model="claude-sonnet-4-20250514", max_tokens=4096)
    return create_react_agent(llm, ALL_TOOLS, prompt=SYSTEM_PROMPT)


def _extract_tool_calls(messages) -> list:
    """Extract tool call info from agent message history."""
    calls = []
    call_by_id = {}  # map tool_call_id → call dict

    for msg in messages:
        msg_type = getattr(msg, "type", "")
        if msg_type == "ai" and hasattr(msg, "tool_calls") and msg.tool_calls:
            for tc in msg.tool_calls:
                info = TOOL_NAMES.get(tc["name"], {"icon": "🔧", "label": tc["name"]})
                entry = {
                    "name": tc["name"],
                    "icon": info["icon"],
                    "label": info["label"],
                    "args": tc["args"],
                }
                calls.append(entry)
                if "id" in tc:
                    call_by_id[tc["id"]] = entry
        elif msg_type == "tool":
            content = msg.content if isinstance(msg.content, str) else json.dumps(msg.content, ensure_ascii=False)
            # Match by tool_call_id
            tid = getattr(msg, "tool_call_id", None)
            if tid and tid in call_by_id:
                call_by_id[tid]["result"] = content[:2000]
            else:
                # Fallback: match by name
                name = getattr(msg, "name", "")
                for c in reversed(calls):
                    if c["name"] == name and "result" not in c:
                        c["result"] = content[:2000]
                        break
    return calls


# === Single variant ===

class SingleRequest(BaseModel):
    protein_id: str = "Q9Y375"
    gene: str = "NDUFAF1"
    variant: str = "L117H"
    language: str = "en"


@router.post("/assess")
def assess_single(req: SingleRequest):
    """Run full LangChain agent assessment for a single variant."""
    try:
        wt = req.variant[0]
        mut = req.variant[-1]
        pos = int(req.variant[1:-1])
    except Exception:
        raise HTTPException(400, f"Invalid variant format: {req.variant}")

    agent = _get_agent()
    lang = "Please respond in Chinese (中文)." if req.language == "zh" else "Please respond in English."

    query = (
        f"{lang}\n\n"
        f"Please classify the variant {req.gene} {req.variant} "
        f"(protein: {req.protein_id}, position: {pos}, {wt}→{mut}).\n\n"
        f"Use your decision framework to gather appropriate evidence, "
        f"then provide ACMG classification and a clinical report. "
        f"Be efficient — stop gathering evidence once you have enough to classify confidently."
    )

    result = agent.invoke({"messages": [("user", query)]})

    tool_calls = _extract_tool_calls(result["messages"])
    report = result["messages"][-1].content

    return {
        "variant": req.variant,
        "gene": req.gene,
        "protein_id": req.protein_id,
        "position": pos,
        "wt": wt,
        "mut": mut,
        "tool_calls": tool_calls,
        "report": report,
    }


# === Chat ===

class ChatRequest(BaseModel):
    messages: list[dict]
    language: str = "en"


@router.post("/chat")
def langchain_chat(req: ChatRequest):
    """Free-form clinical consultation with tool access."""
    agent = _get_agent()
    lang = "Respond in Chinese." if req.language == "zh" else "Respond in English."

    lc_messages = []
    for m in req.messages:
        lc_messages.append((m["role"], m["content"]))

    # Prepend language hint to last message
    if lc_messages:
        role, content = lc_messages[-1]
        lc_messages[-1] = (role, f"{lang}\n{content}")

    result = agent.invoke({"messages": lc_messages})
    tool_calls = _extract_tool_calls(result["messages"])
    reply = result["messages"][-1].content

    return {
        "reply": reply,
        "tool_calls": tool_calls,
    }


@router.post("/chat/stream")
async def langchain_chat_stream(req: ChatRequest):
    """Streaming version of chat — sends events as Agent thinks/calls tools."""
    from fastapi.responses import StreamingResponse

    agent = _get_agent()
    lang = "Respond in Chinese." if req.language == "zh" else "Respond in English."

    lc_messages = [(m["role"], m["content"]) for m in req.messages]
    if lc_messages:
        role, content = lc_messages[-1]
        lc_messages[-1] = (role, f"{lang}\n{content}")

    async def event_stream():
        """Yield Server-Sent Events as the agent processes."""
        try:
            # Use astream_events to get fine-grained progress
            async for event in agent.astream_events(
                {"messages": lc_messages},
                version="v2",
            ):
                kind = event.get("event", "")
                name = event.get("name", "")

                # Tool started
                if kind == "on_tool_start":
                    info = TOOL_NAMES.get(name, {"icon": "🔧", "label": name})
                    payload = {
                        "type": "tool_start",
                        "name": name,
                        "icon": info["icon"],
                        "label": info["label"],
                        "args": event.get("data", {}).get("input", {}),
                    }
                    yield f"data: {json.dumps(payload, ensure_ascii=False)}\n\n"

                # Tool finished
                elif kind == "on_tool_end":
                    output = event.get("data", {}).get("output", "")
                    if hasattr(output, "content"):
                        output = output.content
                    payload = {
                        "type": "tool_end",
                        "name": name,
                        "result": str(output)[:500],
                    }
                    yield f"data: {json.dumps(payload, ensure_ascii=False)}\n\n"

                # LLM streaming text tokens
                elif kind == "on_chat_model_stream":
                    chunk = event.get("data", {}).get("chunk")
                    if chunk and hasattr(chunk, "content"):
                        text = chunk.content
                        # Content may be a list (Anthropic format) or string
                        if isinstance(text, list):
                            for block in text:
                                if isinstance(block, dict) and block.get("type") == "text":
                                    payload = {"type": "token", "text": block.get("text", "")}
                                    yield f"data: {json.dumps(payload, ensure_ascii=False)}\n\n"
                        elif isinstance(text, str) and text:
                            payload = {"type": "token", "text": text}
                            yield f"data: {json.dumps(payload, ensure_ascii=False)}\n\n"

            # Done
            yield f"data: {json.dumps({'type': 'done'})}\n\n"

        except Exception as e:
            yield f"data: {json.dumps({'type': 'error', 'message': str(e)})}\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


@router.get("/tools")
def list_tools():
    """List all available LangChain tools."""
    return {
        "tools": [
            {**TOOL_NAMES[t.name], "name": t.name, "description": t.description}
            for t in ALL_TOOLS
        ],
        "total": len(ALL_TOOLS),
        "framework": "LangChain + LangGraph",
    }
