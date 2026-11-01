"""Fail-closed authority boundaries; synthetic identities, no invented assignments."""

from unittest.mock import AsyncMock, MagicMock
from uuid import UUID

import httpx
import pytest
from _router_auth_helpers import make_authed_test_app
from fastapi import FastAPI

from app.gateway.auth.models import User
from app.gateway.routers import rigor
from deerflow.config.database_config import DatabaseConfig
from deerflow.persistence.engine import close_engine, get_session_factory, init_engine_from_config
from deerflow.persistence.rigor import RigorRepository
from deerflow.rigor.manager import RigorManager


@pytest.mark.asyncio
@pytest.mark.parametrize("status", ["SHOW_READY", "SHOW_COMPLETE"])
@pytest.mark.parametrize("create", [True, False])
async def test_service_blocks_release_claims_without_verified_authority(status, create):
    repo = MagicMock()
    repo.create_show = AsyncMock()
    repo.update_show = AsyncMock()
    manager = RigorManager(repo)
    with pytest.raises(PermissionError, match="verified assignments"):
        if create:
            await manager.create_show(show_status=status)
        else:
            await manager.update_show("show-a", show_status=status)
    repo.create_show.assert_not_awaited()
    repo.update_show.assert_not_awaited()


@pytest.mark.asyncio
@pytest.mark.parametrize("create", [True, False])
async def test_service_blocks_requirement_approval_without_verified_assignment(create):
    repo = MagicMock()
    repo.get_show = AsyncMock(return_value={"show_id": "show-a"})
    repo.get_requirement = AsyncMock(return_value={"show_id": "show-a", "document_id": None})
    repo.create_requirement = AsyncMock()
    repo.update_requirement = AsyncMock()
    manager = RigorManager(repo)
    with pytest.raises(PermissionError, match="verified assignments"):
        if create:
            await manager.add_requirement("show-a", department="VIDEO", category="SCREEN", requirement_text="Synthetic", origin_type="HUMAN_ENTRY", requirement_status="APPROVED")
        else:
            await manager.update_requirement("req-a", requirement_status="APPROVED")
    repo.create_requirement.assert_not_awaited()
    repo.update_requirement.assert_not_awaited()


@pytest.mark.asyncio
@pytest.mark.parametrize("role", ["anonymous", "user", "admin"])
async def test_http_generic_permissions_and_forged_claims_cannot_approve(role):
    repo = MagicMock()
    repo.get_show = AsyncMock(return_value={"show_id": "show-a"})
    repo.get_requirement = AsyncMock(return_value={"show_id": "show-a", "document_id": None})
    repo.update_show = AsyncMock()
    repo.update_requirement = AsyncMock()
    user = User(email="authority@example.com", system_role="admin" if role == "admin" else "user")
    app = make_authed_test_app(user_factory=lambda: user) if role != "anonymous" else FastAPI()
    app.state.rigor_manager = RigorManager(repo)
    app.include_router(rigor.router)
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        for path, body in [
            ("/api/rigor/shows/show-a", {"show_status": "SHOW_READY", "role": "Founder", "gates_passed": True}),
            ("/api/rigor/requirements/req-a", {"requirement_status": "APPROVED", "assigned_department": "VIDEO", "approved_by": "founder"}),
        ]:
            response = await client.patch(path, json=body, headers={"X-RIGOR-Role": "Founder"})
            assert response.status_code == (401 if role == "anonymous" else 403)
    repo.update_show.assert_not_awaited()
    repo.update_requirement.assert_not_awaited()


@pytest.mark.asyncio
@pytest.mark.parametrize("authenticated", [False, True])
async def test_audit_has_no_public_read_or_mutation_surface(authenticated):
    app = make_authed_test_app() if authenticated else FastAPI()
    app.state.rigor_manager = MagicMock()
    app.include_router(rigor.router)
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        for path in ["/api/rigor/shows/show-a/history", "/api/rigor/shows/show-a/audit", "/api/rigor/audit"]:
            for method in ["GET", "POST", "PATCH", "DELETE"]:
                assert (await client.request(method, path)).status_code == 404


@pytest.mark.asyncio
async def test_draft_writes_keep_actor_scope_history_and_denied_approval_writes_nothing(tmp_path):
    await init_engine_from_config(DatabaseConfig(backend="sqlite", sqlite_dir=str(tmp_path)))
    try:
        repo = RigorRepository(get_session_factory())
        uid = UUID("22222222-2222-4222-8222-222222222222")
        user = User(id=uid, email="authority@example.com", system_role="user")
        app = make_authed_test_app(user_factory=lambda: user)
        app.state.rigor_manager = RigorManager(repo)
        app.include_router(rigor.router)
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
            assert (await client.post("/api/rigor/shows", json={"show_id": "show-a"})).status_code == 200
            response = await client.patch("/api/rigor/shows/show-a", json={"show_name": "Draft updated", "approved_by": "forged"})
            assert response.status_code == 200 and response.json()["show_id"] == "show-a"
            history = await repo.list_history("show-a")
            assert len(history) == 2
            assert all(item["actor_id"] == str(uid) and item["show_id"] == "show-a" for item in history)
            assert "forged" not in str(history)
            assert await repo.list_history("show-other") == []
            assert (await client.patch("/api/rigor/shows/show-a", json={"show_status": "SHOW_READY"})).status_code == 403
            assert await repo.list_history("show-a") == history
            assert (await repo.get_show("show-a"))["show_status"] == "DOCUMENTS_PENDING"
    finally:
        await close_engine()
