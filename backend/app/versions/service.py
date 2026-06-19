"""ModelVersion 资源服务层（含版本状态机 + §8.1 变更日志写入）。"""
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.common import change_log
from app.common.errors import NotFoundError
from app.db.tables import ModelVersionRow
from app.domain.enums import Framework, VersionStatus
from app.domain.state_machine import assert_transition
from app.models.service import ModelService


def _fw(value: Any) -> str:
    return value.value if isinstance(value, Framework) else value


class VersionService:
    @staticmethod
    async def create(
        session: AsyncSession,
        *,
        model_id: str,
        version: str,
        file_path: str,
        framework: Framework | str,
        resource_req: dict | None,
        change_note: str = "",
    ) -> ModelVersionRow:
        await ModelService.get(session, model_id)  # 模型不存在 → 404
        row = ModelVersionRow(
            model_id=model_id,
            version=version,
            file_path=file_path,
            framework=_fw(framework),
            resource_req=resource_req or {},
            change_note=change_note,
            status=VersionStatus.draft.value,
        )
        session.add(row)
        await session.flush()
        await change_log.append(
            session,
            target_type="model_version",
            target_id=row.id,
            op="version.create",
            before=None,
            after={"status": row.status},
        )
        return row

    @staticmethod
    async def get(session: AsyncSession, version_id: str) -> ModelVersionRow:
        row = await session.get(ModelVersionRow, version_id)
        if row is None:
            raise NotFoundError("版本")
        return row

    @staticmethod
    async def list_by_model(
        session: AsyncSession, model_id: str
    ) -> list[ModelVersionRow]:
        await ModelService.get(session, model_id)
        stmt = (
            select(ModelVersionRow)
            .where(ModelVersionRow.model_id == model_id)
            .order_by(ModelVersionRow.created_at)
        )
        return list((await session.execute(stmt)).scalars().all())

    @staticmethod
    async def transition(
        session: AsyncSession, *, version_id: str, target: VersionStatus | str
    ) -> ModelVersionRow:
        row = await VersionService.get(session, version_id)
        current = VersionStatus(row.status)
        tgt = target if isinstance(target, VersionStatus) else VersionStatus(target)
        assert_transition(current, tgt)  # 非法 → InvalidTransitionError(409)
        row.status = tgt.value
        await session.flush()
        await change_log.append(
            session,
            target_type="model_version",
            target_id=row.id,
            op="version.transition",
            before={"status": current.value},
            after={"status": tgt.value},
        )
        return row

    @staticmethod
    async def set_metrics(
        session: AsyncSession, *, version_id: str, metrics: dict
    ) -> ModelVersionRow:
        row = await VersionService.get(session, version_id)
        row.metrics = metrics
        await session.flush()
        return row

    @staticmethod
    async def compare(session: AsyncSession, model_id: str) -> list[dict]:
        versions = await VersionService.list_by_model(session, model_id)
        return [
            {"version": v.version, "version_id": v.id, "metrics": v.metrics}
            for v in versions
        ]
