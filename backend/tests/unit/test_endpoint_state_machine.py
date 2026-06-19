"""端点状态机单元测试(a2 · 第二个独立状态机)。

BDD:覆盖允许集内全部流转、非法流转被拒、is_active 占用语义。
端点状态机与版本状态机不共享字段;非法流转复用 a1 的 InvalidTransitionError(→409)。
"""
import pytest

from app.domain.endpoint_state_machine import (
    assert_endpoint_transition,
    can_endpoint_transition,
    is_active,
)
from app.domain.enums import EndpointStatus
from app.domain.state_machine import InvalidTransitionError

LEGAL = [
    (EndpointStatus.creating, EndpointStatus.running),
    (EndpointStatus.creating, EndpointStatus.failed),
    (EndpointStatus.creating, EndpointStatus.stopped),  # 取消卡住/进行中的部署
    (EndpointStatus.running, EndpointStatus.creating),  # 更新/重启重新部署
    (EndpointStatus.running, EndpointStatus.stopped),   # 停止完成
    (EndpointStatus.running, EndpointStatus.failed),
    (EndpointStatus.stopped, EndpointStatus.creating),  # 启动/重启重新部署
    (EndpointStatus.failed, EndpointStatus.creating),   # 重启恢复(failed 非终态)
]

ILLEGAL = [
    (EndpointStatus.stopped, EndpointStatus.running),  # 启动须经 creating 重部署
    (EndpointStatus.failed, EndpointStatus.running),   # 重启须经 creating
    (EndpointStatus.failed, EndpointStatus.stopped),
    (EndpointStatus.stopped, EndpointStatus.failed),
    (EndpointStatus.creating, EndpointStatus.creating),  # 自环
    (EndpointStatus.running, EndpointStatus.running),
    (EndpointStatus.stopped, EndpointStatus.stopped),
    (EndpointStatus.failed, EndpointStatus.failed),
]


@pytest.mark.parametrize("cur,tgt", LEGAL)
def test_legal_transitions_allowed(cur, tgt):
    # WHEN 允许集内的流转 THEN can_* 为真且 assert_* 不抛
    assert can_endpoint_transition(cur, tgt) is True
    assert_endpoint_transition(cur, tgt)


@pytest.mark.parametrize("cur,tgt", ILLEGAL)
def test_illegal_transitions_rejected(cur, tgt):
    # WHEN 不在允许集内 THEN can_* 为假且 assert_* 抛 InvalidTransitionError
    assert can_endpoint_transition(cur, tgt) is False
    with pytest.raises(InvalidTransitionError):
        assert_endpoint_transition(cur, tgt)


@pytest.mark.parametrize(
    "status,active",
    [
        (EndpointStatus.creating, True),
        (EndpointStatus.running, True),
        (EndpointStatus.stopped, False),
        (EndpointStatus.failed, False),
    ],
)
def test_is_active_occupies_quota(status, active):
    # creating/running 计入配额占用;stopped/failed 不计。
    assert is_active(status) is active
