"""平台资源配额累计校验单元测试(a2)。

口径(§4.2):端点占用 = 副本数 × 单副本配额,CPU/内存/GPU 三维分别;
剩余 = 总配额 − Σ在用端点占用;超出当且仅当 占用 > 剩余(边界含等于允许)。
"""
import pytest

from app.common.quota import (
    QuotaExceededError,
    check_within_quota,
    endpoint_usage,
    remaining,
    sum_usage,
)

TOTAL = {"cpu": 10, "memory": 1000, "gpu": 4}


def test_endpoint_usage_replicas_times_quota():
    assert endpoint_usage(2, {"cpu": 2, "memory": 100, "gpu": 1}) == {
        "cpu": 4,
        "memory": 200,
        "gpu": 2,
    }


def test_sum_usage_accumulates():
    usages = [{"cpu": 2, "memory": 100, "gpu": 1}, {"cpu": 1, "memory": 50, "gpu": 0}]
    assert sum_usage(usages) == {"cpu": 3, "memory": 150, "gpu": 1}


def test_remaining_subtracts_in_use():
    assert remaining(TOTAL, [{"cpu": 4, "memory": 200, "gpu": 2}]) == {
        "cpu": 6,
        "memory": 800,
        "gpu": 2,
    }


def test_within_quota_allows():
    # 无在用、请求恰好等于总额 → 允许(边界含等于)
    check_within_quota(TOTAL, [], {"cpu": 10, "memory": 1000, "gpu": 4})


def test_exactly_equal_remaining_allowed():
    # 已用一半,请求恰好等于剩余 → 允许
    check_within_quota(
        TOTAL,
        [{"cpu": 5, "memory": 500, "gpu": 2}],
        {"cpu": 5, "memory": 500, "gpu": 2},
    )


def test_exceed_any_dimension_rejected():
    # 仅 gpu 维超出 → 拒绝
    with pytest.raises(QuotaExceededError):
        check_within_quota(TOTAL, [], {"cpu": 10, "memory": 1000, "gpu": 5})


def test_cumulative_in_use_reduces_remaining_then_rejects():
    # 已用 6 cpu,再请求 5 cpu(剩 4)→ 拒绝
    with pytest.raises(QuotaExceededError):
        check_within_quota(
            TOTAL,
            [{"cpu": 6, "memory": 100, "gpu": 1}],
            {"cpu": 5, "memory": 100, "gpu": 1},
        )


def test_missing_dimension_treated_as_zero():
    # 配额维度缺省视为 0,不应 KeyError
    assert endpoint_usage(1, {"cpu": 2}) == {"cpu": 2, "memory": 0, "gpu": 0}


def test_fractional_equal_remaining_allowed():
    # 审查 M3:分数配额下"占用恰等于剩余"(0.3-0.1=0.199999…)应放行,不因浮点误差误拒。
    check_within_quota(
        {"cpu": 0.3, "memory": 0, "gpu": 0},
        [{"cpu": 0.1, "memory": 0, "gpu": 0}],
        {"cpu": 0.2, "memory": 0, "gpu": 0},
    )
