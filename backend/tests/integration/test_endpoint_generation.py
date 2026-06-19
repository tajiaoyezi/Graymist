"""审查 H1:取消后重启,旧代后台任务不得污染新部署(代次令牌)。"""
from app.endpoints import deploy

from .helpers import endpoint_payload, make_model, make_ready_version


async def _status(ep, eid):
    return (await ep.client.get(f"/endpoints/{eid}")).json()["status"]


async def test_stale_cancelled_task_does_not_poison_restart(endpoint_client, monkeypatch):
    ep = endpoint_client
    model_id = await make_model(ep.client)
    vid = await make_ready_version(ep.client, model_id)
    r = await ep.client.post(
        "/endpoints", json=endpoint_payload([{"model_version_id": vid, "weight": 100}])
    )
    eid = r.json()["id"]
    # 此刻 creating,T1(部署任务)已收集、未执行。

    # 取消(creating→stopped),T1 仍 pending。
    rc = await ep.client.post(f"/endpoints/{eid}/stop")
    assert rc.json()["status"] == "stopped"

    # 启动(stopped→creating),收集 T2。collected = [T1, T2]。
    rs = await ep.client.post(f"/endpoints/{eid}/start")
    assert rs.json()["status"] == "creating"

    # 令被取消的旧任务 T1 失败先跑;再让 T2 正常成功。
    monkeypatch.setattr(deploy, "_simulate_failure", lambda _eid: True)
    await ep.drain(1)  # T1:旧代,应被代次守卫丢弃,不得把端点标 failed
    monkeypatch.setattr(deploy, "_simulate_failure", lambda _eid: False)
    await ep.drain()  # T2:当前代,creating→running

    assert await _status(ep, eid) == "running"


async def test_executor_unexpected_exception_marks_failed(endpoint_client, monkeypatch):
    """审查 M4:成功路径 finalize 抛非模拟异常时,兜底 except 仍把端点置 failed。"""
    from app.domain.enums import EndpointStatus
    from app.endpoints.service import EndpointService

    ep = endpoint_client
    model_id = await make_model(ep.client)
    vid = await make_ready_version(ep.client, model_id)
    eid = (
        await ep.client.post(
            "/endpoints", json=endpoint_payload([{"model_version_id": vid, "weight": 100}])
        )
    ).json()["id"]

    orig = EndpointService.finalize_async  # 取原静态方法(纯函数)

    async def flaky(session, *, endpoint_id, expected_from, target, op, token):
        if target == EndpointStatus.running:
            raise RuntimeError("boom on success write")  # 非 _simulate_failure 的意外异常
        return await orig(
            session, endpoint_id=endpoint_id, expected_from=expected_from, target=target, op=op, token=token
        )

    monkeypatch.setattr(EndpointService, "finalize_async", staticmethod(flaky))
    await ep.drain()
    assert await _status(ep, eid) == "failed"

