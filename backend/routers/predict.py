"""
Prediction Router — endpoints for running QAFI predictions.
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from ..services import qafi

router = APIRouter(prefix="/api/predict", tags=["prediction"])


class PredictRequest(BaseModel):
    protein_id: str
    method: str  # PSP or QAFI method name
    model_type: str = "psp"  # "psp" or "qafi"


class PredictResponse(BaseModel):
    success: bool
    method: str
    protein_id: str
    output: str
    error: str | None = None


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
    """List all available prediction methods."""
    return {
        "psp": qafi.list_psp_methods(),
        "qafi": qafi.list_qafi_methods(),
    }


@router.post("/run", response_model=PredictResponse)
def run_prediction(req: PredictRequest):
    """Run a prediction model."""
    if req.model_type == "psp":
        result = qafi.run_psp(req.method)
    elif req.model_type == "qafi":
        result = qafi.run_qafi(req.method, req.protein_id)
    else:
        raise HTTPException(status_code=400, detail=f"Unknown model_type: {req.model_type}")

    return PredictResponse(
        success=result["success"],
        method=req.method,
        protein_id=req.protein_id,
        output=result["stdout"][:3000],
        error=result["stderr"] if not result["success"] else None,
    )
