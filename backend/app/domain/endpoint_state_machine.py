"""端点状态机(两个独立状态机之二,§3 / 原需求特别提醒第二条)。

状态:creating / running / stopped / failed。允许流转(其它一律拒绝):
- creating→running / creating→failed / creating→stopped(取消进行中/卡住的部署)
- running→creating(更新/重启重新部署) / running→stopped(停止完成) / running→failed
- stopped→creating(启动/重启重新部署)
- failed→creating(重启恢复;failed 非终态)

操作 → 流转:部署/启动/重启 均经 creating 异步重部署回 running;停止令 running→stopped;
重启对 running/stopped/failed 统一为"重新部署"。与版本状态机不共享字段、不互相触发。
非法流转复用 a1 的 InvalidTransitionError(由 main.py 映射为 409)。
"""
from .enums import EndpointStatus
from .state_machine import InvalidTransitionError

_ALLOWED: set[tuple[EndpointStatus, EndpointStatus]] = {
    (EndpointStatus.creating, EndpointStatus.running),
    (EndpointStatus.creating, EndpointStatus.failed),
    (EndpointStatus.creating, EndpointStatus.stopped),
    (EndpointStatus.running, EndpointStatus.creating),
    (EndpointStatus.running, EndpointStatus.stopped),
    (EndpointStatus.running, EndpointStatus.failed),
    (EndpointStatus.stopped, EndpointStatus.creating),
    (EndpointStatus.failed, EndpointStatus.creating),
}


def can_endpoint_transition(current: EndpointStatus, target: EndpointStatus) -> bool:
    return (current, target) in _ALLOWED


def assert_endpoint_transition(current: EndpointStatus, target: EndpointStatus) -> None:
    if not can_endpoint_transition(current, target):
        raise InvalidTransitionError(
            f"非法端点状态流转:{current.value} → {target.value}"
        )


def is_active(status: EndpointStatus) -> bool:
    """creating/running 计入平台配额占用;stopped/failed 不计(已释放资源)。"""
    return status in (EndpointStatus.creating, EndpointStatus.running)
