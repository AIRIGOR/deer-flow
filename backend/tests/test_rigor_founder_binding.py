"""Synthetic account/assignment fixtures; no real authority is provisioned."""

from dataclasses import replace
from datetime import UTC, datetime, timedelta
from types import SimpleNamespace
from unittest.mock import AsyncMock
from uuid import UUID

import httpx
import pytest
from fastapi import FastAPI, HTTPException, Request

from app.gateway import deps
from app.gateway.auth import jwt
from app.gateway.auth.config import AuthConfig
from app.gateway.auth.models import User
from app.gateway.auth_middleware import AuthMiddleware
from app.gateway.authz import AuthContext
from app.gateway.founder_authority import FOUNDER_DRY_RUN_SCOPE, FounderAssignment, FounderBindings, FounderMembership, authorize_founder_command
from app.gateway.routers import rigor


class SyntheticSessionFixture(tuple):
    def __repr__(self):
        return "<synthetic session fixture; credential omitted>"


@pytest.fixture
def human_app(monkeypatch):
    monkeypatch.setenv("DEER_FLOW_AUTH_DISABLED", "")
    config = AuthConfig(jwt_secret="synthetic-test-key-not-a-real-credential-0001")
    monkeypatch.setattr(jwt, "get_auth_config", lambda: config)
    user = User(id=UUID("33333333-3333-4333-8333-333333333333"), email="binding@example.com", system_role="user")
    lookup = AsyncMock(return_value=user)
    monkeypatch.setattr(deps, "get_local_provider", lambda: SimpleNamespace(get_user=lookup))
    app = FastAPI()
    app.add_middleware(AuthMiddleware)
    app.include_router(rigor.router)
    token = jwt.create_access_token(str(user.id), token_version=user.token_version)
    return SyntheticSessionFixture((app, user, token, lookup))


@pytest.mark.asyncio
async def test_binding_defaults_to_unavailable_without_trusted_assignment_store(human_app):
    app, _, token, _ = human_app
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test", cookies={"access_token": token}) as client:
        response = await client.get("/api/rigor/founder/authority", params={"tenant_id": "synthetic-a"})
    assert response.status_code == 503


def bindings(user):
    membership = FounderMembership("fixture-membership", user.id, "synthetic-a", True)
    assignment = FounderAssignment("fixture-assignment", membership.membership_id, user.id, membership.tenant_id, "FOUNDER", frozenset({FOUNDER_DRY_RUN_SCOPE}), "fixture-rev-1", True, False)
    return FounderBindings(membership, (assignment,))


def install_fixture_reader(app, snapshot):
    reader = SimpleNamespace(read_founder_bindings=AsyncMock(return_value=snapshot))
    app.state.rigor_founder_assignments = reader
    return reader


@pytest.mark.asyncio
async def test_verified_session_and_explicit_fixture_assignment_bind_receipt_references(human_app):
    app, user, token, _ = human_app
    reader = install_fixture_reader(app, bindings(user))
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test", cookies={"access_token": token}) as client:
        response = await client.get("/api/rigor/founder/authority", params={"tenant_id": "synthetic-a"})
    assert response.status_code == 200
    data = response.json()
    assert data == {
        "actor_id": str(user.id),
        "auth_source": "session",
        "tenant_id": "synthetic-a",
        "membership_id": "fixture-membership",
        "assignment_id": "fixture-assignment",
        "assignment_revision": "fixture-rev-1",
        "authority_scope": FOUNDER_DRY_RUN_SCOPE,
        "command_permission": "LOCAL_DRY_RUN",
        "production_execution_enabled": False,
        "requires_revalidation_before_execution": True,
    }
    reader.read_founder_bindings.assert_awaited_once_with(user.id, "synthetic-a")
    assert "token" not in response.text and "email" not in response.text


@pytest.mark.asyncio
@pytest.mark.parametrize("failure", ["missing", "junk", "expired", "revoked_session", "deleted_user", "auth_disabled", "needs_setup"])
async def test_missing_or_invalid_authenticated_identity_is_denied(human_app, monkeypatch, failure):
    app, user, token, lookup = human_app
    reader = install_fixture_reader(app, bindings(user))
    if failure in {"missing", "auth_disabled"}:
        cookies = {}
        if failure == "auth_disabled":
            monkeypatch.setenv("DEER_FLOW_AUTH_DISABLED", "1")
    else:
        if failure == "junk":
            token = "invalid-synthetic-cookie"
        elif failure == "expired":
            token = jwt.create_access_token(str(user.id), expires_delta=timedelta(seconds=-5))
        elif failure == "revoked_session":
            user.token_version += 1
        elif failure == "deleted_user":
            lookup.return_value = None
        elif failure == "needs_setup":
            user.needs_setup = True
        cookies = {"access_token": token}
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test", cookies=cookies) as client:
        response = await client.get("/api/rigor/founder/authority", params={"tenant_id": "synthetic-a"}, headers={"X-RIGOR-Founder-Token": "synthetic-capability", "X-User-ID": str(user.id), "X-Role": "Founder"})
    assert response.status_code == (403 if failure == "needs_setup" else 401)
    reader.read_founder_bindings.assert_not_awaited()


@pytest.mark.asyncio
@pytest.mark.parametrize("role", ["user", "admin"])
async def test_generic_roles_and_forged_founder_claims_never_supply_assignment(human_app, role):
    app, user, token, _ = human_app
    user.system_role = role
    snapshot = bindings(user)
    install_fixture_reader(app, replace(snapshot, assignments=()))
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test", cookies={"access_token": token}) as client:
        response = await client.get("/api/rigor/founder/authority", params={"tenant_id": "synthetic-a", "role": "Founder", "approved": "true"}, headers={"X-Role": "Founder", "X-Founder-Assignment": "forged"})
    assert response.status_code == 403


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "failure",
    [
        "cross_tenant_membership",
        "cross_tenant_assignment",
        "other_user",
        "other_membership",
        "inactive_membership",
        "inactive_assignment",
        "revoked",
        "expired",
        "wrong_role",
        "wrong_scope",
        "ambiguous",
        "invalid_revision",
        "naive_expiry",
        "invalid_scopes",
    ],
)
async def test_missing_cross_scope_revoked_or_ambiguous_authority_denies(human_app, failure):
    app, user, token, _ = human_app
    snapshot = bindings(user)
    assignment = snapshot.assignments[0]
    if failure == "cross_tenant_membership":
        snapshot = replace(snapshot, membership=replace(snapshot.membership, tenant_id="synthetic-b"))
    elif failure == "cross_tenant_assignment":
        assignment = replace(assignment, tenant_id="synthetic-b")
    elif failure == "other_user":
        assignment = replace(assignment, user_id=UUID("44444444-4444-4444-8444-444444444444"))
    elif failure == "other_membership":
        assignment = replace(assignment, membership_id="other-membership")
    elif failure == "inactive_membership":
        snapshot = replace(snapshot, membership=replace(snapshot.membership, active=False))
    elif failure == "inactive_assignment":
        assignment = replace(assignment, active=False)
    elif failure == "revoked":
        assignment = replace(assignment, revoked=True)
    elif failure == "expired":
        assignment = replace(assignment, expires_at=datetime(2000, 1, 1, tzinfo=UTC))
    elif failure == "wrong_role":
        assignment = replace(assignment, role="admin")
    elif failure == "wrong_scope":
        assignment = replace(assignment, scopes=frozenset({"production:release"}))
    elif failure == "invalid_revision":
        assignment = replace(assignment, revision="")
    elif failure == "naive_expiry":
        assignment = replace(assignment, expires_at=datetime(2000, 1, 1))
    elif failure == "invalid_scopes":
        assignment = replace(assignment, scopes=FOUNDER_DRY_RUN_SCOPE)
    snapshot = replace(snapshot, assignments=(assignment, assignment) if failure == "ambiguous" else (assignment,))
    install_fixture_reader(app, snapshot)
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test", cookies={"access_token": token}) as client:
        response = await client.get("/api/rigor/founder/authority", params={"tenant_id": "synthetic-a"})
    assert response.status_code == (503 if failure in {"invalid_revision", "naive_expiry", "invalid_scopes"} else 403)


@pytest.mark.asyncio
async def test_assignment_revocation_is_rechecked_and_production_permission_never_granted(human_app):
    app, user, token, _ = human_app
    snapshot = bindings(user)
    reader = install_fixture_reader(app, snapshot)
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test", cookies={"access_token": token}) as client:
        assert (await client.get("/api/rigor/founder/authority", params={"tenant_id": "synthetic-a"})).status_code == 200
        reader.read_founder_bindings.return_value = replace(snapshot, assignments=(replace(snapshot.assignments[0], revoked=True, revision="fixture-rev-2"),))
        assert (await client.get("/api/rigor/founder/authority", params={"tenant_id": "synthetic-a"})).status_code == 403
        assert (await client.get("/api/rigor/founder/authority", params={"tenant_id": "synthetic-a", "command_permission": "PRODUCTION_PROMOTE"})).status_code == 403
    assert reader.read_founder_bindings.await_count == 2


@pytest.mark.asyncio
@pytest.mark.parametrize("source", ["internal", "auth_disabled", None])
async def test_unverified_authentication_source_cannot_bind_a_human(human_app, source):
    _, user, _, _ = human_app
    request = Request({"type": "http", "headers": [], "state": {"user": user, "auth": AuthContext(user=user), "auth_source": source}})
    with pytest.raises(HTTPException) as error:
        await authorize_founder_command(request, "synthetic-a", None)
    assert error.value.status_code == 401


@pytest.mark.asyncio
async def test_assignment_store_failure_is_sanitized(human_app):
    app, user, token, _ = human_app
    reader = install_fixture_reader(app, bindings(user))
    reader.read_founder_bindings.side_effect = RuntimeError("private backend configuration")
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test", cookies={"access_token": token}) as client:
        response = await client.get("/api/rigor/founder/authority", params={"tenant_id": "synthetic-a"})
    assert response.status_code == 503 and "private backend" not in response.text
