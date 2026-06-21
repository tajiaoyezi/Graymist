"""Anthropic 兼容南向适配器（a6,§21）。

canonical chat ↔ Anthropic `/messages` wire。与 OpenAI 的差异(§21):system 走顶层独立字段、
`max_tokens` 必填(canonical 未给时用默认兜底)、响应 `content` 是 block 数组(过滤 `type=="text"`
拼接,首块不保证是 text,不照搬 OpenAI 的 `[0]` 索引)、usage 原生即 input/output_tokens。
鉴权头为 `x-api-key`(+ 常量 `anthropic-version` 头,属 wire 形状由 build_request 携带)。
"""
from app.inference.canonical import (
    CanonicalChatRequest,
    CanonicalChatResult,
    CanonicalUsage,
)
from app.inference.errors import UpstreamError

# Anthropic `max_tokens` 必填;canonical 未给时的安全兜底(1024 偏低、易静默截断)。
DEFAULT_MAX_TOKENS = 4096
ANTHROPIC_VERSION = "2023-06-01"


class AnthropicAdapter:
    def build_request(
        self, req: CanonicalChatRequest, *, upstream_model: str
    ) -> tuple[str, dict, dict]:
        body: dict = {
            "model": upstream_model,
            "messages": req.messages,
            # 必填:canonical 未给 → 默认兜底,避免真上游 400。
            "max_tokens": req.max_tokens if req.max_tokens is not None else DEFAULT_MAX_TOKENS,
        }
        if req.system:
            body["system"] = req.system  # 顶层独立字段(非 role:system message)
        if req.temperature is not None:
            body["temperature"] = req.temperature
        return "/messages", body, {"anthropic-version": ANTHROPIC_VERSION}

    def parse_response(self, status: int, body: dict) -> CanonicalChatResult:
        try:
            blocks = body["content"]
            finish = body.get("stop_reason")
        except (KeyError, TypeError) as exc:
            # 2xx 但响应体不可解析 = 上游故障(502 由 main.py 统一映射)。
            raise UpstreamError("上游响应体不可解析") from exc
        if not isinstance(blocks, list):
            raise UpstreamError("上游响应体不可解析")
        # content 是 block 数组,首块可能是 thinking 等非 text;过滤 type==text 拼接。
        text = "".join(
            b.get("text", "")
            for b in blocks
            if isinstance(b, dict) and b.get("type") == "text"
        )
        if not text:
            raise UpstreamError("上游响应无 text block")
        u = body.get("usage") or {}
        input_tokens = int(u.get("input_tokens", 0) or 0)
        output_tokens = int(u.get("output_tokens", 0) or 0)
        # Anthropic 原生无 total_tokens → input+output 兜底。
        total = int(u.get("total_tokens", 0) or 0) or (input_tokens + output_tokens)
        usage = CanonicalUsage(
            input_tokens=input_tokens,
            output_tokens=output_tokens,
            total_tokens=total,
        )
        return CanonicalChatResult(
            content=text, finish_reason=finish, usage=usage, raw=body
        )

    def auth_headers(self, key: str) -> dict:
        return {"x-api-key": key}
