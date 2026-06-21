"""推理调用的 Pydantic 请求/响应模型(a3;a5 增 usage 与北向)。"""
from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class InferIn(BaseModel):
    # 推理输入(mock 按 input_schema 校验;external-api 为 chat 形状 {messages,...})。
    input: Any = Field(...)


class InferSyncOut(BaseModel):
    result: Any = None
    version_id: str  # 实际命中版本
    latency_ms: int
    usage: dict | None = None  # a5:external-api 真实 token 用量;mock 为 None


class ChatCompletionsIn(BaseModel):
    # 北向 OpenAI 兼容入口:model 用于寻址(匹配端点 url_path),其余字段透传 canonical。
    model_config = ConfigDict(protected_namespaces=(), extra="allow")

    model: str
    messages: list = Field(default_factory=list)


class AsyncSubmitOut(BaseModel):
    task_id: str
    status: str


class AsyncTaskOut(BaseModel):
    id: str
    endpoint_id: str
    status: str
    result: Any = None
    created_at: datetime
    finished_at: datetime | None = None
