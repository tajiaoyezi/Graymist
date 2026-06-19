"""Alembic 迁移环境。

URL 优先级：环境变量 ALEMBIC_SQLALCHEMY_URL > alembic.ini sqlalchemy.url >
app.config.settings.database_url。迁移使用同步驱动。
"""
import os
import sys
from pathlib import Path

from alembic import context
from sqlalchemy import engine_from_config, pool

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))  # backend/

from app.config import settings  # noqa: E402
from app.db import tables  # noqa: E402,F401  注册 ORM 到 metadata
from app.db.base import Base  # noqa: E402

config = context.config

_url = (
    os.environ.get("ALEMBIC_SQLALCHEMY_URL")
    or config.get_main_option("sqlalchemy.url")
    or settings.database_url
)
config.set_main_option("sqlalchemy.url", _url)

target_metadata = Base.metadata


def run_migrations_offline() -> None:
    context.configure(
        url=_url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    with connectable.connect() as connection:
        context.configure(connection=connection, target_metadata=target_metadata)
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
