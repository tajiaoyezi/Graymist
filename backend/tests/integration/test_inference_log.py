"""推理日志字段契约 + 摘要截断 + A/B 按版本落库(补审计缺口 TC-1 / TC-2)。

原套件只经监控聚合间接覆盖 status/latency,从不直接读 InferenceLogRow 断言其字段;
摘要截断(_MAX_SUMMARY)与 A/B 命中版本的逐版本隔离也无回归护栏,本文件补齐。
"""
from sqlalchemy import select

from app.db.tables import InferenceLogRow
from app.inference import executor
from app.inference.service import _MAX_SUMMARY

from .helpers import endpoint_payload, make_model, make_ready_version

INPUT_SCHEMA = {"type": "object", "properties": {"text": {"type": "string"}}, "required": ["text"]}
OUTPUT_SCHEMA = {"type": "object", "properties": {"label": {"type": "string"}}, "required": ["label"]}


async def _logs(session_factory, endpoint_id):
    async with session_factory() as s:
        return (
            await s.execute(
                select(InferenceLogRow).where(InferenceLogRow.endpoint_id == endpoint_id)
            )
        ).scalars().all()


async def _running_endpoint(c, bindings=None, **ep_over):
    mid = await make_model(c.client, input_schema=INPUT_SCHEMA, output_schema=OUTPUT_SCHEMA)
    vid = await make_ready_version(c.client, mid)
    if bindings is None:
        bindings = [{"model_version_id": vid, "weight": 100}]
    r = await c.client.post("/endpoints", json=endpoint_payload(bindings, **ep_over))
    eid = r.json()["id"]
    await c.drain()  # creating → running
    return eid, vid


async def test_sync_log_records_all_contract_fields(infer_client, session_factory):
    # spec「推理日志与命中记录」:每次调用须落 端点/版本/模式/输入摘要/输出摘要/延迟/状态
    c = infer_client
    eid, vid = await _running_endpoint(c)
    r = await c.client.post(f"/endpoints/{eid}/infer", json={"input": {"text": "hi"}})
    assert r.status_code == 200, r.text

    rows = await _logs(session_factory, eid)
    assert len(rows) == 1
    log = rows[0]
    assert log.mode == "sync"
    assert log.status == "success"
    assert log.version_id == vid           # A/B 命中版本落库(监控按版本聚合所依赖)
    assert log.input_summary               # 非空摘要
    assert log.output_summary
    assert log.latency_ms is not None


async def test_summary_truncated_to_max(infer_client, session_factory):
    # spec MUST:输入/输出摘要为截断摘要,避免写入超大内容
    c = infer_client
    eid, _ = await _running_endpoint(c)
    big = "x" * (_MAX_SUMMARY * 5)
    r = await c.client.post(f"/endpoints/{eid}/infer", json={"input": {"text": big}})
    assert r.status_code == 200, r.text

    rows = await _logs(session_factory, eid)
    assert len(rows) == 1
    assert len(rows[0].input_summary) == _MAX_SUMMARY  # 截断生效,不会写满库


async def test_ab_per_version_metrics_isolated(infer_client, session_factory, monkeypatch):
    # spec「按版本分组与 A/B 对比」:两版本各自命中应分别落库、监控按版本各自成列。
    c = infer_client
    mid = await make_model(c.client, input_schema=INPUT_SCHEMA, output_schema=OUTPUT_SCHEMA)
    v1 = await make_ready_version(c.client, mid, version="v1")
    v2 = await make_ready_version(c.client, mid, version="v2")
    r = await c.client.post(
        "/endpoints",
        json=endpoint_payload(
            [{"model_version_id": v1, "weight": 50}, {"model_version_id": v2, "weight": 50}]
        ),
    )
    eid = r.json()["id"]
    await c.drain()

    # 确定性路由:第 1 次命中绑定[0],第 2 次命中绑定[1](轮流),消除加权随机的不确定性。
    calls = {"n": 0}

    def pick(bindings):
        b = bindings[calls["n"] % len(bindings)]
        calls["n"] += 1
        return b

    monkeypatch.setattr(executor, "_select_fn", pick)
    for _ in range(2):
        rr = await c.client.post(f"/endpoints/{eid}/infer", json={"input": {"text": "hi"}})
        assert rr.status_code == 200, rr.text

    # 日志层:两条命中分别记到 v1 / v2
    logged = {row.version_id for row in await _logs(session_factory, eid)}
    assert logged == {v1, v2}

    # 监控层:versions[] 两版本各自成列,各自恰好一个非空桶(指标互不串列)
    body = (await c.client.get(f"/monitoring/metrics?endpoint_id={eid}&range=24h")).json()
    assert {v["version_id"] for v in body["versions"]} == {v1, v2}
    for v in body["versions"]:
        nonzero = [b for b in v["buckets"] if b["qps"] > 0]
        assert len(nonzero) == 1, v
