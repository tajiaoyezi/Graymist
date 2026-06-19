"""endpoint.deploy_generation (a2 review H1)

Revision ID: 0003_endpoint_deploy_generation
Revises: 0002_endpoint_tables
Create Date: 2026-06-19

Add a monotonically increasing generation token on endpoint so a stale background
deploy task (from a cancelled / superseded operation) can be detected and dropped
when it writes back the terminal status.
"""
import sqlalchemy as sa
from alembic import op

revision = "0003_endpoint_deploy_generation"
down_revision = "0002_endpoint_tables"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "endpoint",
        sa.Column("deploy_generation", sa.Integer(), nullable=False, server_default="0"),
    )


def downgrade() -> None:
    op.drop_column("endpoint", "deploy_generation")
