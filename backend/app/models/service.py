"""Model 资源服务层。"""
from typing import Any

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.errors import NotFoundError
from app.common.schema_validation import validate_json_schema
from app.db.tables import ModelRow, ModelVersionRow
from app.domain.enums import TaskType


def _tt(value: Any) -> str:
    return value.value if isinstance(value, TaskType) else value


class ModelService:
    @staticmethod
    async def create(
        session: AsyncSession,
        *,
        name: str,
        description: str,
        task_type: TaskType | str,
        input_schema: dict,
        output_schema: dict,
    ) -> ModelRow:
        validate_json_schema(input_schema)
        validate_json_schema(output_schema)
        row = ModelRow(
            name=name,
            description=description,
            task_type=_tt(task_type),
            input_schema=input_schema,
            output_schema=output_schema,
        )
        session.add(row)
        await session.flush()
        return row

    @staticmethod
    async def get(session: AsyncSession, model_id: str) -> ModelRow:
        row = await session.get(ModelRow, model_id)
        if row is None:
            raise NotFoundError("模型")
        return row

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
            stmt = stmt.where(ModelRow.name.ilike(f"%{q}%"))
        return list((await session.execute(stmt)).scalars().all())

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
        await session.flush()
        return row

    @staticmethod
    async def delete(session: AsyncSession, model_id: str) -> None:
        row = await ModelService.get(session, model_id)
        # 先删版本，再删模型；change_log 是 append-only 历史，保留不删。
        await session.execute(
            delete(ModelVersionRow).where(ModelVersionRow.model_id == model_id)
        )
        await session.delete(row)
        await session.flush()
