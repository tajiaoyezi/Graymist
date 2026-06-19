"""Model 资源路由。"""
from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_session
from app.domain.enums import TaskType
from app.models.schemas import ModelCreate, ModelOut, ModelUpdate
from app.models.service import ModelService

router = APIRouter(prefix="/models", tags=["models"])


@router.post("", response_model=ModelOut, status_code=201)
async def create_model(payload: ModelCreate, session: AsyncSession = Depends(get_session)):
    return await ModelService.create(
        session,
        name=payload.name,
        description=payload.description,
        task_type=payload.task_type,
        input_schema=payload.input_schema,
        output_schema=payload.output_schema,
    )


@router.get("", response_model=list[ModelOut])
async def list_models(
    task_type: TaskType | None = Query(None),
    q: str | None = Query(None),
    session: AsyncSession = Depends(get_session),
):
    return await ModelService.list(session, task_type=task_type, q=q)


@router.get("/{model_id}", response_model=ModelOut)
async def get_model(model_id: str, session: AsyncSession = Depends(get_session)):
    return await ModelService.get(session, model_id)


@router.patch("/{model_id}", response_model=ModelOut)
async def update_model(
    model_id: str, payload: ModelUpdate, session: AsyncSession = Depends(get_session)
):
    return await ModelService.update(
        session, model_id, fields=payload.model_dump(exclude_unset=True)
    )


@router.delete("/{model_id}", status_code=204)
async def delete_model(model_id: str, session: AsyncSession = Depends(get_session)):
    await ModelService.delete(session, model_id)
