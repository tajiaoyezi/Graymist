"""Model 资源的 Pydantic 请求/响应模型。"""
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from app.domain.enums import TaskType, VersionStatus


class ModelCreate(BaseModel):
    name: str = Field(min_length=1)
    description: str
    task_type: TaskType
    input_schema: dict
    output_schema: dict


class ModelUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    task_type: TaskType | None = None
    input_schema: dict | None = None
    output_schema: dict | None = None


class ModelOut(BaseModel):
    model_config = ConfigDict(from_attributes=True, protected_namespaces=())

    id: str
    name: str
    description: str
    task_type: TaskType
    input_schema: dict
    output_schema: dict
    # 模型仓库列表卡片用(§2.5):版本数与最新版本状态点。
    version_count: int = 0
    latest_version_status: VersionStatus | None = None
    created_at: datetime
    updated_at: datetime
