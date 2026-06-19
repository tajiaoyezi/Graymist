"""平台资源配额累计校验(a2 · 集成)。§4.2 口径;超额→409。"""
import pytest

from app.config import settings

from .helpers import endpoint_payload, make_model, make_ready_version


@pytest.fixture
def small_quota(monkeypatch):
    monkeypatch.setattr(settings, "total_cpu", 10)
    monkeypatch.setattr(settings, "total_memory", 1000)
    monkeypatch.setattr(settings, "total_gpu", 4)


async def _ready_binding(client):
    model_id = await make_model(client)
    vid = await make_ready_version(client, model_id)
    return [{"model_version_id": vid, "weight": 100}]


async def test_within_quota_allowed(endpoint_client, small_quota):
    ep = endpoint_client
    binding = await _ready_binding(ep.client)
    r = await ep.client.post(
        "/endpoints",
        json=endpoint_payload(binding, replicas=2, resource_quota={"cpu": 2, "memory": 100, "gpu": 1}),
    )
    assert r.status_code == 201, r.text  # 占用 cpu4/mem200/gpu2 ≤ 10/1000/4


async def test_exact_equal_remaining_allowed(endpoint_client, small_quota):
    ep = endpoint_client
    binding = await _ready_binding(ep.client)
    # 占用恰好等于总额
    r = await ep.client.post(
        "/endpoints",
        json=endpoint_payload(binding, replicas=2, resource_quota={"cpu": 5, "memory": 500, "gpu": 2}),
    )
    assert r.status_code == 201, r.text  # cpu10/mem1000/gpu4 == total


async def test_exceed_dimension_rejected_409(endpoint_client, small_quota):
    ep = endpoint_client
    binding = await _ready_binding(ep.client)
    r = await ep.client.post(
        "/endpoints",
        json=endpoint_payload(binding, replicas=1, resource_quota={"cpu": 1, "memory": 100, "gpu": 5}),
    )
    assert r.status_code == 409, r.text  # gpu 5 > 4


async def test_cumulative_in_use_rejects_second(endpoint_client, small_quota):
    ep = endpoint_client
    b1 = await _ready_binding(ep.client)
    r1 = await ep.client.post(
        "/endpoints",
        json=endpoint_payload(b1, url_path="/ep/a", replicas=1, resource_quota={"cpu": 7, "memory": 100, "gpu": 1}),
    )
    assert r1.status_code == 201, r1.text  # 占 cpu7
    b2 = await _ready_binding(ep.client)
    r2 = await ep.client.post(
        "/endpoints",
        json=endpoint_payload(b2, url_path="/ep/b", replicas=1, resource_quota={"cpu": 5, "memory": 100, "gpu": 1}),
    )
    assert r2.status_code == 409, r2.text  # 剩 3 < 5


async def test_quota_endpoint_reports_total_used_remaining(endpoint_client, small_quota):
    ep = endpoint_client
    binding = await _ready_binding(ep.client)
    await ep.client.post(
        "/endpoints",
        json=endpoint_payload(binding, replicas=1, resource_quota={"cpu": 3, "memory": 100, "gpu": 1}),
    )
    r = await ep.client.get("/quota")
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["total"]["cpu"] == 10
    assert body["used"]["cpu"] == 3
    assert body["remaining"]["cpu"] == 7


async def test_start_rechecks_quota(endpoint_client, small_quota):
    """停止释放配额后,新端点占满;再启动旧端点应因超额被拒(启动重算累计)。"""
    ep = endpoint_client
    b1 = await _ready_binding(ep.client)
    r1 = await ep.client.post(
        "/endpoints",
        json=endpoint_payload(b1, url_path="/ep/a", replicas=1, resource_quota={"cpu": 6, "memory": 100, "gpu": 1}),
    )
    eid = r1.json()["id"]
    await ep.drain()  # a → running (占 cpu6)
    # 停止 a(异步)→ 排空 → stopped,释放 6
    await ep.client.post(f"/endpoints/{eid}/stop")
    await ep.drain()
    # 新端点 b 占满剩余(cpu10)
    b2 = await _ready_binding(ep.client)
    r2 = await ep.client.post(
        "/endpoints",
        json=endpoint_payload(b2, url_path="/ep/b", replicas=1, resource_quota={"cpu": 10, "memory": 100, "gpu": 1}),
    )
    assert r2.status_code == 201, r2.text
    await ep.drain()
    # 再启动 a:需 6,但剩余 0 → 409
    r3 = await ep.client.post(f"/endpoints/{eid}/start")
    assert r3.status_code == 409, r3.text
