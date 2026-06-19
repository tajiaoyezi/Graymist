"""ORM 表定义（v1.0：model / model_version / change_log 三张表）。

JSON 列在 PostgreSQL 用 jsonb、在 SQLite 退化为 JSON（见 _json）。
本 change 不建 Endpoint/Binding/InferenceLog/AsyncTask/PlatformQuota 表 —— 其领域
关系已在 design 锁定，留待 change 2–4（a2/a3/a4）实现（tasks 2.4）。
"""
from datetime import datetime, timezone
from uuid import uuid4

from sqlalchemy import JSON, DateTime, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.domain.enums import VersionStatus
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
