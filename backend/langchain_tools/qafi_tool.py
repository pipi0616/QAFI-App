"""QAFI prediction tool — wraps QAFI_CODE_NEW model with rich context."""

import subprocess
import csv
from functools import lru_cache
from pathlib import Path
from langchain_core.tools import tool

QAFI_DIR = Path("/Users/pipi/Projects/QAFI_Paper/QAFI_CODE_NEW")


@lru_cache(maxsize=16)
def _load_all_predictions(protein_id: str, method: str = "qafisplit3") -> tuple:
    """Load all predictions for a protein. Cached per protein.
    Returns (rows_list, score_stats_dict)."""
    results_csv = QAFI_DIR / "outputs" / "runs" / method / protein_id / f"{method}.csv"
    # Note: run_qafi.py uses outputs/runs/qafi/<method>/ structure
    alt_csv = QAFI_DIR / "outputs" / "runs" / "qafi" / method / protein_id / f"{method}.csv"
    csv_path = results_csv if results_csv.exists() else alt_csv

    if not csv_path.exists():
        return None, None

    rows = []
    scores = []
    with open(csv_path) as f:
        for row in csv.DictReader(f):
            row_score = float(row[method])
            rows.append({**row, "_score": row_score})
            scores.append(row_score)

    if not scores:
        return None, None

    scores_sorted = sorted(scores)
    n = len(scores)
    stats = {
        "min": min(scores),
        "max": max(scores),
        "mean": sum(scores) / n,
        "median": scores_sorted[n // 2],
        "total_variants": n,
    }
    return rows, stats


def _run_prediction(protein_id: str, method: str = "qafisplit3"):
    """Trigger prediction if not cached."""
    cmd = f"conda run -n pipi python scripts/models/run_qafi.py --method {method} --uniprot {protein_id}"
    try:
        subprocess.run(cmd, shell=True, cwd=str(QAFI_DIR),
                       capture_output=True, text=True, timeout=300)
    except Exception:
        pass


def _classify(percentile: float) -> str:
    """Map percentile to plain-language classification."""
    if percentile >= 80:
        return "High predicted impact"
    elif percentile >= 60:
        return "Moderately high predicted impact"
    elif percentile >= 40:
        return "Moderate predicted impact"
    elif percentile >= 20:
        return "Low predicted impact"
    else:
        return "Very low predicted impact"


@tool
def qafi_predict(protein_id: str, variant: str) -> dict:
    """Run QAFI variant effect prediction model with comprehensive context.

    Returns the QAFI score plus:
    - Percentile rank across all variants in this protein
    - Classification (high/moderate/low predicted impact)
    - Protein-wide score distribution (min, max, mean, median)
    - Same-position comparison: rank among all substitutions at this residue,
      most pathogenic and most benign substitutions at the same position

    Use this when asked about a variant's predicted pathogenicity from QAFI,
    or to compare a variant against other substitutions at the same position.
    """
    # Load all predictions (cached)
    rows, stats = _load_all_predictions(protein_id)

    # If not cached, trigger computation and retry
    if rows is None:
        _run_prediction(protein_id)
        _load_all_predictions.cache_clear()
        rows, stats = _load_all_predictions(protein_id)
        if rows is None:
            return {
                "variant": variant, "protein_id": protein_id,
                "error": "Unable to compute QAFI prediction",
                "status": "failed",
            }

    # Find the requested variant
    target = next((r for r in rows if r["variant"] == variant), None)
    if target is None:
        return {
            "variant": variant, "protein_id": protein_id,
            "error": f"Variant {variant} not found in QAFI predictions",
            "status": "failed",
        }

    score = target["_score"]
    position = int(target["pos"])
    wt = target["first"]
    mut = target["second"]

    # Percentile (how many variants score lower)
    n_below = sum(1 for r in rows if r["_score"] < score)
    percentile = round(n_below / len(rows) * 100, 1)

    # Same-position analysis
    pos_variants = [r for r in rows if int(r["pos"]) == position]
    pos_scores = [r["_score"] for r in pos_variants]
    pos_scores_sorted = sorted(pos_scores, reverse=True)
    rank_at_pos = pos_scores_sorted.index(score) + 1

    # Most/least damaging at same position
    max_at_pos = max(pos_variants, key=lambda r: r["_score"])
    min_at_pos = min(pos_variants, key=lambda r: r["_score"])

    return {
        "variant": variant,
        "protein_id": protein_id,
        "position": position,
        "wt": wt,
        "mut": mut,
        "score": round(score, 4),
        "method": "qafisplit3",
        "status": "success",

        # Score interpretation
        "percentile": percentile,
        "classification": _classify(percentile),

        # Protein-wide context
        "score_context": {
            "protein_min": round(stats["min"], 4),
            "protein_max": round(stats["max"], 4),
            "protein_mean": round(stats["mean"], 4),
            "protein_median": round(stats["median"], 4),
            "total_variants_in_protein": stats["total_variants"],
        },

        # Position context
        "position_analysis": {
            "rank_at_position": rank_at_pos,
            "total_at_position": len(pos_variants),
            "mean_score_at_position": round(sum(pos_scores) / len(pos_scores), 4),
            "most_damaging_substitution": {
                "variant": max_at_pos["variant"],
                "score": round(max_at_pos["_score"], 4),
            },
            "least_damaging_substitution": {
                "variant": min_at_pos["variant"],
                "score": round(min_at_pos["_score"], 4),
            },
        },
    }
