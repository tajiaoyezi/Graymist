"""异步推理 API 集成测试(a3,§4.3)。"""
from .helpers import endpoint_payload, make_model, make_ready_version

INPUT_SCHEMA = {
    "type": "object",
    "properties": {"text": {"type": "string"}},
    "required": ["text"],
}
OUTPUT_SCHEMA = {
    "type": "object",
    "properties": {"label": {"type": "string"}},
    "required": ["label"],
}


async def _running_endpoint(c, **ep_over):
    mid = await make_model(c.client, input_schema=INPUT_SCHEMA, output_schema=OUTPUT_SCHEMA)
    vid = await make_ready_version(c.client, mid)
    r = await c.client.post(
        "/endpoints",
        json=endpoint_payload([{"model_version_id": vid, "weight": 100}], **ep_over),
    )
    eid = r.json()["id"]
    await c.drain()
    return eid, vid


async def test_async_submit_and_poll_success(infer_client):
    c = infer_client
    eid, _ = await _running_endpoint(c)
    r = await c.client.post(f"/endpoints/{eid}/infer/async", json={"input": {"text": "hi"}})
    assert r.status_code == 202, r.text
    task_id = r.json()["task_id"]
    assert r.json()["status"] == "queued"

    r = await c.client.get(f"/inference/tasks/{task_id}")  # 后台未执行前
    assert r.status_code == 200
    assert r.json()["status"] == "queued"

    await c.drain_infer()  # 后台执行 queued→running→succeeded
    body = (await c.client.get(f"/inference/tasks/{task_id}")).json()
    assert body["status"] == "succeeded", body
    assert "label" in body["result"]
    assert body["finished_at"] is not None


async def test_async_invalid_input_422_no_task(infer_client):
    c = infer_client
    eid, _ = await _running_endpoint(c)
    r = await c.client.post(f"/endpoints/{eid}/infer/async", json={"input": {"bad": 1}})
    assert r.status_code == 422, r.text  # submit 即校验失败,不建任务、不入队


async def test_async_task_not_found_404(infer_client):
    c = infer_client
    r = await c.client.get("/inference/tasks/nope")
    assert r.status_code == 404, r.text


async def test_async_execution_error_failed(infer_client, monkeypatch):
    c = infer_client
    eid, _ = await _running_endpoint(c)
    r = await c.client.post(f"/endpoints/{eid}/infer/async", json={"input": {"text": "hi"}})
    task_id = r.json()["task_id"]

    from app.inference import executor

    def boom(_schema):
        raise RuntimeError("boom")

    monkeypatch.setattr(executor, "generate_output", boom)
    await c.drain_infer()
    body = (await c.client.get(f"/inference/tasks/{task_id}")).json()
    assert body["status"] == "failed", body
