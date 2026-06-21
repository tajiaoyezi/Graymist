"""encrypted upstream credential on model_version (a7)

Revision ID: 0006_auth_secret
Revises: 0005_external_api_source
Create Date: 2026-06-21

a7 (southbound-credentials): adds auth_secret_enc to model_version to store the
平台内加密(Fernet)的上游 API Key 密文。Nullable so existing rows survive zero-backfill
(auth_secret_enc=NULL → has_api_key=false, 行为不变, 仍走 auth_ref).
"""
import sqlalchemy as sa
from alembic import op

revision = "0006_auth_secret"
down_revision = "0005_external_api_source"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "model_version",
        sa.Column("auth_secret_enc", sa.Text(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("model_version", "auth_secret_enc")
