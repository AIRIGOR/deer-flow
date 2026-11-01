"""Core SQL audit-history regressions: temporary SQLite and synthetic input only."""

import asyncio
from datetime import datetime, timedelta, timezone
from uuid import UUID

import httpx
import pytest
import pytest_asyncio
from _router_auth_helpers import make_authed_test_app
from fastapi import FastAPI
from sqlalchemy import event, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import create_async_engine

from app.gateway.auth.models import User
from app.gateway.authz import AuthContext
from app.gateway.routers import rigor
from deerflow.config.database_config import DatabaseConfig
from deerflow.persistence.bootstrap import _get_alembic_config, _upgrade
from deerflow.persistence.engine import close_engine, get_session_factory, init_engine_from_config
from deerflow.persistence.rigor import RigorRepository
from deerflow.persistence.rigor.audit import AuditContext, audit_scope
from deerflow.persistence.rigor.audit_model import RigorAuditRow
from deerflow.rigor.manager import RigorManager


@pytest_asyncio.fixture
async def repo(tmp_path):
    await init_engine_from_config(DatabaseConfig(backend="sqlite", sqlite_dir=str(tmp_path)))
    try:
        yield RigorRepository(get_session_factory())
    finally:
        await close_engine()


async def seed(repo):
    await repo.create_show(show_id="show-a", show_name="Synthetic initial")
    await repo.create_document(document_id="doc-a", show_id="show-a", document_name="Synthetic rider", document_type="RIDER", storage_location="https://example.invalid/file?secret=synthetic")
    await repo.create_requirement(
        requirement_id="req-a", show_id="show-a", document_id="doc-a", department="VIDEO", category="SCREEN", requirement_text="Synthetic screen", origin_type="SOURCE_DOCUMENT", source_page=2, source_excerpt="Private synthetic excerpt"
    )


@pytest.mark.asyncio
async def test_core_changes_have_durable_history(tmp_path):
    await init_engine_from_config(DatabaseConfig(backend="sqlite", sqlite_dir=str(tmp_path)))
    try:
        repo = RigorRepository(get_session_factory())
        await repo.create_show(show_id="show-a", show_name="Synthetic initial")
        await repo.update_show("show-a", updates={"show_name": "Synthetic revised"})
        history = await repo.list_history("show-a")
        assert [item["action"] for item in history] == ["CREATE", "UPDATE"]
        assert history[1]["before_state"]["show_name"] == "Synthetic initial"
        assert history[1]["after_state"]["show_name"] == "Synthetic revised"
    finally:
        await close_engine()


@pytest.mark.asyncio
async def test_all_entity_kinds_redaction_sources_and_stable_ids(repo):
    await seed(repo)
    history = await repo.list_history("show-a")
    assert {item["entity_type"] for item in history} == {"SHOW", "DOCUMENT", "REQUIREMENT"}
    assert all(item["actor_kind"] == "SYSTEM" and item["actor_id"] == "rigor-core" for item in history)
    assert all(item["occurred_at"] and item["correlation_id"] for item in history)
    assert all(item["before_state"] is None for item in history)
    requirement = next(item for item in history if item["entity_type"] == "REQUIREMENT")
    assert requirement["entity_id"] == requirement["after_state"]["requirement_id"] == "req-a"
    assert requirement["source_refs"]["document_id"] == "doc-a"
    assert requirement["source_refs"]["source_page"] == 2
    assert requirement["after_state"]["source_excerpt"]["redacted"] is True
    document = next(item for item in history if item["entity_type"] == "DOCUMENT")
    assert document["after_state"]["storage_location"]["redacted"] is True
    assert "Private synthetic excerpt" not in str(history)
    assert "secret=synthetic" not in str(history)
    await repo.update_document("doc-a", updates={"document_name": "Synthetic revised rider"})
    await repo.update_requirement("req-a", updates={"owner": "Video Lead", "requirement_status": "APPROVED"})
    latest = (await repo.list_history("show-a", entity_type="REQUIREMENT", entity_id="req-a"))[-1]
    assert latest["entity_id"] == "req-a" and latest["after_state"]["document_id"] == "doc-a"
    assert latest["before_state"]["owner"] is None and latest["after_state"]["owner"] == "Video Lead"
    assert latest["approval_context"]["status_changes"]["requirement_status"]["after"] == "APPROVED"
    assert latest["approval_context"]["verified_approval"] is False


@pytest.mark.asyncio
async def test_after_snapshot_matches_database_roundtrip_values(repo):
    value = datetime(2026, 10, 29, 18, 0, tzinfo=timezone(timedelta(hours=5)))
    created = await repo.create_show(show_id="show-a", show_at=value)
    assert (await repo.list_history("show-a"))[-1]["after_state"] == created
    changed = await repo.update_show("show-a", updates={"show_at": value + timedelta(hours=1)})
    assert (await repo.list_history("show-a"))[-1]["after_state"] == changed


@pytest.mark.asyncio
async def test_archive_noop_duplicate_create_and_repeated_delete(repo):
    await repo.create_show(show_id="show-a", show_name="Synthetic")
    original = await repo.get_show("show-a")
    await repo.update_show("show-a", updates={"show_name": "Synthetic"})
    assert await repo.get_show("show-a") == original
    assert len(await repo.list_history("show-a")) == 1
    with pytest.raises(IntegrityError):
        await repo.create_show(show_id="show-a")
    assert len(await repo.list_history("show-a")) == 1
    await repo.update_show("show-a", updates={"show_status": "ARCHIVED"})
    assert (await repo.list_history("show-a"))[-1]["after_state"]["show_status"] == "ARCHIVED"
    assert await repo.delete_show("show-a") is True
    assert await repo.delete_show("show-a") is False
    assert [item["action"] for item in await repo.list_history("show-a")] == ["CREATE", "UPDATE", "DELETE"]


@pytest.mark.asyncio
async def test_document_delete_audits_set_null_dependencies(repo):
    await seed(repo)
    await repo.create_document(document_id="doc-next", show_id="show-a", document_name="Synthetic revision", document_type="RIDER", supersedes_document_id="doc-a")
    await repo.delete_document("doc-a")
    assert (await repo.get_requirement("req-a"))["document_id"] is None
    assert (await repo.get_document("doc-next"))["supersedes_document_id"] is None
    history = await repo.list_history("show-a")
    assert any(item["entity_id"] == "doc-a" and item["action"] == "DELETE" and item["after_state"] is None for item in history)
    for entity_id, field in [("req-a", "document_id"), ("doc-next", "supersedes_document_id")]:
        changes = [item for item in history if item["entity_id"] == entity_id and item["action"] == "UPDATE"]
        assert changes[-1]["before_state"][field] == "doc-a"
        assert changes[-1]["after_state"][field] is None


@pytest.mark.asyncio
async def test_show_delete_keeps_each_child_history_and_isolates_other_show(repo):
    await seed(repo)
    await repo.create_show(show_id="show-b")
    other_history = await repo.list_history("show-b")
    await repo.delete_show("show-a")
    assert await repo.get_show("show-a") is None
    assert await repo.get_document("doc-a") is None
    assert await repo.get_requirement("req-a") is None
    deleted = [item for item in await repo.list_history("show-a") if item["action"] == "DELETE"]
    assert {item["entity_id"] for item in deleted} == {"show-a", "doc-a", "req-a"}
    assert await repo.list_history("show-b") == other_history


@pytest.mark.asyncio
@pytest.mark.parametrize("operation", ["create", "update", "delete"])
async def test_audit_insert_failure_rolls_back_business_and_cascades(repo, operation):
    if operation != "create":
        await seed(repo)
    before = await repo.get_show("show-a")
    history = await repo.list_history("show-a")

    def fail(*args):
        raise RuntimeError("synthetic audit failure")

    event.listen(RigorAuditRow, "before_insert", fail)
    try:
        with pytest.raises(RuntimeError, match="synthetic audit failure"):
            if operation == "create":
                await repo.create_show(show_id="show-a")
            elif operation == "update":
                await repo.update_show("show-a", updates={"show_name": "Must roll back"})
            else:
                await repo.delete_show("show-a")
    finally:
        event.remove(RigorAuditRow, "before_insert", fail)
    assert await repo.get_show("show-a") == before
    assert await repo.list_history("show-a") == history
    if operation == "delete":
        assert (await repo.get_requirement("req-a"))["document_id"] == "doc-a"
        assert (await repo.get_document("doc-a"))["show_id"] == "show-a"


@pytest.mark.asyncio
async def test_scoped_actor_correlation_and_reset(repo):
    with audit_scope(AuditContext("SYSTEM", "synthetic-importer", "job-123", "fixture-packet")):
        await seed(repo)
    assert all(item["actor_id"] == "synthetic-importer" and item["correlation_id"] == "job-123" and item["source_ref"] == "fixture-packet" for item in await repo.list_history("show-a"))
    await repo.update_show("show-a", updates={"city": "Synthetic City"})
    assert (await repo.list_history("show-a"))[-1]["actor_id"] == "rigor-core"


@pytest.mark.asyncio
async def test_transfer_records_both_show_scopes_without_unrelated_events(repo):
    await seed(repo)
    await repo.create_show(show_id="show-b")
    await repo.update_requirement("req-a", updates={"show_id": "show-b", "document_id": None})
    for show_id in ["show-a", "show-b"]:
        moves = [item for item in await repo.list_history(show_id) if item["entity_id"] == "req-a" and item["action"] == "UPDATE"]
        assert moves[-1]["before_state"]["show_id"] == "show-a"
        assert moves[-1]["after_state"]["show_id"] == "show-b"
    assert all(item["entity_id"] != "show-b" for item in await repo.list_history("show-a"))


@pytest.mark.asyncio
async def test_http_actor_is_authenticated_subject_not_body_or_headers(repo):
    uid = UUID("11111111-1111-4111-8111-111111111111")
    user = User(id=uid, email="fixture@example.com", password_hash="unused", system_role="user")
    app = make_authed_test_app(user_factory=lambda: user)
    app.state.rigor_manager = RigorManager(repo)
    app.include_router(rigor.router)
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app), base_url="http://test") as client:
        response = await client.post("/api/rigor/shows", json={"show_id": "show-a", "actor_id": "forged"}, headers={"X-Actor-ID": "forged", "X-Request-ID": "forged"})
        assert response.status_code == 200
        for method, path, payload in [
            ("POST", "/api/rigor/shows/show-a/documents", {"document_id": "doc-a", "document_name": "Synthetic rider", "document_type": "RIDER"}),
            ("POST", "/api/rigor/shows/show-a/requirements", {"requirement_id": "req-a", "document_id": "doc-a", "department": "VIDEO", "category": "SCREEN", "requirement_text": "Synthetic screen", "origin_type": "SOURCE_DOCUMENT"}),
            ("PATCH", "/api/rigor/shows/show-a", {"show_name": "Synthetic renamed"}),
            ("PATCH", "/api/rigor/documents/doc-a", {"document_name": "Synthetic revised"}),
            ("PATCH", "/api/rigor/requirements/req-a", {"owner": "Fixture Lead"}),
            ("DELETE", "/api/rigor/requirements/req-a", None),
            ("DELETE", "/api/rigor/documents/doc-a", None),
            ("DELETE", "/api/rigor/shows/show-a", None),
        ]:
            response = await client.request(method, path, json=payload)
            assert response.status_code == 200, response.text
    records = await repo.list_history("show-a")
    assert len(records) == 9
    assert all(record["actor_kind"] == "USER" and record["actor_id"] == str(uid) for record in records)
    assert len({record["correlation_id"] for record in records}) == 9
    assert records[0]["source_ref"] == "POST /api/rigor/shows"
    assert "forged" not in str(records)


@pytest.mark.asyncio
@pytest.mark.parametrize("authenticated,expected", [(False, 401), (True, 403)])
async def test_unauthorized_http_mutations_create_no_entity_or_history(repo, authenticated, expected):
    app = FastAPI()
    app.state.rigor_manager = RigorManager(repo)
    app.include_router(rigor.router)
    if authenticated:

        @app.middleware("http")
        async def denied_context(request, call_next):
            request.state.auth = AuthContext(user=User(id=UUID("11111111-1111-4111-8111-111111111111"), email="fixture@example.com", password_hash="unused", system_role="user"), permissions=[])
            return await call_next(request)

    async with httpx.AsyncClient(transport=httpx.ASGITransport(app), base_url="http://test") as client:
        response = await client.post("/api/rigor/shows", json={"show_id": "show-a"})
    assert response.status_code == expected
    assert await repo.get_show("show-a") is None
    assert await repo.list_history("show-a") == []


@pytest.mark.asyncio
async def test_migration_preserves_existing_data_without_backfill(tmp_path):
    engine = create_async_engine(f"sqlite+aiosqlite:///{(tmp_path / 'old.db').as_posix()}")
    try:
        cfg = _get_alembic_config(engine)
        await asyncio.to_thread(_upgrade, cfg, "c8e7d9a1f203")
        async with engine.begin() as conn:
            await conn.execute(text("INSERT INTO rigor_shows (show_id, show_status, created_at, updated_at) VALUES ('legacy-show','DOCUMENTS_PENDING',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)"))
        await asyncio.to_thread(_upgrade, cfg, "d94e7a2c6105")
        async with engine.connect() as conn:
            assert (await conn.execute(text("SELECT show_id FROM rigor_shows"))).scalar() == "legacy-show"
            assert (await conn.execute(text("SELECT count(*) FROM rigor_audit_history"))).scalar() == 0
    finally:
        await engine.dispose()
