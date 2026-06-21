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

    # a2 平台总配额（资源预算累计校验，可配置）。CPU 核 / 内存 MB / GPU 卡。
    total_cpu: float = 32
    total_memory: float = 65536
    total_gpu: float = 8
    # a2 异步部署模拟耗时区间（秒）。测试/E2E 设 0 使其确定收敛。
    deploy_delay_min_seconds: float = 3.0
    deploy_delay_max_seconds: float = 10.0
    # a3 推理执行模拟耗时区间（秒，原 2.3：100ms~3s）。测试设 0/可注入。
    infer_latency_min_seconds: float = 0.1
    infer_latency_max_seconds: float = 3.0
    # a5 external-api 南向接入。upstream_mock=True：走内置打桩上游（确定性、无 key/无网络）；
    # 接真上游时翻转为 False。整体往返超时走端点 timeout_ms（asyncio.wait_for），此处仅 httpx 连接级兜底。
    upstream_mock: bool = True
    upstream_connect_timeout_seconds: float = 30.0
    # a7：上游凭证加密主密钥（Fernet key）。为空则平台内不加密存 key,只能用 auth_ref 环境变量引用。
    secret_key: str = ""


settings = Settings()
