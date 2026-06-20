"""推理执行核心单元测试(a3):A/B 路由 + output_schema→mock 生成。"""
import random

from jsonschema import Draft202012Validator

from app.inference import executor


def test_single_binding_always_hit():
    b = {"model_version_id": "v1", "weight": 100}
    assert executor.select_binding([b]) is b


def test_select_fn_injection_used(monkeypatch):
    a = {"model_version_id": "va", "weight": 50}
    b = {"model_version_id": "vb", "weight": 50}
    monkeypatch.setattr(executor, "_select_fn", lambda bs: bs[1])
    assert executor.select_binding([a, b]) is b


def test_weighted_distribution_60_40(monkeypatch):
    monkeypatch.setattr(executor, "_rng", random.Random(1234))
    a = {"model_version_id": "va", "weight": 60}
    b = {"model_version_id": "vb", "weight": 40}
    n = 4000
    hits_a = sum(1 for _ in range(n) if executor.select_binding([a, b]) is a)
    assert 0.55 < hits_a / n < 0.65, hits_a / n


def test_generate_output_object_required_validates():
    schema = {
        "type": "object",
        "properties": {
            "label": {"type": "string"},
            "score": {"type": "number"},
            "ok": {"type": "boolean"},
            "rank": {"type": "integer"},
        },
        "required": ["label", "score"],
    }
    out = executor.generate_output(schema)
    Draft202012Validator(schema).validate(out)  # 反向校验:生成物符合 schema


def test_generate_output_enum_array_format():
    assert executor.generate_output({"enum": ["a", "b"]}) == "a"
    assert executor.generate_output({"type": "array", "items": {"type": "string"}}) == ["示例文本"]
    assert executor.generate_output({"type": "string", "format": "uri"}).startswith("http")


def test_generate_output_unsupported_falls_back_no_raise():
    assert executor.generate_output({"$ref": "#/defs/X"}) is None
    assert executor.generate_output({"oneOf": [{"type": "string"}]}) is None
    assert executor.generate_output({}) is None  # 空 schema
    assert executor.generate_output("not a dict") is None
