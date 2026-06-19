"""BDD: 版本间指标对比（对应 spec 需求「版本间指标对比」）。"""
from .helpers import make_model, make_version


class TestComparison:
    async def test_compare_returns_metrics_per_version(self, client):
        # WHEN 请求对比同模型下 v1/v2 THEN 返回各版本 准确率/延迟/吞吐
        mid = await make_model(client)
        v1 = await make_version(client, mid, version="v1")
        v2 = await make_version(client, mid, version="v2")
        await client.put(f"/versions/{v1}/metrics", json={"accuracy": 0.8, "latency": 100, "throughput": 40})
        await client.put(f"/versions/{v2}/metrics", json={"accuracy": 0.9, "latency": 120, "throughput": 50})

        r = await client.get(f"/models/{mid}/versions/compare")
        assert r.status_code == 200
        data = {d["version"]: d["metrics"] for d in r.json()}
        assert data["v1"]["accuracy"] == 0.8
        assert data["v2"]["accuracy"] == 0.9
