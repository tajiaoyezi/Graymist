"""监控查询路由(a4,§4.4)。资源总览复用既有 GET /quota,故此处只出聚合指标。"""
from typing import Literal

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_session
from app.monitoring.schemas import InferenceLogOut, MetricsOut
from app.monitoring.service import MonitoringService

router = APIRouter(tags=["monitoring"])


@router.get("/monitoring/metrics", response_model=MetricsOut)
async def get_metrics(
    endpoint_id: str = Query(...),
    range: Literal["1h", "24h", "7d"] = Query("24h"),  # 非法值由 FastAPI 返 422
    session: AsyncSession = Depends(get_session),
):
    return await MonitoringService.metrics(session, endpoint_id, range)


@router.get("/monitoring/logs", response_model=list[InferenceLogOut])
async def list_logs(
    endpoint_id: str = Query(...),
    status: str | None = Query(None),  # success/timeout/error/rate_limited;空=全部
    limit: int = Query(50, ge=1, le=200),
    session: AsyncSession = Depends(get_session),
):
    return await MonitoringService.list_logs(session, endpoint_id, status=status, limit=limit)
