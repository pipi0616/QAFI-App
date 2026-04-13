"""AlphaMissense tool — fetch pathogenicity predictions from AlphaFold EBI."""

import csv
import io
from functools import lru_cache
import requests
from langchain_core.tools import tool


@lru_cache(maxsize=16)
def _fetch_am_data(uniprot_id: str) -> dict:
    """Download AlphaMissense CSV for a protein (cached)."""
    try:
        r = requests.get(f"https://alphafold.ebi.ac.uk/api/prediction/{uniprot_id}", timeout=10)
        csv_url = r.json()[0].get("amAnnotationsUrl")
        if not csv_url:
            return {}
        r2 = requests.get(csv_url, timeout=15)
        variants = {}
        for row in csv.DictReader(io.StringIO(r2.text)):
            variants[row["protein_variant"]] = {
                "am_score": round(float(row["am_pathogenicity"]), 4),
                "am_class": row["am_class"],
            }
        return variants
    except Exception:
        return {}


AM_LABELS = {"LPath": "Likely Pathogenic", "LBen": "Likely Benign", "Amb": "Ambiguous"}


@tool
def alphamissense_predict(protein_id: str, variant: str) -> dict:
    """Get AlphaMissense (Google DeepMind) pathogenicity prediction for a variant.
    Returns score (0-1, higher=more pathogenic) and classification.
    Use this to get an independent computational prediction."""

    data = _fetch_am_data(protein_id)
    if not data:
        return {"available": False, "variant": variant, "error": "No AlphaMissense data"}

    v = data.get(variant)
    if not v:
        return {"available": False, "variant": variant, "error": f"Variant {variant} not in AlphaMissense"}

    return {
        "available": True,
        "variant": variant,
        "protein_id": protein_id,
        "am_score": v["am_score"],
        "am_class": v["am_class"],
        "am_class_label": AM_LABELS.get(v["am_class"], v["am_class"]),
        "interpretation": f"Score {v['am_score']}: {'likely damaging' if v['am_score'] > 0.564 else 'likely benign' if v['am_score'] < 0.34 else 'ambiguous'}",
    }
