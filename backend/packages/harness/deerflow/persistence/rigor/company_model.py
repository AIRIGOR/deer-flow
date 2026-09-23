from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

from sqlalchemy import Boolean, CheckConstraint, DateTime, JSON, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from deerflow.persistence.base import Base


COMPANY_RECORD_TYPES = (
    "OBJECTIVE",
    "MILESTONE",
    "RELATIONSHIP",
    "FEEDBACK",
    "RISK",
    "EXPERIMENT",
    "RUNWAY",
)

COMPANY_RECORD_STATUSES = (
    "OPEN",
    "ACTIVE",
    "BLOCKED",
    "NEEDS_APPROVAL",
    "COMPLETE",
    "ARCHIVED",
)

COMPANY_PRIORITIES = ("CRITICAL", "HIGH", "MEDIUM", "LOW")


class RigorCompanyRecordRow(Base):
    """Durable operating-state record for the RIGOR company."""

    __tablename__ = "rigor_company_records"

    __table_args__ = (
        CheckConstraint(
            "record_type IN ("
            "'OBJECTIVE','MILESTONE','RELATIONSHIP','FEEDBACK','RISK',"
            "'EXPERIMENT','RUNWAY'"
            ")",
            name="ck_rigor_company_records_type",
        ),
        CheckConstraint(
            "status IN ("
            "'OPEN','ACTIVE','BLOCKED','NEEDS_APPROVAL','COMPLETE','ARCHIVED'"
            ")",
            name="ck_rigor_company_records_status",
        ),
        CheckConstraint(
            "priority IN ('CRITICAL','HIGH','MEDIUM','LOW')",
            name="ck_rigor_company_records_priority",
        ),
    )

    record_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    record_type: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(
        String(32),
        default="OPEN",
        nullable=False,
        index=True,
    )
    priority: Mapped[str] = mapped_column(
        String(16),
        default="MEDIUM",
        nullable=False,
        index=True,
    )
    owner_agent: Mapped[str | None] = mapped_column(
        String(128),
        nullable=True,
        index=True,
    )
    approval_required: Mapped[bool] = mapped_column(
        Boolean,
        default=False,
        nullable=False,
        index=True,
    )
    due_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
        index=True,
    )
    source_ref: Mapped[str | None] = mapped_column(Text, nullable=True)
    payload: Mapped[dict[str, Any]] = mapped_column(
        JSON,
        default=dict,
        nullable=False,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        onupdate=lambda: datetime.now(UTC),
        nullable=False,
    )
