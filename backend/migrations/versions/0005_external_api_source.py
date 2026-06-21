"""external-api source on model_version + token usage on inference_log (a5)

Revision ID: 0005_external_api_source
Revises: 0004_inference_tables
Create Date: 2026-06-21

a5 incremental migration (v1.1 南向接入 + 真实数据流, §11). Adds the external-api
source dimension to model_version and real token-usage columns to inference_log.
All columns nullable / defaulted so existing rows survive with zero backfill;
file_path / framework are relaxed to nullable (mock 必填、external 可空,由服务层派发).
"""
import sqlalchemy as sa
from alembic import op

revision = "0005_external_api_source"
down_revision = "0004_inference_tables"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # model_version：来源维度 + external-api 上游连接字段
    op.add_column(
        "model_version",
        sa.Column("source", sa.String(length=32), nullable=False, server_default="mock"),
    )
    op.add_column("model_version", sa.Column("provider", sa.String(length=64), nullable=True))
    op.add_column("model_version", sa.Column("base_url", sa.String(length=512), nullable=True))
    op.add_column("model_version", sa.Column("upstream_model", sa.String(length=255), nullable=True))
    op.add_column("model_version", sa.Column("protocol", sa.String(length=16), nullable=True))
    op.add_column("model_version", sa.Column("auth_ref", sa.String(length=128), nullable=True))
    # file_path / framework 放宽为可空（external-api 版本不需要）
    with op.batch_alter_table("model_version") as batch:
        batch.alter_column("file_path", existing_type=sa.String(length=512), nullable=True)
        batch.alter_column("framework", existing_type=sa.String(length=32), nullable=True)

    # inference_log：真实 token 用量（external 落值、mock 留空）
    op.add_column("inference_log", sa.Column("prompt_tokens", sa.Integer(), nullable=True))
    op.add_column("inference_log", sa.Column("completion_tokens", sa.Integer(), nullable=True))
    op.add_column("inference_log", sa.Column("total_tokens", sa.Integer(), nullable=True))


def downgrade() -> None:
    op.drop_column("inference_log", "total_tokens")
    op.drop_column("inference_log", "completion_tokens")
    op.drop_column("inference_log", "prompt_tokens")
    with op.batch_alter_table("model_version") as batch:
        batch.alter_column("framework", existing_type=sa.String(length=32), nullable=False)
        batch.alter_column("file_path", existing_type=sa.String(length=512), nullable=False)
    op.drop_column("model_version", "auth_ref")
    op.drop_column("model_version", "protocol")
    op.drop_column("model_version", "upstream_model")
    op.drop_column("model_version", "base_url")
    op.drop_column("model_version", "provider")
    op.drop_column("model_version", "source")
