from __future__ import annotations

from datetime import UTC, date, datetime

from sqlalchemy import (
    CheckConstraint,
    Date,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
)
from sqlalchemy.orm import Mapped, mapped_column

from deerflow.persistence.base import Base


SHOW_STATUSES = (
    "DOCUMENTS_PENDING",
    "INITIAL_REVIEW",
    "ADVANCE_IN_PROGRESS",
    "NEEDS_CONFIRMATION",
    "CONFLICTS_OPEN",
    "DEPARTMENT_REVIEW",
    "SHOW_READY",
    "SHOW_COMPLETE",
    "POST_SHOW_REVIEW",
    "ARCHIVED",
)

DOCUMENT_TYPES = (
    "RIDER",
    "VENUE_TECHNICAL_PACKAGE",
    "FEQ",
    "PRODUCTION_SCHEDULE",
    "LABOR_CALL",
    "RIGGING_PLOT",
    "POWER_PLAN",
    "LED_SPECIFICATION",
    "CAMERA_PLOT",
    "SIGNAL_FLOW",
    "CONTACT_SHEET",
    "EMAIL",
    "CREW_UPDATE",
    "OTHER",
)

DOCUMENT_PROCESSING_STATUSES = (
    "RECEIVED",
    "CLASSIFYING",
    "EXTRACTING",
    "NEEDS_REVIEW",
    "PROCESSED",
    "FAILED",
    "SUPERSEDED",
)

REQUIREMENT_ORIGIN_TYPES = (
    "SOURCE_DOCUMENT",
    "EMAIL_CONFIRMATION",
    "VERBAL_CONFIRMATION",
    "CREW_UPDATE",
    "AI_INFERENCE",
    "HUMAN_ENTRY",
)

REQUIREMENT_STATUSES = (
    "UNKNOWN",
    "EXTRACTED",
    "NEEDS_CONFIRMATION",
    "REQUESTED",
    "CONFIRMED",
    "CONFLICTING",
    "REJECTED",
    "CHANGED",
    "RESOLVED",
    "APPROVED",
    "NOT_APPLICABLE",
)


class RigorShowRow(Base):
    """Primary RIGOR record for one production date."""

    __tablename__ = "rigor_shows"

    __table_args__ = (
        CheckConstraint(
            "show_status IN ("
            "'DOCUMENTS_PENDING', "
            "'INITIAL_REVIEW', "
            "'ADVANCE_IN_PROGRESS', "
            "'NEEDS_CONFIRMATION', "
            "'CONFLICTS_OPEN', "
            "'DEPARTMENT_REVIEW', "
            "'SHOW_READY', "
            "'SHOW_COMPLETE', "
            "'POST_SHOW_REVIEW', "
            "'ARCHIVED'"
            ")",
            name="ck_rigor_shows_status",
        ),
    )

    show_id: Mapped[str] = mapped_column(String(64), primary_key=True)

    tour_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    artist_or_client: Mapped[str | None] = mapped_column(
        String(255),
        nullable=True,
    )
    show_name: Mapped[str | None] = mapped_column(String(255), nullable=True)

    venue_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    city: Mapped[str | None] = mapped_column(String(128), nullable=True)
    state_region: Mapped[str | None] = mapped_column(String(128), nullable=True)
    country: Mapped[str | None] = mapped_column(String(128), nullable=True)
    timezone: Mapped[str | None] = mapped_column(String(64), nullable=True)

    load_in_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    doors_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    show_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
        index=True,
    )
    curfew_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )

    show_status: Mapped[str] = mapped_column(
        String(32),
        default="DOCUMENTS_PENDING",
        nullable=False,
        index=True,
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


class RigorDocumentRow(Base):
    """Evidence supplied for a RIGOR show."""

    __tablename__ = "rigor_documents"

    __table_args__ = (
        CheckConstraint(
            "document_type IN ("
            "'RIDER', "
            "'VENUE_TECHNICAL_PACKAGE', "
            "'FEQ', "
            "'PRODUCTION_SCHEDULE', "
            "'LABOR_CALL', "
            "'RIGGING_PLOT', "
            "'POWER_PLAN', "
            "'LED_SPECIFICATION', "
            "'CAMERA_PLOT', "
            "'SIGNAL_FLOW', "
            "'CONTACT_SHEET', "
            "'EMAIL', "
            "'CREW_UPDATE', "
            "'OTHER'"
            ")",
            name="ck_rigor_documents_type",
        ),
        CheckConstraint(
            "processing_status IN ("
            "'RECEIVED', "
            "'CLASSIFYING', "
            "'EXTRACTING', "
            "'NEEDS_REVIEW', "
            "'PROCESSED', "
            "'FAILED', "
            "'SUPERSEDED'"
            ")",
            name="ck_rigor_documents_processing_status",
        ),
    )

    document_id: Mapped[str] = mapped_column(String(64), primary_key=True)

    show_id: Mapped[str] = mapped_column(
        String(64),
        ForeignKey("rigor_shows.show_id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    document_name: Mapped[str] = mapped_column(
        String(255),
        nullable=False,
    )
    document_type: Mapped[str] = mapped_column(
        String(64),
        nullable=False,
        index=True,
    )
    source_party: Mapped[str | None] = mapped_column(
        String(255),
        nullable=True,
    )
    revision: Mapped[str | None] = mapped_column(
        String(64),
        nullable=True,
    )
    document_date: Mapped[date | None] = mapped_column(
        Date,
        nullable=True,
    )
    received_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        nullable=False,
    )

    file_format: Mapped[str | None] = mapped_column(
        String(32),
        nullable=True,
    )
    page_count: Mapped[int | None] = mapped_column(
        Integer,
        nullable=True,
    )
    storage_location: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
    )

    processing_status: Mapped[str] = mapped_column(
        String(32),
        default="RECEIVED",
        nullable=False,
        index=True,
    )
    supersedes_document_id: Mapped[str | None] = mapped_column(
        String(64),
        ForeignKey("rigor_documents.document_id", ondelete="SET NULL"),
        nullable=True,
        index=True,
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


class RigorRequirementRow(Base):
    """One sourced operational requirement for a RIGOR show."""

    __tablename__ = "rigor_requirements"

    __table_args__ = (
        CheckConstraint(
            "origin_type IN ("
            "'SOURCE_DOCUMENT', "
            "'EMAIL_CONFIRMATION', "
            "'VERBAL_CONFIRMATION', "
            "'CREW_UPDATE', "
            "'AI_INFERENCE', "
            "'HUMAN_ENTRY'"
            ")",
            name="ck_rigor_requirements_origin_type",
        ),
        CheckConstraint(
            "requirement_status IN ("
            "'UNKNOWN', "
            "'EXTRACTED', "
            "'NEEDS_CONFIRMATION', "
            "'REQUESTED', "
            "'CONFIRMED', "
            "'CONFLICTING', "
            "'REJECTED', "
            "'CHANGED', "
            "'RESOLVED', "
            "'APPROVED', "
            "'NOT_APPLICABLE'"
            ")",
            name="ck_rigor_requirements_status",
        ),
        CheckConstraint(
            "confidence IS NULL OR "
            "(confidence >= 0.0 AND confidence <= 1.0)",
            name="ck_rigor_requirements_confidence",
        ),
    )

    requirement_id: Mapped[str] = mapped_column(
        String(64),
        primary_key=True,
    )
    show_id: Mapped[str] = mapped_column(
        String(64),
        ForeignKey("rigor_shows.show_id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    document_id: Mapped[str | None] = mapped_column(
        String(64),
        ForeignKey("rigor_documents.document_id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    department: Mapped[str] = mapped_column(
        String(64),
        nullable=False,
        index=True,
    )
    category: Mapped[str] = mapped_column(
        String(64),
        nullable=False,
        index=True,
    )
    requirement_text: Mapped[str] = mapped_column(
        Text,
        nullable=False,
    )

    normalized_value: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
    )
    unit: Mapped[str | None] = mapped_column(
        String(64),
        nullable=True,
    )
    origin_type: Mapped[str] = mapped_column(
        String(32),
        nullable=False,
        index=True,
    )

    source_page: Mapped[int | None] = mapped_column(
        Integer,
        nullable=True,
    )
    source_location: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
    )
    source_excerpt: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
    )
    confidence: Mapped[float | None] = mapped_column(
        Float,
        nullable=True,
    )

    requirement_status: Mapped[str] = mapped_column(
        String(32),
        default="EXTRACTED",
        nullable=False,
        index=True,
    )
    owner: Mapped[str | None] = mapped_column(
        String(255),
        nullable=True,
    )
    due_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
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
