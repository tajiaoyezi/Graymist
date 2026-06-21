"""external-api 真实数据流执行（a5,1.1-d）。

parse_to_canonical → 南向适配器 build_request → httpx 转发上游 → parse_response;
量真实墙钟延迟、归一 usage。超时由调用方(_run_core)以 asyncio.wait_for(timeout_ms) 包裹;
上游非 2xx / 不可解析 → UpstreamError(502)。auth_ref 在 mock 上游下不解析真密钥(无 key 可跑)。
"""
import logging
import os
import time

from app.common import crypto
from app.config import settings
from app.db.tables import ModelVersionRow
from app.inference import adapters, canonical, http_client
from app.inference.canonical import CanonicalUsage

logger = logging.getLogger("graymist.inference")


def _resolve_key(version_row: ModelVersionRow) -> str | None:
    # a7 优先级:平台内加密存储的 key(解密)> auth_ref 指向的环境变量 > 无。
    if version_row.auth_secret_enc:
        try:
            return crypto.decrypt_secret(version_row.auth_secret_enc)
        except Exception:
            # 解密失败(主密钥丢失/被换)→ 不注入(请求照发,上游 401 使问题可见),不崩 500。
            logger.warning("上游凭证解密失败,跳过注入: version=%s", version_row.id)
    if version_row.auth_ref:
        return os.environ.get(version_row.auth_ref)
    return None


def _auth_headers(version_row: ModelVersionRow, headers: dict, adapter) -> dict:
    # mock 上游无需真 key;真上游时按优先级解析密钥,按协议(适配器)注入。
    if settings.upstream_mock:
        return headers
    key = _resolve_key(version_row)
    if not key:
        return headers  # 无可用密钥 → 不注入(避免脏头;请求照发)
    return {**headers, **adapter.auth_headers(key)}


async def run(version_row: ModelVersionRow, input_data) -> tuple[str, int, CanonicalUsage]:
    """转发上游并返回 (content, latency_ms, usage)。

    入参 input_data 须为 chat 形状(校验已前置于 service)。超时不在此处理——由 _run_core
    用 asyncio.wait_for 包裹本协程,超时 → asyncio.TimeoutError。
    """
    req = canonical.parse_to_canonical(input_data)
    adapter = adapters.get_adapter(version_row.protocol)
    path, body, headers = adapter.build_request(req, upstream_model=version_row.upstream_model)
    headers = _auth_headers(version_row, headers, adapter)
    start = time.monotonic()
    status, resp_body = await http_client.post_upstream(version_row.base_url, path, body, headers)
    latency_ms = round((time.monotonic() - start) * 1000)
    if status >= 400:
        from app.inference.errors import UpstreamError

        raise UpstreamError(f"上游返回 {status}")
    result = adapter.parse_response(status, resp_body)
    return result.content, latency_ms, result.usage
