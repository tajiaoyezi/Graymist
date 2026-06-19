"""DB / HTTP 测试 fixture。

测试用 SQLite(aiosqlite, 内存, StaticPool 共享一条连接)替代生产 PostgreSQL；
被测领域逻辑(CRUD/枚举/状态机/JSON 存储)与方言无关，故 SQLite 足够。
"""
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

from app.config import settings
from app.db.base import Base
from app.db import tables  # noqa: F401  注册 ORM 到 Base.metadata
from app.db.session import get_session
from app.main import create_app


@pytest_asyncio.fixture
async def engine():
    eng = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        poolclass=StaticPool,
        connect_args={"check_same_thread": False},
    )
    async with eng.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield eng
    await eng.dispose()


@pytest_asyncio.fixture
async def session_factory(engine):
    return async_sessionmaker(engine, expire_on_commit=False)


@pytest_asyncio.fixture
async def db_session(session_factory):
    async with session_factory() as s:
        yield s
        await s.commit()


@pytest_asyncio.fixture
async def client(session_factory):
    app = create_app()

    async def override_get_session():
        async with session_factory() as s:
            try:
                yield s
                await s.commit()
            except Exception:
                await s.rollback()
                raise

    app.dependency_overrides[get_session] = override_get_session
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


class _EndpointHarness:
    """端点测试夹具:客户端 + 异步部署排空器。"""

    def __init__(self, client, drain):
        self.client = client
        self.drain = drain


@pytest_asyncio.fixture
async def endpoint_client(session_factory, monkeypatch):
    """专供端点用例:覆盖后台会话工厂为测试工厂,并把异步部署收集起来,
    由 drain() 在请求提交后确定性执行(规避 StaticPool 并发可见性)。"""
    from app.db.session import get_bg_sessionmaker
    from app.endpoints import deploy

    # 模拟耗时设 0,使后台执行即时收敛。
    monkeypatch.setattr(settings, "deploy_delay_min_seconds", 0)
    monkeypatch.setattr(settings, "deploy_delay_max_seconds", 0)

    collected: list = []
    monkeypatch.setattr(deploy, "_spawn_fn", lambda coro: collected.append(coro))

    app = create_app()

    async def override_get_session():
        async with session_factory() as s:
            try:
                yield s
                await s.commit()
            except Exception:
                await s.rollback()
                raise

    app.dependency_overrides[get_session] = override_get_session
    app.dependency_overrides[get_bg_sessionmaker] = lambda: session_factory

    async def drain(n=None):
        # 请求已提交并关闭后,顺序执行后台部署协程(各自开独立会话)。
        # n 指定只执行前 n 个(用于构造交错场景),省略则全部执行。
        count = 0
        while collected and (n is None or count < n):
            await collected.pop(0)
            count += 1

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield _EndpointHarness(ac, drain)
    # 清理未排空的协程,避免 "coroutine never awaited" 警告。
    for coro in collected:
        coro.close()
