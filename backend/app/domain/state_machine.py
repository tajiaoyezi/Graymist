"""版本状态机（两个独立状态机之一，§3 / 原需求特别提醒第二条）。

draft → validating → ready → archived，仅允许相邻前向流转；
拒绝跨级 / 逆向 / 自环；archived 为终态；仅 ready 可部署。

注：validating→archived（失败版本归档）属 v1.1.3 评测门禁范畴，v1.0 不开放。
端点状态机在 change 2（a2-endpoint-deployment）独立建模，与本状态机不共享字段。
"""
from .enums import VersionStatus


class InvalidTransitionError(Exception):
    """非法的版本状态流转。"""


_ALLOWED: set[tuple[VersionStatus, VersionStatus]] = {
    (VersionStatus.draft, VersionStatus.validating),
    (VersionStatus.validating, VersionStatus.ready),
    (VersionStatus.ready, VersionStatus.archived),
}


def can_transition(current: VersionStatus, target: VersionStatus) -> bool:
    """是否允许 current → target 的流转。"""
    return (current, target) in _ALLOWED


def assert_transition(current: VersionStatus, target: VersionStatus) -> None:
    """非法流转则抛 InvalidTransitionError。"""
    if not can_transition(current, target):
        raise InvalidTransitionError(
            f"非法版本状态流转：{current.value} → {target.value}"
        )


def is_deployable(status: VersionStatus) -> bool:
    """仅 ready 版本可被部署到端点（原需求 2.1 / 2.2）。"""
    return status == VersionStatus.ready
