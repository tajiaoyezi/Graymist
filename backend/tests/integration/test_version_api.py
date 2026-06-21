"""BDD: 版本上传 / 框架枚举 / 版本状态机 / 仅 ready 可部署 / 指标写入
（对应 spec 需求「版本上传与管理」「框架枚举」「版本状态机」「版本间指标对比」）。
"""
from .helpers import make_model, make_version, version_payload


class TestCreateVersion:
    async def test_create_defaults_to_draft(self, client):
        # WHEN 在模型下新建版本 THEN 初始 draft、归属该模型
        mid = await make_model(client)
        r = await client.post(f"/models/{mid}/versions", json=version_payload())
        assert r.status_code == 201, r.text
        b = r.json()
        assert b["status"] == "draft"
        assert b["model_id"] == mid

    async def test_invalid_framework_rejected(self, client):
        # WHEN framework="Caffe" THEN 422
        mid = await make_model(client)
        r = await client.post(f"/models/{mid}/versions", json=version_payload(framework="Caffe"))
        assert r.status_code == 422

    async def test_multiple_versions_under_one_model(self, client):
        mid = await make_model(client)
        await make_version(client, mid, version="v1")
        await make_version(client, mid, version="v2")
        r = await client.get(f"/models/{mid}/versions")
        assert r.status_code == 200
        assert sorted(v["version"] for v in r.json()) == ["v1", "v2"]

    async def test_create_with_optional_metrics(self, client):
        # WHEN 创建版本时选填性能指标 THEN 随版本落库并可在对比表读到
        mid = await make_model(client)
        r = await client.post(
            f"/models/{mid}/versions",
            json={
                **version_payload(),
                "metrics": {"accuracy": 0.88, "latency": 30, "throughput": 200},
            },
        )
        assert r.status_code == 201, r.text
        assert r.json()["metrics"] == {
            "accuracy": 0.88,
            "latency": 30,
            "throughput": 200,
        }
        cmp = (await client.get(f"/models/{mid}/versions/compare")).json()
        assert cmp[0]["metrics"]["accuracy"] == 0.88

    async def test_create_without_metrics_stays_null(self, client):
        # WHEN 创建版本不带 metrics THEN metrics 为 null(保持原行为)
        mid = await make_model(client)
        r = await client.post(f"/models/{mid}/versions", json=version_payload())
        assert r.json()["metrics"] is None


class TestVersionStateMachine:
    async def test_valid_forward_transition(self, client):
        # WHEN draft 推进 THEN validating
        mid = await make_model(client)
        vid = await make_version(client, mid)
        r = await client.post(f"/versions/{vid}/transition", json={"target": "validating"})
        assert r.status_code == 200
        assert r.json()["status"] == "validating"

    async def test_skip_level_transition_rejected(self, client):
        # WHEN draft 直接置 ready（跨级）THEN 409
        mid = await make_model(client)
        vid = await make_version(client, mid)
        r = await client.post(f"/versions/{vid}/transition", json={"target": "ready"})
        assert r.status_code == 409


class TestDeployable:
    async def test_only_ready_is_deployable(self, client):
        # WHEN 查询是否可部署 THEN 仅 ready 为 True
        mid = await make_model(client)
        vid = await make_version(client, mid)
        assert (await client.get(f"/versions/{vid}")).json()["deployable"] is False
        for target in ("validating", "ready"):
            await client.post(f"/versions/{vid}/transition", json={"target": target})
        assert (await client.get(f"/versions/{vid}")).json()["deployable"] is True


class TestMetrics:
    async def test_write_and_read_metrics(self, client):
        # 指标由「测试时写入」（原需求 2.1）
        mid = await make_model(client)
        vid = await make_version(client, mid)
        r = await client.put(
            f"/versions/{vid}/metrics",
            json={"accuracy": 0.9, "latency": 120, "throughput": 50},
        )
        assert r.status_code == 200
        assert r.json()["metrics"]["accuracy"] == 0.9
