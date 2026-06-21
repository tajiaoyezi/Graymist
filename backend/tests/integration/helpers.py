"""测试用 payload 工厂。"""

VALID_SCHEMA = {
    "type": "object",
    "properties": {"text": {"type": "string"}},
    "required": ["text"],
}


def model_payload(**over):
    p = {
        "name": "文本分类器",
        "description": "demo",
        "task_type": "classification",
        "input_schema": VALID_SCHEMA,
        "output_schema": {"type": "object"},
    }
    p.update(over)
    return p


def version_payload(**over):
    p = {
        "version": "v1",
        "file_path": "/mock/v1.onnx",
        "framework": "ONNX",
        "resource_req": {"cpu": 2, "memory": 4096, "gpu_vram": 0},
        "change_note": "init",
    }
    p.update(over)
    return p


async def make_model(client, **over):
    r = await client.post("/models", json=model_payload(**over))
    assert r.status_code == 201, r.text
    return r.json()["id"]


async def make_version(client, model_id, **over):
    r = await client.post(f"/models/{model_id}/versions", json=version_payload(**over))
    assert r.status_code == 201, r.text
    return r.json()["id"]


async def make_ready_version(client, model_id, **over):
    """创建一个版本并推进到 ready(draft→validating→ready),供端点绑定。"""
    vid = await make_version(client, model_id, **over)
    for tgt in ("validating", "ready"):
        r = await client.post(f"/versions/{vid}/transition", json={"target": tgt})
        assert r.status_code == 200, r.text
    return vid


# ---- a5：external-api 来源 ----

# external-api 模型的固定 chat schema(只描述、不强校验;推理按 is_chat_like 校验)。
CHAT_SCHEMA = {
    "type": "object",
    "properties": {"messages": {"type": "array"}, "system": {"type": "string"}},
}


def external_version_payload(**over):
    p = {
        "version": "v1",
        "source": "external-api",
        "provider": "openai",
        "base_url": "http://mock-upstream/v1",
        "upstream_model": "gpt-4o-mini",
        "protocol": "openai",
    }
    p.update(over)
    return p


async def make_external_ready_version(client, model_id, **over):
    r = await client.post(
        f"/models/{model_id}/versions", json=external_version_payload(**over)
    )
    assert r.status_code == 201, r.text
    vid = r.json()["id"]
    for tgt in ("validating", "ready"):
        rr = await client.post(f"/versions/{vid}/transition", json={"target": tgt})
        assert rr.status_code == 200, rr.text
    return vid


def endpoint_payload(bindings, **over):
    p = {
        "name": "ep-demo",
        "url_path": "/ep/demo",
        "replicas": 1,
        "resource_quota": {"cpu": 1, "memory": 100, "gpu": 0},
        "timeout_ms": 30000,
        "max_concurrency": 4,
        "bindings": bindings,
    }
    p.update(over)
    return p
