"""ORM 表定义。

a1：model / model_version / change_log。
a2：endpoint / endpoint_version_binding（change_log 复用 a1，不改表）。
JSON 列在 PostgreSQL 用 jsonb、在 SQLite 退化为 JSON（见 _json）。
InferenceLog/AsyncTask 留待 a3 实现。
"""
from datetime import datetime, timezone
from uuid import uuid4

from sqlalchemy import JSON, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.domain.enums import EndpointStatus, VersionStatus
from app.domain.state_machine import is_deployable


def _json():
    """jsonb on PostgreSQL, JSON on其它方言。"""
    return JSON().with_variant(JSONB(), "postgresql")


def _uuid() -> str:
    return uuid4().hex


def _utcnow() -> datetime:
    # §8.4：时间统一以 UTC 存储。
    return datetime.now(timezone.utc)


class ModelRow(Base):
    __tablename__ = "model"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uuid)
    name: Mapped[str] = mapped_column(String(255), index=True)
    description: Mapped[str] = mapped_column(Text, default="")
    task_type: Mapped[str] = mapped_column(String(32), index=True)
    input_schema: Mapped[dict] = mapped_column(_json())
    output_schema: Mapped[dict] = mapped_column(_json())
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, onupdate=_utcnow
    )

    versions: Mapped[list["ModelVersionRow"]] = relationship(back_populates="model")


class ModelVersionRow(Base):
    __tablename__ = "model_version"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uuid)
    model_id: Mapped[str] = mapped_column(
        ForeignKey("model.id", ondelete="CASCADE"), index=True
    )
    version: Mapped[str] = mapped_column(String(64))
    file_path: Mapped[str] = mapped_column(String(512))  # 模拟路径
    framework: Mapped[str] = mapped_column(String(32))
    resource_req: Mapped[dict] = mapped_column(_json(), default=dict)
    change_note: Mapped[str] = mapped_column(Text, default="")
    status: Mapped[str] = mapped_column(String(32), default=VersionStatus.draft.value)
    metrics: Mapped[dict | None] = mapped_column(_json(), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)

    model: Mapped["ModelRow"] = relationship(back_populates="versions")

    @property
    def deployable(self) -> bool:
        return is_deployable(VersionStatus(self.status))


class EndpointRow(Base):
    """推理端点（a2，第二个一等实体）。url_path 唯一；状态机独立于版本。"""

    __tablename__ = "endpoint"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uuid)
    name: Mapped[str] = mapped_column(String(255), index=True)
    url_path: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    status: Mapped[str] = mapped_column(String(32), default=EndpointStatus.creating.value)
    replicas: Mapped[int] = mapped_column(Integer, default=1)
    resource_quota: Mapped[dict] = mapped_column(_json(), default=dict)  # {cpu,memory,gpu}
    timeout_ms: Mapped[int] = mapped_column(Integer, default=30000)
    max_concurrency: Mapped[int] = mapped_column(Integer, default=1)
    # 代次令牌(审查 H1):每次进入/重新进入异步操作自增,后台任务回写时校验,
    # 使被取消/被新操作取代的旧代任务的回写被丢弃。
    deploy_generation: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, onupdate=_utcnow
    )

    bindings: Mapped[list["EndpointVersionBindingRow"]] = relationship(
        back_populates="endpoint", cascade="all, delete-orphan"
    )


class EndpointVersionBindingRow(Base):
    """端点 ↔ 版本 A/B 绑定（带权重）。同端点下 weight 之和必须 = 100。"""

    __tablename__ = "endpoint_version_binding"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uuid)
    endpoint_id: Mapped[str] = mapped_column(
        ForeignKey("endpoint.id", ondelete="CASCADE"), index=True
    )
    model_version_id: Mapped[str] = mapped_column(String(32), index=True)
    weight: Mapped[int] = mapped_column(Integer)

    endpoint: Mapped["EndpointRow"] = relationship(back_populates="bindings")


class ChangeLogRow(Base):
    """§8.1 append-only 变更日志缝。供 v1.3 审计直接复用，不重复建表。"""

    __tablename__ = "change_log"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uuid)
    target_type: Mapped[str] = mapped_column(String(64), index=True)
    target_id: Mapped[str] = mapped_column(String(32), index=True)
    op: Mapped[str] = mapped_column(String(64))
    before: Mapped[dict | None] = mapped_column(_json(), nullable=True)
    after: Mapped[dict | None] = mapped_column(_json(), nullable=True)
    # D12：v1.5/E7 建立真实身份前记占位标识，历史不回填。
    actor: Mapped[str] = mapped_column(String(64), default="local-admin")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
