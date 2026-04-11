"""
Agent Router — Claude-powered clinical variant interpretation.

Core endpoint: /api/agent/assess
  Takes ALL evidence (QAFI, ClinVar, AlphaMissense, gnomAD, Literature)
  and returns a synthesized clinical assessment.

Secondary endpoint: /api/agent/chat
  Follow-up questions about the assessment.
"""

import json
import time
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

import anthropic

from ..services import qafi

router = APIRouter(prefix="/api/agent", tags=["agent"])


ASSESS_SYSTEM = """You are a clinical genetics expert assistant. You have been given ALL available evidence about a protein variant. Your job is to synthesize it into a clear clinical assessment.

You MUST respond in valid JSON with this exact structure:
{
  "classification": "Likely Pathogenic | Possibly Pathogenic | Uncertain Significance (VUS) | Possibly Benign | Likely Benign",
  "confidence": "High | Moderate | Low",
  "summary": "2-3 sentence plain-language summary for a clinician",
  "evidence_for_pathogenic": ["bullet point 1", "bullet point 2", ...],
  "evidence_for_benign": ["bullet point 1", "bullet point 2", ...],
  "evidence_uncertain": ["bullet point 1", ...],
  "acmg_criteria": ["PM2", "BP4", ...],
  "recommendation": "1-2 sentence clinical recommendation",
  "report": "A formal 1-paragraph clinical report suitable for medical records"
}

Guidelines:
- Weigh all evidence sources. Note agreements AND conflicts between predictors.
- Use ACMG/AMP criteria codes where applicable (PVS1, PS1-4, PM1-6, PP1-5, BA1, BS1-4, BP1-7).
- gnomAD absence = PM2. Common variant (>5%) = BA1.
- If predictors disagree, explain why and which is more reliable for this case.
- The report should use formal clinical genetics terminology.
- Be honest about uncertainty. Never overstate confidence.
- Respond in the same language as the user's query language. If no query, use English."""


def _build_evidence_prompt(variant_data: dict) -> str:
    """Build a structured evidence summary for the LLM."""
    lines = []
    lines.append(f"VARIANT: {variant_data.get('variant', 'N/A')}")
    lines.append(f"PROTEIN: {variant_data.get('protein_name', '')} ({variant_data.get('protein_id', '')})")
    lines.append(f"POSITION: {variant_data.get('position', '')}")
    lines.append(f"SUBSTITUTION: {variant_data.get('wt', '')} → {variant_data.get('mut', '')}")
    lines.append("")

    # QAFI
    lines.append("=== QAFI PREDICTION ===")
    lines.append(f"Score: {variant_data.get('score', 'N/A')}")
    lines.append(f"Percentile: {variant_data.get('percentile', 'N/A')}%")
    lines.append(f"Score range: {variant_data.get('score_range', {}).get('min', '')} - {variant_data.get('score_range', {}).get('max', '')}")
    lines.append(f"Preliminary classification: {variant_data.get('classification', 'N/A')}")
    lines.append("")

    # Feature evidence
    lines.append("=== MOLECULAR FEATURES ===")
    for e in variant_data.get("evidence", []):
        lines.append(f"- {e['feature']}: {e['value']} — {e['detail']} [{e['impact']}]")
    lines.append("")

    # Position context
    pos = variant_data.get("position_context", {})
    lines.append(f"=== POSITION CONTEXT ===")
    lines.append(f"Total substitutions at this position: {pos.get('total_variants', '?')}")
    lines.append(f"This variant ranks #{pos.get('rank', '?')} of {pos.get('total_variants', '?')}")
    lines.append(f"Mean score at position: {pos.get('mean_score', '?')}")
    lines.append("")

    # ClinVar
    cv = variant_data.get("clinvar", {})
    lines.append("=== CLINVAR ===")
    if cv and cv.get("found"):
        em = cv.get("exact_match")
        if em:
            lines.append(f"Exact match: {em['significance']} ({em['stars']} stars, {em['num_submissions']} submissions)")
            if em.get("traits"):
                lines.append(f"Associated conditions: {', '.join(em['traits'])}")
        sp = cv.get("same_position", [])
        if sp:
            lines.append(f"Other variants at this position: {', '.join(v['protein_change'] + '=' + v['significance'] for v in sp[:5])}")
    else:
        lines.append(f"Not found in ClinVar. {cv.get('same_gene_count', 0)} gene variants total in ClinVar.")
    lines.append("")

    # AlphaMissense
    am = variant_data.get("alphamissense", {})
    lines.append("=== ALPHAMISSENSE ===")
    if am and am.get("available") and am.get("variant"):
        v = am["variant"]
        lines.append(f"Score: {v['am_score']} — Classification: {v['am_class_label']}")
        summary = am.get("summary", {})
        if summary:
            lines.append(f"Protein-wide: {summary['pathogenic']} pathogenic, {summary['ambiguous']} ambiguous, {summary['benign']} benign out of {summary['total']}")
    else:
        lines.append("Not available")
    lines.append("")

    # gnomAD
    gn = variant_data.get("gnomad", {})
    lines.append("=== gnomAD (POPULATION FREQUENCY) ===")
    if gn and gn.get("available") and gn.get("variant"):
        v = gn["variant"]
        lines.append(f"Allele frequency: {v['allele_freq']}")
        lines.append(f"Allele count: {v['allele_count']}, Homozygotes: {v['homozygote_count']}")
        lines.append(f"Interpretation: {v['freq_interpretation']}")
        lines.append(f"Gene missense variants in gnomAD: {gn.get('gene_missense_count', '?')}")
    else:
        lines.append("Not available")
    lines.append("")

    # Literature
    lit = variant_data.get("literature", {})
    lines.append("=== LITERATURE ===")
    lines.append(f"Variant-specific papers: {lit.get('variant_search_count', 0)}")
    lines.append(f"Gene clinical papers: {lit.get('gene_search_count', 0)}")
    lines.append(f"Total gene papers: {lit.get('total_gene_papers', 0)}")
    if lit.get("variant_articles"):
        for a in lit["variant_articles"][:3]:
            lines.append(f"  - {a['title'][:100]} ({a['year']}, PMID:{a['pmid']})")
    if lit.get("gene_articles"):
        lines.append("Key gene papers:")
        for a in lit["gene_articles"][:3]:
            lines.append(f"  - {a['title'][:100]} ({a['year']}, PMID:{a['pmid']})")

    return "\n".join(lines)


class AssessRequest(BaseModel):
    variant_data: dict  # full lookup result from /api/predict/lookup
    language: str = "en"  # "en" or "zh"


class AssessResponse(BaseModel):
    classification: str
    confidence: str
    summary: str
    evidence_for_pathogenic: list[str]
    evidence_for_benign: list[str]
    evidence_uncertain: list[str]
    acmg_criteria: list[str]
    recommendation: str
    report: str


@router.post("/assess")
def assess_variant(req: AssessRequest):
    """The core agentic endpoint: synthesize all evidence into a clinical assessment."""
    try:
        client = anthropic.Anthropic()
    except Exception:
        raise HTTPException(status_code=500, detail="ANTHROPIC_API_KEY not set")

    evidence_text = _build_evidence_prompt(req.variant_data)

    lang_hint = "Respond in Chinese (中文)." if req.language == "zh" else "Respond in English."

    messages = [
        {
            "role": "user",
            "content": f"Please assess this variant based on ALL the evidence below. {lang_hint}\n\n{evidence_text}",
        }
    ]

    for attempt in range(3):
        try:
            response = client.messages.create(
                model="claude-sonnet-4-20250514",
                max_tokens=4096,
                system=ASSESS_SYSTEM,
                messages=messages,
            )
            break
        except anthropic._exceptions.OverloadedError:
            time.sleep(2 ** attempt)
    else:
        raise HTTPException(status_code=503, detail="Claude API overloaded")

    # Parse JSON from response
    reply = ""
    for block in response.content:
        if hasattr(block, "text"):
            reply += block.text

    # Extract JSON from response (handle markdown code blocks)
    json_str = reply.strip()
    if json_str.startswith("```"):
        json_str = json_str.split("\n", 1)[1]  # remove ```json
        json_str = json_str.rsplit("```", 1)[0]  # remove trailing ```

    try:
        result = json.loads(json_str)
    except json.JSONDecodeError:
        # Fallback: return raw text as summary
        result = {
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

    return result


# --- Follow-up chat (keeps context) ---

class ChatRequest(BaseModel):
    messages: list[dict]
    variant_data: dict | None = None


class ChatResponse(BaseModel):
    reply: str


CHAT_SYSTEM = """You are a clinical genetics AI assistant. You have already provided an initial assessment of a variant.
Now the clinician has follow-up questions. Answer based on the variant evidence you were given.
Be concise, clinical, and honest about uncertainty.
Respond in the same language as the user."""


@router.post("/chat", response_model=ChatResponse)
def agent_chat(req: ChatRequest):
    """Follow-up chat about a variant assessment."""
    try:
        client = anthropic.Anthropic()
    except Exception:
        raise HTTPException(status_code=500, detail="ANTHROPIC_API_KEY not set")

    system = CHAT_SYSTEM
    if req.variant_data:
        system += "\n\nVariant context:\n" + _build_evidence_prompt(req.variant_data)

    for attempt in range(3):
        try:
            response = client.messages.create(
                model="claude-sonnet-4-20250514",
                max_tokens=4096,
                system=system,
                messages=req.messages,
            )
            break
        except anthropic._exceptions.OverloadedError:
            time.sleep(2 ** attempt)
    else:
        raise HTTPException(status_code=503, detail="Claude API overloaded")

    reply = ""
    for block in response.content:
        if hasattr(block, "text"):
            reply += block.text

    return ChatResponse(reply=reply)
