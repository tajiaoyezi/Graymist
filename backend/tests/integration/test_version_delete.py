"""BDD: version-delete —— 删除单版本 + 端点绑定守卫(避免孤儿化绑定)。"""
from .helpers import endpoint_payload, make_model, make_ready_version, make_version


class TestVersionDelete:
    async def test_delete_unbound_version(self, client):
        # 未被端点绑定 → 204,删除后不可达,且从模型版本列表消失
        mid = await make_model(client)
        vid = await make_version(client, mid, version="v1")
        assert (await client.delete(f"/versions/{vid}")).status_code == 204
        assert (await client.get(f"/versions/{vid}")).status_code == 404
        assert (await client.get(f"/models/{mid}/versions")).json() == []

    async def test_delete_unknown_version_404(self, client):
        assert (await client.delete("/versions/does-not-exist")).status_code == 404

    async def test_delete_bound_version_blocked(self, endpoint_client):
        # 被端点绑定 → 409 且点名端点,版本保持不变
        c = endpoint_client.client
        mid = await make_model(c)
        vid = await make_ready_version(c, mid)
        ep = await c.post(
            "/endpoints", json=endpoint_payload([{"model_version_id": vid, "weight": 100}])
        )
        assert ep.status_code == 201, ep.text
        r = await c.delete(f"/versions/{vid}")
        assert r.status_code == 409
        assert "ep-demo" in r.json()["detail"]  # 默认端点名
        assert (await c.get(f"/versions/{vid}")).status_code == 200

    async def test_delete_after_rebind_away(self, endpoint_client):
        # 把端点改绑到另一模型的版本后,原版本即可删除
        c = endpoint_client.client
        m1 = await make_model(c)
        v1 = await make_ready_version(c, m1)
        m2 = await make_model(c, name="另一个模型")
        v2 = await make_ready_version(c, m2)
        ep = await c.post(
            "/endpoints", json=endpoint_payload([{"model_version_id": v1, "weight": 100}])
        )
        eid = ep.json()["id"]
        assert (await c.delete(f"/versions/{v1}")).status_code == 409  # 绑定中→拒绝
        patched = await c.patch(
            f"/endpoints/{eid}",
            json={"bindings": [{"model_version_id": v2, "weight": 100}]},
        )
        assert patched.status_code == 200, patched.text
        assert (await c.delete(f"/versions/{v1}")).status_code == 204
