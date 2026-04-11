"""
External Predictor Service — query other variant effect prediction models.

Currently supports:
- AlphaMissense (Google DeepMind): per-protein CSV from AlphaFold EBI API

Future:
- CADD
- REVEL
- SIFT / PolyPhen-2
"""

import csv
import io
from functools import lru_cache

import requests

ALPHAFOLD_API = "https://alphafold.ebi.ac.uk/api/prediction"

# AlphaMissense class labels
AM_CLASS_LABELS = {
    "LPath": "Likely Pathogenic",
    "LBen": "Likely Benign",
    "Amb": "Ambiguous",
}

AM_CLASS_COLORS = {
    "LPath": "#dc2626",
    "LBen": "#16a34a",
    "Amb": "#ca8a04",
}


@lru_cache(maxsize=32)
def _fetch_am_data(uniprot_id: str) -> dict[str, dict] | None:
    """
    Download AlphaMissense predictions for a protein.
    Returns dict keyed by variant name (e.g. "L117H").
    Cached in memory to avoid re-downloading.
    """
    # Step 1: Get the CSV URL from AlphaFold API
    try:
        r = requests.get(f"{ALPHAFOLD_API}/{uniprot_id}", timeout=10)
        r.raise_for_status()
        data = r.json()
        csv_url = data[0].get("amAnnotationsUrl")
        if not csv_url:
            return None
    except Exception:
        return None

    # Step 2: Download the CSV
    try:
        r = requests.get(csv_url, timeout=15)
        r.raise_for_status()
    except Exception:
        return None

    # Step 3: Parse into dict
    variants = {}
    reader = csv.DictReader(io.StringIO(r.text))
    for row in reader:
        name = row["protein_variant"]
        variants[name] = {
            "variant": name,
            "am_score": round(float(row["am_pathogenicity"]), 4),
            "am_class": row["am_class"],
            "am_class_label": AM_CLASS_LABELS.get(row["am_class"], row["am_class"]),
            "am_class_color": AM_CLASS_COLORS.get(row["am_class"], "#94a3b8"),
        }
    return variants


def lookup_alphamissense(uniprot_id: str, variant: str, position: int = None) -> dict:
    """
    Look up AlphaMissense prediction for a single variant.

    Returns:
        {
            "available": bool,
            "variant": {am_score, am_class, am_class_label, ...} or None,
            "same_position": [variants at same position],
            "summary": {total, pathogenic_count, benign_count, ambiguous_count},
        }
    """
    all_data = _fetch_am_data(uniprot_id)
    if all_data is None:
        return {"available": False, "variant": None, "same_position": [], "summary": None}

    # Find exact variant
    exact = all_data.get(variant)

    # Find same-position variants
    same_pos = []
    if position is not None:
        for name, v in all_data.items():
            # Parse position from variant name (e.g. "L117H" -> 117)
            pos_str = "".join(c for c in name[1:] if c.isdigit())
            if pos_str and int(pos_str) == position:
                same_pos.append(v)
        same_pos.sort(key=lambda x: x["am_score"], reverse=True)

    # Summary stats
    total = len(all_data)
    path_count = sum(1 for v in all_data.values() if v["am_class"] == "LPath")
    ben_count = sum(1 for v in all_data.values() if v["am_class"] == "LBen")
    amb_count = sum(1 for v in all_data.values() if v["am_class"] == "Amb")

    return {
        "available": True,
        "variant": exact,
        "same_position": same_pos,
        "summary": {
            "total": total,
            "pathogenic": path_count,
            "benign": ben_count,
            "ambiguous": amb_count,
        },
    }
