"""BDD: 审查补盲区 —— version 资源 404 路径、model 作用域隔离、metrics 三字段持久化。"""
from .helpers import make_model, make_version


class TestVersionNotFound:
    async def test_get_unknown_version_404(self, client):
        assert (await client.get("/versions/nope")).status_code == 404

    async def test_transition_unknown_version_404(self, client):
        r = await client.post(
            "/versions/nope/transition", json={"target": "validating"}
        )
        assert r.status_code == 404

    async def test_metrics_unknown_version_404(self, client):
        r = await client.put("/versions/nope/metrics", json={"accuracy": 1})
        assert r.status_code == 404


class TestModelScopeIsolation:
    async def test_versions_and_compare_scoped_to_model(self, client):
        # 删掉 list_by_model 的 .where(model_id==) 会让此测试失败（跨模型串台）
        m1 = await make_model(client, name="m1")
        m2 = await make_model(client, name="m2")
        await make_version(client, m1, version="a1")
        await make_version(client, m2, version="b1")

        v1 = [v["version"] for v in (await client.get(f"/models/{m1}/versions")).json()]
        assert v1 == ["a1"]
        cmp1 = [
            c["version"]
            for c in (await client.get(f"/models/{m1}/versions/compare")).json()
        ]
        assert cmp1 == ["a1"]


class TestMetricsAllFields:
    async def test_metrics_persists_all_three_fields(self, client):
        mid = await make_model(client)
        vid = await make_version(client, mid)
        await client.put(
            f"/versions/{vid}/metrics",
            json={"accuracy": 0.8, "latency": 120, "throughput": 50},
        )
        m = (await client.get(f"/versions/{vid}")).json()["metrics"]
        assert m["accuracy"] == 0.8
        assert m["latency"] == 120
        assert m["throughput"] == 50
