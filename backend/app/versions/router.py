"""ModelVersion 资源路由（模型作用域 + 版本作用域）。"""
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_session
from app.versions.schemas import MetricsIn, VersionCreate, VersionOut, VersionTransition
from app.versions.service import VersionService

router = APIRouter(tags=["versions"])


@router.post("/models/{model_id}/versions", response_model=VersionOut, status_code=201)
async def create_version(
    model_id: str, payload: VersionCreate, session: AsyncSession = Depends(get_session)
):
    return await VersionService.create(
        session,
        model_id=model_id,
        version=payload.version,
        file_path=payload.file_path,
        framework=payload.framework,
        resource_req=payload.resource_req,
        change_note=payload.change_note,
        metrics=payload.metrics.model_dump() if payload.metrics else None,
    )


@router.get("/models/{model_id}/versions", response_model=list[VersionOut])
async def list_versions(model_id: str, session: AsyncSession = Depends(get_session)):
    return await VersionService.list_by_model(session, model_id)


@router.get("/models/{model_id}/versions/compare")
async def compare_versions(model_id: str, session: AsyncSession = Depends(get_session)):
    return await VersionService.compare(session, model_id)


@router.get("/versions/{version_id}", response_model=VersionOut)
async def get_version(version_id: str, session: AsyncSession = Depends(get_session)):
    return await VersionService.get(session, version_id)


@router.post("/versions/{version_id}/transition", response_model=VersionOut)
async def transition_version(
    version_id: str,
    payload: VersionTransition,
    session: AsyncSession = Depends(get_session),
):
    return await VersionService.transition(
        session, version_id=version_id, target=payload.target
    )


@router.put("/versions/{version_id}/metrics", response_model=VersionOut)
async def set_metrics(
    version_id: str, payload: MetricsIn, session: AsyncSession = Depends(get_session)
):
    return await VersionService.set_metrics(
        session, version_id=version_id, metrics=payload.model_dump()
    )


@router.delete("/versions/{version_id}", status_code=204)
async def delete_version(version_id: str, session: AsyncSession = Depends(get_session)):
    await VersionService.delete(session, version_id)
