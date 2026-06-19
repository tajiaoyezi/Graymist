"""异步执行器健壮性单元测试(审查 M4:强引用防 GC)。"""
from app.endpoints import deploy


async def test_default_spawn_tracks_then_releases():
    # _default_spawn 应把任务放入 _pending(强引用防 GC),完成后移除。
    ran = []

    async def coro():
        ran.append(1)

    task = deploy._default_spawn(coro())
    assert task in deploy._pending
    await task
    assert task not in deploy._pending
    assert ran == [1]
