"""endpoint / endpoint_version_binding (a2)

Revision ID: 0002_endpoint_tables
Revises: 0001_initial
Create Date: 2026-06-19

a2 incremental migration. change_log is reused from a1 (no change).
JSON column uses jsonb on PostgreSQL, JSON elsewhere.
"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0002_endpoint_tables"
down_revision = "0001_initial"
branch_labels = None
depends_on = None


def _json():
    return sa.JSON().with_variant(postgresql.JSONB(), "postgresql")


def upgrade() -> None:
    op.create_table(
        "endpoint",
        sa.Column("id", sa.String(length=32), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("url_path", sa.String(length=255), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("replicas", sa.Integer(), nullable=False),
        sa.Column("resource_quota", _json(), nullable=False),
        sa.Column("timeout_ms", sa.Integer(), nullable=False),
        sa.Column("max_concurrency", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_endpoint_name", "endpoint", ["name"])
    op.create_index("ix_endpoint_url_path", "endpoint", ["url_path"], unique=True)

    op.create_table(
        "endpoint_version_binding",
        sa.Column("id", sa.String(length=32), nullable=False),
        sa.Column("endpoint_id", sa.String(length=32), nullable=False),
        sa.Column("model_version_id", sa.String(length=32), nullable=False),
        sa.Column("weight", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(["endpoint_id"], ["endpoint.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_endpoint_version_binding_endpoint_id",
        "endpoint_version_binding",
        ["endpoint_id"],
    )
    op.create_index(
        "ix_endpoint_version_binding_model_version_id",
        "endpoint_version_binding",
        ["model_version_id"],
    )


def downgrade() -> None:
    op.drop_table("endpoint_version_binding")
    op.drop_table("endpoint")
