"""external-api 真实数据流执行（a5,1.1-d）。

parse_to_canonical → 南向适配器 build_request → httpx 转发上游 → parse_response;
量真实墙钟延迟、归一 usage。超时由调用方(_run_core)以 asyncio.wait_for(timeout_ms) 包裹;
上游非 2xx / 不可解析 → UpstreamError(502)。auth_ref 在 mock 上游下不解析真密钥(无 key 可跑)。
"""
import os
import time

from app.config import settings
from app.db.tables import ModelVersionRow
from app.inference import adapters, canonical, http_client
from app.inference.canonical import CanonicalUsage


def _auth_headers(version_row: ModelVersionRow, headers: dict) -> dict:
    # mock 上游无需真 key;接真上游时从 auth_ref 指向的环境变量取密钥。
    if settings.upstream_mock or not version_row.auth_ref:
        return headers
    key = os.environ.get(version_row.auth_ref)
    if key:
        return {**headers, "Authorization": f"Bearer {key}"}
    return headers


async def run(version_row: ModelVersionRow, input_data) -> tuple[str, int, CanonicalUsage]:
    """转发上游并返回 (content, latency_ms, usage)。

    入参 input_data 须为 chat 形状(校验已前置于 service)。超时不在此处理——由 _run_core
    用 asyncio.wait_for 包裹本协程,超时 → asyncio.TimeoutError。
    """
    req = canonical.parse_to_canonical(input_data)
    adapter = adapters.get_adapter(version_row.protocol)
    path, body, headers = adapter.build_request(req, upstream_model=version_row.upstream_model)
    headers = _auth_headers(version_row, headers)
    start = time.monotonic()
    status, resp_body = await http_client.post_upstream(version_row.base_url, path, body, headers)
    latency_ms = round((time.monotonic() - start) * 1000)
    if status >= 400:
        from app.inference.errors import UpstreamError

        raise UpstreamError(f"上游返回 {status}")
    result = adapter.parse_response(status, resp_body)
    return result.content, latency_ms, result.usage
