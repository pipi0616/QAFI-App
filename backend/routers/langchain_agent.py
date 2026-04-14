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

SYSTEM_PROMPT = """You are a clinical genetics expert performing variant interpretation.

You have 7 tools. For a comprehensive assessment, call ALL relevant tools:
1. qafi_predict — QAFI prediction model
2. clinvar_lookup — ClinVar clinical database
3. alphamissense_predict — AlphaMissense (Google DeepMind)
4. gnomad_frequency — population frequency
5. uniprot_annotate — protein annotations
6. pubmed_search — literature search
7. acmg_guideline — ACMG classification guidelines (RAG)

After gathering evidence, provide a structured report with:
- ACMG classification with applicable criteria
- Evidence for/against pathogenicity
- Clinical recommendation
- Formal report paragraph for medical records

Respond in the same language as the user. Be thorough but concise.
IMPORTANT: Call ALL relevant tools before giving your final assessment."""

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
        f"Perform a comprehensive clinical assessment of variant {req.gene} {req.variant} "
        f"(protein: {req.protein_id}, position: {pos}, {wt}->{mut}).\n"
        f"Call all relevant tools, then provide ACMG classification and clinical report."
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
