"""监控查询的 Pydantic 响应模型(a4)。"""
from datetime import datetime

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


class InferenceLogOut(BaseModel):
    """逐条推理日志(§4.3):记录端点/命中版本/输入·输出摘要/延迟/状态。"""

    id: str
    endpoint_id: str
    version_id: str | None  # 实际命中版本;429/422 等未命中为 None
    version: str | None = None  # 命中版本的可读版本号(供 A/B 分析展示)
    mode: str
    input_summary: str
    output_summary: str
    latency_ms: int
    status: str
    created_at: datetime
