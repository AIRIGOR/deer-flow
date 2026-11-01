"""Add core SQL audit history without fabricating historical events.

Revision ID: d94e7a2c6105
Revises: c8e7d9a1f203
"""

import sqlalchemy as sa
from alembic import op

revision = "d94e7a2c6105"
down_revision = "c8e7d9a1f203"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "rigor_audit_history",
        sa.Column("audit_id", sa.String(64), primary_key=True),
        sa.Column("entity_type", sa.String(16), nullable=False),
        sa.Column("entity_id", sa.String(64), nullable=False),
        sa.Column("show_id", sa.String(64), nullable=False),
        sa.Column("action", sa.String(16), nullable=False),
        sa.Column("actor_kind", sa.String(8), nullable=False),
        sa.Column("actor_id", sa.String(128), nullable=False),
        sa.Column("correlation_id", sa.String(64), nullable=False),
        sa.Column("source_ref", sa.String(256), nullable=True),
        sa.Column("occurred_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("changed_fields", sa.JSON(), nullable=False),
        sa.Column("before_state", sa.JSON(), nullable=True),
        sa.Column("after_state", sa.JSON(), nullable=True),
        sa.Column("source_refs", sa.JSON(), nullable=False),
        sa.Column("approval_context", sa.JSON(), nullable=False),
        sa.CheckConstraint("entity_type IN ('SHOW','DOCUMENT','REQUIREMENT')", name="ck_rigor_audit_entity"),
        sa.CheckConstraint("action IN ('CREATE','UPDATE','DELETE')", name="ck_rigor_audit_action"),
        sa.CheckConstraint("actor_kind IN ('USER','SYSTEM')", name="ck_rigor_audit_actor"),
    )
    op.create_index("ix_rigor_audit_show_time", "rigor_audit_history", ["show_id", "occurred_at", "audit_id"])
    op.create_index("ix_rigor_audit_entity", "rigor_audit_history", ["entity_type", "entity_id"])


def downgrade():
    op.drop_table("rigor_audit_history")
