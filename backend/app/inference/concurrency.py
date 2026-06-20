"""每端点并发准入控制器(a3,修正审查 P1)。

进程内、不引入 Redis。容量变更**按差值调整、绝不重建对象**(重建会丢在飞许可、瞬时超限)。
同步非阻塞准入(满→429);异步阻塞准入(FIFO 排队)。容量调小时记账式延迟回收。
"""
import asyncio
from collections import deque


class CapacityController:
    def __init__(self, capacity: int):
        self._capacity = capacity
        self._in_flight = 0
        self._waiters: deque[asyncio.Future] = deque()

    @property
    def capacity(self) -> int:
        return self._capacity

    @property
    def in_flight(self) -> int:
        return self._in_flight

    def try_acquire(self) -> bool:
        """同步非阻塞准入:有空位且无人排队即占用并返回 True,否则 False(→429)。"""
        if self._in_flight < self._capacity and not self._waiters:
            self._in_flight += 1
            return True
        return False

    async def acquire(self) -> None:
        """异步阻塞准入:无空位则 FIFO 排队等待空位。"""
        if self._in_flight < self._capacity and not self._waiters:
            self._in_flight += 1
            return
        fut: asyncio.Future = asyncio.get_running_loop().create_future()
        self._waiters.append(fut)
        try:
            await fut
        except BaseException:
            if fut in self._waiters:
                try:
                    self._waiters.remove(fut)
                except ValueError:
                    pass
            elif fut.done() and not fut.cancelled():
                self.release()  # 已被授予名额却放弃 → 归还
            raise

    def release(self) -> None:
        """释放一个在飞名额。

        - 若在飞已超目标容量(容量被调小):仅回收、不转交,直至回落到容量(记账式延迟回收);
        - 否则有排队者则名额直接转交队首(在飞计数不变),无排队者则回收。
        """
        if self._in_flight > self._capacity:
            self._in_flight -= 1
            return
        while self._waiters:
            fut = self._waiters.popleft()
            if not fut.done():
                fut.set_result(None)  # 转交名额,in_flight 维持
                return
        if self._in_flight > 0:
            self._in_flight -= 1

    def set_capacity(self, new_capacity: int) -> None:
        """按差值调整目标容量,不重建对象、不丢在飞许可。

        调大:在新容量允许范围内唤醒排队者并占位;调小:不动在飞,空位归还时由
        release 自然回落(in_flight>capacity 时只回收不补发),直至降到新容量。
        """
        self._capacity = new_capacity
        while self._waiters and self._in_flight < self._capacity:
            fut = self._waiters.popleft()
            if not fut.done():
                self._in_flight += 1
                fut.set_result(None)


_controllers: dict[str, CapacityController] = {}


def get_controller(endpoint_id: str, capacity: int) -> CapacityController:
    """取(或建)端点并发控制器;若 max_concurrency 变化,按差值调整、不重建。"""
    ctrl = _controllers.get(endpoint_id)
    if ctrl is None:
        ctrl = CapacityController(capacity)
        _controllers[endpoint_id] = ctrl
    elif ctrl.capacity != capacity:
        ctrl.set_capacity(capacity)
    return ctrl


def reset() -> None:
    """清空注册表(测试隔离用)。"""
    _controllers.clear()
