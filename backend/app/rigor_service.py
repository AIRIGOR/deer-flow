"""Minimal public service for RIGOR's DeerFlow-backed document intelligence."""

from __future__ import annotations

import hmac
import os

from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel, Field

from deerflow.rigor import RigorAnalysisError, RigorDocumentAnalyzer

app = FastAPI(
    title="RIGOR DeerFlow Intelligence",
    version="0.1.0",
    docs_url=None,
    redoc_url=None,
)


class AnalyzeDocumentRequest(BaseModel):
    document_name: str = Field(min_length=1, max_length=255)
    pages: list[str] = Field(min_length=1, max_length=120)


def _authorize(token: str | None) -> None:
    configured = os.getenv("RIGOR_SERVICE_TOKEN", "").strip()
    if not configured:
        raise HTTPException(
            status_code=503,
            detail="RIGOR service authentication is not configured",
        )
    provided = (token or "").strip()
    if not provided or not hmac.compare_digest(provided, configured):
        raise HTTPException(status_code=401, detail="Invalid RIGOR service token")


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "healthy", "service": "rigor-deerflow-intelligence"}


@app.post("/api/rigor/analyze")
async def analyze_document(
    body: AnalyzeDocumentRequest,
    x_rigor_service_token: str | None = Header(default=None),
):
    _authorize(x_rigor_service_token)

    total_chars = sum(len(page) for page in body.pages)
    if total_chars > 600_000:
        raise HTTPException(
            status_code=413,
            detail="RIGOR analysis input exceeds the 600,000 character limit",
        )

    try:
        result = await RigorDocumentAnalyzer().analyze(
            document_name=body.document_name,
            pages=body.pages,
        )
    except RigorAnalysisError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    return result.model_dump()
