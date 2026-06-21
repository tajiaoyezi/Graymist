"""external-api 真实数据流集成测试(a5,1.1-d)。打桩上游(默认 upstream_mock),无 key/无网络。"""
import asyncio
import json

import httpx
from sqlalchemy import select

from app.db.tables import InferenceLogRow
from app.inference import executor, http_client

from .helpers import (
    CHAT_SCHEMA,
    endpoint_payload,
    make_external_ready_version,
    make_model,
)

CHAT_INPUT = {"input": {"messages": [{"role": "user", "content": "hi there"}]}}


async def _external_running(c, url_path="/chat/demo", **ep_over):
    mid = await make_model(c.client, input_schema=CHAT_SCHEMA, output_schema={})
    vid = await make_external_ready_version(c.client, mid)
    r = await c.client.post(
        "/endpoints",
        json=endpoint_payload(
            [{"model_version_id": vid, "weight": 100}], url_path=url_path, **ep_over
        ),
    )
    assert r.status_code == 201, r.text
    eid = r.json()["id"]
    await c.drain()  # creating → running
    return eid, vid


async def test_external_sync_success_real_usage(infer_client, db_session):
    c = infer_client
    eid, vid = await _external_running(c)
    r = await c.client.post(f"/endpoints/{eid}/infer", json=CHAT_INPUT)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["version_id"] == vid
    assert body["result"] == "echo: hi there"  # 打桩上游确定性回声
    assert body["usage"]["total_tokens"] > 0  # 真实(归一)usage
    # usage 落库(prompt/completion/total)
    rows = (
        await db_session.execute(
            select(InferenceLogRow).where(
                InferenceLogRow.endpoint_id == eid, InferenceLogRow.status == "success"
            )
        )
    ).scalars().all()
    assert rows and rows[0].total_tokens and rows[0].total_tokens > 0


async def test_external_no_key_still_runs(infer_client):
    # COMPLETE-6:mock 上游下 auth_ref 对应环境变量不存在,推理仍端到端成功(不解析真密钥)。
    c = infer_client
    eid, _ = await _external_running(c)
    r = await c.client.post(f"/endpoints/{eid}/infer", json=CHAT_INPUT)
    assert r.status_code == 200, r.text


async def test_external_non_chat_input_422(infer_client):
    c = infer_client
    eid, _ = await _external_running(c)
    r = await c.client.post(f"/endpoints/{eid}/infer", json={"input": {"text": "x"}})  # 非 chat
    assert r.status_code == 422, r.text


async def test_external_malformed_messages_422_no_log(infer_client, db_session):
    # messages 非空但元素非 dict:必须在 422 前置门拦下(不占额度、不落 error 日志),而非崩 500。
    c = infer_client
    eid, _ = await _external_running(c)
    r = await c.client.post(f"/endpoints/{eid}/infer", json={"input": {"messages": [42]}})
    assert r.status_code == 422, r.text
    rows = (
        await db_session.execute(select(InferenceLogRow).where(InferenceLogRow.endpoint_id == eid))
    ).scalars().all()
    assert rows == []  # 前置校验失败 → 不进执行、不落任何日志


async def test_external_async_success(infer_client):
    c = infer_client
    eid, _ = await _external_running(c)
    r = await c.client.post(f"/endpoints/{eid}/infer/async", json=CHAT_INPUT)
    assert r.status_code == 202, r.text
    task_id = r.json()["task_id"]
    await c.drain_infer()
    rr = await c.client.get(f"/inference/tasks/{task_id}")
    assert rr.json()["status"] == "succeeded"
    assert rr.json()["result"] == "echo: hi there"


async def test_external_upstream_5xx_502(infer_client, monkeypatch):
    c = infer_client
    eid, _ = await _external_running(c)
    monkeypatch.setattr(
        http_client,
        "_transport_override",
        httpx.MockTransport(lambda req: httpx.Response(500, json={"error": "boom"})),
    )
    r = await c.client.post(f"/endpoints/{eid}/infer", json=CHAT_INPUT)
    assert r.status_code == 502, r.text


async def test_external_upstream_5xx_async_failed(infer_client, monkeypatch):
    c = infer_client
    eid, _ = await _external_running(c)
    monkeypatch.setattr(
        http_client,
        "_transport_override",
        httpx.MockTransport(lambda req: httpx.Response(503, json={})),
    )
    r = await c.client.post(f"/endpoints/{eid}/infer/async", json=CHAT_INPUT)
    task_id = r.json()["task_id"]
    await c.drain_infer()
    rr = await c.client.get(f"/inference/tasks/{task_id}")
    assert rr.json()["status"] == "failed"


async def test_external_timeout_504(infer_client, monkeypatch, db_session):
    c = infer_client
    eid, vid = await _external_running(c, timeout_ms=10)

    async def _slow(*a, **k):
        await asyncio.sleep(0.1)  # 100ms > 10ms timeout
        return 200, {}

    monkeypatch.setattr(http_client, "post_upstream", _slow)
    r = await c.client.post(f"/endpoints/{eid}/infer", json=CHAT_INPUT)
    assert r.status_code == 504, r.text
    # 超时须在抛 InferenceTimeoutError 前先落一条 ST_TIMEOUT 日志(tasks 4.3 专属分支,既有 re-raise 分支不写日志)
    rows = (
        await db_session.execute(
            select(InferenceLogRow).where(
                InferenceLogRow.endpoint_id == eid, InferenceLogRow.status == "timeout"
            )
        )
    ).scalars().all()
    assert rows, "external 超时应落一条 timeout 日志"
    assert rows[0].version_id == vid
    assert rows[0].latency_ms == 10  # 落库延迟 = 端点 timeout_ms


async def test_external_ab_hit_routes_to_chosen_upstream(infer_client, monkeypatch):
    # DOM-1:A-B 双 external 版本,确定性命中某版本 → 打到该版本的 upstream_model、日志 version_id 正确。
    c = infer_client
    mid = await make_model(c.client, input_schema=CHAT_SCHEMA, output_schema={})
    v1 = await make_external_ready_version(c.client, mid, version="v1", upstream_model="model-a")
    v2 = await make_external_ready_version(c.client, mid, version="v2", upstream_model="model-b")
    r = await c.client.post(
        "/endpoints",
        json=endpoint_payload(
            [
                {"model_version_id": v1, "weight": 50},
                {"model_version_id": v2, "weight": 50},
            ],
            url_path="/chat/ab",
        ),
    )
    eid = r.json()["id"]
    await c.drain()
    # 确定性命中 v1
    monkeypatch.setattr(
        executor, "_select_fn", lambda bindings: next(b for b in bindings if b["model_version_id"] == v1)
    )
    # 假上游把请求的 model 反射回 content,据此断言打到了 v1 的 upstream_model
    def _reflect_model(req):
        upstream = json.loads(req.content)["model"]
        return httpx.Response(
            200,
            json={
                "choices": [{"message": {"content": "from:" + upstream}}],
                "usage": {"prompt_tokens": 1, "completion_tokens": 1, "total_tokens": 2},
            },
        )

    monkeypatch.setattr(http_client, "_transport_override", httpx.MockTransport(_reflect_model))
    resp = await c.client.post(f"/endpoints/{eid}/infer", json=CHAT_INPUT)
    assert resp.status_code == 200, resp.text
    assert resp.json()["version_id"] == v1
    assert resp.json()["result"] == "from:model-a"
