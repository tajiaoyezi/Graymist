"""inference_log / async_inference_task (a3)

Revision ID: 0004_inference_tables
Revises: 0003_endpoint_deploy_generation
Create Date: 2026-06-20

a3 incremental migration (推理调用 API, §4.3). JSON column uses jsonb on
PostgreSQL, JSON elsewhere. inference_log.version_id is nullable (429/422 calls
rejected before version selection carry no hit version).
"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0004_inference_tables"
down_revision = "0003_endpoint_deploy_generation"
branch_labels = None
depends_on = None


def _json():
    return sa.JSON().with_variant(postgresql.JSONB(), "postgresql")


def upgrade() -> None:
    op.create_table(
        "inference_log",
        sa.Column("id", sa.String(length=32), nullable=False),
        sa.Column("endpoint_id", sa.String(length=32), nullable=False),
        sa.Column("version_id", sa.String(length=32), nullable=True),
        sa.Column("mode", sa.String(length=16), nullable=False),
        sa.Column("input_summary", sa.Text(), nullable=False),
        sa.Column("output_summary", sa.Text(), nullable=False),
        sa.Column("latency_ms", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_inference_log_endpoint_id", "inference_log", ["endpoint_id"])

    op.create_table(
        "async_inference_task",
        sa.Column("id", sa.String(length=32), nullable=False),
        sa.Column("endpoint_id", sa.String(length=32), nullable=False),
        sa.Column("status", sa.String(length=16), nullable=False),
        sa.Column("input", _json(), nullable=False),
        sa.Column("result", _json(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_async_inference_task_endpoint_id", "async_inference_task", ["endpoint_id"]
    )


def downgrade() -> None:
    op.drop_table("async_inference_task")
    op.drop_table("inference_log")
