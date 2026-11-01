"""Session-to-Founder binding contract; no assignment store or grants are installed."""

from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Protocol
from uuid import UUID

from fastapi import HTTPException, Request

from app.gateway.auth.models import User
from app.gateway.auth_disabled import AUTH_SOURCE_SESSION
from app.gateway.authz import AuthContext

FOUNDER_DRY_RUN_SCOPE = "founder:command:dry_run"


@dataclass(frozen=True)
class FounderMembership:
    membership_id: str
    user_id: UUID
    tenant_id: str
    active: bool


@dataclass(frozen=True)
class FounderAssignment:
    assignment_id: str
    membership_id: str
    user_id: UUID
    tenant_id: str
    role: str
    scopes: frozenset[str]
    revision: str
    active: bool
    revoked: bool
    expires_at: datetime | None = None


@dataclass(frozen=True)
class FounderBindings:
    membership: FounderMembership | None
    assignments: tuple[FounderAssignment, ...]


class FounderAssignmentReader(Protocol):
    async def read_founder_bindings(self, user_id: UUID, tenant_id: str) -> FounderBindings:
        """Read one current consistent snapshot from a trusted assignment authority.

        The implementation must verify membership/grant provenance and revocation.
        It is server-wired, never obtained from a request or model output.
        No production implementation exists yet.
        """
        ...


@dataclass(frozen=True)
class FounderCommandBinding:
    actor_id: UUID
    tenant_id: str
    membership_id: str
    assignment_id: str
    assignment_revision: str

    def receipt_attribution(self) -> dict:
        """Decision references only, not a bearer token or a production approval."""
        return {
            "actor_id": str(self.actor_id),
            "auth_source": AUTH_SOURCE_SESSION,
            "tenant_id": self.tenant_id,
            "membership_id": self.membership_id,
            "assignment_id": self.assignment_id,
            "assignment_revision": self.assignment_revision,
            "authority_scope": FOUNDER_DRY_RUN_SCOPE,
            "command_permission": "LOCAL_DRY_RUN",
            "production_execution_enabled": False,
            "requires_revalidation_before_execution": True,
        }


async def authorize_founder_command(
    request: Request,
    tenant_id: str,
    reader: FounderAssignmentReader | None,
    *,
    command_permission: str = "LOCAL_DRY_RUN",
) -> FounderCommandBinding:
    auth = getattr(request.state, "auth", None)
    user = getattr(auth, "user", None)
    state_user = getattr(request.state, "user", None)
    if getattr(request.state, "auth_source", None) != AUTH_SOURCE_SESSION or not isinstance(auth, AuthContext) or not isinstance(user, User) or not isinstance(user.id, UUID) or not isinstance(state_user, User) or user.id != state_user.id:
        raise HTTPException(401, "A verified user session is required; internal tokens and auth-disabled identities are insufficient")
    if user.needs_setup or state_user.needs_setup:
        raise HTTPException(403, "Account setup must be completed")
    if command_permission != "LOCAL_DRY_RUN" or not tenant_id.strip() or len(tenant_id) > 128:
        raise HTTPException(403, "Requested Founder command scope is not enabled")
    if reader is None:
        raise HTTPException(503, "Verified tenant membership and Founder assignment storage is not configured")
    try:
        snapshot = await reader.read_founder_bindings(user.id, tenant_id)
        if not isinstance(snapshot, FounderBindings) or not isinstance(snapshot.assignments, tuple):
            raise ValueError
        membership = snapshot.membership
        if membership is not None and not isinstance(membership, FounderMembership):
            raise ValueError
        if membership is None or membership.active is not True or membership.user_id != user.id or membership.tenant_id != tenant_id:
            raise HTTPException(403, "Verified active tenant membership is required")
        if not membership.membership_id.strip():
            raise ValueError
        candidates = []
        for assignment in snapshot.assignments:
            if not isinstance(assignment, FounderAssignment):
                raise ValueError
            if assignment.user_id != user.id or assignment.tenant_id != tenant_id or assignment.membership_id != membership.membership_id:
                raise HTTPException(403, "Founder assignment does not match the authenticated membership scope")
            if not assignment.assignment_id.strip() or not assignment.revision.strip() or not isinstance(assignment.scopes, frozenset):
                raise ValueError
            if assignment.expires_at is not None and assignment.expires_at.tzinfo is None:
                raise ValueError
            if assignment.role == "FOUNDER" and assignment.active is True and assignment.revoked is False and FOUNDER_DRY_RUN_SCOPE in assignment.scopes and (assignment.expires_at is None or assignment.expires_at > datetime.now(UTC)):
                candidates.append(assignment)
        if len(candidates) != 1:
            raise HTTPException(403, "Exactly one active, unambiguous Founder assignment is required")
        assignment = candidates[0]
        return FounderCommandBinding(user.id, tenant_id, membership.membership_id, assignment.assignment_id, assignment.revision)
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(503, "Verified Founder authority is unavailable") from exc
