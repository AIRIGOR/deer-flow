from __future__ import annotations

import os
from pathlib import Path
from typing import Annotated, Literal

from fastapi import Cookie, FastAPI, File, HTTPException, Request, Response, UploadFile
from fastapi.responses import FileResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from .database import Database
from .service import DEPARTMENTS, RigorService


APP_ROOT = Path(__file__).resolve().parent
DATA_DIR = Path(os.getenv("RIGOR_DATA_DIR", APP_ROOT.parent / "data"))
DB_PATH = Path(os.getenv("RIGOR_DB_PATH", DATA_DIR / "rigor-beta.db"))
SECRET_KEY = os.getenv("RIGOR_SECRET_KEY", "development-only-change-me")
COOKIE_SECURE = os.getenv("RIGOR_COOKIE_SECURE", "false").lower() == "true"
SESSION_COOKIE = "rigor_beta_session"

database = Database(DB_PATH)
service = RigorService(database, SECRET_KEY)
app = FastAPI(title="RIGOR Private Beta", version="1.0.0")


class StartRequest(BaseModel):
    display_name: str = Field(min_length=2, max_length=60)
    role: Literal["TM", "PM", "Video", "Audio", "Lighting", "Rigging", "Backline", "Other"]


class RequirementUpdate(BaseModel):
    status: Literal["EXTRACTED", "NEEDS_CONFIRMATION", "CONFIRMED", "REJECTED", "RESOLVED"] | None = None
    department: str | None = None
    owner: str | None = Field(default=None, max_length=80)
    due_at: str | None = Field(default=None, max_length=40)


class ConflictResolution(BaseModel):
    resolution: str = Field(min_length=8, max_length=600)
    owner: str = Field(min_length=2, max_length=80)


class CheckpointUpdate(BaseModel):
    complete: bool


class IncidentCreate(BaseModel):
    department: str
    summary: str = Field(min_length=5, max_length=500)
    severity: Literal["LOW", "MEDIUM", "HIGH", "CRITICAL"]
    resolution: str | None = Field(default=None, max_length=800)


class FeedbackCreate(BaseModel):
    session_number: Literal[1, 2, 3]
    useful_score: int = Field(ge=1, le=5)
    trust_score: int = Field(ge=1, le=5)
    comments: str = Field(default="", max_length=2000)


def auth_context(token: str | None) -> tuple[dict, dict]:
    tester = service.tester_for_token(token)
    if not tester:
        raise HTTPException(status_code=401, detail="Start or resume your RIGOR beta session")
    return tester, service.workspace_for_tester(tester["tester_id"])


@app.middleware("http")
async def security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
    if request.url.path.startswith("/api/"):
        response.headers["Cache-Control"] = "no-store"
    return response


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok", "service": "rigor-private-beta"}


@app.post("/api/start")
def start(payload: StartRequest, response: Response) -> dict:
    token, snapshot = service.start_tester(payload.display_name, payload.role)
    response.set_cookie(
        SESSION_COOKIE,
        token,
        max_age=45 * 24 * 60 * 60,
        httponly=True,
        secure=COOKIE_SECURE,
        samesite="lax",
        path="/",
    )
    return snapshot


@app.post("/api/logout")
def logout(response: Response) -> dict[str, bool]:
    response.delete_cookie(SESSION_COOKIE, path="/")
    return {"ok": True}


@app.get("/api/workspace")
def workspace(rigor_beta_session: Annotated[str | None, Cookie()] = None) -> dict:
    tester, _ = auth_context(rigor_beta_session)
    return service.snapshot_for_tester(tester["tester_id"])


@app.patch("/api/requirements/{requirement_id}")
def update_requirement(requirement_id: str, payload: RequirementUpdate, rigor_beta_session: Annotated[str | None, Cookie()] = None) -> dict:
    tester, workspace = auth_context(rigor_beta_session)
    values = payload.model_dump(exclude_none=True)
    if "department" in values and values["department"] not in DEPARTMENTS:
        raise HTTPException(status_code=422, detail="Invalid department")
    try:
        service.update_requirement(workspace["workspace_id"], requirement_id, values)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return service.snapshot_for_tester(tester["tester_id"])


@app.post("/api/conflicts/{conflict_id}/resolve")
def resolve_conflict(conflict_id: str, payload: ConflictResolution, rigor_beta_session: Annotated[str | None, Cookie()] = None) -> dict:
    tester, workspace = auth_context(rigor_beta_session)
    try:
        service.resolve_conflict(workspace["workspace_id"], conflict_id, payload.resolution, payload.owner)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return service.snapshot_for_tester(tester["tester_id"])


@app.patch("/api/checkpoints/{checkpoint_id}")
def update_checkpoint(checkpoint_id: str, payload: CheckpointUpdate, rigor_beta_session: Annotated[str | None, Cookie()] = None) -> dict:
    tester, workspace = auth_context(rigor_beta_session)
    try:
        service.update_checkpoint(workspace["workspace_id"], checkpoint_id, payload.complete)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return service.snapshot_for_tester(tester["tester_id"])


@app.post("/api/incidents")
def create_incident(payload: IncidentCreate, rigor_beta_session: Annotated[str | None, Cookie()] = None) -> dict:
    tester, workspace = auth_context(rigor_beta_session)
    try:
        service.add_incident(workspace["workspace_id"], payload.department, payload.summary, payload.severity, payload.resolution)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return service.snapshot_for_tester(tester["tester_id"])


@app.post("/api/feedback")
def feedback(payload: FeedbackCreate, rigor_beta_session: Annotated[str | None, Cookie()] = None) -> dict[str, bool]:
    _, workspace = auth_context(rigor_beta_session)
    try:
        service.save_feedback(workspace["workspace_id"], payload.session_number, payload.useful_score, payload.trust_score, payload.comments)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return {"ok": True}


@app.post("/api/documents")
def upload_document(file: Annotated[UploadFile, File()], rigor_beta_session: Annotated[str | None, Cookie()] = None) -> dict:
    tester, workspace = auth_context(rigor_beta_session)
    content = file.file.read(15 * 1024 * 1024 + 1)
    try:
        result = service.ingest_document(workspace["workspace_id"], file.filename or "document", content)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return {"result": result, "workspace": service.snapshot_for_tester(tester["tester_id"])}


@app.get("/api/reports/advance.pdf")
def report(department: str | None = None, rigor_beta_session: Annotated[str | None, Cookie()] = None) -> StreamingResponse:
    _, workspace = auth_context(rigor_beta_session)
    if department and department not in DEPARTMENTS:
        raise HTTPException(status_code=422, detail="Invalid department")
    data = service.report_pdf(workspace["workspace_id"], department)
    filename = f"RIGOR-{department or 'Master'}-Advance-Report.pdf".replace(" ", "-")
    return StreamingResponse(
        iter([data]),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@app.get("/")
def index() -> FileResponse:
    return FileResponse(APP_ROOT / "static" / "index.html")


app.mount("/assets", StaticFiles(directory=APP_ROOT / "static"), name="assets")

