"""异步推理后台执行调度接缝(a3,沿用 deploy.py 进程内 asyncio 模式)。

不引入 Redis。测试覆盖 `_spawn_fn` 为收集器,由 drain() 在请求提交后确定性执行。
与 a2 不同:异步推理任务一任务一行、状态单向,无需代次令牌(见 design D-a3-1)。
"""
import asyncio

_pending: set[asyncio.Task] = set()


def _default_spawn(coro):
    task = asyncio.create_task(coro)
    _pending.add(task)  # 强引用防 GC(对齐 a2 M3)
    task.add_done_callback(_pending.discard)
    return task


_spawn_fn = _default_spawn  # 测试覆盖为收集器


def schedule(coro):
    return _spawn_fn(coro)
