"""监控指标聚合与查询(a4,§4.4 / 原 2.4)。

从 inference_log 按时间窗(1h-分钟 / 24h-小时 / 7d-天)**按需**分桶聚合 QPS/平均延迟/P99/
错误率,并按命中版本分组(A/B 对比)+ 整窗 summary。延迟样本仅取实际执行的调用
(success/timeout);error 与 rate_limited 行 latency_ms=0,只计错误率分母、不计延迟。
当前并发数读 a3 进程内在飞计数;资源总览复用 a2 /quota(不在此重造)。
聚合为纯函数(aggregate),now 可注入,便于确定性测试;查询服务留接缝,生产可换 SQL 物化。
"""
import math
from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.errors import NotFoundError
from app.common.schema_validation import InvalidSchemaError
from app.db.tables import EndpointRow, InferenceLogRow
from app.inference import concurrency
from app.inference.service import ST_SUCCESS, ST_TIMEOUT

# range → (桶数, 单桶秒数)
RANGES: dict[str, tuple[int, int]] = {
    "1h": (60, 60),
    "24h": (24, 3600),
    "7d": (7, 86400),
}

# 延迟样本只取实际执行的调用(error/rate_limited 的 latency_ms=0,不代表真实延迟)。
_LATENCY_COHORT = {ST_SUCCESS, ST_TIMEOUT}


def _ca(row) -> datetime:
    ca = row.created_at
    return ca.replace(tzinfo=timezone.utc) if ca.tzinfo is None else ca


def _percentile_nearest_rank(values: list[int], q: float) -> int:
    if not values:
        return 0
    s = sorted(values)
    rank = max(1, math.ceil(q * len(s)))
    return s[rank - 1]


def _metrics_for(rows: list, period_seconds: int) -> dict:
    total = len(rows)
    if total == 0:
        return {"qps": 0.0, "avg_latency_ms": 0, "p99_latency_ms": 0, "error_rate": 0.0}
    lat = [r.latency_ms for r in rows if r.status in _LATENCY_COHORT]
    avg = round(sum(lat) / len(lat)) if lat else 0
    p99 = _percentile_nearest_rank(lat, 0.99) if lat else 0
    errors = sum(1 for r in rows if r.status != ST_SUCCESS)
    return {
        "qps": round(total / period_seconds, 4),
        "avg_latency_ms": avg,
        "p99_latency_ms": p99,
        "error_rate": round(errors / total * 100, 2),
    }


def _bucketize(rows: list, now: datetime, num_buckets: int, bucket_seconds: int) -> list[dict]:
    window_start = now - timedelta(seconds=num_buckets * bucket_seconds)
    buckets: list[list] = [[] for _ in range(num_buckets)]
    for r in rows:
        delta = (_ca(r) - window_start).total_seconds()
        if delta < 0:
            continue
        idx = min(int(delta // bucket_seconds), num_buckets - 1)
        buckets[idx].append(r)
    out = []
    for i, b in enumerate(buckets):
        t = (window_start + timedelta(seconds=i * bucket_seconds)).isoformat()
        out.append({"t": t, **_metrics_for(b, bucket_seconds)})
    return out


def aggregate(rows: list, *, now: datetime, range_key: str) -> dict:
    """纯聚合:把窗口内日志行分桶 + 按版本分组 + 整窗 summary。now 可注入。"""
    num_buckets, bucket_seconds = RANGES[range_key]
    window = num_buckets * bucket_seconds
    window_start = now - timedelta(seconds=window)
    in_window = [r for r in rows if _ca(r) >= window_start]

    by_version: dict[str, list] = {}
    for r in in_window:
        if r.version_id:  # version_id 为空(429/未命中)不单列为版本
            by_version.setdefault(r.version_id, []).append(r)

    return {
        "range": range_key,
        "buckets": _bucketize(in_window, now, num_buckets, bucket_seconds),
        "versions": [
            {"version_id": vid, "buckets": _bucketize(vr, now, num_buckets, bucket_seconds)}
            for vid, vr in by_version.items()
        ],
        # 整窗 summary:整窗视为单一桶,套用同口径
        "summary": _metrics_for(in_window, window),
    }


class MonitoringService:
    @staticmethod
    async def metrics(session: AsyncSession, endpoint_id: str, range_key: str, now: datetime | None = None) -> dict:
        if range_key not in RANGES:
            raise InvalidSchemaError(f"不支持的时间范围: {range_key}")  # → 422
        ep = await session.get(EndpointRow, endpoint_id)
        if ep is None:
            raise NotFoundError("端点")  # → 404
        now = now or datetime.now(timezone.utc)
        num_buckets, bucket_seconds = RANGES[range_key]
        window_start = now - timedelta(seconds=num_buckets * bucket_seconds)
        rows = (
            await session.execute(
                select(InferenceLogRow).where(
                    InferenceLogRow.endpoint_id == endpoint_id,
                    InferenceLogRow.created_at >= window_start,
                )
            )
        ).scalars().all()
        agg = aggregate(list(rows), now=now, range_key=range_key)
        agg["current_concurrency"] = concurrency.current_in_flight(endpoint_id)
        return agg
