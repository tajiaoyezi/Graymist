"""OpenAI 南向适配器单测(a5):build_request 折叠 / parse_response 解析 + usage 映射。"""
import pytest

from app.inference import adapters
from app.inference.canonical import CanonicalChatRequest
from app.inference.errors import InferenceInputInvalidError, UpstreamError


def test_build_request_folds_system_and_options():
    adapter = adapters.get_adapter("openai")
    req = CanonicalChatRequest(
        messages=[{"role": "user", "content": "hi"}],
        system="你是助手",
        max_tokens=64,
        temperature=0.2,
    )
    path, body, headers = adapter.build_request(req, upstream_model="gpt-4o-mini")
    assert path == "/chat/completions"
    assert body["model"] == "gpt-4o-mini"
    assert body["messages"][0] == {"role": "system", "content": "你是助手"}  # system 折回首条
    assert body["messages"][1]["content"] == "hi"
    assert body["max_tokens"] == 64 and body["temperature"] == 0.2


def test_parse_response_extracts_content_and_maps_usage():
    adapter = adapters.get_adapter("openai")
    res = adapter.parse_response(
        200,
        {
            "choices": [{"message": {"role": "assistant", "content": "你好"}, "finish_reason": "stop"}],
            "usage": {"prompt_tokens": 7, "completion_tokens": 3, "total_tokens": 10},
        },
    )
    assert res.content == "你好"
    assert res.finish_reason == "stop"
    # prompt/completion → 归一 input/output
    assert res.usage.input_tokens == 7
    assert res.usage.output_tokens == 3
    assert res.usage.total_tokens == 10


def test_parse_response_malformed_raises_upstream_error():
    adapter = adapters.get_adapter("openai")
    with pytest.raises(UpstreamError):
        adapter.parse_response(200, {"unexpected": True})


def test_get_adapter_unsupported_protocol():
    with pytest.raises(InferenceInputInvalidError):
        adapters.get_adapter("anthropic")
