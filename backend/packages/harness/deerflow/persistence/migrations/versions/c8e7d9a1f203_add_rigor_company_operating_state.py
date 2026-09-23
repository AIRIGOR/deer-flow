"""add rigor company operating state

Revision ID: c8e7d9a1f203
Revises: 6cd33f2a9104
Create Date: 2026-09-23
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op


revision: str = "c8e7d9a1f203"
down_revision: str | Sequence[str] | None = "6cd33f2a9104"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "rigor_company_records",
        sa.Column("record_id", sa.String(length=64), nullable=False),
        sa.Column("record_type", sa.String(length=32), nullable=False),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("summary", sa.Text(), nullable=True),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("priority", sa.String(length=16), nullable=False),
        sa.Column("owner_agent", sa.String(length=128), nullable=True),
        sa.Column("approval_required", sa.Boolean(), nullable=False),
        sa.Column("due_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("source_ref", sa.Text(), nullable=True),
        sa.Column("payload", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint(
            "record_type IN ("
            "'OBJECTIVE','MILESTONE','RELATIONSHIP','FEEDBACK','RISK',"
            "'EXPERIMENT','RUNWAY'"
            ")",
            name="ck_rigor_company_records_type",
        ),
        sa.CheckConstraint(
            "status IN ("
            "'OPEN','ACTIVE','BLOCKED','NEEDS_APPROVAL','COMPLETE','ARCHIVED'"
            ")",
            name="ck_rigor_company_records_status",
        ),
        sa.CheckConstraint(
            "priority IN ('CRITICAL','HIGH','MEDIUM','LOW')",
            name="ck_rigor_company_records_priority",
        ),
        sa.PrimaryKeyConstraint("record_id"),
    )
    op.create_index(
        "ix_rigor_company_records_record_type",
        "rigor_company_records",
        ["record_type"],
    )
    op.create_index(
        "ix_rigor_company_records_status",
        "rigor_company_records",
        ["status"],
    )
    op.create_index(
        "ix_rigor_company_records_priority",
        "rigor_company_records",
        ["priority"],
    )
    op.create_index(
        "ix_rigor_company_records_owner_agent",
        "rigor_company_records",
        ["owner_agent"],
    )
    op.create_index(
        "ix_rigor_company_records_approval_required",
        "rigor_company_records",
        ["approval_required"],
    )
    op.create_index(
        "ix_rigor_company_records_due_at",
        "rigor_company_records",
        ["due_at"],
    )


def downgrade() -> None:
    op.drop_table("rigor_company_records")
