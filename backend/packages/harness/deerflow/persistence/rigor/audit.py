"""Scoped attribution for trusted SQL callers; never grants approval authority."""

from contextlib import contextmanager
from contextvars import ContextVar
from dataclasses import dataclass
from uuid import uuid4


@dataclass(frozen=True)
class AuditContext:
    actor_kind: str = "SYSTEM"
    actor_id: str = "rigor-core"
    correlation_id: str | None = None
    source_ref: str | None = None

    def __post_init__(self):
        if self.actor_kind not in {"USER", "SYSTEM"} or not self.actor_id.strip() or len(self.actor_id) > 128:
            raise ValueError("Invalid audit actor")
        if self.correlation_id is not None and (not self.correlation_id.strip() or len(self.correlation_id) > 64):
            raise ValueError("Invalid audit correlation")
        if self.source_ref is not None and len(self.source_ref) > 256:
            raise ValueError("Invalid audit source")


_context: ContextVar[AuditContext | None] = ContextVar("rigor_sql_audit", default=None)


def current_audit_context() -> AuditContext:
    context = _context.get() or AuditContext()
    return AuditContext(context.actor_kind, context.actor_id, context.correlation_id or str(uuid4()), context.source_ref)


@contextmanager
def audit_scope(context: AuditContext):
    token = _context.set(context)
    try:
        yield
    finally:
        _context.reset(token)
