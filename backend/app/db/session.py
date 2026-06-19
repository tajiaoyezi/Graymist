"""异步 DB 会话。引擎惰性创建：仅在首次取会话/引擎时按 settings 建立，
避免在导入期（如测试，get_session 被 override）连接生产 PostgreSQL/加载 asyncpg。
"""
from collections.abc import AsyncIterator

from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from app.config import settings

_engine: AsyncEngine | None = None
_sessionmaker: async_sessionmaker[AsyncSession] | None = None


def get_engine() -> AsyncEngine:
    global _engine
    if _engine is None:
        _engine = create_async_engine(settings.database_url, future=True)
    return _engine


def get_sessionmaker() -> async_sessionmaker[AsyncSession]:
    global _sessionmaker
    if _sessionmaker is None:
        _sessionmaker = async_sessionmaker(get_engine(), expire_on_commit=False)
    return _sessionmaker


async def get_session() -> AsyncIterator[AsyncSession]:
    """FastAPI 依赖：每请求一个会话，成功提交、异常回滚。"""
    async with get_sessionmaker()() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise


def get_bg_sessionmaker() -> async_sessionmaker[AsyncSession]:
    """FastAPI 依赖：供异步后台任务开自己的独立会话（a2 异步部署执行器，H3）。
    测试可覆盖此依赖为测试会话工厂，使后台写回落到测试库。"""
    return get_sessionmaker()
