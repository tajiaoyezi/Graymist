"""BDD: 模型 CRUD / 任务类型枚举 / Schema 一等公民 / 列表筛选搜索
（对应 spec 需求「模型 CRUD」「任务类型枚举」「输入输出 Schema 是一等公民」
「模型仓库列表页」的后端契约）。
"""
from .helpers import model_payload


class TestCreateModel:
    async def test_create_with_all_required(self, client):
        # WHEN 提交全部必填字段 THEN 创建成功并返回 id/created_at
        r = await client.post("/models", json=model_payload())
        assert r.status_code == 201, r.text
        body = r.json()
        assert body["id"]
        assert body["created_at"]
        assert body["task_type"] == "classification"

    async def test_missing_required_rejected(self, client):
        # WHEN 缺少必填字段 THEN 422
        r = await client.post("/models", json={"name": "x"})
        assert r.status_code == 422

    async def test_invalid_task_type_rejected(self, client):
        # WHEN task_type="foo" THEN 422
        r = await client.post("/models", json=model_payload(task_type="foo"))
        assert r.status_code == 422

    async def test_invalid_input_schema_rejected(self, client):
        # WHEN input_schema 非合法 JSON Schema THEN 422
        r = await client.post(
            "/models", json=model_payload(input_schema={"type": "not-a-real-type"})
        )
        assert r.status_code == 422


class TestListModels:
    async def test_filter_by_task_type(self, client):
        await client.post("/models", json=model_payload(name="alpha", task_type="classification"))
        await client.post("/models", json=model_payload(name="beta", task_type="embedding"))
        # WHEN 按 task_type=embedding 筛选 THEN 只返回 embedding
        r = await client.get("/models", params={"task_type": "embedding"})
        assert r.status_code == 200
        assert [m["name"] for m in r.json()] == ["beta"]

    async def test_search_by_name(self, client):
        await client.post("/models", json=model_payload(name="alpha classifier"))
        await client.post("/models", json=model_payload(name="beta embedder"))
        # WHEN 搜索关键字 alpha THEN 只返回名称匹配的
        r = await client.get("/models", params={"q": "alpha"})
        assert r.status_code == 200
        assert [m["name"] for m in r.json()] == ["alpha classifier"]


class TestModelDetailUpdateDelete:
    async def test_get_update_delete(self, client):
        cid = (await client.post("/models", json=model_payload())).json()["id"]
        assert (await client.get(f"/models/{cid}")).status_code == 200

        r = await client.patch(f"/models/{cid}", json={"description": "updated"})
        assert r.status_code == 200
        assert r.json()["description"] == "updated"

        # WHEN 删除模型 THEN 不再可见
        assert (await client.delete(f"/models/{cid}")).status_code == 204
        assert (await client.get(f"/models/{cid}")).status_code == 404

    async def test_get_missing_returns_404(self, client):
        assert (await client.get("/models/does-not-exist")).status_code == 404
