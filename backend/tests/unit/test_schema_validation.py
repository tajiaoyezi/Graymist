"""BDD: 输入输出 Schema 是一等公民 —— 保存时校验其本身为合法 JSON Schema
（对应 spec 需求「输入输出 Schema 是一等公民」）。
"""
import pytest

from app.common.schema_validation import validate_json_schema, InvalidSchemaError


class TestSchemaValidity:
    def test_valid_schema_accepted(self):
        # WHEN 提交结构合法的 JSON Schema THEN 通过
        schema = {
            "type": "object",
            "properties": {"text": {"type": "string"}},
            "required": ["text"],
        }
        validate_json_schema(schema)  # 不抛异常

    def test_malformed_schema_rejected(self):
        # WHEN 提交不是合法 JSON Schema 的内容（type 取了非法值）THEN 拒绝
        bad = {"type": "not-a-real-type"}
        with pytest.raises(InvalidSchemaError):
            validate_json_schema(bad)

    def test_non_dict_rejected(self):
        # WHEN 提交的 schema 根本不是对象 THEN 拒绝
        with pytest.raises(InvalidSchemaError):
            validate_json_schema(["not", "an", "object"])
