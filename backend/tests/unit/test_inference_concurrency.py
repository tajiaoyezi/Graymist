"""每端点并发准入控制器单元测试(a3 · 修正审查 P1)。"""
import asyncio

from app.inference.concurrency import CapacityController, get_controller, reset


def test_try_acquire_until_full_then_release():
    c = CapacityController(2)
    assert c.try_acquire() is True
    assert c.try_acquire() is True
    assert c.in_flight == 2
    assert c.try_acquire() is False  # 满 → 429
    c.release()
    assert c.in_flight == 1
    assert c.try_acquire() is True  # 释放后下一请求可获额度


def test_release_on_each_exit_frees():
    c = CapacityController(1)
    assert c.try_acquire() is True
    assert c.try_acquire() is False
    c.release()  # 模拟成功/异常/超时任一出口释放
    assert c.try_acquire() is True


async def test_async_acquire_queues_and_granted_on_release():
    c = CapacityController(1)
    assert c.try_acquire() is True  # 占满
    waited = []

    async def waiter():
        await c.acquire()
        waited.append(1)

    task = asyncio.create_task(waiter())
    await asyncio.sleep(0)  # 让 waiter 进入排队
    assert waited == []  # 阻塞等待,不 429
    c.release()  # 名额转交队首异步
    await task
    assert waited == [1]
    assert c.in_flight == 1  # 名额转交,在飞维持


async def test_sync_gets_429_while_async_queued():
    c = CapacityController(1)
    assert c.try_acquire() is True

    async def waiter():
        await c.acquire()

    task = asyncio.create_task(waiter())
    await asyncio.sleep(0)
    assert c.try_acquire() is False  # 有异步排队 → 新同步仍 429(FIFO)
    c.release()
    await task


async def test_capacity_increase_wakes_waiter():
    c = CapacityController(1)
    assert c.try_acquire() is True
    granted = []

    async def waiter():
        await c.acquire()
        granted.append(1)

    task = asyncio.create_task(waiter())
    await asyncio.sleep(0)
    c.set_capacity(2)  # 调大 → 唤醒排队者占新空位
    await task
    assert granted == [1]
    assert c.in_flight == 2


async def test_capacity_decrease_no_drop_and_drains():
    c = CapacityController(3)
    for _ in range(3):
        assert c.try_acquire() is True
    assert c.in_flight == 3
    c.set_capacity(1)  # 调小:不动在飞
    assert c.in_flight == 3  # 在飞许可未丢
    assert c.try_acquire() is False  # 超容量,不再准入
    c.release()
    assert c.in_flight == 2  # 记账式回收
    c.release()
    assert c.in_flight == 1  # 回落到新容量
    assert c.try_acquire() is False  # 仍满(=1)
    c.release()
    assert c.in_flight == 0
    assert c.try_acquire() is True  # 降到容量后恢复准入


def test_get_controller_adjusts_not_rebuild():
    reset()
    c1 = get_controller("ep1", 2)
    c1.try_acquire()
    c2 = get_controller("ep1", 5)  # 容量变化
    assert c2 is c1  # 同一对象,不重建
    assert c2.capacity == 5
    assert c2.in_flight == 1  # 在飞计数保留
    reset()


def test_current_in_flight_reads_without_creating():
    from app.inference import concurrency as cc

    cc.reset()
    assert cc.current_in_flight("epX") == 0  # 无控制器返 0
    assert "epX" not in cc._controllers  # 且不创建控制器
    ctrl = cc.get_controller("epX", 2)
    ctrl.try_acquire()
    assert cc.current_in_flight("epX") == 1
    cc.reset()
