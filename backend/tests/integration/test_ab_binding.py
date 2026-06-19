"""A/B 流量分配与权重一致性(a2 · 集成)。§6.3 原子性不可削弱。"""
from .helpers import endpoint_payload, make_model, make_ready_version, make_version


async def _model_with_two_ready(client):
    model_id = await make_model(client)
    v1 = await make_ready_version(client, model_id, version="v1", file_path="/m/v1.onnx")
    v2 = await make_ready_version(client, model_id, version="v2", file_path="/m/v2.onnx")
    return model_id, v1, v2


async def test_two_versions_sum_100_accepted(endpoint_client):
    ep = endpoint_client
    _, v1, v2 = await _model_with_two_ready(ep.client)
    r = await ep.client.post(
        "/endpoints",
        json=endpoint_payload(
            [{"model_version_id": v1, "weight": 80}, {"model_version_id": v2, "weight": 20}]
        ),
    )
    assert r.status_code == 201, r.text
    weights = {b["model_version_id"]: b["weight"] for b in r.json()["bindings"]}
    assert weights == {v1: 80, v2: 20}


async def test_sum_not_100_rejected(endpoint_client):
    ep = endpoint_client
    _, v1, v2 = await _model_with_two_ready(ep.client)
    r = await ep.client.post(
        "/endpoints",
        json=endpoint_payload(
            [{"model_version_id": v1, "weight": 80}, {"model_version_id": v2, "weight": 10}]
        ),
    )
    assert r.status_code == 422, r.text


async def test_single_weight_out_of_range_rejected(endpoint_client):
    ep = endpoint_client
    _, v1, v2 = await _model_with_two_ready(ep.client)
    # 和恰为 100,但单条 120/-20 越界
    r = await ep.client.post(
        "/endpoints",
        json=endpoint_payload(
            [{"model_version_id": v1, "weight": 120}, {"model_version_id": v2, "weight": -20}]
        ),
    )
    assert r.status_code == 422, r.text


async def test_bind_non_ready_version_rejected(endpoint_client):
    ep = endpoint_client
    model_id = await make_model(ep.client)
    draft_vid = await make_version(ep.client, model_id)  # 仍 draft
    r = await ep.client.post(
        "/endpoints",
        json=endpoint_payload([{"model_version_id": draft_vid, "weight": 100}]),
    )
    assert r.status_code == 422, r.text


async def test_bind_cross_model_rejected(endpoint_client):
    ep = endpoint_client
    m1 = await make_model(ep.client, name="m1")
    m2 = await make_model(ep.client, name="m2")
    v1 = await make_ready_version(ep.client, m1)
    v2 = await make_ready_version(ep.client, m2)
    r = await ep.client.post(
        "/endpoints",
        json=endpoint_payload(
            [{"model_version_id": v1, "weight": 50}, {"model_version_id": v2, "weight": 50}]
        ),
    )
    assert r.status_code == 422, r.text


async def test_weight_replace_is_atomic_sum_100(endpoint_client):
    ep = endpoint_client
    _, v1, v2 = await _model_with_two_ready(ep.client)
    r = await ep.client.post(
        "/endpoints",
        json=endpoint_payload([{"model_version_id": v1, "weight": 100}]),
    )
    eid = r.json()["id"]
    # 整体替换为双版本 70/30
    r2 = await ep.client.patch(
        f"/endpoints/{eid}",
        json={"bindings": [
            {"model_version_id": v1, "weight": 70},
            {"model_version_id": v2, "weight": 30},
        ]},
    )
    assert r2.status_code == 200, r2.text
    weights = {b["model_version_id"]: b["weight"] for b in r2.json()["bindings"]}
    assert weights == {v1: 70, v2: 30}
    assert sum(weights.values()) == 100
