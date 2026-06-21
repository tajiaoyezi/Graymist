"""Anthropic 南向适配器单测(a6):build_request 顶层 system/必填 max_tokens、
parse_response 过滤 text block(非取 content[0])+ usage 归一,auth_headers=x-api-key。"""
import pytest

from app.inference import adapters
from app.inference.adapters.anthropic import (
    ANTHROPIC_VERSION,
    DEFAULT_MAX_TOKENS,
    AnthropicAdapter,
)
from app.inference.canonical import CanonicalChatRequest
from app.inference.errors import UpstreamError


def test_build_request_system_top_level_and_default_max_tokens():
    adapter = AnthropicAdapter()
    req = CanonicalChatRequest(
        messages=[{"role": "user", "content": "hi"}],
        system="你是助手",
    )
    path, body, headers = adapter.build_request(req, upstream_model="claude-3-5-sonnet")
    assert path == "/messages"
    assert body["model"] == "claude-3-5-sonnet"
    assert body["system"] == "你是助手"  # 顶层字段,而非折进 messages
    assert body["messages"] == [{"role": "user", "content": "hi"}]
    assert body["max_tokens"] == DEFAULT_MAX_TOKENS  # canonical 未给 → 默认兜底(Anthropic 必填)
    assert headers["anthropic-version"] == ANTHROPIC_VERSION


def test_build_request_uses_given_max_tokens_and_temperature():
    adapter = AnthropicAdapter()
    req = CanonicalChatRequest(
        messages=[{"role": "user", "content": "x"}], max_tokens=128, temperature=0.5
    )
    _, body, _ = adapter.build_request(req, upstream_model="m")
    assert body["max_tokens"] == 128 and body["temperature"] == 0.5


def test_parse_response_joins_text_blocks_skips_non_text():
    adapter = AnthropicAdapter()
    res = adapter.parse_response(
        200,
        {
            "content": [
                {"type": "thinking", "thinking": "..."},  # 非 text,首块不应被当 content[0] 取
                {"type": "text", "text": "你好"},
                {"type": "text", "text": "世界"},
            ],
            "stop_reason": "end_turn",
            "usage": {"input_tokens": 5, "output_tokens": 2},
        },
    )
    assert res.content == "你好世界"  # 仅拼接 type==text 块
    assert res.finish_reason == "end_turn"
    assert res.usage.input_tokens == 5
    assert res.usage.output_tokens == 2
    assert res.usage.total_tokens == 7  # 无 total → input+output 兜底


def test_parse_response_no_text_block_raises():
    adapter = AnthropicAdapter()
    with pytest.raises(UpstreamError):
        adapter.parse_response(
            200, {"content": [{"type": "thinking", "thinking": "x"}], "usage": {}}
        )


def test_parse_response_malformed_raises():
    adapter = AnthropicAdapter()
    with pytest.raises(UpstreamError):
        adapter.parse_response(200, {"unexpected": True})


def test_auth_headers_x_api_key():
    assert AnthropicAdapter().auth_headers("secret") == {"x-api-key": "secret"}


def test_get_adapter_anthropic_returns_anthropic_adapter():
    assert isinstance(adapters.get_adapter("anthropic"), AnthropicAdapter)
