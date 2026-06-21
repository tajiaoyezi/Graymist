"""canonical 内核（a5,§11 1.1-c / §21）：协议无关的统一 chat 表示 + 统一 usage。

执行层的 Schema/chat 校验、A/B、日志、指标都在 canonical 层;南向适配器在 canonical 与
具体上游 wire 格式之间双向转换(N+M)。usage 内部归一为 input/output_tokens(Anthropic 风),
日志列用 prompt/completion_tokens(OpenAI 风),映射各一处集中。纯逻辑、无 I/O。
"""
from dataclasses import dataclass, field
from typing import Any


@dataclass
class CanonicalUsage:
    input_tokens: int = 0
    output_tokens: int = 0
    total_tokens: int = 0


@dataclass
class CanonicalChatRequest:
    messages: list[dict] = field(default_factory=list)  # [{role, content}]
    system: str | None = None
    max_tokens: int | None = None
    temperature: float | None = None


@dataclass
class CanonicalChatResult:
    content: str
    finish_reason: str | None
    usage: CanonicalUsage
    raw: dict


def is_chat_like(payload: Any) -> bool:
    """external-api 输入校验:是否为合法 chat 形状(非空 messages 列表、且每条均为 dict)。

    元素须为 dict —— 否则 parse_to_canonical 的 dict(m)/m.get(...) 会抛错,届时已过 422
    前置门、占了并发槽,违反「非 chat 形状 MUST 422、不占额度」契约,故在此一并拦下。
    """
    return (
        isinstance(payload, dict)
        and isinstance(payload.get("messages"), list)
        and len(payload["messages"]) > 0
        and all(isinstance(m, dict) for m in payload["messages"])
    )


def parse_to_canonical(payload: dict) -> CanonicalChatRequest:
    """把 OpenAI 风格 body 解析进 canonical;首条 role:system 提到顶层 system 字段
    (已为 Anthropic「顶层 system」铺好,§21)。"""
    messages = [dict(m) for m in (payload.get("messages") or [])]
    system = payload.get("system")
    if messages and messages[0].get("role") == "system":
        system = messages[0].get("content")
        messages = messages[1:]
    return CanonicalChatRequest(
        messages=messages,
        system=system,
        max_tokens=payload.get("max_tokens"),
        temperature=payload.get("temperature"),
    )
