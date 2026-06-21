"""external-api 南向 HTTP 客户端（a5,1.1-d）。

真跑 httpx 代码路径;`upstream_mock=True`(默认)时用内置打桩上游(确定性回声 + 固定 usage,
同 OpenAI wire 格式),无 key/无网络、CI 离线。`_transport_override` 是测试注入缝(仿
runner._spawn_fn / deploy._spawn_fn):测试可注入自定义 MockTransport 模拟 5xx 等。
"""
import json

import httpx

from app.config import settings

# 测试注入缝:置为 httpx.MockTransport(handler) 可定制上游行为(5xx 等);None 时按 upstream_mock 决定。
_transport_override: httpx.MockTransport | None = None


def set_transport(transport: httpx.MockTransport | None) -> None:
    global _transport_override
    _transport_override = transport


def reset() -> None:
    set_transport(None)


def _default_mock_handler(request: httpx.Request) -> httpx.Response:
    """内置假 OpenAI server:回声最后一条 user 消息 + 确定性 usage(同 wire 格式)。"""
    try:
        body = json.loads(request.content)
    except Exception:
        body = {}
    messages = body.get("messages") or []
    last_user = ""
    for m in reversed(messages):
        if isinstance(m, dict) and m.get("role") == "user":
            last_user = str(m.get("content", ""))
            break
    content = f"echo: {last_user}"
    prompt_tokens = sum(len(str(m.get("content", "")).split()) for m in messages if isinstance(m, dict))
    completion_tokens = len(content.split())
    resp = {
        "id": "chatcmpl-mock",
        "object": "chat.completion",
        "model": body.get("model", "mock"),
        "choices": [
            {"index": 0, "message": {"role": "assistant", "content": content}, "finish_reason": "stop"}
        ],
        "usage": {
            "prompt_tokens": prompt_tokens,
            "completion_tokens": completion_tokens,
            "total_tokens": prompt_tokens + completion_tokens,
        },
    }
    return httpx.Response(200, json=resp)


def _transport() -> httpx.MockTransport | None:
    if _transport_override is not None:
        return _transport_override
    if settings.upstream_mock:
        return httpx.MockTransport(_default_mock_handler)
    return None  # 真上游:走默认网络传输


async def post_upstream(
    base_url: str, path: str, json_body: dict, headers: dict
) -> tuple[int, dict]:
    url = (base_url or "").rstrip("/") + path
    transport = _transport()
    async with httpx.AsyncClient(
        transport=transport, timeout=settings.upstream_connect_timeout_seconds
    ) as client:
        resp = await client.post(url, json=json_body, headers=headers)
    try:
        data = resp.json()
    except Exception:
        data = {}
    return resp.status_code, data
