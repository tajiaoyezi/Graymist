"""同步推理 API 集成测试(a3,§4.3 / 原 2.3)。"""
from app.inference import concurrency

from .helpers import endpoint_payload, make_model, make_ready_version

INPUT_SCHEMA = {
    "type": "object",
    "properties": {"text": {"type": "string"}},
    "required": ["text"],
}
OUTPUT_SCHEMA = {
    "type": "object",
    "properties": {"label": {"type": "string"}, "score": {"type": "number"}},
    "required": ["label"],
}


async def _running_endpoint(c, **ep_over):
    mid = await make_model(c.client, input_schema=INPUT_SCHEMA, output_schema=OUTPUT_SCHEMA)
    vid = await make_ready_version(c.client, mid)
    r = await c.client.post(
        "/endpoints",
        json=endpoint_payload([{"model_version_id": vid, "weight": 100}], **ep_over),
    )
    assert r.status_code == 201, r.text
    eid = r.json()["id"]
    await c.drain()  # creating → running
    return eid, vid


async def test_sync_infer_success(infer_client):
    c = infer_client
    eid, vid = await _running_endpoint(c)
    r = await c.client.post(f"/endpoints/{eid}/infer", json={"input": {"text": "hi"}})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["version_id"] == vid  # 命中版本贯穿响应
    assert "latency_ms" in body
    assert {"label", "score"}.issubset(body["result"].keys())  # 结果符合 output_schema 形态


async def test_sync_infer_non_running_409(infer_client):
    c = infer_client
    mid = await make_model(c.client, input_schema=INPUT_SCHEMA, output_schema=OUTPUT_SCHEMA)
    vid = await make_ready_version(c.client, mid)
    r = await c.client.post(
        "/endpoints", json=endpoint_payload([{"model_version_id": vid, "weight": 100}])
    )
    eid = r.json()["id"]
    # 不 drain:端点仍 creating → 拒绝推理
    r = await c.client.post(f"/endpoints/{eid}/infer", json={"input": {"text": "hi"}})
    assert r.status_code == 409, r.text


async def test_sync_infer_invalid_input_422(infer_client):
    c = infer_client
    eid, _ = await _running_endpoint(c)
    r = await c.client.post(f"/endpoints/{eid}/infer", json={"input": {"wrong": 1}})  # 缺 required text
    assert r.status_code == 422, r.text


async def test_sync_infer_full_concurrency_429(infer_client):
    c = infer_client
    eid, _ = await _running_endpoint(c, max_concurrency=1)
    # 预占满该端点并发槽(控制器与 service 共用同一进程内注册表实例)
    ctrl = concurrency.get_controller(eid, 1)
    assert ctrl.try_acquire() is True
    r = await c.client.post(f"/endpoints/{eid}/infer", json={"input": {"text": "hi"}})
    assert r.status_code == 429, r.text
    ctrl.release()


async def _ab_endpoint(c):
    """挂载两个 ready 版本(50/50)的 running 端点,返回 (eid, v1, v2)。"""
    mid = await make_model(c.client, input_schema=INPUT_SCHEMA, output_schema=OUTPUT_SCHEMA)
    v1 = await make_ready_version(c.client, mid, version="v1")
    v2 = await make_ready_version(c.client, mid, version="v2")
    r = await c.client.post(
        "/endpoints",
        json=endpoint_payload(
            [
                {"model_version_id": v1, "weight": 50},
                {"model_version_id": v2, "weight": 50},
            ]
        ),
    )
    assert r.status_code == 201, r.text
    eid = r.json()["id"]
    await c.drain()  # creating → running
    return eid, v1, v2


async def test_sync_infer_routes_only_ready_binding(infer_client):
    # 绑定后某版本被 archived → 路由只在仍 ready 的绑定里选(spec:A/B 权重路由)
    c = infer_client
    eid, v1, v2 = await _ab_endpoint(c)
    r = await c.client.post(f"/versions/{v2}/transition", json={"target": "archived"})
    assert r.status_code == 200, r.text
    for _ in range(8):  # 多次调用恒命中仍 ready 的 v1,绝不命中已 archived 的 v2
        resp = await c.client.post(f"/endpoints/{eid}/infer", json={"input": {"text": "hi"}})
        assert resp.status_code == 200, resp.text
        assert resp.json()["version_id"] == v1


async def test_sync_infer_all_bindings_archived_409(infer_client):
    # 端点全部绑定均已非 ready → 推理被拒(spec:返回 409)
    c = infer_client
    eid, v1, v2 = await _ab_endpoint(c)
    for vid in (v1, v2):
        r = await c.client.post(f"/versions/{vid}/transition", json={"target": "archived"})
        assert r.status_code == 200, r.text
    r = await c.client.post(f"/endpoints/{eid}/infer", json={"input": {"text": "hi"}})
    assert r.status_code == 409, r.text


async def test_sync_infer_timeout_504(infer_client, monkeypatch):
    c = infer_client
    eid, _ = await _running_endpoint(c, timeout_ms=0)
    from app.inference import executor

    monkeypatch.setattr(executor, "simulate_latency_seconds", lambda: 0.005)  # 5ms > 0ms → 超时
    r = await c.client.post(f"/endpoints/{eid}/infer", json={"input": {"text": "hi"}})
    assert r.status_code == 504, r.text
