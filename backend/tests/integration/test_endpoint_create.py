"""端点创建与部署配置(a2 · 集成)。BDD: WHEN/THEN 对应 spec 场景。"""
from .helpers import endpoint_payload, make_model, make_ready_version


async def test_create_endpoint_returns_creating(endpoint_client):
    ep = endpoint_client
    model_id = await make_model(ep.client)
    vid = await make_ready_version(ep.client, model_id)
    r = await ep.client.post(
        "/endpoints", json=endpoint_payload([{"model_version_id": vid, "weight": 100}])
    )
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["status"] == "creating"
    assert body["url_path"] == "/ep/demo"
    assert body["bindings"][0]["weight"] == 100


async def test_missing_required_config_rejected(endpoint_client):
    ep = endpoint_client
    model_id = await make_model(ep.client)
    vid = await make_ready_version(ep.client, model_id)
    payload = endpoint_payload([{"model_version_id": vid, "weight": 100}])
    del payload["replicas"]
    r = await ep.client.post("/endpoints", json=payload)
    assert r.status_code == 422, r.text


async def test_empty_bindings_rejected(endpoint_client):
    ep = endpoint_client
    await make_model(ep.client)
    r = await ep.client.post("/endpoints", json=endpoint_payload([]))
    assert r.status_code in (400, 422), r.text


async def test_binding_nonexistent_version_rejected(endpoint_client):
    ep = endpoint_client
    await make_model(ep.client)
    r = await ep.client.post(
        "/endpoints",
        json=endpoint_payload([{"model_version_id": "doesnotexist", "weight": 100}]),
    )
    assert r.status_code == 422, r.text


async def test_duplicate_url_path_conflict(endpoint_client):
    ep = endpoint_client
    model_id = await make_model(ep.client)
    vid = await make_ready_version(ep.client, model_id)
    binding = [{"model_version_id": vid, "weight": 100}]
    r1 = await ep.client.post("/endpoints", json=endpoint_payload(binding, url_path="/ep/dup"))
    assert r1.status_code == 201, r1.text
    r2 = await ep.client.post(
        "/endpoints", json=endpoint_payload(binding, name="other", url_path="/ep/dup")
    )
    assert r2.status_code == 409, r2.text
