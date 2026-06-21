"""canonical 内核单测(a5):system 提升、usage 归一、chat 形状判定。"""
from app.inference import canonical


def test_parse_lifts_leading_system_message():
    req = canonical.parse_to_canonical(
        {
            "messages": [
                {"role": "system", "content": "你是助手"},
                {"role": "user", "content": "hi"},
            ],
            "max_tokens": 128,
        }
    )
    assert req.system == "你是助手"
    assert req.messages == [{"role": "user", "content": "hi"}]  # system 已被提走
    assert req.max_tokens == 128


def test_parse_keeps_top_level_system_when_no_system_message():
    req = canonical.parse_to_canonical(
        {"system": "顶层", "messages": [{"role": "user", "content": "x"}]}
    )
    assert req.system == "顶层"
    assert len(req.messages) == 1


def test_is_chat_like():
    assert canonical.is_chat_like({"messages": [{"role": "user", "content": "x"}]}) is True
    assert canonical.is_chat_like({"messages": []}) is False
    assert canonical.is_chat_like({"text": "x"}) is False
    assert canonical.is_chat_like("plain") is False
    assert canonical.is_chat_like(None) is False
    # messages 非空但元素非 dict → 必须判 False(否则 parse_to_canonical 会崩,绕过 422 前置门)
    assert canonical.is_chat_like({"messages": [42]}) is False
    assert canonical.is_chat_like({"messages": [None]}) is False
    assert canonical.is_chat_like({"messages": [["a", "b"]]}) is False
