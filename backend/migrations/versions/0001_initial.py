"""initial: model / model_version / change_log

Revision ID: 0001_initial
Revises:
Create Date: 2026-06-19

对应 tasks 2.1/2.2/2.3。JSON 列在 PostgreSQL 用 jsonb、其它方言退化为 JSON。
本迁移不建 Endpoint/Binding/InferenceLog/AsyncTask/PlatformQuota（tasks 2.4，留待 change 2–4）。
"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0001_initial"
down_revision = None
branch_labels = None
depends_on = None


def _json():
    return sa.JSON().with_variant(postgresql.JSONB(), "postgresql")


def upgrade() -> None:
    op.create_table(
        "model",
        sa.Column("id", sa.String(length=32), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("task_type", sa.String(length=32), nullable=False),
        sa.Column("input_schema", _json(), nullable=False),
        sa.Column("output_schema", _json(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_model_name", "model", ["name"])
    op.create_index("ix_model_task_type", "model", ["task_type"])

    op.create_table(
        "model_version",
        sa.Column("id", sa.String(length=32), nullable=False),
        sa.Column("model_id", sa.String(length=32), nullable=False),
        sa.Column("version", sa.String(length=64), nullable=False),
        sa.Column("file_path", sa.String(length=512), nullable=False),
        sa.Column("framework", sa.String(length=32), nullable=False),
        sa.Column("resource_req", _json(), nullable=False),
        sa.Column("change_note", sa.Text(), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("metrics", _json(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["model_id"], ["model.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_model_version_model_id", "model_version", ["model_id"])

    op.create_table(
        "change_log",
        sa.Column("id", sa.String(length=32), nullable=False),
        sa.Column("target_type", sa.String(length=64), nullable=False),
        sa.Column("target_id", sa.String(length=32), nullable=False),
        sa.Column("op", sa.String(length=64), nullable=False),
        sa.Column("before", _json(), nullable=True),
        sa.Column("after", _json(), nullable=True),
        sa.Column("actor", sa.String(length=64), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_change_log_target_type", "change_log", ["target_type"])
    op.create_index("ix_change_log_target_id", "change_log", ["target_id"])


def downgrade() -> None:
    op.drop_table("change_log")
    op.drop_table("model_version")
    op.drop_table("model")
