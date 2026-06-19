"""审查 H4:commit-first(TOCTOU)修复的回归护栏。

用【文件型 SQLite + 两条独立连接】真正验证:_schedule 在调度后台任务前已提交 creating。
若删除 service._schedule 里的 `await session.commit()`,独立连接读不到该行 → 本测试失败。
(原 drain 收集器夹具共享单连接,无法证伪该修复,故另起此测试。)
"""
import pytest_asyncio
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.db import tables  # noqa: F401  注册 ORM
from app.db.base import Base
from app.db.tables import EndpointRow, ModelRow, ModelVersionRow
from app.domain.enums import VersionStatus
from app.endpoints import deploy
from app.endpoints.schemas import EndpointCreate
from app.endpoints.service import EndpointService


@pytest_asyncio.fixture
async def file_sm(tmp_path):
    # 文件库 → 多会话即多连接(StaticPool 内存库做不到独立连接可见性区分)。
    url = "sqlite+aiosqlite:///" + (tmp_path / "h4.db").as_posix()
    eng = create_async_engine(url)
    async with eng.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    sm = async_sessionmaker(eng, expire_on_commit=False)
    yield sm
    await eng.dispose()


async def test_schedule_commits_creating_before_dispatch(file_sm, monkeypatch):
    # 后台任务不真正执行(只关闭协程),只检验调度时刻 creating 是否已对独立连接可见。
    monkeypatch.setattr(deploy, "_spawn_fn", lambda coro: coro.close())

    async with file_sm() as s:
        m = ModelRow(
            name="m", description="", task_type="classification",
            input_schema={}, output_schema={},
        )
        s.add(m)
        await s.flush()
        v = ModelVersionRow(
            model_id=m.id, version="v1", file_path="/x", framework="ONNX",
            resource_req={}, status=VersionStatus.ready.value,
        )
        s.add(v)
        await s.flush()
        await s.commit()
        vid = v.id

    async with file_sm() as s1:
        payload = EndpointCreate(
            name="e", url_path="/e", replicas=1,
            resource_quota={"cpu": 1, "memory": 1, "gpu": 0},
            timeout_ms=1, max_concurrency=1,
            bindings=[{"model_version_id": vid, "weight": 100}],
        )
        out = await EndpointService.create(s1, file_sm, payload=payload)
        eid = out["id"]
        # 独立连接读:能读到 creating ⇒ create 内部(_schedule)已提交(commit-first 生效)。
        async with file_sm() as s2:
            row = await s2.get(EndpointRow, eid)
            assert row is not None and row.status == "creating"
