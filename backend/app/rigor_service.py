"""Minimal public service for RIGOR's DeerFlow-backed document intelligence."""

from __future__ import annotations

import hashlib
import hmac
import os

from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel, Field, StrictBool

from deerflow.rigor import (
    CompanyActionProposal,
    RigorAnalysisError,
    RigorCompanyActionExecutionBlocked,
    RigorCompanyActionExecutionError,
    RigorCompanyActionExecutor,
    RigorCompanyOperator,
    RigorCompanyPulseError,
    RigorDocumentAnalyzer,
)
from deerflow.rigor.john_pm import JohnEvidence, JohnPmAgent, JohnPmError

app = FastAPI(
    title="RIGOR DeerFlow Intelligence",
    version="0.1.0",
    docs_url=None,
    redoc_url=None,
)


class AnalyzeDocumentRequest(BaseModel):
    document_name: str = Field(min_length=1, max_length=255)
    pages: list[str] = Field(min_length=1, max_length=120)


class JohnAnalyzeRequest(BaseModel):
    synthetic: StrictBool
    evidence: list[JohnEvidence] = Field(min_length=1, max_length=80)


class CompanyPulseRequest(BaseModel):
    objective: str = Field(
        default="Review current RIGOR company state and identify the highest-leverage next actions.",
        min_length=1,
        max_length=4000,
    )
    context: str | None = Field(default=None, max_length=30000)


class CompanyActionExecuteRequest(BaseModel):
    proposal: CompanyActionProposal
    context: str | None = Field(default=None, max_length=20000)


def _authorize(token: str | None, *, token_sha256: str | None = None) -> None:
    configured = os.getenv("RIGOR_SERVICE_TOKEN", "").strip()
    if not configured:
        raise HTTPException(
            status_code=503,
            detail="RIGOR service authentication is not configured",
        )
    # Digest transport avoids ambiguous non-ASCII HTTP header encoding.
    # The digest is itself a bearer credential: never log or persist it.
    if token_sha256 is not None:
        expected = hashlib.sha256(configured.encode("utf-8")).hexdigest()
        if len(token_sha256) != 64 or any(c not in "0123456789abcdef" for c in token_sha256) or not hmac.compare_digest(token_sha256, expected):
            raise HTTPException(status_code=401, detail="Invalid RIGOR service token")
        return
    provided = (token or "").strip()
    if not provided or not hmac.compare_digest(provided.encode("utf-8"), configured.encode("utf-8")):
        raise HTTPException(status_code=401, detail="Invalid RIGOR service token")


@app.get("/health")
async def health() -> dict[str, str]:
    return {
        "status": "healthy",
        "service": "rigor-deerflow-intelligence",
        "company_team": "v1",
        "action_executor": "v1",
    }


@app.post("/api/rigor/analyze")
async def analyze_document(
    body: AnalyzeDocumentRequest,
    x_rigor_service_token: str | None = Header(default=None),
    x_rigor_service_token_sha256: str | None = Header(default=None),
):
    _authorize(x_rigor_service_token, token_sha256=x_rigor_service_token_sha256)

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


@app.post("/api/rigor/agents/john/analyze")
async def analyze_john(
    body: JohnAnalyzeRequest,
    x_rigor_service_token: str | None = Header(default=None),
    x_rigor_service_token_sha256: str | None = Header(default=None),
):
    _authorize(x_rigor_service_token, token_sha256=x_rigor_service_token_sha256)
    if os.getenv("RIGOR_JOHN_STAGING_ENABLED") != "true":
        raise HTTPException(status_code=403, detail="John requires isolated staging")
    if body.synthetic is not True:
        raise HTTPException(status_code=422, detail="Synthetic evidence is required")
    if sum(len(item.text) for item in body.evidence) > 25000:
        raise HTTPException(status_code=413, detail="Synthetic evidence exceeds the PM analysis limit")
    try:
        result = await JohnPmAgent().analyze(evidence=body.evidence)
    except JohnPmError as exc:
        raise HTTPException(status_code=502, detail="John model response unavailable or invalid") from exc
    return result.model_dump()


@app.post("/api/rigor/company/pulse")
async def run_company_pulse(
    body: CompanyPulseRequest,
    x_rigor_service_token: str | None = Header(default=None),
    x_rigor_service_token_sha256: str | None = Header(default=None),
):
    _authorize(x_rigor_service_token, token_sha256=x_rigor_service_token_sha256)
    try:
        result = await RigorCompanyOperator().run(
            objective=body.objective,
            context=body.context,
        )
    except RigorCompanyPulseError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    return result.model_dump()


@app.post("/api/rigor/company/action/execute")
async def execute_company_action(
    body: CompanyActionExecuteRequest,
    x_rigor_service_token: str | None = Header(default=None),
    x_rigor_service_token_sha256: str | None = Header(default=None),
):
    _authorize(x_rigor_service_token, token_sha256=x_rigor_service_token_sha256)
    try:
        result = await RigorCompanyActionExecutor().execute(
            body.proposal,
            context=body.context,
        )
    except RigorCompanyActionExecutionBlocked as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except RigorCompanyActionExecutionError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    return result.model_dump()
