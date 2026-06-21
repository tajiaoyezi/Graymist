"""南向出站鉴权头集成测试(a6,2.3)。

a5 无非-mock 鉴权回归基线,此处首次为出站鉴权落测:用 capturing MockTransport 捕获
出站 `request.headers`。仅当 `upstream_mock=False` 时 `_auth_headers` 才注入,按协议
OpenAI=`Authorization: Bearer` / Anthropic=`x-api-key`;`auth_ref` 环境变量缺失→不注入(避免脏头)。
"""
import httpx

from app.config import settings
from app.inference import http_client

from .helpers import (
    CHAT_SCHEMA,
    endpoint_payload,
    make_external_ready_version,
    make_model,
)

CHAT_INPUT = {"input": {"messages": [{"role": "user", "content": "hi"}]}}


async def _running(c, *, protocol, url_path, auth_ref=None):
    mid = await make_model(c.client, input_schema=CHAT_SCHEMA, output_schema={})
    over = {"protocol": protocol}
    if auth_ref:
        over["auth_ref"] = auth_ref
    vid = await make_external_ready_version(c.client, mid, **over)
    r = await c.client.post(
        "/endpoints",
        json=endpoint_payload([{"model_version_id": vid, "weight": 100}], url_path=url_path),
    )
    assert r.status_code == 201, r.text
    eid = r.json()["id"]
    await c.drain()
    return eid


def _capturing(seen, *, anthropic):
    def _h(req):
        seen["headers"] = dict(req.headers)  # httpx Headers → 小写键
        if anthropic:
            return httpx.Response(
                200,
                json={
                    "content": [{"type": "text", "text": "ok"}],
                    "stop_reason": "end_turn",
                    "usage": {"input_tokens": 1, "output_tokens": 1},
                },
            )
        return httpx.Response(
            200,
            json={
                "choices": [{"message": {"content": "ok"}}],
                "usage": {"prompt_tokens": 1, "completion_tokens": 1, "total_tokens": 2},
            },
        )

    return httpx.MockTransport(_h)


async def test_openai_auth_injects_bearer(infer_client, monkeypatch):
    c = infer_client
    eid = await _running(c, protocol="openai", url_path="/auth/oai", auth_ref="GM_KEY_OAI")
    monkeypatch.setenv("GM_KEY_OAI", "secret-oai")
    monkeypatch.setattr(settings, "upstream_mock", False)
    seen = {}
    monkeypatch.setattr(http_client, "_transport_override", _capturing(seen, anthropic=False))
    r = await c.client.post(f"/endpoints/{eid}/infer", json=CHAT_INPUT)
    assert r.status_code == 200, r.text
    assert seen["headers"].get("authorization") == "Bearer secret-oai"


async def test_anthropic_auth_injects_x_api_key(infer_client, monkeypatch):
    c = infer_client
    eid = await _running(c, protocol="anthropic", url_path="/auth/ant", auth_ref="GM_KEY_ANT")
    monkeypatch.setenv("GM_KEY_ANT", "secret-ant")
    monkeypatch.setattr(settings, "upstream_mock", False)
    seen = {}
    monkeypatch.setattr(http_client, "_transport_override", _capturing(seen, anthropic=True))
    r = await c.client.post(f"/endpoints/{eid}/infer", json=CHAT_INPUT)
    assert r.status_code == 200, r.text
    assert seen["headers"].get("x-api-key") == "secret-ant"
    assert "anthropic-version" in seen["headers"]  # wire 常量头由 build_request 携带、经合并保留


async def test_auth_ref_missing_env_not_injected(infer_client, monkeypatch):
    # auth_ref 指向的环境变量不存在 → 不注入鉴权头(避免脏头),推理仍成功。
    c = infer_client
    eid = await _running(c, protocol="openai", url_path="/auth/missing", auth_ref="GM_KEY_ABSENT")
    monkeypatch.delenv("GM_KEY_ABSENT", raising=False)
    monkeypatch.setattr(settings, "upstream_mock", False)
    seen = {}
    monkeypatch.setattr(http_client, "_transport_override", _capturing(seen, anthropic=False))
    r = await c.client.post(f"/endpoints/{eid}/infer", json=CHAT_INPUT)
    assert r.status_code == 200, r.text
    assert "authorization" not in seen["headers"]
