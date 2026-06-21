"""external-api 版本注册(a5,SCOPE-1):来源派发必填集。"""
from .helpers import CHAT_SCHEMA, make_model, make_version


async def test_create_external_version_minimal(client):
    mid = await make_model(client, input_schema=CHAT_SCHEMA, output_schema={})
    r = await client.post(
        f"/models/{mid}/versions",
        json={
            "version": "v1",
            "source": "external-api",
            "provider": "openai",
            "base_url": "http://up/v1",
            "upstream_model": "gpt-4o-mini",
            "protocol": "openai",
        },
    )
    assert r.status_code == 201, r.text  # 仅带上游字段(无 file_path/framework)即成功
    body = r.json()
    assert body["source"] == "external-api"
    assert body["file_path"] is None and body["framework"] is None
    assert body["base_url"] == "http://up/v1" and body["upstream_model"] == "gpt-4o-mini"


async def test_external_version_missing_upstream_422(client):
    mid = await make_model(client, input_schema=CHAT_SCHEMA, output_schema={})
    r = await client.post(
        f"/models/{mid}/versions",
        json={"version": "v1", "source": "external-api", "provider": "openai"},  # 缺 base_url/upstream_model
    )
    assert r.status_code == 422, r.text


async def test_mock_version_requires_file_path_422(client):
    mid = await make_model(client)
    r = await client.post(
        f"/models/{mid}/versions", json={"version": "v1", "source": "mock"}  # 缺 file_path/framework
    )
    assert r.status_code == 422, r.text


async def test_mock_version_unchanged(client):
    # 既有 mock 版本创建路径不变(回归)。
    mid = await make_model(client)
    vid = await make_version(client, mid)
    r = await client.get(f"/versions/{vid}")
    assert r.json()["source"] == "mock"
    assert r.json()["file_path"] == "/mock/v1.onnx"
