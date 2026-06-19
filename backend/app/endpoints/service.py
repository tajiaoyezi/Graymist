"""Endpoint 资源服务层(a2)。

承载三大难点:异步部署反馈、A/B 权重原子一致性、平台资源配额累计校验。
端点状态机独立于版本状态机;每次流转/权重变更写 a1 §8.1 change_log。
"""
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.common import change_log
from app.common.errors import BindingError, ConflictError, NotFoundError
from app.common.quota import DIMENSIONS, check_within_quota, endpoint_usage, remaining, sum_usage
from app.config import settings
from app.db.tables import EndpointRow, EndpointVersionBindingRow, ModelVersionRow
from app.domain.endpoint_state_machine import assert_endpoint_transition
from app.domain.enums import EndpointStatus, VersionStatus
from app.endpoints import deploy

_ACTIVE = (EndpointStatus.creating.value, EndpointStatus.running.value)


def _total() -> dict:
    return {"cpu": settings.total_cpu, "memory": settings.total_memory, "gpu": settings.total_gpu}


class EndpointService:
    # ---- 读取 / 序列化 ----

    @staticmethod
    async def _get_row(session: AsyncSession, endpoint_id: str) -> EndpointRow:
        row = await session.get(EndpointRow, endpoint_id)
        if row is None:
            raise NotFoundError("端点")
        return row

    @staticmethod
    async def _serialize(session: AsyncSession, ep: EndpointRow) -> dict:
        # 显式查询绑定,避免 async 关系懒加载(MissingGreenlet)。
        rows = (
            await session.execute(
                select(EndpointVersionBindingRow).where(
                    EndpointVersionBindingRow.endpoint_id == ep.id
                )
            )
        ).scalars().all()
        return {
            "id": ep.id,
            "name": ep.name,
            "url_path": ep.url_path,
            "status": ep.status,
            "replicas": ep.replicas,
            "resource_quota": ep.resource_quota,
            "timeout_ms": ep.timeout_ms,
            "max_concurrency": ep.max_concurrency,
            "created_at": ep.created_at,
            "bindings": [
                {"model_version_id": b.model_version_id, "weight": b.weight} for b in rows
            ],
        }

    @staticmethod
    async def get(session: AsyncSession, endpoint_id: str) -> dict:
        return await EndpointService._serialize(session, await EndpointService._get_row(session, endpoint_id))

    @staticmethod
    async def list_all(session: AsyncSession) -> list[dict]:
        rows = (
            await session.execute(select(EndpointRow).order_by(EndpointRow.created_at))
        ).scalars().all()
        return [await EndpointService._serialize(session, r) for r in rows]

    # ---- 配额 ----

    @staticmethod
    async def _active_usages(session: AsyncSession, exclude_id: str | None = None) -> list[dict]:
        rows = (
            await session.execute(select(EndpointRow).where(EndpointRow.status.in_(_ACTIVE)))
        ).scalars().all()
        return [
            endpoint_usage(r.replicas, r.resource_quota) for r in rows if r.id != exclude_id
        ]

    @staticmethod
    async def quota(session: AsyncSession) -> dict:
        in_use = await EndpointService._active_usages(session)
        used = sum_usage(in_use)
        total = _total()
        return {"total": total, "used": used, "remaining": remaining(total, in_use)}

    # ---- 绑定校验(同一事务内) ----

    @staticmethod
    async def _validate_bindings(session: AsyncSession, bindings: list) -> None:
        if not bindings:
            raise BindingError("至少需要一条版本绑定")
        ids = [b.model_version_id for b in bindings]
        if len(set(ids)) != len(ids):
            raise BindingError("同一版本不可在一个端点重复绑定")  # 审查 H2
        for b in bindings:
            if not (1 <= b.weight <= 100):
                raise BindingError("单条权重需为 1..100 的整数")
        if sum(b.weight for b in bindings) != 100:
            raise BindingError("权重之和必须为 100")
        model_ids: set[str] = set()
        for b in bindings:
            v = await session.get(ModelVersionRow, b.model_version_id)
            if v is None:
                raise BindingError(f"版本不存在: {b.model_version_id}")
            if VersionStatus(v.status) != VersionStatus.ready:
                raise BindingError("仅 ready 版本可部署")
            model_ids.add(v.model_id)
        if len(model_ids) > 1:
            raise BindingError("同一端点仅可绑定同一模型的版本")

    # ---- 内部:同步流转 + 日志 ----

    @staticmethod
    async def _schedule(session, bg_sessionmaker, *, ep, expected_from, target, op) -> None:
        # 自增代次令牌(H1):每次调度都取新令牌,旧代任务回写时令牌不符即被丢弃。
        ep.deploy_generation = (ep.deploy_generation or 0) + 1
        token = ep.deploy_generation
        await session.flush()
        # 先提交过渡态(含新代次),后台独立会话方能读到 —— 否则 delay=0 下后台可能
        # 早于请求提交而读不到该行(对抗式审查 TOCTOU 的真实触发,见 design D2/D4)。
        await session.commit()
        deploy.schedule(
            bg_sessionmaker,
            endpoint_id=ep.id,
            expected_from=expected_from,
            target=target,
            op=op,
            token=token,
        )

    @staticmethod
    async def _transition_sync(session, ep: EndpointRow, target: EndpointStatus, *, op: str) -> None:
        current = EndpointStatus(ep.status)
        assert_endpoint_transition(current, target)
        ep.status = target.value
        await session.flush()
        await change_log.append(
            session,
            target_type="endpoint",
            target_id=ep.id,
            op=op,
            before={"status": current.value},
            after={"status": target.value},
        )

    # ---- 创建(配额校验 + 绑定校验 + 落库 + 异步部署) ----

    @staticmethod
    async def create(session: AsyncSession, bg_sessionmaker, *, payload) -> dict:
        dup = await session.scalar(
            select(EndpointRow).where(EndpointRow.url_path == payload.url_path)
        )
        if dup is not None:
            raise ConflictError("url_path 已被占用")
        await EndpointService._validate_bindings(session, payload.bindings)
        quota_dict = payload.resource_quota.model_dump()
        # 同事务内配额累计校验(基于已提交在用端点;诚实承认 READ COMMITTED 残余竞态,见 design D4)
        request_usage = endpoint_usage(payload.replicas, quota_dict)
        check_within_quota(_total(), await EndpointService._active_usages(session), request_usage)

        ep = EndpointRow(
            name=payload.name,
            url_path=payload.url_path,
            status=EndpointStatus.creating.value,
            replicas=payload.replicas,
            resource_quota=quota_dict,
            timeout_ms=payload.timeout_ms,
            max_concurrency=payload.max_concurrency,
        )
        session.add(ep)
        await session.flush()
        for b in payload.bindings:
            session.add(
                EndpointVersionBindingRow(
                    endpoint_id=ep.id, model_version_id=b.model_version_id, weight=b.weight
                )
            )
        await session.flush()
        await change_log.append(
            session,
            target_type="endpoint",
            target_id=ep.id,
            op="endpoint.create",
            before=None,
            after={"status": ep.status},
        )
        await EndpointService._schedule(
            session, bg_sessionmaker,
            ep=ep, expected_from=EndpointStatus.creating,
            target=EndpointStatus.running, op="endpoint.deploy",
        )
        return await EndpointService._serialize(session, ep)

    # ---- 启停重启 ----

    @staticmethod
    async def start(session: AsyncSession, bg_sessionmaker, endpoint_id: str) -> dict:
        ep = await EndpointService._get_row(session, endpoint_id)
        cur = EndpointStatus(ep.status)
        if cur != EndpointStatus.stopped:
            assert_endpoint_transition(cur, EndpointStatus.creating)  # 非 stopped 多半非法→409
        # 重新上线计入累计校验(排除自身)
        check_within_quota(
            _total(),
            await EndpointService._active_usages(session, exclude_id=ep.id),
            endpoint_usage(ep.replicas, ep.resource_quota),
        )
        await EndpointService._transition_sync(session, ep, EndpointStatus.creating, op="endpoint.start")
        await EndpointService._schedule(
            session, bg_sessionmaker, ep=ep,
            expected_from=EndpointStatus.creating, target=EndpointStatus.running, op="endpoint.start",
        )
        return await EndpointService._serialize(session, ep)

    @staticmethod
    async def restart(session: AsyncSession, bg_sessionmaker, endpoint_id: str) -> dict:
        ep = await EndpointService._get_row(session, endpoint_id)
        cur = EndpointStatus(ep.status)
        if cur not in (EndpointStatus.running, EndpointStatus.stopped, EndpointStatus.failed):
            assert_endpoint_transition(cur, EndpointStatus.creating)  # creating 等→409
        check_within_quota(
            _total(),
            await EndpointService._active_usages(session, exclude_id=ep.id),
            endpoint_usage(ep.replicas, ep.resource_quota),
        )
        await EndpointService._transition_sync(session, ep, EndpointStatus.creating, op="endpoint.restart")
        await EndpointService._schedule(
            session, bg_sessionmaker, ep=ep,
            expected_from=EndpointStatus.creating, target=EndpointStatus.running, op="endpoint.restart",
        )
        return await EndpointService._serialize(session, ep)

    @staticmethod
    async def stop(session: AsyncSession, bg_sessionmaker, endpoint_id: str) -> dict:
        ep = await EndpointService._get_row(session, endpoint_id)
        cur = EndpointStatus(ep.status)
        if cur == EndpointStatus.creating:
            # 取消进行中/卡住的部署:同步 creating→stopped,释放配额
            await EndpointService._transition_sync(session, ep, EndpointStatus.stopped, op="endpoint.stop.cancel")
        elif cur == EndpointStatus.running:
            # 停止异步:端点暂仍 running,后台 running→stopped(带代次,后续操作可使其失效)
            await EndpointService._schedule(
                session, bg_sessionmaker, ep=ep,
                expected_from=EndpointStatus.running, target=EndpointStatus.stopped, op="endpoint.stop",
            )
        else:
            assert_endpoint_transition(cur, EndpointStatus.stopped)  # stopped/failed→409
        return await EndpointService._serialize(session, ep)

    # ---- 更新(权重原子整体替换 + 配置增占异步重部署) ----

    @staticmethod
    async def update(session: AsyncSession, bg_sessionmaker, endpoint_id: str, payload) -> dict:
        ep = await EndpointService._get_row(session, endpoint_id)

        if payload.bindings is not None:
            await EndpointService._validate_bindings(session, payload.bindings)
            before_rows = (
                await session.execute(
                    select(EndpointVersionBindingRow).where(
                        EndpointVersionBindingRow.endpoint_id == ep.id
                    )
                )
            ).scalars().all()
            before = {b.model_version_id: b.weight for b in before_rows}
            # 单事务整删整插 → 对外可见权重和恒为 100(隔离前提见 design D3)
            await session.execute(
                delete(EndpointVersionBindingRow).where(
                    EndpointVersionBindingRow.endpoint_id == ep.id
                )
            )
            for b in payload.bindings:
                session.add(
                    EndpointVersionBindingRow(
                        endpoint_id=ep.id, model_version_id=b.model_version_id, weight=b.weight
                    )
                )
            await session.flush()
            await change_log.append(
                session,
                target_type="binding",
                target_id=ep.id,
                op="endpoint.weight.replace",
                before=before,
                after={b.model_version_id: b.weight for b in payload.bindings},
            )

        # 占用类变更(replicas/resource_quota)与元数据变更(timeout/concurrency)分开处理:
        occupancy_changed = payload.replicas is not None or payload.resource_quota is not None
        meta_changed = payload.timeout_ms is not None or payload.max_concurrency is not None
        if occupancy_changed or meta_changed:
            new_replicas = payload.replicas if payload.replicas is not None else ep.replicas
            new_quota = (
                payload.resource_quota.model_dump()
                if payload.resource_quota is not None
                else ep.resource_quota
            )
            running = EndpointStatus(ep.status) == EndpointStatus.running
            # M2:仅当占用变化且端点在线(占额)时才重跑配额校验;stopped/failed 不占额、不校验(留待 start/restart)。
            if occupancy_changed and running:
                check_within_quota(
                    _total(),
                    await EndpointService._active_usages(session, exclude_id=ep.id),
                    endpoint_usage(new_replicas, new_quota),
                )
            before_cfg = {
                "replicas": ep.replicas,
                "resource_quota": ep.resource_quota,
                "timeout_ms": ep.timeout_ms,
                "max_concurrency": ep.max_concurrency,
            }
            ep.replicas = new_replicas
            ep.resource_quota = new_quota
            if payload.timeout_ms is not None:
                ep.timeout_ms = payload.timeout_ms
            if payload.max_concurrency is not None:
                ep.max_concurrency = payload.max_concurrency
            await session.flush()
            # L2:配置变更一律写审计(无论端点处于何种状态)。
            await change_log.append(
                session,
                target_type="endpoint",
                target_id=ep.id,
                op="endpoint.config.update",
                before=before_cfg,
                after={
                    "replicas": ep.replicas,
                    "resource_quota": ep.resource_quota,
                    "timeout_ms": ep.timeout_ms,
                    "max_concurrency": ep.max_concurrency,
                },
            )
            # M1:仅"改变占用"的更新才对 running 端点触发异步重部署;
            # 纯 timeout_ms/max_concurrency 修改就地持久化、不重部署(它们仅存储不执行)。
            if occupancy_changed and running:
                await EndpointService._transition_sync(session, ep, EndpointStatus.creating, op="endpoint.update")
                await EndpointService._schedule(
                    session, bg_sessionmaker, ep=ep,
                    expected_from=EndpointStatus.creating, target=EndpointStatus.running, op="endpoint.update",
                )

        return await EndpointService._serialize(session, ep)

    # ---- 异步执行器回调(后台协程在独立会话内调用) ----

    @staticmethod
    async def finalize_async(session: AsyncSession, *, endpoint_id, expected_from, target, op, token) -> None:
        ep = await session.get(EndpointRow, endpoint_id)
        if ep is None:
            return
        if (ep.deploy_generation or 0) != token:
            return  # 旧代任务(已被取消/被新操作取代),丢弃其回写(H1)
        current = EndpointStatus(ep.status)
        if current != expected_from:
            return  # 用户已改变状态(如取消),幂等跳过
        assert_endpoint_transition(current, target)
        ep.status = target.value
        await session.flush()
        await change_log.append(
            session,
            target_type="endpoint",
            target_id=ep.id,
            op=op,
            before={"status": current.value},
            after={"status": target.value},
        )
