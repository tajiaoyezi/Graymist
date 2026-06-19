"""输入输出 Schema 校验（Schema 一等公民，§6.6 / 原需求 2.1）。

本 change 只负责 Schema **本身**的合法性校验（是否为合法 JSON Schema）。
另含复杂度上限（体积/嵌套深度），防止调用方提交超大/超深 Schema 拖垮 worker（审查 M2）。
"""
import json
from typing import Any

from jsonschema import Draft202012Validator
from jsonschema.exceptions import SchemaError

# DoS 防护上限（审查 M2）。Schema 在 v1.0 是调用方完全可控的任意 JSON。
MAX_SCHEMA_BYTES = 64 * 1024
MAX_SCHEMA_DEPTH = 32


class InvalidSchemaError(Exception):
    """提交的内容不是合法的 JSON Schema，或超出复杂度上限。"""


def _max_depth(obj: Any) -> int:
    """迭代（非递归）计算嵌套深度，自身不会因深输入栈溢出。"""
    stack = [(obj, 1)]
    deepest = 0
    while stack:
        node, depth = stack.pop()
        if depth > deepest:
            deepest = depth
        if depth > MAX_SCHEMA_DEPTH:
            break  # 已超限，无需继续
        if isinstance(node, dict):
            for value in node.values():
                stack.append((value, depth + 1))
        elif isinstance(node, list):
            for value in node:
                stack.append((value, depth + 1))
    return deepest


def validate_json_schema(schema: Any) -> None:
    """校验 schema 是否为合法 JSON Schema 且未超复杂度上限；否则抛 InvalidSchemaError。"""
    if not isinstance(schema, dict):
        raise InvalidSchemaError("Schema 必须是 JSON 对象（dict）")

    # 先查深度（迭代、安全），把后续 json.dumps / check_schema 的递归深度限制在上限内。
    if _max_depth(schema) > MAX_SCHEMA_DEPTH:
        raise InvalidSchemaError(f"Schema 嵌套过深（上限 {MAX_SCHEMA_DEPTH} 层）")

    if len(json.dumps(schema)) > MAX_SCHEMA_BYTES:
        raise InvalidSchemaError(f"Schema 过大（上限 {MAX_SCHEMA_BYTES} 字节）")

    try:
        Draft202012Validator.check_schema(schema)
    except SchemaError as exc:
        raise InvalidSchemaError(f"非法 JSON Schema：{exc.message}") from exc
    except RecursionError as exc:  # 兜底：极端深度
        raise InvalidSchemaError("Schema 嵌套过深") from exc
