"""BDD: 审查 H1（PATCH Schema 校验）+ H2（删除模型连带删除版本）补盲区。"""
from .helpers import (
    endpoint_payload,
    make_model,
    make_ready_version,
    make_version,
    model_payload,
)


class TestUpdateSchemaValidation:
    async def test_patch_invalid_schema_rejected(self, client):
        # H1：spec「Schema 一等公民」—— update 也是保存路径，非法 Schema 必须 422
        cid = (await client.post("/models", json=model_payload())).json()["id"]
        r = await client.patch(
            f"/models/{cid}", json={"input_schema": {"type": "not-a-real-type"}}
        )
        assert r.status_code == 422

    async def test_patch_valid_schema_persisted(self, client):
        cid = (await client.post("/models", json=model_payload())).json()["id"]
        new_schema = {"type": "object", "properties": {"q": {"type": "string"}}}
        r = await client.patch(f"/models/{cid}", json={"input_schema": new_schema})
        assert r.status_code == 200
        assert r.json()["input_schema"] == new_schema

    async def test_patch_empty_name_rejected(self, client):
        # 与创建对齐:更新 name 同样不可为空(min_length=1 → 422),前端兜底之外补后端守卫
        cid = (await client.post("/models", json=model_payload())).json()["id"]
        r = await client.patch(f"/models/{cid}", json={"name": ""})
        assert r.status_code == 422


class TestDeleteCascade:
    async def test_delete_model_removes_its_versions(self, client):
        # H2：spec「删除模型」THEN 模型及其版本都不再出现
        mid = (await client.post("/models", json=model_payload())).json()["id"]
        await make_version(client, mid, version="v1")
        await make_version(client, mid, version="v2")
        assert len((await client.get(f"/models/{mid}/versions")).json()) == 2

        assert (await client.delete(f"/models/{mid}")).status_code == 204
        assert (await client.get(f"/models/{mid}")).status_code == 404
        # 版本随模型消失（不再可达）
        assert (await client.get(f"/models/{mid}/versions")).status_code == 404


class TestDeleteGuard:
    async def test_delete_blocked_when_endpoint_bound(self, endpoint_client):
        # spec「删除被端点绑定的模型被拒绝」—— 避免孤儿化端点绑定，返回 409
        c = endpoint_client.client
        mid = await make_model(c)
        vid = await make_ready_version(c, mid)
        ep = await c.post(
            "/endpoints",
            json=endpoint_payload([{"model_version_id": vid, "weight": 100}]),
        )
        assert ep.status_code == 201, ep.text

        r = await c.delete(f"/models/{mid}")
        assert r.status_code == 409
        # 409 文案点名冲突端点(省去用户去管控台逐个翻);默认端点名 ep-demo
        assert "ep-demo" in r.json()["detail"]
        # 模型与版本保持不变
        assert (await c.get(f"/models/{mid}")).status_code == 200
        assert len((await c.get(f"/models/{mid}/versions")).json()) == 1

    async def test_delete_allowed_after_rebinding_away(self, endpoint_client):
        # 守卫只看绑定是否存在：把端点改绑到另一模型的版本后，原模型即可删除
        c = endpoint_client.client
        m1 = await make_model(c)
        v1 = await make_ready_version(c, m1)
        m2 = await make_model(c, name="另一个模型")
        v2 = await make_ready_version(c, m2)
        ep = await c.post(
            "/endpoints",
            json=endpoint_payload([{"model_version_id": v1, "weight": 100}]),
        )
        eid = ep.json()["id"]
        assert (await c.delete(f"/models/{m1}")).status_code == 409  # 绑定中→拒绝

        # 改绑到 m2 的版本 → m1 不再被绑定 → 可删除
        patched = await c.patch(
            f"/endpoints/{eid}",
            json={"bindings": [{"model_version_id": v2, "weight": 100}]},
        )
        assert patched.status_code == 200, patched.text
        assert (await c.delete(f"/models/{m1}")).status_code == 204
        # 级联确认:m1 与其版本 v1 确实消失(后置断言,非仅状态码)
        assert (await c.get(f"/models/{m1}")).status_code == 404
        assert (await c.get(f"/models/{m1}/versions")).status_code == 404

    async def test_delete_unknown_model_404(self, client):
        # get-before-guard 顺序:未知 id 先命中存在性检查 → 404(而非 409/500)
        assert (await client.delete("/models/does-not-exist")).status_code == 404
