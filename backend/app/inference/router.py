"""推理调用路由(a3,§4.3)。同步/异步推理 + 异步任务查询。"""
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_bg_sessionmaker, get_session
from app.inference.schemas import AsyncSubmitOut, AsyncTaskOut, InferIn, InferSyncOut
from app.inference.service import InferenceService

router = APIRouter(tags=["inference"])


@router.post("/endpoints/{endpoint_id}/infer", response_model=InferSyncOut)
async def infer_sync(
    endpoint_id: str,
    payload: InferIn,
    session: AsyncSession = Depends(get_session),
):
    return await InferenceService.infer_sync(session, endpoint_id, payload.input)


@router.post(
    "/endpoints/{endpoint_id}/infer/async", response_model=AsyncSubmitOut, status_code=202
)
async def infer_async(
    endpoint_id: str,
    payload: InferIn,
    session: AsyncSession = Depends(get_session),
    bg=Depends(get_bg_sessionmaker),
):
    return await InferenceService.submit_async(session, bg, endpoint_id, payload.input)


@router.get("/inference/tasks/{task_id}", response_model=AsyncTaskOut)
async def get_task(task_id: str, session: AsyncSession = Depends(get_session)):
    return await InferenceService.get_task(session, task_id)
