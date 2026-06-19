"""对抗式审查修复回归(H2 重复绑定 / H3 配额校验 / M1 元数据更新不重部署 /
M2 停止态更新不被配额拒 / L2 配置更新审计 / L5 更新超额拒绝且保留原配置)。"""
import pytest
from sqlalchemy import select

from app.config import settings
from app.db.tables import ChangeLogRow

from .helpers import endpoint_payload, make_model, make_ready_version


@pytest.fixture
def small_quota(monkeypatch):
    monkeypatch.setattr(settings, "total_cpu", 10)
    monkeypatch.setattr(settings, "total_memory", 1000)
    monkeypatch.setattr(settings, "total_gpu", 4)


async def _ready_binding(client):
    mid = await make_model(client)
    vid = await make_ready_version(client, mid)
    return [{"model_version_id": vid, "weight": 100}]


# ---- H2 ----
async def test_duplicate_version_binding_rejected(endpoint_client):
    ep = endpoint_client
    mid = await make_model(ep.client)
    vid = await make_ready_version(ep.client, mid)
    r = await ep.client.post(
        "/endpoints",
        json=endpoint_payload(
            [{"model_version_id": vid, "weight": 60}, {"model_version_id": vid, "weight": 40}]
        ),
    )
    assert r.status_code == 422, r.text


# ---- H3 ----
async def test_resource_quota_missing_key_rejected(endpoint_client):
    ep = endpoint_client
    b = await _ready_binding(ep.client)
    r = await ep.client.post("/endpoints", json=endpoint_payload(b, resource_quota={"cpu": 1}))
    assert r.status_code == 422, r.text


async def test_resource_quota_negative_rejected(endpoint_client):
    ep = endpoint_client
    b = await _ready_binding(ep.client)
    r = await ep.client.post(
        "/endpoints", json=endpoint_payload(b, resource_quota={"cpu": -1, "memory": 1, "gpu": 0})
    )
    assert r.status_code == 422, r.text


async def test_resource_quota_nonnumeric_is_422_not_500(endpoint_client):
    ep = endpoint_client
    b = await _ready_binding(ep.client)
    r = await ep.client.post(
        "/endpoints", json=endpoint_payload(b, resource_quota={"cpu": "lots", "memory": 1, "gpu": 0})
    )
    assert r.status_code == 422, r.text


# ---- M1 ----
async def test_meta_only_update_does_not_redeploy(endpoint_client):
    ep = endpoint_client
    b = await _ready_binding(ep.client)
    eid = (await ep.client.post("/endpoints", json=endpoint_payload(b))).json()["id"]
    await ep.drain()  # → running
    r = await ep.client.patch(f"/endpoints/{eid}", json={"timeout_ms": 9999})
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "running"  # 仅改 timeout_ms 不重部署
    assert r.json()["timeout_ms"] == 9999


# ---- M2 ----
async def test_stopped_config_update_not_quota_rejected(endpoint_client, small_quota):
    ep = endpoint_client
    b = await _ready_binding(ep.client)
    eid = (
        await ep.client.post(
            "/endpoints",
            json=endpoint_payload(b, replicas=1, resource_quota={"cpu": 1, "memory": 10, "gpu": 0}),
        )
    ).json()["id"]
    await ep.drain()  # running
    await ep.client.post(f"/endpoints/{eid}/stop")
    await ep.drain()  # stopped
    # stopped 端点不占额,把配额调到远超总额也不应被 409
    r = await ep.client.patch(
        f"/endpoints/{eid}", json={"resource_quota": {"cpu": 9999, "memory": 10, "gpu": 0}}
    )
    assert r.status_code == 200, r.text
    assert r.json()["resource_quota"]["cpu"] == 9999


# ---- L2 ----
async def test_config_update_writes_change_log(endpoint_client, db_session):
    ep = endpoint_client
    b = await _ready_binding(ep.client)
    eid = (await ep.client.post("/endpoints", json=endpoint_payload(b))).json()["id"]
    await ep.client.patch(f"/endpoints/{eid}", json={"timeout_ms": 5000})
    rows = (
        await db_session.execute(select(ChangeLogRow).where(ChangeLogRow.target_id == eid))
    ).scalars().all()
    assert any(row.op == "endpoint.config.update" for row in rows)


# ---- L5 ----
async def test_update_overquota_rejected_preserves_config(endpoint_client, small_quota):
    ep = endpoint_client
    b = await _ready_binding(ep.client)
    eid = (
        await ep.client.post(
            "/endpoints",
            json=endpoint_payload(b, replicas=1, resource_quota={"cpu": 2, "memory": 10, "gpu": 0}),
        )
    ).json()["id"]
    await ep.drain()  # running, 占 cpu2
    r = await ep.client.patch(
        f"/endpoints/{eid}", json={"resource_quota": {"cpu": 100, "memory": 10, "gpu": 0}}
    )
    assert r.status_code == 409, r.text
    cur = await ep.client.get(f"/endpoints/{eid}")
    assert cur.json()["resource_quota"]["cpu"] == 2  # 原配置保留
