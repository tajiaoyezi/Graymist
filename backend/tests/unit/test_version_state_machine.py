"""BDD: 版本状态机（对应 spec 需求「版本状态机」）。

允许的相邻前向流转：draft→validating→ready→archived。
拒绝跨级/逆向/自环。archived 为终态。仅 ready 可部署。
"""
import pytest

from app.domain.enums import VersionStatus
from app.domain.state_machine import (
    can_transition,
    assert_transition,
    is_deployable,
    InvalidTransitionError,
)

D = VersionStatus.draft
V = VersionStatus.validating
R = VersionStatus.ready
A = VersionStatus.archived


class TestAllowedTransitions:
    @pytest.mark.parametrize("current,target", [(D, V), (V, R), (R, A)])
    def test_adjacent_forward_allowed(self, current, target):
        # WHEN 相邻前向流转 THEN 允许
        assert can_transition(current, target) is True
        assert_transition(current, target)  # 不抛异常


class TestForbiddenTransitions:
    @pytest.mark.parametrize(
        "current,target",
        [
            (D, R),  # 跨级
            (D, A),  # 跨级
            (V, A),  # 跨级（v1.0 不允许；validating→archived 属 v1.1.3）
            (V, D),  # 逆向
            (R, V),  # 逆向
            (R, D),  # 逆向
            (A, R),  # 终态后流转
            (A, D),
            (D, D),  # 自环
            (R, R),
        ],
    )
    def test_illegal_transition_rejected(self, current, target):
        # WHEN 跨级/逆向/自环/终态后流转 THEN 拒绝
        assert can_transition(current, target) is False
        with pytest.raises(InvalidTransitionError):
            assert_transition(current, target)


class TestDeployability:
    def test_only_ready_is_deployable(self):
        # WHEN 查询是否可部署 THEN 仅 ready 返回 True
        assert is_deployable(R) is True
        for s in (D, V, A):
            assert is_deployable(s) is False
