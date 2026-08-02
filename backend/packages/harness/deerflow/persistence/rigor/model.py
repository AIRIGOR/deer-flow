from __future__ import annotations

from datetime import UTC, datetime

from sqlalchemy import CheckConstraint, DateTime, String
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
        index=True,
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        onupdate=lambda: datetime.now(UTC),
    )