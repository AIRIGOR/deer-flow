"""add rigor shows

Revision ID: cc250085fbd2
Revises: abbdcd8a40ee
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "cc250085fbd2"
down_revision: str | Sequence[str] | None = "abbdcd8a40ee"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "rigor_shows",
        sa.Column("show_id", sa.String(64), nullable=False),
        sa.Column("tour_name", sa.String(255), nullable=True),
        sa.Column("artist_or_client", sa.String(255), nullable=True),
        sa.Column("show_name", sa.String(255), nullable=True),
        sa.Column("venue_name", sa.String(255), nullable=True),
        sa.Column("city", sa.String(128), nullable=True),
        sa.Column("state_region", sa.String(128), nullable=True),
        sa.Column("country", sa.String(128), nullable=True),
        sa.Column("timezone", sa.String(64), nullable=True),
        sa.Column("load_in_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("doors_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("show_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("curfew_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("show_status", sa.String(32), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint(
            "show_status IN ('DOCUMENTS_PENDING','INITIAL_REVIEW',"
            "'ADVANCE_IN_PROGRESS','NEEDS_CONFIRMATION','CONFLICTS_OPEN',"
            "'DEPARTMENT_REVIEW','SHOW_READY','SHOW_COMPLETE',"
            "'POST_SHOW_REVIEW','ARCHIVED')",
            name="ck_rigor_shows_status",
        ),
        sa.PrimaryKeyConstraint("show_id"),
    )
    op.create_index("ix_rigor_shows_show_at", "rigor_shows", ["show_at"])
    op.create_index(
        "ix_rigor_shows_show_status",
        "rigor_shows",
        ["show_status"],
    )


def downgrade() -> None:
    op.drop_index("ix_rigor_shows_show_status", table_name="rigor_shows")
    op.drop_index("ix_rigor_shows_show_at", table_name="rigor_shows")
    op.drop_table("rigor_shows")
