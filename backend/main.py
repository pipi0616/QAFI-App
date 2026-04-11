"""
QAFI App — FastAPI Backend
A clinical-facing web application for protein variant prediction and interpretation.
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .routers import predict, analysis, agent

app = FastAPI(
    title="QAFI",
    description="Quantitative Assessment of Functional Impact — Variant Prediction & Interpretation",
    version="1.0.0",
)

# Allow frontend (React dev server) to call backend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(predict.router)
app.include_router(analysis.router)
app.include_router(agent.router)


@app.get("/api/health")
def health():
    return {"status": "ok", "app": "QAFI"}
