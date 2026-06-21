"""Model 资源的 Pydantic 请求/响应模型。"""
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.domain.enums import TaskType, VersionStatus


class ModelCreate(BaseModel):
    name: str = Field(min_length=1)
    description: str
    task_type: TaskType
    custom_task_type: str | None = None
    input_schema: dict
    output_schema: dict

    @model_validator(mode="after")
    def _normalize_custom_task_type(self):
        # custom 必须命名;非 custom 不留残名(规范为 None)。
        if self.task_type == TaskType.custom:
            if not (self.custom_task_type and self.custom_task_type.strip()):
                raise ValueError("task_type 为 custom 时必须提供 custom_task_type")
            self.custom_task_type = self.custom_task_type.strip()
        else:
            self.custom_task_type = None
        return self


class ModelUpdate(BaseModel):
    # 与 ModelCreate 对齐:更新 name 同样不可为空(否则直连 API 可清空名称)。
    name: str | None = Field(default=None, min_length=1)
    description: str | None = None
    task_type: TaskType | None = None
    custom_task_type: str | None = None
    input_schema: dict | None = None
    output_schema: dict | None = None


class ModelOut(BaseModel):
    model_config = ConfigDict(from_attributes=True, protected_namespaces=())

    id: str
    name: str
    description: str
    task_type: TaskType
    custom_task_type: str | None = None
    input_schema: dict
    output_schema: dict
    # 模型仓库列表卡片用(§2.5):版本数与最新版本状态点。
    version_count: int = 0
    latest_version_status: VersionStatus | None = None
    created_at: datetime
    updated_at: datetime
