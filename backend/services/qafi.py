"""
QAFI Service Layer — wraps QAFI_CODE_NEW as callable functions.
All QAFI operations go through here. No modification to QAFI source code.
"""

import json
import os
import subprocess
import numpy as np
import pandas as pd
from pathlib import Path
from dotenv import load_dotenv

load_dotenv()  # reads from .env file

QAFI_DIR = Path(os.getenv("QAFI_CODE_DIR", "/Users/pipi/Projects/QAFI_Paper/QAFI_CODE_NEW"))
QAFI_CONDA_ENV = os.getenv("QAFI_CONDA_ENV", "pipi")
PYTHON_CMD = f"conda run -n {QAFI_CONDA_ENV} python"


def run_command(script: str, args: list[str] | None = None, timeout: int = 300) -> dict:
    """Execute a QAFI script and return structured result."""
    cmd = f"{PYTHON_CMD} {script}"
    if args:
        cmd += " " + " ".join(args)
    try:
        result = subprocess.run(
            cmd, shell=True, cwd=str(QAFI_DIR),
            capture_output=True, text=True, timeout=timeout,
        )
        return {
            "success": result.returncode == 0,
            "stdout": result.stdout,
            "stderr": result.stderr,
        }
    except subprocess.TimeoutExpired:
        return {"success": False, "stdout": "", "stderr": "Command timed out"}
    except Exception as e:
        return {"success": False, "stdout": "", "stderr": str(e)}


def list_proteins() -> list[str]:
    """List available protein IDs."""
    proteins_dir = QAFI_DIR / "data" / "proteins"
    if not proteins_dir.exists():
        return []
    return sorted(d.name for d in proteins_dir.iterdir() if d.is_dir())


def get_protein_info(protein_id: str) -> dict | None:
    """Get info about a specific protein's available data files."""
    pdir = QAFI_DIR / "data" / "proteins" / protein_id
    if not pdir.exists():
        return None
    files = sorted(f.name for f in pdir.iterdir() if f.is_file())
    csv_files = [f for f in files if f.endswith(".csv")]
    return {
        "protein_id": protein_id,
        "directory": str(pdir),
        "files": files,
        "csv_files": csv_files,
        "has_structure": any(f.endswith(".cif") for f in files),
    }


def list_psp_methods() -> list[str]:
    """List available PSP methods."""
    result = run_command("scripts/models/run_psp.py", ["--list"])
    if result["success"]:
        return [m.strip() for m in result["stdout"].strip().split("\n") if m.strip()]
    return []


def list_qafi_methods() -> list[str]:
    """List available QAFI methods."""
    result = run_command("scripts/models/run_qafi.py", ["--list"])
    if result["success"]:
        return [m.strip() for m in result["stdout"].strip().split("\n") if m.strip()]
    return []


def run_psp(method: str) -> dict:
    """Run a PSP model. method='all' runs all."""
    if method == "all":
        return run_command("scripts/models/run_psp.py", ["--all"])
    return run_command("scripts/models/run_psp.py", ["--method", method])


def run_qafi(method: str, protein_id: str) -> dict:
    """Run a QAFI model for a specific protein."""
    args = ["--uniprot", protein_id]
    if method == "all":
        args.insert(0, "--all")
    else:
        args = ["--method", method] + args
    return run_command("scripts/models/run_qafi.py", args)


def load_qafi_results(method: str, protein_id: str) -> dict | None:
    """Load QAFI prediction results as structured data for the frontend."""
    results_csv = QAFI_DIR / "outputs" / "runs" / "qafi" / method / protein_id / f"{method}.csv"
    if not results_csv.exists():
        return None

    df = pd.read_csv(results_csv)
    score_col = method  # the prediction column is named after the method

    result = {
        "total_variants": len(df),
        "columns": list(df.columns),
        "variants": [],
    }

    # Build per-variant records
    for _, row in df.iterrows():
        variant = {
            "variant": row.get("variant", ""),
            "position": int(row["pos"]) if "pos" in row else None,
            "wt": row.get("first", ""),
            "mut": row.get("second", ""),
            "score": round(float(row[score_col]), 4) if score_col in row else None,
        }
        result["variants"].append(variant)

    # Summary stats
    if score_col in df.columns:
        scores = df[score_col].dropna()
        result["stats"] = {
            "mean": round(float(scores.mean()), 4),
            "std": round(float(scores.std()), 4),
            "min": round(float(scores.min()), 4),
            "max": round(float(scores.max()), 4),
            "median": round(float(scores.median()), 4),
        }
        # Score distribution (histogram bins for chart)
        hist_counts, bin_edges = np.histogram(scores, bins=20)
        result["distribution"] = [
            {"bin_start": round(float(bin_edges[i]), 3),
             "bin_end": round(float(bin_edges[i + 1]), 3),
             "count": int(hist_counts[i])}
            for i in range(len(hist_counts))
        ]

    return result


def lookup_variant(protein_id: str, variant_query: str, method: str = "qafisplit3") -> dict | None:
    """
    Look up a single variant and return clinical interpretation.
    variant_query can be: "L117H", "117", "L117", etc.
    """
    # Load prediction scores
    results_csv = QAFI_DIR / "outputs" / "runs" / "qafi" / method / protein_id / f"{method}.csv"
    if not results_csv.exists():
        return None
    scores_df = pd.read_csv(results_csv)

    # Load features for interpretation
    features_csv = QAFI_DIR / "data" / "proteins" / protein_id / f"{protein_id}_features29.csv"
    features_df = pd.read_csv(features_csv) if features_csv.exists() else None

    # Parse query — find the target variant
    query = variant_query.strip().upper()
    match = scores_df[scores_df["variant"].str.upper() == query]
    if match.empty:
        # Try position match
        try:
            pos = int("".join(c for c in query if c.isdigit()))
            match = scores_df[scores_df["pos"] == pos]
        except ValueError:
            return None
    if match.empty:
        return None

    # Get the primary variant (first match if position search)
    target = match.iloc[0]
    score = float(target[method])
    position = int(target["pos"])
    wt = target["first"]
    mut = target["second"]
    variant_name = target["variant"]

    # Score context — where does this score sit among all variants?
    all_scores = scores_df[method].dropna()
    percentile = float((all_scores < score).mean() * 100)
    score_min = float(all_scores.min())
    score_max = float(all_scores.max())

    # Classification based on score percentile
    if percentile >= 80:
        classification = "Likely Pathogenic"
        confidence = "High"
        color = "#dc2626"
    elif percentile >= 60:
        classification = "Possibly Pathogenic"
        confidence = "Moderate"
        color = "#ea580c"
    elif percentile >= 40:
        classification = "Uncertain Significance (VUS)"
        confidence = "Low"
        color = "#ca8a04"
    elif percentile >= 20:
        classification = "Possibly Benign"
        confidence = "Moderate"
        color = "#2563eb"
    else:
        classification = "Likely Benign"
        confidence = "High"
        color = "#16a34a"

    # All variants at this position (context)
    pos_variants = scores_df[scores_df["pos"] == position].copy()
    pos_variants = pos_variants.sort_values(method, ascending=False)
    pos_scores = pos_variants[method].tolist()
    pos_mean = float(np.mean(pos_scores))
    pos_rank = int((pos_variants[method] >= score).sum())  # rank among position variants

    same_pos_list = [
        {"variant": r["variant"], "mut": r["second"], "score": round(float(r[method]), 4)}
        for _, r in pos_variants.iterrows()
    ]

    # Feature-based interpretation
    evidence = []
    if features_df is not None:
        feat_row = features_df[
            (features_df["pos"] == position) & (features_df["second"] == mut)
        ]
        if feat_row.empty:
            feat_row = features_df[features_df["pos"] == position].head(1)
        if not feat_row.empty:
            f = feat_row.iloc[0]

            # pLDDT — structural confidence
            plddt = f.get("pLDDT")
            if plddt is not None:
                plddt = float(plddt)
                if plddt >= 90:
                    evidence.append({"feature": "Structure Confidence", "value": f"{plddt:.1f}", "detail": "Very high confidence region (pLDDT >= 90) — variants here more likely to disrupt structure", "impact": "damaging"})
                elif plddt >= 70:
                    evidence.append({"feature": "Structure Confidence", "value": f"{plddt:.1f}", "detail": "Confident structural region (pLDDT 70-90)", "impact": "moderate"})
                else:
                    evidence.append({"feature": "Structure Confidence", "value": f"{plddt:.1f}", "detail": "Low confidence / disordered region (pLDDT < 70) — variants may be tolerated", "impact": "benign"})

            # Shannon entropy — conservation
            entropy = f.get("Shannon's entropy")
            if entropy is not None:
                entropy = float(entropy)
                if entropy < 1.0:
                    evidence.append({"feature": "Conservation", "value": f"{entropy:.2f}", "detail": "Highly conserved position (low entropy) — substitutions likely damaging", "impact": "damaging"})
                elif entropy < 2.0:
                    evidence.append({"feature": "Conservation", "value": f"{entropy:.2f}", "detail": "Moderately conserved position", "impact": "moderate"})
                else:
                    evidence.append({"feature": "Conservation", "value": f"{entropy:.2f}", "detail": "Variable position (high entropy) — substitutions may be tolerated", "impact": "benign"})

            # BLOSUM62 — substitution likelihood
            blosum = f.get("Blosum62")
            if blosum is not None:
                blosum = float(blosum)
                if blosum <= -2:
                    evidence.append({"feature": "Substitution Matrix", "value": f"BLOSUM62 = {blosum:.0f}", "detail": f"{wt} → {mut} is a biochemically unfavorable substitution", "impact": "damaging"})
                elif blosum >= 1:
                    evidence.append({"feature": "Substitution Matrix", "value": f"BLOSUM62 = {blosum:.0f}", "detail": f"{wt} → {mut} is a biochemically conservative substitution", "impact": "benign"})
                else:
                    evidence.append({"feature": "Substitution Matrix", "value": f"BLOSUM62 = {blosum:.0f}", "detail": f"{wt} → {mut} is a moderately tolerated substitution", "impact": "moderate"})

            # PSSM — position-specific scoring
            pssm = f.get("PSSM")
            if pssm is not None:
                pssm = float(pssm)
                if pssm > 2:
                    evidence.append({"feature": "Position-Specific Score", "value": f"PSSM = {pssm:.1f}", "detail": "This substitution is rarely seen at this position across species", "impact": "damaging"})
                elif pssm < -1:
                    evidence.append({"feature": "Position-Specific Score", "value": f"PSSM = {pssm:.1f}", "detail": "This substitution is commonly seen at this position", "impact": "benign"})

            # Neighborhood conservation
            neco = f.get("neco")
            if neco is not None:
                neco = float(neco)
                if neco > 0.5:
                    evidence.append({"feature": "3D Neighborhood", "value": f"neco = {neco:.3f}", "detail": "Surrounding residues in 3D are highly conserved — functional region", "impact": "damaging"})
                elif neco < -0.5:
                    evidence.append({"feature": "3D Neighborhood", "value": f"neco = {neco:.3f}", "detail": "Surrounding residues are variable — less constrained region", "impact": "benign"})

    return {
        "variant": variant_name,
        "protein_id": protein_id,
        "protein_name": features_df.iloc[0]["protein"] if features_df is not None and "protein" in features_df.columns else protein_id,
        "position": position,
        "wt": wt,
        "mut": mut,
        "score": round(score, 4),
        "score_range": {"min": round(score_min, 4), "max": round(score_max, 4)},
        "percentile": round(percentile, 1),
        "classification": classification,
        "confidence": confidence,
        "color": color,
        "method": method,
        "evidence": evidence,
        "position_context": {
            "total_variants": len(pos_variants),
            "mean_score": round(pos_mean, 4),
            "rank": pos_rank,
            "variants": same_pos_list,
        },
    }


def load_dataset() -> pd.DataFrame | None:
    """Load the main 60-protein dataset."""
    path = QAFI_DIR / "data" / "Dataset_60proteins_features.csv.gz"
    if path.exists():
        return pd.read_csv(path)
    return None


def load_protein_features(protein_id: str) -> pd.DataFrame | None:
    """Load feature CSV for a protein."""
    pdir = QAFI_DIR / "data" / "proteins" / protein_id
    # Try various feature file patterns
    for pattern in [f"{protein_id}_features5.csv", f"{protein_id}_all_features.csv"]:
        path = pdir / pattern
        if path.exists():
            return pd.read_csv(path)
    # Check outputs
    out_path = QAFI_DIR / "outputs" / "features" / f"{protein_id}_all_features.csv"
    if out_path.exists():
        return pd.read_csv(out_path)
    return None
