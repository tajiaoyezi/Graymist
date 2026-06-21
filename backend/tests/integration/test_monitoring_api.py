"""监控查询 API 集成测试(a4,§4.4)。"""
from .helpers import endpoint_payload, make_model, make_ready_version

INPUT_SCHEMA = {"type": "object", "properties": {"text": {"type": "string"}}, "required": ["text"]}
OUTPUT_SCHEMA = {"type": "object", "properties": {"label": {"type": "string"}}, "required": ["label"]}


async def _running_endpoint(c):
    mid = await make_model(c.client, input_schema=INPUT_SCHEMA, output_schema=OUTPUT_SCHEMA)
    vid = await make_ready_version(c.client, mid)
    r = await c.client.post(
        "/endpoints", json=endpoint_payload([{"model_version_id": vid, "weight": 100}])
    )
    eid = r.json()["id"]
    await c.drain()  # → running
    return eid, vid


async def test_metrics_returns_shape(infer_client):
    c = infer_client
    eid, vid = await _running_endpoint(c)
    for _ in range(2):  # 跑两次同步推理 → inference_log 落 2 行
        r = await c.client.post(f"/endpoints/{eid}/infer", json={"input": {"text": "hi"}})
        assert r.status_code == 200, r.text
    r = await c.client.get(f"/monitoring/metrics?endpoint_id={eid}&range=24h")
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["range"] == "24h"
    assert len(body["buckets"]) == 24
    assert body["current_concurrency"] == 0  # 查询时刻无在飞
    assert set(body["summary"].keys()) == {"qps", "avg_latency_ms", "p99_latency_ms", "error_rate"}
    assert any(v["version_id"] == vid for v in body["versions"])  # 单版本端点命中该版本


async def test_logs_list_records_each_call(infer_client):
    c = infer_client
    eid, vid = await _running_endpoint(c)
    for _ in range(3):  # 3 次同步推理 → 落 3 条日志
        r = await c.client.post(f"/endpoints/{eid}/infer", json={"input": {"text": "hi"}})
        assert r.status_code == 200, r.text
    r = await c.client.get(f"/monitoring/logs?endpoint_id={eid}&limit=50")
    assert r.status_code == 200, r.text
    logs = r.json()
    assert len(logs) == 3
    first = logs[0]
    # 逐条记录:端点/命中版本/输入·输出摘要/延迟/状态(§4.3)
    assert set(first.keys()) >= {
        "endpoint_id", "version_id", "version", "mode",
        "input_summary", "output_summary", "latency_ms", "status",
    }
    assert first["status"] == "success"
    assert first["version_id"] == vid  # A/B 实际命中版本已记录
    assert first["version"] == "v1"  # 命中版本可读版本号(helper 版本为 v1)
    assert "hi" in first["input_summary"]


async def test_logs_status_filter(infer_client):
    c = infer_client
    eid, _ = await _running_endpoint(c)
    await c.client.post(f"/endpoints/{eid}/infer", json={"input": {"text": "ok"}})
    # 只筛 rate_limited:本端点无 429 → 空列表(过滤生效,不返回 success 行)
    r = await c.client.get(f"/monitoring/logs?endpoint_id={eid}&status=rate_limited")
    assert r.status_code == 200, r.text
    assert r.json() == []


async def test_logs_endpoint_not_found_404(infer_client):
    r = await infer_client.client.get("/monitoring/logs?endpoint_id=nope")
    assert r.status_code == 404, r.text


async def test_metrics_endpoint_not_found_404(infer_client):
    r = await infer_client.client.get("/monitoring/metrics?endpoint_id=nope&range=24h")
    assert r.status_code == 404, r.text


async def test_metrics_invalid_range_422(infer_client):
    c = infer_client
    eid, _ = await _running_endpoint(c)
    r = await c.client.get(f"/monitoring/metrics?endpoint_id={eid}&range=99x")
    assert r.status_code == 422, r.text
