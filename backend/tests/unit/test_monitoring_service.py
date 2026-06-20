"""监控聚合纯函数单元测试(a4):分桶/口径/版本分组/整窗 summary,now 可注入确定性。"""
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

from app.inference.service import ST_ERROR, ST_RATE_LIMITED, ST_SUCCESS, ST_TIMEOUT
from app.monitoring.service import aggregate

NOW = datetime(2026, 6, 20, 12, 0, 0, tzinfo=timezone.utc)


def _row(status, latency_ms, version_id="v1", ago_seconds=10):
    return SimpleNamespace(
        status=status,
        latency_ms=latency_ms,
        version_id=version_id,
        created_at=NOW - timedelta(seconds=ago_seconds),
    )


def test_summary_latency_cohort_excludes_zero_latency_rows():
    rows = [
        _row(ST_SUCCESS, 100),
        _row(ST_SUCCESS, 200),
        _row(ST_TIMEOUT, 500),
        _row(ST_ERROR, 0),
        _row(ST_RATE_LIMITED, 0, version_id=None),
    ]
    s = aggregate(rows, now=NOW, range_key="1h")["summary"]
    # 延迟样本 = success+timeout = [100,200,500];error/rate_limited(0) 不计入,不被拉向 0
    assert s["avg_latency_ms"] == 267  # round(800/3)
    assert s["p99_latency_ms"] == 500
    # 错误率 = 非 success(timeout+error+rate_limited=3)/5 = 60%
    assert s["error_rate"] == 60.0
    assert s["qps"] == round(5 / 3600, 4)


def test_empty_window_all_zero():
    agg = aggregate([], now=NOW, range_key="24h")
    assert agg["summary"] == {"qps": 0.0, "avg_latency_ms": 0, "p99_latency_ms": 0, "error_rate": 0.0}
    assert len(agg["buckets"]) == 24
    assert all(b["qps"] == 0 and b["error_rate"] == 0 for b in agg["buckets"])  # 空桶补零
    assert agg["versions"] == []


def test_version_grouping_skips_null():
    rows = [
        _row(ST_SUCCESS, 100, version_id="v1"),
        _row(ST_SUCCESS, 100, version_id="v1"),
        _row(ST_SUCCESS, 100, version_id="v2"),
        _row(ST_RATE_LIMITED, 0, version_id=None),
    ]
    agg = aggregate(rows, now=NOW, range_key="24h")
    assert sorted(v["version_id"] for v in agg["versions"]) == ["v1", "v2"]  # null 不单列为版本
    assert agg["summary"]["error_rate"] == 25.0  # null(rate_limited) 仍计入总错误率


def test_bucketing_places_row_in_single_bucket():
    agg = aggregate([_row(ST_SUCCESS, 100, ago_seconds=90)], now=NOW, range_key="1h")
    assert len(agg["buckets"]) == 60
    assert len([b for b in agg["buckets"] if b["qps"] > 0]) == 1
