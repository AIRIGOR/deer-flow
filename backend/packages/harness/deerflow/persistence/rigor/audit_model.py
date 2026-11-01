"""Durable core-entity history. No FK: history survives source deletion."""

from datetime import datetime
from typing import Any

from sqlalchemy import JSON, CheckConstraint, DateTime, Index, String
from sqlalchemy.orm import Mapped, mapped_column

from deerflow.persistence.base import Base


class RigorAuditRow(Base):
    __tablename__ = "rigor_audit_history"
    __table_args__ = (
        CheckConstraint("entity_type IN ('SHOW','DOCUMENT','REQUIREMENT')", name="ck_rigor_audit_entity"),
        CheckConstraint("action IN ('CREATE','UPDATE','DELETE')", name="ck_rigor_audit_action"),
        CheckConstraint("actor_kind IN ('USER','SYSTEM')", name="ck_rigor_audit_actor"),
        Index("ix_rigor_audit_show_time", "show_id", "occurred_at", "audit_id"),
        Index("ix_rigor_audit_entity", "entity_type", "entity_id"),
    )
    audit_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    entity_type: Mapped[str] = mapped_column(String(16))
    entity_id: Mapped[str] = mapped_column(String(64))
    show_id: Mapped[str] = mapped_column(String(64))
    action: Mapped[str] = mapped_column(String(16))
    actor_kind: Mapped[str] = mapped_column(String(8))
    actor_id: Mapped[str] = mapped_column(String(128))
    correlation_id: Mapped[str] = mapped_column(String(64))
    source_ref: Mapped[str | None] = mapped_column(String(256), nullable=True)
    occurred_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    changed_fields: Mapped[list[str]] = mapped_column(JSON)
    before_state: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)
    after_state: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)
    source_refs: Mapped[dict[str, Any]] = mapped_column(JSON)
    approval_context: Mapped[dict[str, Any]] = mapped_column(JSON)
