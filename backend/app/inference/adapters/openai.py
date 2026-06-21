"""OpenAI 兼容南向适配器（a5,§21）。

canonical chat ↔ OpenAI `/chat/completions` wire。usage 由 OpenAI 的
prompt/completion_tokens 归一为 canonical 的 input/output_tokens。
"""
from app.inference.canonical import (
    CanonicalChatRequest,
    CanonicalChatResult,
    CanonicalUsage,
)
from app.inference.errors import UpstreamError


class OpenAIAdapter:
    def build_request(
        self, req: CanonicalChatRequest, *, upstream_model: str
    ) -> tuple[str, dict, dict]:
        messages: list[dict] = []
        if req.system:
            messages.append({"role": "system", "content": req.system})
        messages.extend(req.messages)
        body: dict = {"model": upstream_model, "messages": messages}
        if req.max_tokens is not None:
            body["max_tokens"] = req.max_tokens
        if req.temperature is not None:
            body["temperature"] = req.temperature
        return "/chat/completions", body, {}

    def parse_response(self, status: int, body: dict) -> CanonicalChatResult:
        try:
            choice = body["choices"][0]
            content = choice["message"]["content"]
            finish = choice.get("finish_reason")
        except (KeyError, IndexError, TypeError) as exc:
            # 2xx 但响应体不可解析 = 上游故障(502)。
            raise UpstreamError("上游响应体不可解析") from exc
        u = body.get("usage") or {}
        usage = CanonicalUsage(
            input_tokens=int(u.get("prompt_tokens", 0) or 0),
            output_tokens=int(u.get("completion_tokens", 0) or 0),
            total_tokens=int(u.get("total_tokens", 0) or 0),
        )
        return CanonicalChatResult(
            content=content, finish_reason=finish, usage=usage, raw=body
        )

    def auth_headers(self, key: str) -> dict:
        return {"Authorization": f"Bearer {key}"}
