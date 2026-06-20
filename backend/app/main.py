"""FastAPI 应用工厂。

异常映射：NotFoundError→404、InvalidSchemaError→422、InvalidTransitionError→409。
引擎惰性创建，故 create_app() 在导入期不连接数据库。
"""
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from sqlalchemy.exc import IntegrityError

from app.common.errors import BindingError, ConflictError, NotFoundError
from app.common.health import redis_ping
from app.common.quota import QuotaExceededError
from app.common.schema_validation import InvalidSchemaError
from app.config import settings
from app.domain.state_machine import InvalidTransitionError
from app.endpoints.router import router as endpoints_router
from app.inference.errors import (
    InferenceInputInvalidError,
    InferenceTimeoutError,
    RateLimitedError,
)
from app.inference.router import router as inference_router
from app.models.router import router as models_router
from app.monitoring.router import router as monitoring_router
from app.versions.router import router as versions_router


@asynccontextmanager
async def _lifespan(_app: "FastAPI"):
    # 仅当 auto_create_tables（本地/E2E）时建表；生产走 Alembic。
    if settings.auto_create_tables:
        from app.db import tables  # noqa: F401  注册 ORM
        from app.db.base import Base
        from app.db.session import get_engine

        async with get_engine().begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
    yield


def create_app() -> FastAPI:
    app = FastAPI(
        title="Graymist 模型注册与版本管理", version="0.1.0", lifespan=_lifespan
    )

    @app.middleware("http")
    async def _limit_body_size(request: Request, call_next):
        # 审查 M2：超大请求体早拦，避免进入解析/校验拖垮 worker。
        cl = request.headers.get("content-length")
        if cl is not None and cl.isdigit() and int(cl) > settings.max_request_bytes:
            return JSONResponse(status_code=413, content={"detail": "请求体过大"})
        return await call_next(request)

    @app.exception_handler(RecursionError)
    async def _too_nested(request: Request, exc: RecursionError):
        return JSONResponse(status_code=400, content={"detail": "请求结构过于嵌套"})

    @app.exception_handler(NotFoundError)
    async def _not_found(request: Request, exc: NotFoundError):
        return JSONResponse(status_code=404, content={"detail": str(exc)})

    @app.exception_handler(InvalidSchemaError)
    async def _bad_schema(request: Request, exc: InvalidSchemaError):
        return JSONResponse(status_code=422, content={"detail": str(exc)})

    @app.exception_handler(InvalidTransitionError)
    async def _bad_transition(request: Request, exc: InvalidTransitionError):
        return JSONResponse(status_code=409, content={"detail": str(exc)})

    @app.exception_handler(ConflictError)
    async def _conflict(request: Request, exc: ConflictError):
        return JSONResponse(status_code=409, content={"detail": str(exc)})

    @app.exception_handler(QuotaExceededError)
    async def _quota_exceeded(request: Request, exc: QuotaExceededError):
        return JSONResponse(status_code=409, content={"detail": str(exc)})

    @app.exception_handler(BindingError)
    async def _bad_binding(request: Request, exc: BindingError):
        return JSONResponse(status_code=422, content={"detail": str(exc)})

    @app.exception_handler(RateLimitedError)
    async def _rate_limited(request: Request, exc: RateLimitedError):
        return JSONResponse(status_code=429, content={"detail": str(exc)})

    @app.exception_handler(InferenceTimeoutError)
    async def _infer_timeout(request: Request, exc: InferenceTimeoutError):
        return JSONResponse(status_code=504, content={"detail": str(exc)})

    @app.exception_handler(InferenceInputInvalidError)
    async def _infer_input_invalid(request: Request, exc: InferenceInputInvalidError):
        return JSONResponse(status_code=422, content={"detail": str(exc)})

    @app.exception_handler(IntegrityError)
    async def _integrity(request: Request, exc: IntegrityError):
        # 审查 L1:SELECT-查重→INSERT 的并发竞态下唯一约束冲突的兜底,统一 409。
        return JSONResponse(status_code=409, content={"detail": "资源冲突(唯一约束)"})

    @app.get("/health", tags=["health"])
    async def health():
        return {"status": "ok", "redis": await redis_ping(settings.redis_url)}

    app.include_router(models_router)
    app.include_router(versions_router)
    app.include_router(endpoints_router)
    app.include_router(inference_router)
    app.include_router(monitoring_router)
    return app


app = create_app()
