"""ModelVersion 资源的 Pydantic 请求/响应模型。"""
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.domain.enums import Framework, VersionStatus


class MetricsIn(BaseModel):
    accuracy: float | None = None
    latency: float | None = None
    throughput: float | None = None


class VersionCreate(BaseModel):
    model_config = ConfigDict(protected_namespaces=())

    version: str = Field(min_length=1)
    # a5：来源维度。mock=v1.0 模拟（必填 file_path/framework）；external-api=真转发上游（必填上游字段）。
    source: str = "mock"
    file_path: str | None = None  # 模拟路径，不真实上传
    framework: Framework | None = None
    resource_req: dict = Field(default_factory=dict)
    # external-api 上游连接（仅 source=external-api）。auth_ref 为凭证引用（环境变量名），非明文密钥。
    provider: str | None = None
    base_url: str | None = None
    upstream_model: str | None = None
    protocol: str | None = None
    auth_ref: str | None = None
    change_note: str = ""
    # 创建时可选带上性能指标(选填);未填则保持 null,后续仍可在版本详情页补录。
    metrics: MetricsIn | None = None

    @model_validator(mode="after")
    def _dispatch_required(self):
        # 按 source 派发必填集,并清空非本来源字段(避免脏数据)。
        if self.source == "external-api":
            missing = [k for k in ("provider", "base_url", "upstream_model") if not getattr(self, k)]
            if missing:
                raise ValueError(f"external-api 版本必填: {', '.join(missing)}")
            self.protocol = self.protocol or "openai"
            if self.protocol != "openai":
                raise ValueError("a5 仅支持 protocol=openai")
            self.file_path = None
            self.framework = None
        elif self.source == "mock":
            missing = [k for k in ("file_path", "framework") if not getattr(self, k)]
            if missing:
                raise ValueError(f"mock 版本必填: {', '.join(missing)}")
            self.provider = self.base_url = self.upstream_model = self.protocol = self.auth_ref = None
        else:
            raise ValueError("source 必须为 mock 或 external-api")
        return self


class VersionTransition(BaseModel):
    target: VersionStatus


class VersionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True, protected_namespaces=())

    id: str
    model_id: str
    version: str
    source: str = "mock"
    file_path: str | None = None
    framework: Framework | None = None
    resource_req: dict
    provider: str | None = None
    base_url: str | None = None
    upstream_model: str | None = None
    protocol: str | None = None
    auth_ref: str | None = None
    change_note: str
    status: VersionStatus
    metrics: dict | None
    created_at: datetime
    deployable: bool
