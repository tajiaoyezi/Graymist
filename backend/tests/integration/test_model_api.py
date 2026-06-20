"""BDD: 模型 CRUD / 任务类型枚举 / Schema 一等公民 / 列表筛选搜索
（对应 spec 需求「模型 CRUD」「任务类型枚举」「输入输出 Schema 是一等公民」
「模型仓库列表页」的后端契约）。
"""
from .helpers import make_version, model_payload


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


class TestModelCardFields:
    """§2.5 仓库列表卡片:版本数 + 最新版本状态点的后端契约。"""

    async def test_no_versions_returns_zero_and_none(self, client):
        # WHEN 模型尚无版本 THEN version_count=0、latest_version_status=None
        mid = (await client.post("/models", json=model_payload())).json()["id"]
        m = (await client.get(f"/models/{mid}")).json()
        assert m["version_count"] == 0
        assert m["latest_version_status"] is None

    async def test_count_and_latest_status(self, client):
        # WHEN 模型有多个版本、最新版本推进到 validating
        # THEN 列表返回版本数与最新(created_at 最大)版本的状态
        mid = (await client.post("/models", json=model_payload())).json()["id"]
        await make_version(client, mid, version="v1")
        v2 = await make_version(client, mid, version="v2")
        await client.post(f"/versions/{v2}/transition", json={"target": "validating"})
        m = next(x for x in (await client.get("/models")).json() if x["id"] == mid)
        assert m["version_count"] == 2
        assert m["latest_version_status"] == "validating"
