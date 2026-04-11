"""
Agent Router — Claude-powered natural language interface.
"""

import json
import time
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

import anthropic

from ..services import qafi

router = APIRouter(prefix="/api/agent", tags=["agent"])

SYSTEM_PROMPT = """You are the QAFI Analysis Agent — an AI assistant that helps clinical researchers
analyze protein variant functional impact using the QAFI machine learning framework.

You have access to tools that can:
- List available proteins and model methods
- Run PSP models (per-protein prediction) and QAFI models (cross-protein generalization)
- Explain feature importance and model interpretability

When a user asks for analysis:
1. Check what data/proteins are available
2. Suggest an appropriate workflow
3. Execute step by step
4. Summarize results clearly with clinical relevance

Respond in the same language as the user (Chinese or English).
Focus on clinical interpretation — explain what predictions mean for variant pathogenicity.
"""

AGENT_TOOLS = [
    {
        "name": "list_proteins",
        "description": "List available proteins for analysis.",
        "input_schema": {"type": "object", "properties": {}},
    },
    {
        "name": "list_methods",
        "description": "List all available PSP and QAFI prediction methods.",
        "input_schema": {"type": "object", "properties": {}},
    },
    {
        "name": "run_prediction",
        "description": "Run a prediction model. model_type: 'psp' or 'qafi'.",
        "input_schema": {
            "type": "object",
            "properties": {
                "model_type": {"type": "string", "enum": ["psp", "qafi"]},
                "method": {"type": "string"},
                "protein_id": {"type": "string"},
            },
            "required": ["model_type", "method", "protein_id"],
        },
    },
    {
        "name": "get_feature_info",
        "description": "Get information about the 23 feature blocks used by QAFI.",
        "input_schema": {"type": "object", "properties": {}},
    },
]


def execute_agent_tool(name: str, inputs: dict) -> str:
    if name == "list_proteins":
        proteins = qafi.list_proteins()
        return json.dumps({"proteins": proteins, "count": len(proteins)})
    elif name == "list_methods":
        return json.dumps({"psp": qafi.list_psp_methods(), "qafi": qafi.list_qafi_methods()})
    elif name == "run_prediction":
        if inputs["model_type"] == "psp":
            result = qafi.run_psp(inputs["method"])
        else:
            result = qafi.run_qafi(inputs["method"], inputs["protein_id"])
        return json.dumps({"success": result["success"], "output": result["stdout"][:2000]})
    elif name == "get_feature_info":
        return json.dumps({
            "categories": ["evolutionary (4)", "structural (2)", "neighborhood (13)", "pdff (8)"],
            "total": 27,
            "description": "Features capture sequence conservation, protein structure confidence, 3D neighborhood properties, and position-level distributions.",
        })
    return json.dumps({"error": f"Unknown tool: {name}"})


class ChatRequest(BaseModel):
    messages: list[dict]  # [{"role": "user", "content": "..."}]


class ChatResponse(BaseModel):
    reply: str
    tool_calls: list[dict] = []


@router.post("/chat", response_model=ChatResponse)
def agent_chat(req: ChatRequest):
    """Chat with the QAFI agent. Runs full agent loop and returns final response."""
    try:
        client = anthropic.Anthropic()
    except Exception:
        raise HTTPException(status_code=500, detail="ANTHROPIC_API_KEY not set")

    messages = req.messages
    tool_calls_log = []

    # Agent loop (max 10 iterations for safety)
    for _ in range(10):
        for attempt in range(3):
            try:
                response = client.messages.create(
                    model="claude-sonnet-4-20250514",
                    max_tokens=4096,
                    system=SYSTEM_PROMPT,
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
