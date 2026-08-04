"""align rigor core schema v0.1

Revision ID: 6cd33f2a9104
Revises: abbdcd8a40ee
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op


revision: str = "6cd33f2a9104"
down_revision: str | Sequence[str] | None = "abbdcd8a40ee"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _assert_empty(*table_names: str) -> None:
    bind = op.get_bind()
    populated = [
        name
        for name in table_names
        if bind.execute(sa.text(f'SELECT COUNT(*) FROM "{name}"')).scalar_one()
    ]
    if populated:
        joined = ", ".join(populated)
        raise RuntimeError(
            f"RIGOR schema alignment requires empty tables; found data in: {joined}"
        )


def _create_documents() -> None:
    op.create_table(
        "rigor_documents",
        sa.Column("document_id", sa.String(64), primary_key=True),
        sa.Column(
            "show_id",
            sa.String(64),
            sa.ForeignKey("rigor_shows.show_id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("document_name", sa.String(255), nullable=False),
        sa.Column("document_type", sa.String(64), nullable=False),
        sa.Column("source_party", sa.String(255), nullable=True),
        sa.Column("revision", sa.String(64), nullable=True),
        sa.Column("document_date", sa.Date(), nullable=True),
        sa.Column("received_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("file_format", sa.String(32), nullable=True),
        sa.Column("page_count", sa.Integer(), nullable=True),
        sa.Column("storage_location", sa.Text(), nullable=True),
        sa.Column("processing_status", sa.String(32), nullable=False),
        sa.Column(
            "supersedes_document_id",
            sa.String(64),
            sa.ForeignKey(
                "rigor_documents.document_id",
                ondelete="SET NULL",
            ),
            nullable=True,
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint(
            "document_type IN ("
            "'RIDER','VENUE_TECHNICAL_PACKAGE','FEQ',"
            "'PRODUCTION_SCHEDULE','LABOR_CALL','RIGGING_PLOT',"
            "'POWER_PLAN','LED_SPECIFICATION','CAMERA_PLOT',"
            "'SIGNAL_FLOW','CONTACT_SHEET','EMAIL','CREW_UPDATE','OTHER'"
            ")",
            name="ck_rigor_documents_type",
        ),
        sa.CheckConstraint(
            "processing_status IN ("
            "'RECEIVED','CLASSIFYING','EXTRACTING','NEEDS_REVIEW',"
            "'PROCESSED','FAILED','SUPERSEDED'"
            ")",
            name="ck_rigor_documents_processing_status",
        ),
    )
    op.create_index(
        "ix_rigor_documents_show_id",
        "rigor_documents",
        ["show_id"],
    )
    op.create_index(
        "ix_rigor_documents_document_type",
        "rigor_documents",
        ["document_type"],
    )
    op.create_index(
        "ix_rigor_documents_processing_status",
        "rigor_documents",
        ["processing_status"],
    )
    op.create_index(
        "ix_rigor_documents_supersedes_document_id",
        "rigor_documents",
        ["supersedes_document_id"],
    )


def _create_requirements() -> None:
    op.create_table(
        "rigor_requirements",
        sa.Column("requirement_id", sa.String(64), primary_key=True),
        sa.Column(
            "show_id",
            sa.String(64),
            sa.ForeignKey("rigor_shows.show_id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "document_id",
            sa.String(64),
            sa.ForeignKey(
                "rigor_documents.document_id",
                ondelete="SET NULL",
            ),
            nullable=True,
        ),
        sa.Column("department", sa.String(64), nullable=False),
        sa.Column("category", sa.String(64), nullable=False),
        sa.Column("requirement_text", sa.Text(), nullable=False),
        sa.Column("normalized_value", sa.Text(), nullable=True),
        sa.Column("unit", sa.String(64), nullable=True),
        sa.Column("origin_type", sa.String(32), nullable=False),
        sa.Column("source_page", sa.Integer(), nullable=True),
        sa.Column("source_location", sa.Text(), nullable=True),
        sa.Column("source_excerpt", sa.Text(), nullable=True),
        sa.Column("confidence", sa.Float(), nullable=True),
        sa.Column("requirement_status", sa.String(32), nullable=False),
        sa.Column("owner", sa.String(255), nullable=True),
        sa.Column("due_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint(
            "origin_type IN ("
            "'SOURCE_DOCUMENT','EMAIL_CONFIRMATION','VERBAL_CONFIRMATION',"
            "'CREW_UPDATE','AI_INFERENCE','HUMAN_ENTRY'"
            ")",
            name="ck_rigor_requirements_origin_type",
        ),
        sa.CheckConstraint(
            "requirement_status IN ("
            "'UNKNOWN','EXTRACTED','NEEDS_CONFIRMATION','REQUESTED',"
            "'CONFIRMED','CONFLICTING','REJECTED','CHANGED','RESOLVED',"
            "'APPROVED','NOT_APPLICABLE'"
            ")",
            name="ck_rigor_requirements_status",
        ),
        sa.CheckConstraint(
            "confidence IS NULL OR "
            "(confidence >= 0.0 AND confidence <= 1.0)",
            name="ck_rigor_requirements_confidence",
        ),
    )
    op.create_index(
        "ix_rigor_requirements_show_id",
        "rigor_requirements",
        ["show_id"],
    )
    op.create_index(
        "ix_rigor_requirements_document_id",
        "rigor_requirements",
        ["document_id"],
    )
    op.create_index(
        "ix_rigor_requirements_department",
        "rigor_requirements",
        ["department"],
    )
    op.create_index(
        "ix_rigor_requirements_category",
        "rigor_requirements",
        ["category"],
    )
    op.create_index(
        "ix_rigor_requirements_origin_type",
        "rigor_requirements",
        ["origin_type"],
    )
    op.create_index(
        "ix_rigor_requirements_requirement_status",
        "rigor_requirements",
        ["requirement_status"],
    )


def upgrade() -> None:
    _assert_empty("rigor_documents", "rigor_requirements")
    op.drop_table("rigor_requirements")
    op.drop_table("rigor_documents")
    _create_documents()
    _create_requirements()


def downgrade() -> None:
    _assert_empty("rigor_documents", "rigor_requirements")
    op.drop_table("rigor_requirements")
    op.drop_table("rigor_documents")

    op.create_table(
        "rigor_documents",
        sa.Column("document_id", sa.String(64), primary_key=True),
        sa.Column("show_id", sa.String(64), nullable=False),
        sa.Column("document_type", sa.String(64), nullable=False),
        sa.Column("title", sa.String(255), nullable=False),
        sa.Column("source_filename", sa.String(255), nullable=True),
        sa.Column("source_path", sa.Text(), nullable=True),
        sa.Column("mime_type", sa.String(128), nullable=True),
        sa.Column("checksum_sha256", sa.String(64), nullable=True),
        sa.Column("document_status", sa.String(32), nullable=False),
        sa.Column("schema_version", sa.String(32), nullable=False),
        sa.Column("page_count", sa.Integer(), nullable=True),
        sa.Column("received_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index(
        "ix_rigor_documents_show_id",
        "rigor_documents",
        ["show_id"],
    )
    op.create_index(
        "ix_rigor_documents_document_type",
        "rigor_documents",
        ["document_type"],
    )
    op.create_index(
        "ix_rigor_documents_document_status",
        "rigor_documents",
        ["document_status"],
    )
    op.create_index(
        "ix_rigor_documents_checksum_sha256",
        "rigor_documents",
        ["checksum_sha256"],
    )

    op.create_table(
        "rigor_requirements",
        sa.Column("requirement_id", sa.String(64), primary_key=True),
        sa.Column("show_id", sa.String(64), nullable=False),
        sa.Column("document_id", sa.String(64), nullable=True),
        sa.Column("department", sa.String(64), nullable=False),
        sa.Column("requirement_type", sa.String(64), nullable=False),
        sa.Column("title", sa.String(255), nullable=False),
        sa.Column("requirement_text", sa.Text(), nullable=False),
        sa.Column("normalized_value", sa.Text(), nullable=True),
        sa.Column("unit", sa.String(64), nullable=True),
        sa.Column("source_page", sa.Integer(), nullable=True),
        sa.Column("source_excerpt", sa.Text(), nullable=True),
        sa.Column("confidence_score", sa.Integer(), nullable=True),
        sa.Column("requirement_status", sa.String(32), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index(
        "ix_rigor_requirements_show_id",
        "rigor_requirements",
        ["show_id"],
    )
    op.create_index(
        "ix_rigor_requirements_document_id",
        "rigor_requirements",
        ["document_id"],
    )
    op.create_index(
        "ix_rigor_requirements_department",
        "rigor_requirements",
        ["department"],
    )
    op.create_index(
        "ix_rigor_requirements_requirement_type",
        "rigor_requirements",
        ["requirement_type"],
    )
    op.create_index(
        "ix_rigor_requirements_requirement_status",
        "rigor_requirements",
        ["requirement_status"],
    )
