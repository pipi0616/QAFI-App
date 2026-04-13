"""QAFI prediction tool — wraps QAFI_CODE_NEW model."""

import subprocess
import csv
import io
from pathlib import Path
from langchain_core.tools import tool

QAFI_DIR = Path("/Users/pipi/Projects/QAFI_Paper/QAFI_CODE_NEW")


@tool
def qafi_predict(protein_id: str, variant: str) -> dict:
    """Run QAFI variant effect prediction model.
    Returns the predicted functional impact score and classification.
    Use this when asked about a variant's predicted pathogenicity from QAFI."""

    # Check cached results first
    results_csv = QAFI_DIR / "outputs" / "runs" / "qafi" / "qafisplit3" / protein_id / "qafisplit3.csv"
    if results_csv.exists():
        with open(results_csv) as f:
            reader = csv.DictReader(f)
            for row in reader:
                if row["variant"] == variant:
                    score = float(row["qafisplit3"])
                    return {
                        "variant": variant,
                        "protein_id": protein_id,
                        "score": round(score, 4),
                        "method": "qafisplit3",
                        "status": "success",
                    }

    # If not cached, run prediction
    cmd = f"conda run -n pipi python scripts/models/run_qafi.py --method qafisplit3 --uniprot {protein_id}"
    try:
        result = subprocess.run(cmd, shell=True, cwd=str(QAFI_DIR),
                                capture_output=True, text=True, timeout=300)
        if result.returncode == 0:
            # Re-read results
            if results_csv.exists():
                with open(results_csv) as f:
                    reader = csv.DictReader(f)
                    for row in reader:
                        if row["variant"] == variant:
                            return {
                                "variant": variant,
                                "protein_id": protein_id,
                                "score": round(float(row["qafisplit3"]), 4),
                                "method": "qafisplit3",
                                "status": "success",
                            }
        return {"variant": variant, "error": result.stderr[:200], "status": "failed"}
    except Exception as e:
        return {"variant": variant, "error": str(e), "status": "failed"}
