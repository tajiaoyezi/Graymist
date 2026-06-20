"""异步推理 API 集成测试(a3,§4.3)。"""
from sqlalchemy import select

from app.db.tables import InferenceLogRow

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


async def test_async_execution_error_failed(infer_client, session_factory, monkeypatch):
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

    # spec scenario:执行失败「并写入一条状态为错误的推理日志」(原仅断言 task=failed)
    async with session_factory() as s:
        logs = (
            await s.execute(select(InferenceLogRow).where(InferenceLogRow.endpoint_id == eid))
        ).scalars().all()
    assert any(l.status == "error" and l.mode == "async" for l in logs), [
        (l.status, l.mode) for l in logs
    ]


async def test_async_submit_queues_not_429_when_full(infer_client):
    # 限流异步分支契约:端点并发占满时,同步 429,但异步 submit 入队(202 queued),
    # 释放空位后后台可排空至 succeeded。覆盖 service↔controller 真实接线(DB 读容量 + 进程内复用)。
    from app.inference import concurrency

    c = infer_client
    eid, _ = await _running_endpoint(c, max_concurrency=1)
    ctrl = concurrency.get_controller(eid, 1)
    assert ctrl.try_acquire() is True  # 占满唯一并发槽(与 service 共用进程内注册表)

    r = await c.client.post(f"/endpoints/{eid}/infer/async", json={"input": {"text": "hi"}})
    assert r.status_code == 202, r.text  # 异步永不 429
    assert r.json()["status"] == "queued"
    task_id = r.json()["task_id"]

    r2 = await c.client.post(f"/endpoints/{eid}/infer", json={"input": {"text": "hi"}})
    assert r2.status_code == 429, r2.text  # 对照:同一满载端点的同步推理 429

    ctrl.release()  # 释放空位(此刻后台任务尚未起跑、无排队者 → in_flight 归 0)
    await c.drain_infer()  # 后台任务取得空位 → queued→running→succeeded
    body = (await c.client.get(f"/inference/tasks/{task_id}")).json()
    assert body["status"] == "succeeded", body
