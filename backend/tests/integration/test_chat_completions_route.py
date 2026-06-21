"""北向 OpenAI 兼容寻址集成测试(a5,§12/§21)。model→url_path,OpenAI 形状,免鉴权。"""
from .helpers import (
    CHAT_SCHEMA,
    endpoint_payload,
    make_external_ready_version,
    make_model,
    make_ready_version,
)


async def _external_running(c, url_path):
    mid = await make_model(c.client, input_schema=CHAT_SCHEMA, output_schema={})
    vid = await make_external_ready_version(c.client, mid)
    r = await c.client.post(
        "/endpoints",
        json=endpoint_payload([{"model_version_id": vid, "weight": 100}], url_path=url_path),
    )
    assert r.status_code == 201, r.text
    eid = r.json()["id"]
    await c.drain()
    return eid, vid


async def test_chat_completions_success_openai_shape(infer_client):
    c = infer_client
    await _external_running(c, "/chat/nb")
    r = await c.client.post(
        "/v1/chat/completions",
        json={"model": "/chat/nb", "messages": [{"role": "user", "content": "hi"}]},
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["object"] == "chat.completion"
    assert body["model"] == "/chat/nb"
    assert body["choices"][0]["message"]["content"] == "echo: hi"
    assert body["usage"]["total_tokens"] > 0


async def test_chat_completions_unknown_model_404(infer_client):
    r = await infer_client.client.post(
        "/v1/chat/completions",
        json={"model": "/does-not-exist", "messages": [{"role": "user", "content": "x"}]},
    )
    assert r.status_code == 404, r.text


async def test_chat_completions_non_running_409(infer_client):
    c = infer_client
    mid = await make_model(c.client, input_schema=CHAT_SCHEMA, output_schema={})
    vid = await make_external_ready_version(c.client, mid)
    r = await c.client.post(
        "/endpoints",
        json=endpoint_payload([{"model_version_id": vid, "weight": 100}], url_path="/chat/creating"),
    )
    assert r.status_code == 201
    # 不 drain → 端点仍 creating
    r = await c.client.post(
        "/v1/chat/completions",
        json={"model": "/chat/creating", "messages": [{"role": "user", "content": "x"}]},
    )
    assert r.status_code == 409, r.text


async def test_chat_completions_ignores_auth_header(infer_client):
    # 止步线 = v1.1.1:北向刻意免鉴权,携带 Authorization 头被忽略、不识别调用方。
    c = infer_client
    await _external_running(c, "/chat/auth")
    r = await c.client.post(
        "/v1/chat/completions",
        json={"model": "/chat/auth", "messages": [{"role": "user", "content": "hi"}]},
        headers={"Authorization": "Bearer fake-caller-key"},
    )
    assert r.status_code == 200, r.text


async def test_chat_completions_mock_endpoint_falls_through_to_schema(infer_client):
    # 北向寻址与来源无关:mock 端点同样可被 /v1/chat/completions 命中,此时走该 mock 模型的
    # input_schema 校验(而非 chat 形状)。默认 mock 模型 input_schema 要求 text,chat body 不满足
    # → 422。钉死当前灰区行为以防静默漂移(北向限定 external 属 v1.1.1 网关化的事)。
    c = infer_client
    mid = await make_model(c.client)
    vid = await make_ready_version(c.client, mid)
    r = await c.client.post(
        "/endpoints",
        json=endpoint_payload([{"model_version_id": vid, "weight": 100}], url_path="/chat/mock"),
    )
    assert r.status_code == 201
    await c.drain()
    r = await c.client.post(
        "/v1/chat/completions",
        json={"model": "/chat/mock", "messages": [{"role": "user", "content": "hi"}]},
    )
    assert r.status_code == 422, r.text
