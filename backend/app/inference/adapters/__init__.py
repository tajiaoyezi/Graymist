"""南向协议适配器（a5,§21）。

canonical ↔ 上游 wire 双向转换。适配器接口设计为可加挂——a5 仅 OpenAI 兼容;
后续 Anthropic 等为纯新增(新增一个适配器 + 一行注册),不改 canonical 内核(N+M 非 N×M)。
"""
from typing import Protocol

from app.inference.canonical import CanonicalChatRequest, CanonicalChatResult
from app.inference.errors import InferenceInputInvalidError


class SouthboundAdapter(Protocol):
    def build_request(
        self, req: CanonicalChatRequest, *, upstream_model: str
    ) -> tuple[str, dict, dict]:
        """canonical → (上游 path, json body, headers)。"""
        ...

    def parse_response(self, status: int, body: dict) -> CanonicalChatResult:
        """上游响应 → canonical(含 usage 归一化)。"""
        ...


def get_adapter(protocol: str | None) -> SouthboundAdapter:
    if protocol in (None, "", "openai"):
        from app.inference.adapters.openai import OpenAIAdapter

        return OpenAIAdapter()
    # 非 openai 在 a5 未支持(Anthropic = 下一个 change 的纯 add-on)。
    raise InferenceInputInvalidError(f"南向协议未支持: {protocol}")
