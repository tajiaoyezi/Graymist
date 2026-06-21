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

    def auth_headers(self, key: str) -> dict:
        """凭证 key → 协议特定鉴权头(OpenAI: `Authorization: Bearer`;Anthropic: `x-api-key`)。"""
        ...


def get_adapter(protocol: str | None) -> SouthboundAdapter:
    if protocol in (None, "", "openai"):
        from app.inference.adapters.openai import OpenAIAdapter

        return OpenAIAdapter()
    if protocol == "anthropic":
        from app.inference.adapters.anthropic import AnthropicAdapter

        return AnthropicAdapter()
    # 受支持集合 = {openai, anthropic}(a6);其余未支持。
    raise InferenceInputInvalidError(f"南向协议未支持: {protocol}")
