"""BDD: 健壮性 —— 请求体大小上限 + Schema 复杂度上限（审查 M2，DoS 面）。"""
from .helpers import model_payload


class TestRequestBodyLimit:
    async def test_oversized_body_rejected_413(self, client):
        # WHEN 请求体超过上限 THEN 413（中间件早拦，不进路由）
        big = "x" * (1024 * 1024 + 4096)  # > 1MB
        r = await client.post("/models", json=model_payload(description=big))
        assert r.status_code == 413


class TestSchemaComplexityLimit:
    async def test_deeply_nested_schema_rejected_422(self, client):
        # WHEN 提交超深嵌套（体积很小但深度超限）的 Schema THEN 422
        schema: dict = {"type": "object"}
        node = schema
        for _ in range(45):
            child: dict = {"type": "object"}
            node["properties"] = {"x": child}
            node = child
        r = await client.post("/models", json=model_payload(input_schema=schema))
        assert r.status_code == 422

    async def test_normal_schema_still_ok(self, client):
        # 正常浅 Schema 不受影响
        r = await client.post("/models", json=model_payload())
        assert r.status_code == 201
