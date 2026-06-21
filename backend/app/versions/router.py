"""ModelVersion 资源路由（模型作用域 + 版本作用域）。"""
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_session
from app.versions.schemas import (
    CredentialIn,
    MetricsIn,
    VersionCreate,
    VersionOut,
    VersionTransition,
)
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
        source=payload.source,
        file_path=payload.file_path,
        framework=payload.framework,
        resource_req=payload.resource_req,
        provider=payload.provider,
        base_url=payload.base_url,
        upstream_model=payload.upstream_model,
        protocol=payload.protocol,
        auth_ref=payload.auth_ref,
        change_note=payload.change_note,
        metrics=payload.metrics.model_dump() if payload.metrics else None,
        api_key=payload.api_key,
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


@router.put("/versions/{version_id}/credential", response_model=VersionOut)
async def set_credential(
    version_id: str, payload: CredentialIn, session: AsyncSession = Depends(get_session)
):
    # a7：设置/轮换/清除上游 API Key(明文只写入,响应仅 has_api_key、不回显)。
    return await VersionService.set_credential(
        session, version_id=version_id, api_key=payload.api_key
    )


@router.delete("/versions/{version_id}", status_code=204)
async def delete_version(version_id: str, session: AsyncSession = Depends(get_session)):
    await VersionService.delete(session, version_id)
