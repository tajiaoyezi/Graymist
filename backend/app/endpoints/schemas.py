"""Endpoint 资源的 Pydantic 请求/响应模型(a2)。"""
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from app.domain.enums import EndpointStatus


class ResourceQuota(BaseModel):
    # 审查 H3:三维必填且非负,杜绝裸 dict(缺键→占用算 0 绕过配额、负数虚增剩余、非数值 500)。
    cpu: float = Field(ge=0)
    memory: float = Field(ge=0)
    gpu: float = Field(ge=0)


class BindingIn(BaseModel):
    model_config = ConfigDict(protected_namespaces=())

    model_version_id: str
    weight: int


class EndpointCreate(BaseModel):
    model_config = ConfigDict(protected_namespaces=())

    name: str = Field(min_length=1)
    url_path: str = Field(min_length=1)
    replicas: int = Field(ge=1)
    resource_quota: ResourceQuota
    timeout_ms: int = Field(ge=0)
    max_concurrency: int = Field(ge=1)
    bindings: list[BindingIn]


class EndpointUpdate(BaseModel):
    model_config = ConfigDict(protected_namespaces=())

    replicas: int | None = Field(default=None, ge=1)
    resource_quota: ResourceQuota | None = None
    timeout_ms: int | None = Field(default=None, ge=0)
    max_concurrency: int | None = Field(default=None, ge=1)
    bindings: list[BindingIn] | None = None


class BindingOut(BaseModel):
    model_config = ConfigDict(protected_namespaces=())

    model_version_id: str
    weight: int


class EndpointOut(BaseModel):
    model_config = ConfigDict(protected_namespaces=())

    id: str
    name: str
    url_path: str
    status: EndpointStatus
    replicas: int
    resource_quota: ResourceQuota
    timeout_ms: int
    max_concurrency: int
    bindings: list[BindingOut]
    created_at: datetime


class QuotaOut(BaseModel):
    total: dict
    used: dict
    remaining: dict
