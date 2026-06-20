"""监控查询的 Pydantic 响应模型(a4)。"""
from pydantic import BaseModel


class BucketOut(BaseModel):
    t: str  # 桶起始时间(UTC ISO)
    qps: float
    avg_latency_ms: int
    p99_latency_ms: int
    error_rate: float  # 百分比 0..100


class VersionSeriesOut(BaseModel):
    version_id: str
    buckets: list[BucketOut]


class SummaryOut(BaseModel):
    qps: float
    avg_latency_ms: int
    p99_latency_ms: int
    error_rate: float


class MetricsOut(BaseModel):
    range: str
    buckets: list[BucketOut]
    versions: list[VersionSeriesOut]
    current_concurrency: int
    summary: SummaryOut
