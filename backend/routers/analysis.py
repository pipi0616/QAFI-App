"""
Analysis Router — endpoints for data exploration and interpretation.
"""

from fastapi import APIRouter, HTTPException
from ..services import qafi

router = APIRouter(prefix="/api/analysis", tags=["analysis"])


@router.get("/features/{protein_id}")
def get_features(protein_id: str, limit: int = 100):
    """Get feature data for a protein (for visualization)."""
    df = qafi.load_protein_features(protein_id)
    if df is None:
        raise HTTPException(status_code=404, detail=f"No feature data for {protein_id}")
    return {
        "protein_id": protein_id,
        "shape": list(df.shape),
        "columns": list(df.columns),
        "data": df.head(limit).to_dict(orient="records"),
        "stats": {
            col: {
                "mean": round(float(df[col].mean()), 4),
                "std": round(float(df[col].std()), 4),
                "min": round(float(df[col].min()), 4),
                "max": round(float(df[col].max()), 4),
            }
            for col in df.select_dtypes(include="number").columns[:20]
        },
    }


@router.get("/dataset/overview")
def dataset_overview():
    """Get overview stats of the main 60-protein dataset."""
    df = qafi.load_dataset()
    if df is None:
        raise HTTPException(status_code=404, detail="Main dataset not found")
    return {
        "total_variants": len(df),
        "total_columns": len(df.columns),
        "columns": list(df.columns),
        "proteins": int(df["uniprot"].nunique()) if "uniprot" in df.columns else None,
        "sample": df.head(5).to_dict(orient="records"),
    }


@router.get("/feature-importance")
def feature_importance():
    """Return the 27 core features used by QAFI models (for interpretation)."""
    # These are the features defined in QAFI_CODE_NEW/src/qafi/model/psp/common.py
    features = {
        "evolutionary": [
            {"name": "blosum62", "description": "BLOSUM62 substitution score", "category": "evolutionary"},
            {"name": "pssm", "description": "Position-Specific Scoring Matrix value", "category": "evolutionary"},
            {"name": "shannon_entropy", "description": "Shannon entropy at position", "category": "evolutionary"},
            {"name": "shannon_entropy_sn", "description": "Shannon entropy of sequence neighbors", "category": "evolutionary"},
        ],
        "structural": [
            {"name": "plddt", "description": "AlphaFold predicted confidence score", "category": "structural"},
            {"name": "plddt_bin", "description": "Binned pLDDT confidence category", "category": "structural"},
        ],
        "neighborhood": [
            {"name": "colasi", "description": "Contact-level amino acid similarity", "category": "neighborhood"},
            {"name": "fanc", "description": "Fraction of conserved neighbors (contact)", "category": "neighborhood"},
            {"name": "fbnc", "description": "Fraction of buried neighbors (contact)", "category": "neighborhood"},
            {"name": "mj_potential", "description": "Miyazawa-Jernigan contact potential", "category": "neighborhood"},
            {"name": "neco", "description": "Neighborhood conservation score", "category": "neighborhood"},
            {"name": "neco2", "description": "Neighborhood conservation v2", "category": "neighborhood"},
            {"name": "neco3", "description": "Neighborhood conservation v3", "category": "neighborhood"},
            {"name": "nce_nr", "description": "Neighborhood conservation entropy (non-redundant)", "category": "neighborhood"},
            {"name": "laar", "description": "Local amino acid representation", "category": "neighborhood"},
        ],
        "pdff": [
            {"name": "pdff_entropy", "description": "Position distribution entropy", "category": "pdff"},
            {"name": "pdff_variance", "description": "Position distribution variance", "category": "pdff"},
        ],
    }
    return {
        "total_features": sum(len(v) for v in features.values()),
        "categories": features,
    }
