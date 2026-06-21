"""Model 资源服务层。"""
from typing import Any

from sqlalchemy import delete, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.errors import ConflictError, NotFoundError
from app.common.schema_validation import validate_json_schema
from app.db.tables import (
    EndpointRow,
    EndpointVersionBindingRow,
    ModelRow,
    ModelVersionRow,
)
from app.domain.enums import TaskType


def _tt(value: Any) -> str:
    return value.value if isinstance(value, TaskType) else value


class ModelService:
    @staticmethod
    async def _decorate(
        session: AsyncSession, rows: list[ModelRow]
    ) -> list[ModelRow]:
        """为模型附加 version_count 与 latest_version_status(供 §2.5 仓库列表卡片)。

        latest = created_at 最大的版本状态;无版本则 0 / None。
        """
        ids = [r.id for r in rows]
        counts: dict[str, int] = {}
        latest: dict[str, str] = {}
        if ids:
            cnt = await session.execute(
                select(ModelVersionRow.model_id, func.count())
                .where(ModelVersionRow.model_id.in_(ids))
                .group_by(ModelVersionRow.model_id)
            )
            counts = {mid: n for mid, n in cnt.all()}
            vrows = (
                await session.execute(
                    select(ModelVersionRow)
                    .where(ModelVersionRow.model_id.in_(ids))
                    .order_by(ModelVersionRow.created_at)
                )
            ).scalars().all()
            for v in vrows:  # created_at 升序遍历,最后写入者即最新版本
                latest[v.model_id] = v.status
        for r in rows:
            r.version_count = counts.get(r.id, 0)
            r.latest_version_status = latest.get(r.id)
        return rows

    @staticmethod
    async def create(
        session: AsyncSession,
        *,
        name: str,
        description: str,
        task_type: TaskType | str,
        input_schema: dict,
        output_schema: dict,
        custom_task_type: str | None = None,
    ) -> ModelRow:
        validate_json_schema(input_schema)
        validate_json_schema(output_schema)
        row = ModelRow(
            name=name,
            description=description,
            task_type=_tt(task_type),
            custom_task_type=custom_task_type,
            input_schema=input_schema,
            output_schema=output_schema,
        )
        session.add(row)
        await session.flush()
        return (await ModelService._decorate(session, [row]))[0]

    @staticmethod
    async def get(session: AsyncSession, model_id: str) -> ModelRow:
        row = await session.get(ModelRow, model_id)
        if row is None:
            raise NotFoundError("模型")
        return (await ModelService._decorate(session, [row]))[0]

    @staticmethod
    async def list(
        session: AsyncSession,
        *,
        task_type: TaskType | str | None = None,
        q: str | None = None,
    ) -> list[ModelRow]:
        stmt = select(ModelRow).order_by(ModelRow.created_at)
        if task_type is not None:
            stmt = stmt.where(ModelRow.task_type == _tt(task_type))
        if q:
            like = f"%{q}%"
            # 搜索覆盖名称/描述/自定义类型名(卡片上展示了 custom_task_type,理应可搜)。
            stmt = stmt.where(
                or_(
                    ModelRow.name.ilike(like),
                    ModelRow.description.ilike(like),
                    ModelRow.custom_task_type.ilike(like),
                )
            )
        rows = list((await session.execute(stmt)).scalars().all())
        return await ModelService._decorate(session, rows)

    @staticmethod
    async def update(
        session: AsyncSession, model_id: str, *, fields: dict[str, Any]
    ) -> ModelRow:
        row = await ModelService.get(session, model_id)
        if fields.get("input_schema") is not None:
            validate_json_schema(fields["input_schema"])
        if fields.get("output_schema") is not None:
            validate_json_schema(fields["output_schema"])
        for key, value in fields.items():
            if value is None:
                continue
            if key == "task_type":
                value = _tt(value)
            setattr(row, key, value)
        # 自定义类型名一致性:非 custom 不留残名。
        if row.task_type != TaskType.custom.value:
            row.custom_task_type = None
        await session.flush()
        return (await ModelService._decorate(session, [row]))[0]

    @staticmethod
    async def delete(session: AsyncSession, model_id: str) -> None:
        row = await ModelService.get(session, model_id)
        # 守卫:若有任一端点绑定了该模型的任一版本,拒绝删除(避免孤儿化端点绑定)。
        # 与端点状态无关——停止中的端点仍可被重启,其绑定同样不可指向已删版本。
        # 带上冲突端点名,让用户知道是「谁」在绑(省去去管控台逐个翻)。
        names = (
            await session.execute(
                select(EndpointRow.name)
                .join(
                    EndpointVersionBindingRow,
                    EndpointVersionBindingRow.endpoint_id == EndpointRow.id,
                )
                .join(
                    ModelVersionRow,
                    ModelVersionRow.id == EndpointVersionBindingRow.model_version_id,
                )
                .where(ModelVersionRow.model_id == model_id)
                .distinct()
            )
        ).scalars().all()
        if names:
            joined = "、".join(f"「{n}」" for n in names)
            raise ConflictError(
                f"模型被端点{joined}绑定，无法删除；请先将这些端点改绑到其它模型的版本"
            )
        # 先删版本，再删模型；change_log 是 append-only 历史，保留不删。
        await session.execute(
            delete(ModelVersionRow).where(ModelVersionRow.model_id == model_id)
        )
        await session.delete(row)
        await session.flush()
