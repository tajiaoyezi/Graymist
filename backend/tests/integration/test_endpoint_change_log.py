"""§8.1 变更日志缝复用(a2 · 集成):端点流转与权重变更各追加不可变记录。"""
from sqlalchemy import select

from app.db.tables import ChangeLogRow

from .helpers import endpoint_payload, make_model, make_ready_version


async def _logs(db_session, target_id):
    rows = (
        await db_session.execute(
            select(ChangeLogRow).where(ChangeLogRow.target_id == target_id)
        )
    ).scalars().all()
    return list(rows)


async def test_endpoint_transition_appends_change_log(endpoint_client, db_session):
    ep = endpoint_client
    model_id = await make_model(ep.client)
    vid = await make_ready_version(ep.client, model_id)
    r = await ep.client.post(
        "/endpoints", json=endpoint_payload([{"model_version_id": vid, "weight": 100}])
    )
    eid = r.json()["id"]
    await ep.drain()  # creating→running 写一条流转日志
    logs = await _logs(db_session, eid)
    ops = [row.op for row in logs]
    assert any("endpoint" in op for op in ops)
    transition = [row for row in logs if row.after and row.after.get("status") == "running"]
    assert transition, "端点流转应追加 change_log 记录"
    assert transition[0].actor == "local-admin"


async def test_weight_change_appends_change_log(endpoint_client, db_session):
    ep = endpoint_client
    model_id = await make_model(ep.client)
    v1 = await make_ready_version(ep.client, model_id, version="v1", file_path="/m/v1.onnx")
    v2 = await make_ready_version(ep.client, model_id, version="v2", file_path="/m/v2.onnx")
    r = await ep.client.post(
        "/endpoints", json=endpoint_payload([{"model_version_id": v1, "weight": 100}])
    )
    eid = r.json()["id"]
    await ep.client.patch(
        f"/endpoints/{eid}",
        json={"bindings": [
            {"model_version_id": v1, "weight": 60},
            {"model_version_id": v2, "weight": 40},
        ]},
    )
    logs = await _logs(db_session, eid)
    assert any("weight" in row.op or "binding" in row.op for row in logs), "权重变更应追加 change_log"
