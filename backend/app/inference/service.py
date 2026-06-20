"""推理调用服务(a3,§4.3 / 原 2.3)。

次序(修正审查 P1):解析端点(running)→ 取 Model input_schema 校验输入 →
(同步)限流准入 /(异步)入队 → 执行内核(选 ready 版本 → sleep → 生成输出 → 写日志)。
- 校验失败 422:不占额度、不落日志(异步在 submit 即返 422、不建任务)。
- 429 / 超时 / 错误:均落对应状态日志(429、超时在选版本前/未完成,version_id 可空)。
"""
import asyncio
import json
import logging
from datetime import datetime, timezone

from jsonschema import Draft202012Validator
from jsonschema.exceptions import SchemaError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.errors import ConflictError, NotFoundError
from app.db.tables import (
    AsyncInferenceTaskRow,
    EndpointRow,
    EndpointVersionBindingRow,
    InferenceLogRow,
    ModelRow,
    ModelVersionRow,
)
from app.domain.enums import EndpointStatus, VersionStatus
from app.inference import concurrency, executor, runner
from app.inference.errors import (
    InferenceInputInvalidError,
    InferenceTimeoutError,
    RateLimitedError,
)

logger = logging.getLogger("graymist.inference")

_MAX_SUMMARY = 1000  # 输入/输出摘要截断上限(字符)

# 推理日志状态(对应原 2.3:成功/超时/错误/429)
ST_SUCCESS = "success"
ST_TIMEOUT = "timeout"
ST_ERROR = "error"
ST_RATE_LIMITED = "rate_limited"

# 异步任务状态机:queued → running → succeeded/failed
T_QUEUED = "queued"
T_RUNNING = "running"
T_SUCCEEDED = "succeeded"
T_FAILED = "failed"


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _summary(value) -> str:
    try:
        s = json.dumps(value, ensure_ascii=False, default=str)
    except Exception:
        s = str(value)
    return s[:_MAX_SUMMARY]


class InferenceService:
    # ---- 共享辅助 ----

    @staticmethod
    async def _running_endpoint(session: AsyncSession, endpoint_id: str) -> EndpointRow:
        ep = await session.get(EndpointRow, endpoint_id)
        if ep is None:
            raise NotFoundError("端点")
        if EndpointStatus(ep.status) != EndpointStatus.running:
            raise ConflictError("端点未运行,无法推理")
        return ep

    @staticmethod
    async def _model(session: AsyncSession, endpoint_id: str) -> ModelRow:
        """端点所属 Model(a2 保证同端点同 Model,任取一条 binding 回溯)。"""
        b = (
            await session.execute(
                select(EndpointVersionBindingRow).where(
                    EndpointVersionBindingRow.endpoint_id == endpoint_id
                )
            )
        ).scalars().first()
        if b is None:
            raise ConflictError("端点无版本绑定")
        v = await session.get(ModelVersionRow, b.model_version_id)
        m = await session.get(ModelRow, v.model_id) if v is not None else None
        if m is None:
            raise ConflictError("端点绑定的模型不存在")
        return m

    @staticmethod
    def _validate_input(input_schema, payload) -> None:
        try:
            errors = sorted(
                Draft202012Validator(input_schema).iter_errors(payload),
                key=lambda e: list(e.path),
            )
        except SchemaError:
            return  # input_schema 建模时已校验合法;极端兜底不阻断推理
        if errors:
            raise InferenceInputInvalidError(errors[0].message)

    @staticmethod
    async def _ready_bindings(session: AsyncSession, endpoint_id: str) -> list[dict]:
        rows = (
            await session.execute(
                select(EndpointVersionBindingRow).where(
                    EndpointVersionBindingRow.endpoint_id == endpoint_id
                )
            )
        ).scalars().all()
        ready: list[dict] = []
        for b in rows:
            v = await session.get(ModelVersionRow, b.model_version_id)
            if v is not None and VersionStatus(v.status) == VersionStatus.ready:
                ready.append({"model_version_id": b.model_version_id, "weight": b.weight})
        return ready

    @staticmethod
    async def _log(
        session: AsyncSession, *, endpoint_id, version_id, mode, input_data, output, latency_ms, status
    ) -> None:
        session.add(
            InferenceLogRow(
                endpoint_id=endpoint_id,
                version_id=version_id,
                mode=mode,
                input_summary=_summary(input_data),
                output_summary=_summary(output),
                latency_ms=latency_ms,
                status=status,
            )
        )
        await session.flush()

    # ---- 核心执行(不含校验/限流;同步与异步复用) ----

    @staticmethod
    async def _run_core(session: AsyncSession, *, endpoint_id, mode, input_data) -> dict:
        ep = await session.get(EndpointRow, endpoint_id)
        ready = await InferenceService._ready_bindings(session, endpoint_id)
        if not ready:  # 全部绑定均已非 ready → 端点不可推理
            await InferenceService._log(
                session, endpoint_id=endpoint_id, version_id=None, mode=mode,
                input_data=input_data, output=None, latency_ms=0, status=ST_ERROR,
            )
            await session.commit()
            raise ConflictError("端点无可用(ready)版本")

        version_id = None
        try:
            chosen = executor.select_binding(ready)
            version_id = chosen["model_version_id"]
            version_row = await session.get(ModelVersionRow, version_id)
            model = await session.get(ModelRow, version_row.model_id)
            delay = executor.simulate_latency_seconds()
            await asyncio.sleep(delay)
            latency_ms = round(delay * 1000)
            if latency_ms > ep.timeout_ms:
                await InferenceService._log(
                    session, endpoint_id=endpoint_id, version_id=version_id, mode=mode,
                    input_data=input_data, output=None, latency_ms=latency_ms, status=ST_TIMEOUT,
                )
                await session.commit()
                raise InferenceTimeoutError("推理超时")
            output = executor.generate_output(model.output_schema)
        except (InferenceTimeoutError, ConflictError):
            raise
        except Exception:  # 未预期的执行错误 → 落 error 日志后上抛
            await session.rollback()
            await InferenceService._log(
                session, endpoint_id=endpoint_id, version_id=version_id, mode=mode,
                input_data=input_data, output=None, latency_ms=0, status=ST_ERROR,
            )
            await session.commit()
            raise

        await InferenceService._log(
            session, endpoint_id=endpoint_id, version_id=version_id, mode=mode,
            input_data=input_data, output=output, latency_ms=latency_ms, status=ST_SUCCESS,
        )
        await session.commit()
        return {"result": output, "version_id": version_id, "latency_ms": latency_ms}

    # ---- 同步推理 ----

    @staticmethod
    async def infer_sync(session: AsyncSession, endpoint_id: str, input_data) -> dict:
        ep = await InferenceService._running_endpoint(session, endpoint_id)  # 404 / 409
        model = await InferenceService._model(session, endpoint_id)
        InferenceService._validate_input(model.input_schema, input_data)  # 422 前置:不占额度/不落日志
        ctrl = concurrency.get_controller(ep.id, ep.max_concurrency)
        if not ctrl.try_acquire():
            await InferenceService._log(
                session, endpoint_id=ep.id, version_id=None, mode="sync",
                input_data=input_data, output=None, latency_ms=0, status=ST_RATE_LIMITED,
            )
            await session.commit()
            raise RateLimitedError("端点并发已满")
        try:
            return await InferenceService._run_core(
                session, endpoint_id=ep.id, mode="sync", input_data=input_data
            )
        finally:
            ctrl.release()  # 成功/异常/超时各出口均释放

    # ---- 异步推理 ----

    @staticmethod
    async def submit_async(session: AsyncSession, bg_sessionmaker, endpoint_id: str, input_data) -> dict:
        ep = await InferenceService._running_endpoint(session, endpoint_id)  # 404 / 409
        model = await InferenceService._model(session, endpoint_id)
        InferenceService._validate_input(model.input_schema, input_data)  # 422 前置:不建任务/不入队
        task = AsyncInferenceTaskRow(endpoint_id=ep.id, status=T_QUEUED, input=input_data)
        session.add(task)
        await session.flush()
        task_id = task.id
        await session.commit()  # 先持久化 queued 任务,后台独立会话方能读到(对齐 a2 _schedule)
        runner.schedule(
            InferenceService._run_async_task(bg_sessionmaker, task_id, ep.id, input_data)
        )
        return {"task_id": task_id, "status": T_QUEUED}

    @staticmethod
    async def _run_async_task(sessionmaker, task_id, endpoint_id, input_data) -> None:
        async with sessionmaker() as s0:  # 取容量(以 DB 为准)
            ep0 = await s0.get(EndpointRow, endpoint_id)
            capacity = ep0.max_concurrency if ep0 is not None else 1
        ctrl = concurrency.get_controller(endpoint_id, capacity)
        await ctrl.acquire()  # 阻塞排队(不 429)
        try:
            async with sessionmaker() as session:
                task = await session.get(AsyncInferenceTaskRow, task_id)
                if task is None:
                    return
                task.status = T_RUNNING
                await session.commit()
                try:
                    res = await InferenceService._run_core(
                        session, endpoint_id=endpoint_id, mode="async", input_data=input_data
                    )
                except Exception:  # 超时/错误/无 ready 版本 → 任务 failed(_run_core 已落日志)
                    logger.exception("async inference failed: %s", task_id)
                    t = await session.get(AsyncInferenceTaskRow, task_id)
                    if t is not None:
                        t.status = T_FAILED
                        t.finished_at = _utcnow()
                        await session.commit()
                    return
                t = await session.get(AsyncInferenceTaskRow, task_id)
                t.status = T_SUCCEEDED
                t.result = res["result"]
                t.finished_at = _utcnow()
                await session.commit()
        finally:
            ctrl.release()

    @staticmethod
    async def get_task(session: AsyncSession, task_id: str) -> dict:
        row = await session.get(AsyncInferenceTaskRow, task_id)
        if row is None:
            raise NotFoundError("异步推理任务")
        return {
            "id": row.id,
            "endpoint_id": row.endpoint_id,
            "status": row.status,
            "result": row.result,
            "created_at": row.created_at,
            "finished_at": row.finished_at,
        }
