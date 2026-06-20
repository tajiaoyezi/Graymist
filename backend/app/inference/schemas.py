"""推理调用的 Pydantic 请求/响应模型(a3)。"""
from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field


class InferIn(BaseModel):
    # 推理输入(按命中 Model 的 input_schema 校验;可为对象/数组/标量等任意 JSON)。
    input: Any = Field(...)


class InferSyncOut(BaseModel):
    result: Any = None
    version_id: str  # 实际命中版本
    latency_ms: int


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
