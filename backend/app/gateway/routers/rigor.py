"""HTTP API for RIGOR shows, documents, and requirements."""

from __future__ import annotations

import hmac
import inspect
import os
from collections.abc import Awaitable
from datetime import date, datetime
from uuid import uuid4

from fastapi import APIRouter, HTTPException, Query, Request
from pydantic import BaseModel, Field

from app.gateway.authz import require_permission
from app.gateway.deps import get_rigor_manager
from app.gateway.founder_authority import authorize_founder_command
from deerflow.persistence.rigor.audit import AuditContext, audit_scope
from deerflow.rigor import (
    DocumentProcessingStatus,
    DocumentType,
    RequirementOriginType,
    RequirementStatus,
    RigorAnalysisError,
    RigorConflictError,
    RigorDocumentAnalyzer,
    RigorNotFoundError,
    ShowStatus,
)
from deerflow.rigor.john_pm import JohnEvidence, JohnPmAgent, JohnPmError
from deerflow.rigor.manager import RigorAuthorityError

router = APIRouter(prefix="/api/rigor", tags=["rigor"])


@router.get("/founder/authority")
async def founder_command_authority(request: Request, tenant_id: str = Query(min_length=1, max_length=128), command_permission: str = "LOCAL_DRY_RUN"):
    """Read-only scope check; no trusted assignment reader is installed by default."""
    reader = getattr(request.app.state, "rigor_founder_assignments", None)
    binding = await authorize_founder_command(request, tenant_id, reader, command_permission=command_permission)
    return binding.receipt_attribution()


async def _service_call[T](operation: Awaitable[T], *, request: Request | None = None) -> T:
    try:
        if request is not None:
            auth = getattr(request.state, "auth", None)
            user_id = getattr(getattr(auth, "user", None), "id", None)
            if auth is None or not auth.is_authenticated or user_id is None:
                if inspect.iscoroutine(operation):
                    operation.close()
                raise HTTPException(status_code=401, detail="Authenticated audit actor required")
            route = getattr(request.scope.get("route"), "path", "/api/rigor")
            with audit_scope(AuditContext("USER", str(user_id), str(uuid4()), f"{request.method} {route}")):
                return await operation
        return await operation
    except RigorAuthorityError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc
    except RigorNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except RigorConflictError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


class ShowCreateRequest(BaseModel):
    show_id: str | None = None
    tour_name: str | None = None
    artist_or_client: str | None = None
    show_name: str | None = None
    venue_name: str | None = None
    city: str | None = None
    state_region: str | None = None
    country: str | None = None
    timezone: str | None = None
    load_in_at: datetime | None = None
    doors_at: datetime | None = None
    show_at: datetime | None = None
    curfew_at: datetime | None = None
    show_status: ShowStatus = ShowStatus.DOCUMENTS_PENDING


class ShowUpdateRequest(BaseModel):
    tour_name: str | None = None
    artist_or_client: str | None = None
    show_name: str | None = None
    venue_name: str | None = None
    city: str | None = None
    state_region: str | None = None
    country: str | None = None
    timezone: str | None = None
    load_in_at: datetime | None = None
    doors_at: datetime | None = None
    show_at: datetime | None = None
    curfew_at: datetime | None = None
    show_status: ShowStatus | None = None


class DocumentCreateRequest(BaseModel):
    document_id: str | None = None
    document_name: str = Field(min_length=1)
    document_type: DocumentType
    source_party: str | None = None
    revision: str | None = None
    document_date: date | None = None
    received_at: datetime | None = None
    file_format: str | None = None
    page_count: int | None = Field(default=None, ge=1)
    storage_location: str | None = None
    processing_status: DocumentProcessingStatus = DocumentProcessingStatus.RECEIVED
    supersedes_document_id: str | None = None


class DocumentUpdateRequest(BaseModel):
    show_id: str | None = None
    document_name: str | None = Field(default=None, min_length=1)
    document_type: DocumentType | None = None
    source_party: str | None = None
    revision: str | None = None
    document_date: date | None = None
    received_at: datetime | None = None
    file_format: str | None = None
    page_count: int | None = Field(default=None, ge=1)
    storage_location: str | None = None
    processing_status: DocumentProcessingStatus | None = None
    supersedes_document_id: str | None = None


class RequirementCreateRequest(BaseModel):
    requirement_id: str | None = None
    document_id: str | None = None
    department: str = Field(min_length=1)
    category: str = Field(min_length=1)
    requirement_text: str = Field(min_length=1)
    normalized_value: str | None = None
    unit: str | None = None
    origin_type: RequirementOriginType
    source_page: int | None = Field(default=None, ge=1)
    source_location: str | None = None
    source_excerpt: str | None = None
    confidence: float | None = Field(default=None, ge=0.0, le=1.0)
    requirement_status: RequirementStatus = RequirementStatus.EXTRACTED
    owner: str | None = None
    due_at: datetime | None = None


class RequirementUpdateRequest(BaseModel):
    show_id: str | None = None
    document_id: str | None = None
    department: str | None = Field(default=None, min_length=1)
    category: str | None = Field(default=None, min_length=1)
    requirement_text: str | None = Field(default=None, min_length=1)
    normalized_value: str | None = None
    unit: str | None = None
    origin_type: RequirementOriginType | None = None
    source_page: int | None = Field(default=None, ge=1)
    source_location: str | None = None
    source_excerpt: str | None = None
    confidence: float | None = Field(default=None, ge=0.0, le=1.0)
    requirement_status: RequirementStatus | None = None
    owner: str | None = None
    due_at: datetime | None = None


class AnalyzeDocumentRequest(BaseModel):
    document_name: str = Field(min_length=1, max_length=255)
    pages: list[str] = Field(min_length=1, max_length=120)


class JohnPmRequest(BaseModel):
    synthetic: bool = True
    evidence: list[JohnEvidence] = Field(min_length=1, max_length=80)


@router.post("/agents/john/analyze")
async def analyze_john_pm(request: Request, body: JohnPmRequest):
    """Synthetic, read-only model advisory. No show state can be mutated."""
    configured_token = os.getenv("RIGOR_SERVICE_TOKEN", "").strip()
    provided_token = request.headers.get("x-rigor-service-token", "").strip()
    if not configured_token:
        raise HTTPException(status_code=503, detail="RIGOR service authentication is not configured")
    if not provided_token or not hmac.compare_digest(provided_token, configured_token):
        raise HTTPException(status_code=401, detail="Invalid RIGOR service token")
    if body.synthetic is not True:
        raise HTTPException(status_code=403, detail="John is restricted to synthetic rehearsal")
    try:
        result = await JohnPmAgent().analyze(evidence=body.evidence)
    except JohnPmError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    return result.model_dump()


@router.post("/analyze")
async def analyze_document(request: Request, body: AnalyzeDocumentRequest):
    configured_token = os.getenv("RIGOR_SERVICE_TOKEN", "").strip()
    provided_token = request.headers.get("x-rigor-service-token", "").strip()
    if not configured_token:
        raise HTTPException(
            status_code=503,
            detail="RIGOR service authentication is not configured",
        )
    if not provided_token or not hmac.compare_digest(provided_token, configured_token):
        raise HTTPException(status_code=401, detail="Invalid RIGOR service token")

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


@router.get("/shows")
@require_permission("threads", "read")
async def list_shows(
    request: Request,
    show_status: ShowStatus | None = None,
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
):
    manager = get_rigor_manager(request)
    return await _service_call(
        manager.list_shows(
            show_status=show_status,
            limit=limit,
            offset=offset,
        )
    )


@router.post("/shows")
@require_permission("threads", "write")
async def create_show(request: Request, body: ShowCreateRequest):
    manager = get_rigor_manager(request)
    return await _service_call(manager.create_show(**body.model_dump()), request=request)


@router.get("/shows/{show_id}")
@require_permission("threads", "read")
async def get_show(show_id: str, request: Request):
    manager = get_rigor_manager(request)
    return await _service_call(manager.get_show(show_id))


@router.patch("/shows/{show_id}")
@require_permission("threads", "write")
async def update_show(show_id: str, request: Request, body: ShowUpdateRequest):
    manager = get_rigor_manager(request)
    updates = body.model_dump(exclude_unset=True)
    return await _service_call(manager.update_show(show_id, **updates), request=request)


@router.delete("/shows/{show_id}")
@require_permission("threads", "write")
async def delete_show(show_id: str, request: Request):
    manager = get_rigor_manager(request)
    await _service_call(manager.delete_show(show_id), request=request)
    return {"id": show_id, "deleted": True}


@router.get("/shows/{show_id}/snapshot")
@require_permission("threads", "read")
async def get_show_snapshot(show_id: str, request: Request):
    manager = get_rigor_manager(request)
    snapshot = await _service_call(manager.get_show_snapshot(show_id))
    return {
        "show": snapshot.show,
        "documents": snapshot.documents,
        "requirements": snapshot.requirements,
    }


@router.get("/shows/{show_id}/documents")
@require_permission("threads", "read")
async def list_documents(
    show_id: str,
    request: Request,
    document_type: DocumentType | None = None,
    processing_status: DocumentProcessingStatus | None = None,
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
):
    manager = get_rigor_manager(request)
    return await _service_call(
        manager.list_documents(
            show_id,
            document_type=document_type,
            processing_status=processing_status,
            limit=limit,
            offset=offset,
        )
    )


@router.post("/shows/{show_id}/documents")
@require_permission("threads", "write")
async def add_document(show_id: str, request: Request, body: DocumentCreateRequest):
    manager = get_rigor_manager(request)
    return await _service_call(manager.add_document(show_id, **body.model_dump()), request=request)


@router.get("/documents/{document_id}")
@require_permission("threads", "read")
async def get_document(document_id: str, request: Request):
    manager = get_rigor_manager(request)
    return await _service_call(manager.get_document(document_id))


@router.patch("/documents/{document_id}")
@require_permission("threads", "write")
async def update_document(
    document_id: str,
    request: Request,
    body: DocumentUpdateRequest,
):
    manager = get_rigor_manager(request)
    updates = body.model_dump(exclude_unset=True)
    return await _service_call(manager.update_document(document_id, **updates), request=request)


@router.delete("/documents/{document_id}")
@require_permission("threads", "write")
async def delete_document(document_id: str, request: Request):
    manager = get_rigor_manager(request)
    await _service_call(manager.delete_document(document_id), request=request)
    return {"id": document_id, "deleted": True}


@router.get("/shows/{show_id}/requirements")
@require_permission("threads", "read")
async def list_requirements(
    show_id: str,
    request: Request,
    department: str | None = None,
    requirement_status: RequirementStatus | None = None,
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
):
    manager = get_rigor_manager(request)
    return await _service_call(
        manager.list_requirements(
            show_id,
            department=department,
            requirement_status=requirement_status,
            limit=limit,
            offset=offset,
        )
    )


@router.post("/shows/{show_id}/requirements")
@require_permission("threads", "write")
async def add_requirement(
    show_id: str,
    request: Request,
    body: RequirementCreateRequest,
):
    manager = get_rigor_manager(request)
    return await _service_call(manager.add_requirement(show_id, **body.model_dump()), request=request)


@router.get("/requirements/{requirement_id}")
@require_permission("threads", "read")
async def get_requirement(requirement_id: str, request: Request):
    manager = get_rigor_manager(request)
    return await _service_call(manager.get_requirement(requirement_id))


@router.patch("/requirements/{requirement_id}")
@require_permission("threads", "write")
async def update_requirement(
    requirement_id: str,
    request: Request,
    body: RequirementUpdateRequest,
):
    manager = get_rigor_manager(request)
    updates = body.model_dump(exclude_unset=True)
    return await _service_call(manager.update_requirement(requirement_id, **updates), request=request)


@router.delete("/requirements/{requirement_id}")
@require_permission("threads", "write")
async def delete_requirement(requirement_id: str, request: Request):
    manager = get_rigor_manager(request)
    await _service_call(manager.delete_requirement(requirement_id), request=request)
    return {"id": requirement_id, "deleted": True}
