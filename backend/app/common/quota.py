"""平台资源配额累计校验(a2,§4.2 口径)。

端点占用 = 副本数 × 单副本 resource_quota,按 CPU/内存/GPU 三维分别计算;
剩余 = 平台总配额 − Σ(所有 active[creating/running] 端点占用);
判定"超出"当且仅当某维度 请求占用 > 剩余(占用恰等于剩余允许通过)。
stopped/failed 端点不计占用 —— 由调用方只把 active 端点的占用传入。
"""
from collections.abc import Iterable

DIMENSIONS = ("cpu", "memory", "gpu")
# 浮点容差(审查 M3):分数配额下"占用恰等于剩余"因 IEEE754 误差不应被误判为超出。
_EPS = 1e-9


class QuotaExceededError(Exception):
    """请求资源在某维度超出平台剩余配额(映射为 HTTP 409)。"""


def endpoint_usage(replicas: int, quota: dict) -> dict:
    """单个端点占用 = 副本数 × 单副本配额(缺省维度按 0)。"""
    return {dim: replicas * quota.get(dim, 0) for dim in DIMENSIONS}


def sum_usage(usages: Iterable[dict]) -> dict:
    total = {dim: 0 for dim in DIMENSIONS}
    for u in usages:
        for dim in DIMENSIONS:
            total[dim] += u.get(dim, 0)
    return total


def remaining(total: dict, in_use_usages: Iterable[dict]) -> dict:
    used = sum_usage(in_use_usages)
    return {dim: total.get(dim, 0) - used[dim] for dim in DIMENSIONS}


def check_within_quota(total: dict, in_use_usages: Iterable[dict], request_usage: dict) -> None:
    """请求占用在任一维度 > 剩余则抛 QuotaExceededError。"""
    rem = remaining(total, in_use_usages)
    # 超出当且仅当 占用 > 剩余;加容差使分数配额下的等值边界放行(M3)。
    over = [dim for dim in DIMENSIONS if request_usage.get(dim, 0) > rem[dim] + _EPS]
    if over:
        detail = ", ".join(
            f"{dim}: 需 {request_usage.get(dim, 0)} > 剩余 {rem[dim]}" for dim in over
        )
        raise QuotaExceededError(f"资源预算超额({detail})")
