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
