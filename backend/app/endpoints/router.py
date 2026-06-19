"""Endpoint 资源路由(a2)。无 DELETE —— 端点下线走停止。"""
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_bg_sessionmaker, get_session
from app.endpoints.schemas import EndpointCreate, EndpointOut, EndpointUpdate, QuotaOut
from app.endpoints.service import EndpointService

router = APIRouter(tags=["endpoints"])


@router.post("/endpoints", response_model=EndpointOut, status_code=201)
async def create_endpoint(
    payload: EndpointCreate,
    session: AsyncSession = Depends(get_session),
    bg=Depends(get_bg_sessionmaker),
):
    return await EndpointService.create(session, bg, payload=payload)


@router.get("/endpoints", response_model=list[EndpointOut])
async def list_endpoints(session: AsyncSession = Depends(get_session)):
    return await EndpointService.list_all(session)


@router.get("/quota", response_model=QuotaOut)
async def get_quota(session: AsyncSession = Depends(get_session)):
    return await EndpointService.quota(session)


@router.get("/endpoints/{endpoint_id}", response_model=EndpointOut)
async def get_endpoint(endpoint_id: str, session: AsyncSession = Depends(get_session)):
    return await EndpointService.get(session, endpoint_id)


@router.patch("/endpoints/{endpoint_id}", response_model=EndpointOut)
async def update_endpoint(
    endpoint_id: str,
    payload: EndpointUpdate,
    session: AsyncSession = Depends(get_session),
    bg=Depends(get_bg_sessionmaker),
):
    return await EndpointService.update(session, bg, endpoint_id, payload)


@router.post("/endpoints/{endpoint_id}/start", response_model=EndpointOut)
async def start_endpoint(
    endpoint_id: str,
    session: AsyncSession = Depends(get_session),
    bg=Depends(get_bg_sessionmaker),
):
    return await EndpointService.start(session, bg, endpoint_id)


@router.post("/endpoints/{endpoint_id}/stop", response_model=EndpointOut)
async def stop_endpoint(
    endpoint_id: str,
    session: AsyncSession = Depends(get_session),
    bg=Depends(get_bg_sessionmaker),
):
    return await EndpointService.stop(session, bg, endpoint_id)


@router.post("/endpoints/{endpoint_id}/restart", response_model=EndpointOut)
async def restart_endpoint(
    endpoint_id: str,
    session: AsyncSession = Depends(get_session),
    bg=Depends(get_bg_sessionmaker),
):
    return await EndpointService.restart(session, bg, endpoint_id)
