"""异步部署执行器(a2,进程内 asyncio;Redis 留到 a3)。

设计要点(对抗式审查 H2/H3/M3):
- 部署/启动/重启/更新经 creating 异步重部署回 running;停止异步令 running→stopped。
- 后台协程经独立 sessionmaker 开自己的会话回写终态并提交,绝不复用请求会话(H3)。
- 任何异常都尽力置 failed 并记录日志;对 create_task 保留强引用防 GC(M3)。
- 调度通过 _spawn_fn 接缝,测试可替换为收集器,由 drain() 在请求提交后确定性执行。
"""
import asyncio
import logging
import random

from app.config import settings
from app.domain.enums import EndpointStatus

logger = logging.getLogger("graymist.deploy")

_pending: set[asyncio.Task] = set()


def _default_spawn(coro):
    task = asyncio.create_task(coro)
    _pending.add(task)  # 强引用,防止任务被 GC 提前回收
    task.add_done_callback(_pending.discard)
    return task


_spawn_fn = _default_spawn  # 测试覆盖为收集器


def _simulate_failure(endpoint_id: str) -> bool:
    """模拟部署失败的钩子;默认从不失败,测试可 monkeypatch 强制失败。"""
    return False


async def _delay() -> None:
    lo = settings.deploy_delay_min_seconds
    hi = settings.deploy_delay_max_seconds
    await asyncio.sleep(random.uniform(lo, hi) if hi > lo else lo)


async def _finalize(sessionmaker, endpoint_id, expected_from, target, op, token) -> None:
    from app.endpoints.service import EndpointService

    async with sessionmaker() as session:
        await EndpointService.finalize_async(
            session,
            endpoint_id=endpoint_id,
            expected_from=expected_from,
            target=target,
            op=op,
            token=token,
        )
        await session.commit()


async def _run(sessionmaker, endpoint_id, expected_from, target, op, token) -> None:
    try:
        await _delay()
        if _simulate_failure(endpoint_id):
            raise RuntimeError("simulated deploy failure")
        await _finalize(sessionmaker, endpoint_id, expected_from, target, op, token)
    except Exception:
        logger.exception("deploy executor failed: %s", endpoint_id)
        try:
            await _finalize(
                sessionmaker, endpoint_id, expected_from, EndpointStatus.failed, op + ".failed", token
            )
        except Exception:
            logger.exception("could not mark endpoint failed: %s", endpoint_id)


def schedule(sessionmaker, *, endpoint_id, expected_from, target, op, token):
    """安排一次异步重部署/停止;token 为调度时刻的代次,用于丢弃旧代回写。"""
    return _spawn_fn(_run(sessionmaker, endpoint_id, expected_from, target, op, token))
