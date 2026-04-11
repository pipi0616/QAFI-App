"""
Prediction Router — endpoints for running QAFI variant predictions.
QAFI is the clinical prediction model; PSP is internal training only.
"""

import pandas as pd
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from ..services import qafi

router = APIRouter(prefix="/api/predict", tags=["prediction"])


@router.get("/proteins")
def get_proteins():
    """List all available proteins."""
    proteins = qafi.list_proteins()
    infos = []
    for pid in proteins:
        info = qafi.get_protein_info(pid)
        if info:
            infos.append(info)
    return {"proteins": infos}


@router.get("/proteins/{protein_id}")
def get_protein(protein_id: str):
    """Get details for a specific protein."""
    info = qafi.get_protein_info(protein_id)
    if not info:
        raise HTTPException(status_code=404, detail=f"Protein {protein_id} not found")
    return info


@router.get("/methods")
def get_methods():
    """List available QAFI prediction methods."""
    return {
        "qafi": qafi.list_qafi_methods(),
    }


class PredictRequest(BaseModel):
    protein_id: str
    method: str = "qafisplit3"  # default to best method


@router.post("/run")
def run_prediction(req: PredictRequest):
    """Run QAFI prediction and return structured results."""
    result = qafi.run_qafi(req.method, req.protein_id)

    if not result["success"]:
        raise HTTPException(status_code=500, detail=result["stderr"][:1000])

    # Try to load the output CSV for structured results
    predictions = qafi.load_qafi_results(req.method, req.protein_id)

    return {
        "success": True,
        "method": req.method,
        "protein_id": req.protein_id,
        "log": result["stdout"][:1000],
        "predictions": predictions,
    }


@router.get("/results/{method}/{protein_id}")
def get_results(method: str, protein_id: str):
    """Get previously computed QAFI prediction results (batch)."""
    predictions = qafi.load_qafi_results(method, protein_id)
    if predictions is None:
        raise HTTPException(
            status_code=404,
            detail=f"No results for {method}/{protein_id}. Run prediction first.",
        )
    return {
        "method": method,
        "protein_id": protein_id,
        "predictions": predictions,
    }


@router.get("/lookup/{protein_id}/{variant}")
def lookup_variant(protein_id: str, variant: str, method: str = "qafisplit3"):
    """Look up a single variant — the primary clinical endpoint."""
    result = qafi.lookup_variant(protein_id, variant, method)
    if result is None:
        raise HTTPException(
            status_code=404,
            detail=f"Variant '{variant}' not found for protein {protein_id}",
        )
    return result
