"""ModelVersion 资源的 Pydantic 请求/响应模型。"""
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from app.domain.enums import Framework, VersionStatus


class MetricsIn(BaseModel):
    accuracy: float | None = None
    latency: float | None = None
    throughput: float | None = None


class VersionCreate(BaseModel):
    model_config = ConfigDict(protected_namespaces=())

    version: str = Field(min_length=1)
    file_path: str  # 模拟路径，不真实上传
    framework: Framework
    resource_req: dict = Field(default_factory=dict)
    change_note: str = ""
    # 创建时可选带上性能指标(选填);未填则保持 null,后续仍可在版本详情页补录。
    metrics: MetricsIn | None = None


class VersionTransition(BaseModel):
    target: VersionStatus


class VersionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True, protected_namespaces=())

    id: str
    model_id: str
    version: str
    file_path: str
    framework: Framework
    resource_req: dict
    change_note: str
    status: VersionStatus
    metrics: dict | None
    created_at: datetime
    deployable: bool
