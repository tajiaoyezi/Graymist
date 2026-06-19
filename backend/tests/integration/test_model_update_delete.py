"""BDD: 审查 H1（PATCH Schema 校验）+ H2（删除模型连带删除版本）补盲区。"""
from .helpers import make_version, model_payload


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
