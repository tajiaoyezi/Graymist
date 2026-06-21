"""external-api 配额跳过 + 单一来源守卫(a5,D4)。"""
from .helpers import (
    CHAT_SCHEMA,
    endpoint_payload,
    make_external_ready_version,
    make_model,
    make_ready_version,
)

# 默认平台总配额 cpu=32;下面的请求量远超之,用于验证 external 跳过、mock 被拒。
HUGE = {"cpu": 9999, "memory": 9999999, "gpu": 9999}


async def test_external_endpoint_skips_quota_and_not_counted(infer_client):
    c = infer_client
    mid = await make_model(c.client, input_schema=CHAT_SCHEMA, output_schema={})
    vid = await make_external_ready_version(c.client, mid)
    r = await c.client.post(
        "/endpoints",
        json=endpoint_payload(
            [{"model_version_id": vid, "weight": 100}],
            url_path="/chat/q",
            replicas=10,
            resource_quota=HUGE,
        ),
    )
    assert r.status_code == 201, r.text  # 远超配额但 external 跳过
    await c.drain()  # → running
    q = (await c.client.get("/quota")).json()
    assert q["used"]["cpu"] == 0  # external 占用恒计 0
    assert q["remaining"]["cpu"] == q["total"]["cpu"]  # 剩余不因其减少


async def test_mock_over_budget_still_409(infer_client):
    # 回归守卫:mock 端点仍受 §4.2 配额约束。
    c = infer_client
    mid = await make_model(c.client)
    vid = await make_ready_version(c.client, mid)
    r = await c.client.post(
        "/endpoints",
        json=endpoint_payload(
            [{"model_version_id": vid, "weight": 100}], replicas=1, resource_quota=HUGE
        ),
    )
    assert r.status_code == 409, r.text


async def test_mixed_source_binding_422(infer_client):
    # 单一来源守卫:同模型下混绑 mock + external → 422。
    c = infer_client
    mid = await make_model(c.client, input_schema=CHAT_SCHEMA, output_schema={})
    v_mock = await make_ready_version(c.client, mid, version="vmock")
    v_ext = await make_external_ready_version(c.client, mid, version="vext")
    r = await c.client.post(
        "/endpoints",
        json=endpoint_payload(
            [
                {"model_version_id": v_mock, "weight": 50},
                {"model_version_id": v_ext, "weight": 50},
            ]
        ),
    )
    assert r.status_code == 422, r.text
