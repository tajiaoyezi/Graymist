"""应用配置（pydantic-settings）。环境变量前缀 GRAYMIST_。"""
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_prefix="GRAYMIST_", env_file=".env", extra="ignore"
    )

    # 生产：PostgreSQL（asyncpg）。测试用 SQLite（见 tests/conftest.py）。
    database_url: str = "postgresql+asyncpg://graymist:graymist@localhost:5432/graymist"
    redis_url: str = "redis://localhost:6379/0"
    # 仅本地/E2E：启动时 create_all 建表（生产请用 Alembic 迁移，保持 False）。
    auto_create_tables: bool = False
    # 请求体大小上限（字节），超出返回 413（审查 M2 DoS 防护）。
    max_request_bytes: int = 1024 * 1024


settings = Settings()
