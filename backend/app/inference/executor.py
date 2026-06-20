"""推理执行核心(a3):A/B 版本选择、模拟延迟、按 output_schema 生成占位结果。

均为可单测的纯逻辑;选择经 `_select_fn` 接缝(呼应 deploy._spawn_fn)可注入确定性替换。
校验不在此(已前置于 service,见 design D-a3-2/D-a3-4)。
"""
import random
from collections.abc import Callable
from typing import Any

from app.config import settings

_rng = random.Random()


def _weighted_choice(bindings: list[dict]) -> dict:
    """在(已筛 ready 的)绑定中按 weight 加权随机选一条;bindings 非空。"""
    total = sum(b["weight"] for b in bindings)
    if total <= 0:
        return bindings[0]
    r = _rng.uniform(0, total)
    upto = 0.0
    for b in bindings:
        upto += b["weight"]
        if r <= upto:
            return b
    return bindings[-1]


# 测试可替换为确定性选择以验证分流与命中记录。
_select_fn: Callable[[list[dict]], dict] = _weighted_choice


def select_binding(bindings: list[dict]) -> dict:
    """选中一条绑定;单条端点恒命中该条,多条按权重(经 _select_fn)。bindings 必须非空。"""
    if len(bindings) == 1:
        return bindings[0]
    return _select_fn(bindings)


def simulate_latency_seconds() -> float:
    """模拟推理耗时(原 2.3:100ms~3s);区间可配置、测试设 0。"""
    lo = settings.infer_latency_min_seconds
    hi = settings.infer_latency_max_seconds
    return _rng.uniform(lo, hi) if hi > lo else lo


# ---- output_schema → mock 占位结果 ----

_MAX_DEPTH = 12  # 防御:超深 schema 回退占位,不递归爆栈


def generate_output(schema: Any) -> Any:
    """按 output_schema 生成符合形态的占位结果。

    覆盖 object/array/string/number/integer/boolean/null/enum 常见子集并填充 object 的
    required;未覆盖构造($ref/oneOf/anyOf 等)或异常一律回退安全占位(None),绝不抛错。
    """
    try:
        return _gen(schema, 0)
    except Exception:
        return None


def _gen(schema: Any, depth: int) -> Any:
    if not isinstance(schema, dict) or depth > _MAX_DEPTH:
        return None
    enum = schema.get("enum")
    if isinstance(enum, list) and enum:
        return enum[0]
    # 未覆盖的组合构造 → 回退占位
    if any(k in schema for k in ("$ref", "oneOf", "anyOf", "allOf", "not")):
        return None
    t = schema.get("type")
    if isinstance(t, list):
        t = next((x for x in t if x != "null"), t[0] if t else None)
    if t == "object":
        props = schema.get("properties") or {}
        obj = {key: _gen(sub, depth + 1) for key, sub in props.items()}
        for key in schema.get("required") or []:  # required 但未在 properties 声明的键补占位
            obj.setdefault(key, None)
        return obj
    if t == "array":
        items = schema.get("items")
        return [_gen(items, depth + 1)] if isinstance(items, dict) else []
    if t == "string":
        return "https://example.com/placeholder" if schema.get("format") in ("uri", "url") else "示例文本"
    if t == "integer":
        return 0
    if t == "number":
        return 0.0
    if t == "boolean":
        return False
    return None
