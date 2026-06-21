"""a7:上游凭证加密存储 + 永不回显 + 解密注入优先级 + 轮换 集成测试。"""
import httpx
from cryptography.fernet import Fernet

from app.config import settings
from app.inference import http_client

from .helpers import (
    CHAT_SCHEMA,
    endpoint_payload,
    make_external_ready_version,
    make_model,
    make_version,
)

TEST_SECRET_KEY = Fernet.generate_key().decode()
CHAT_INPUT = {"input": {"messages": [{"role": "user", "content": "hi"}]}}


def _ext_payload(**over):
    p = {
        "version": "v1",
        "source": "external-api",
        "provider": "openai",
        "base_url": "http://up/v1",
        "upstream_model": "gpt-4o-mini",
        "protocol": "openai",
    }
    p.update(over)
    return p


# ---- 3.1 创建时加密存储 + 永不回显 ----


async def test_create_with_api_key_encrypts_and_never_echoes(client, monkeypatch):
    monkeypatch.setattr(settings, "secret_key", TEST_SECRET_KEY)
    mid = await make_model(client, input_schema=CHAT_SCHEMA, output_schema={})
    r = await client.post(f"/models/{mid}/versions", json=_ext_payload(api_key="sk-real-123"))
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["has_api_key"] is True
    assert "api_key" not in body and "auth_secret_enc" not in body
    assert "sk-real-123" not in r.text  # 明文/密文都不回显


async def test_create_with_api_key_without_master_key_400_no_persist(client, monkeypatch):
    monkeypatch.setattr(settings, "secret_key", "")
    mid = await make_model(client, input_schema=CHAT_SCHEMA, output_schema={})
    r = await client.post(f"/models/{mid}/versions", json=_ext_payload(api_key="sk-x"))
    assert r.status_code == 400, r.text
    lst = await client.get(f"/models/{mid}/versions")
    assert lst.json() == []  # 未配主密钥 → 拒绝且不落明文(版本未创建)


async def test_create_without_api_key_unchanged(client):
    mid = await make_model(client, input_schema=CHAT_SCHEMA, output_schema={})
    r = await client.post(f"/models/{mid}/versions", json=_ext_payload(auth_ref="GM_KEY"))
    assert r.status_code == 201, r.text
    assert r.json()["has_api_key"] is False  # 走 auth_ref 路径,回归不变


# ---- 4.1 轮换端点 ----


async def test_credential_set_rotate_clear(client, monkeypatch):
    monkeypatch.setattr(settings, "secret_key", TEST_SECRET_KEY)
    mid = await make_model(client, input_schema=CHAT_SCHEMA, output_schema={})
    vid = (await client.post(f"/models/{mid}/versions", json=_ext_payload())).json()["id"]
    # set
    r = await client.put(f"/versions/{vid}/credential", json={"api_key": "sk-aaa"})
    assert r.status_code == 200 and r.json()["has_api_key"] is True
    assert "sk-aaa" not in r.text
    # rotate
    r = await client.put(f"/versions/{vid}/credential", json={"api_key": "sk-bbb"})
    assert r.json()["has_api_key"] is True
    # clear
    r = await client.put(f"/versions/{vid}/credential", json={"api_key": None})
    assert r.json()["has_api_key"] is False


async def test_credential_on_mock_version_rejected(client):
    mid = await make_model(client)
    vid = await make_version(client, mid)  # mock 版本
    r = await client.put(f"/versions/{vid}/credential", json={"api_key": "sk-x"})
    assert r.status_code == 409, r.text


# ---- 5.1 解密注入优先级 ----


def _capture(seen):
    def _h(req):
        seen["headers"] = dict(req.headers)
        return httpx.Response(
            200,
            json={
                "choices": [{"message": {"content": "ok"}}],
                "usage": {"prompt_tokens": 1, "completion_tokens": 1, "total_tokens": 2},
            },
        )

    return httpx.MockTransport(_h)


async def _ext_running(c, *, url_path, **ver_over):
    mid = await make_model(c.client, input_schema=CHAT_SCHEMA, output_schema={})
    vid = await make_external_ready_version(c.client, mid, **ver_over)
    r = await c.client.post(
        "/endpoints",
        json=endpoint_payload([{"model_version_id": vid, "weight": 100}], url_path=url_path),
    )
    assert r.status_code == 201, r.text
    eid = r.json()["id"]
    await c.drain()
    return eid, vid


async def test_stored_key_takes_priority_over_auth_ref(infer_client, monkeypatch):
    monkeypatch.setattr(settings, "secret_key", TEST_SECRET_KEY)
    c = infer_client
    eid, _ = await _ext_running(c, url_path="/cred/prio", api_key="sk-STORED", auth_ref="GM_ENV")
    monkeypatch.setenv("GM_ENV", "sk-ENVVAL")  # env 设不同值
    monkeypatch.setattr(settings, "upstream_mock", False)
    seen = {}
    monkeypatch.setattr(http_client, "_transport_override", _capture(seen))
    r = await c.client.post(f"/endpoints/{eid}/infer", json=CHAT_INPUT)
    assert r.status_code == 200, r.text
    assert seen["headers"].get("authorization") == "Bearer sk-STORED"  # 用存储 key,非 env


async def test_fallback_to_auth_ref_env_when_no_stored(infer_client, monkeypatch):
    monkeypatch.setattr(settings, "secret_key", TEST_SECRET_KEY)
    c = infer_client
    eid, _ = await _ext_running(c, url_path="/cred/env", auth_ref="GM_ENV2")  # 无 api_key
    monkeypatch.setenv("GM_ENV2", "sk-ENVONLY")
    monkeypatch.setattr(settings, "upstream_mock", False)
    seen = {}
    monkeypatch.setattr(http_client, "_transport_override", _capture(seen))
    r = await c.client.post(f"/endpoints/{eid}/infer", json=CHAT_INPUT)
    assert r.status_code == 200, r.text
    assert seen["headers"].get("authorization") == "Bearer sk-ENVONLY"


async def test_mock_does_not_inject_stored_key(infer_client, monkeypatch):
    monkeypatch.setattr(settings, "secret_key", TEST_SECRET_KEY)
    c = infer_client
    eid, _ = await _ext_running(c, url_path="/cred/mock", api_key="sk-STORED")
    # upstream_mock 默认 True:不解密/不注入真 key,仍端到端成功。
    r = await c.client.post(f"/endpoints/{eid}/infer", json=CHAT_INPUT)
    assert r.status_code == 200, r.text
    assert r.json()["result"] == "echo: hi"


async def test_decrypt_failure_skips_injection_no_crash(infer_client, monkeypatch):
    monkeypatch.setattr(settings, "secret_key", TEST_SECRET_KEY)
    c = infer_client
    eid, _ = await _ext_running(c, url_path="/cred/badkey", api_key="sk-STORED")
    monkeypatch.setattr(settings, "secret_key", Fernet.generate_key().decode())  # 换主密钥
    monkeypatch.setattr(settings, "upstream_mock", False)
    seen = {}
    monkeypatch.setattr(http_client, "_transport_override", _capture(seen))
    r = await c.client.post(f"/endpoints/{eid}/infer", json=CHAT_INPUT)
    assert r.status_code == 200, r.text  # 解密失败不崩
    assert "authorization" not in seen["headers"]  # 未注入
