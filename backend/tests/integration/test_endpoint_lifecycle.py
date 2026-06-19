"""端点异步生命周期(a2 · 集成)。四类操作均异步、API 立即返回、轮询终态。"""
from .helpers import endpoint_payload, make_model, make_ready_version


async def _create_endpoint(ep, **over):
    model_id = await make_model(ep.client, name=over.pop("model_name", "m"))
    vid = await make_ready_version(ep.client, model_id)
    r = await ep.client.post(
        "/endpoints",
        json=endpoint_payload([{"model_version_id": vid, "weight": 100}], **over),
    )
    assert r.status_code == 201, r.text
    return r.json()["id"]


async def _status(ep, eid):
    return (await ep.client.get(f"/endpoints/{eid}")).json()["status"]


async def test_deploy_immediate_return_then_running(endpoint_client):
    ep = endpoint_client
    eid = await _create_endpoint(ep)
    assert await _status(ep, eid) == "creating"  # API 立即返回,未阻塞
    await ep.drain()  # 后台执行(耗时 0)
    assert await _status(ep, eid) == "running"


async def test_stop_running_immediate_then_stopped(endpoint_client):
    ep = endpoint_client
    eid = await _create_endpoint(ep)
    await ep.drain()  # → running
    r = await ep.client.post(f"/endpoints/{eid}/stop")
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "running"  # 停止异步:立即返回仍 running
    await ep.drain()
    assert await _status(ep, eid) == "stopped"


async def test_restart_failed_recovers(endpoint_client, monkeypatch):
    ep = endpoint_client
    eid = await _create_endpoint(ep)
    await ep.drain()  # → running
    # 制造一次失败部署:让执行器抛错 → failed
    from app.endpoints import deploy
    orig = deploy._simulate_failure
    monkeypatch.setattr(deploy, "_simulate_failure", lambda eid_: True)
    await ep.client.post(f"/endpoints/{eid}/restart")  # running→creating, bg 将失败
    await ep.drain()
    assert await _status(ep, eid) == "failed"
    monkeypatch.setattr(deploy, "_simulate_failure", orig)
    # 再重启 → 恢复 running(failed→creating→running)
    r = await ep.client.post(f"/endpoints/{eid}/restart")
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "creating"
    await ep.drain()
    assert await _status(ep, eid) == "running"


async def test_cancel_stuck_creating_via_stop(endpoint_client):
    ep = endpoint_client
    eid = await _create_endpoint(ep)
    # 不 drain:端点仍 creating(模拟卡住)。停止 → 取消 → stopped。
    r = await ep.client.post(f"/endpoints/{eid}/stop")
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "stopped"


async def test_update_increasing_config_redeploys(endpoint_client):
    ep = endpoint_client
    eid = await _create_endpoint(ep, replicas=1, resource_quota={"cpu": 1, "memory": 100, "gpu": 0})
    await ep.drain()  # → running
    r = await ep.client.patch(f"/endpoints/{eid}", json={"replicas": 2})
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "creating"  # 增占更新 → 异步重部署
    await ep.drain()
    assert await _status(ep, eid) == "running"


async def test_illegal_stop_of_stopped_409(endpoint_client):
    ep = endpoint_client
    eid = await _create_endpoint(ep)
    await ep.drain()  # running
    await ep.client.post(f"/endpoints/{eid}/stop")
    await ep.drain()  # stopped
    r = await ep.client.post(f"/endpoints/{eid}/stop")
    assert r.status_code == 409, r.text


async def test_get_missing_endpoint_404(endpoint_client):
    ep = endpoint_client
    r = await ep.client.get("/endpoints/nope")
    assert r.status_code == 404, r.text
