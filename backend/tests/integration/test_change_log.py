"""BDD: §8.1 变更日志缝 —— 每次版本状态流转追加一条不可变记录
（对应 design 决策5 / tasks 4.6 / 7.2）。

v1.0 变更日志无对外 API（是实现地基、非用户功能），故在 service + DB 层验证。
"""
from sqlalchemy import select

from app.db.tables import ChangeLogRow
from app.domain.enums import Framework, TaskType, VersionStatus
from app.models.service import ModelService
from app.versions.service import VersionService


class TestChangeLogSeam:
    async def test_transition_appends_immutable_record(self, db_session):
        m = await ModelService.create(
            db_session,
            name="m",
            description="d",
            task_type=TaskType.classification,
            input_schema={"type": "object"},
            output_schema={"type": "object"},
        )
        v = await VersionService.create(
            db_session,
            model_id=m.id,
            version="v1",
            file_path="/mock",
            framework=Framework.onnx,
            resource_req={"cpu": 1},
            change_note="init",
        )
        await VersionService.transition(
            db_session, version_id=v.id, target=VersionStatus.validating
        )

        rows = (
            await db_session.execute(
                select(ChangeLogRow).where(ChangeLogRow.op == "version.transition")
            )
        ).scalars().all()
        assert len(rows) == 1
        rec = rows[0]
        assert rec.before["status"] == "draft"
        assert rec.after["status"] == "validating"
        assert rec.actor in ("local-admin", "system")  # D12 占位
        assert rec.target_type == "model_version"
        assert rec.target_id == v.id
