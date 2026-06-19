"""BDD: 审查补盲区 —— version.create 也写变更日志，且 actor 为确定的占位值。"""
from sqlalchemy import select

from app.db.tables import ChangeLogRow
from app.domain.enums import Framework, TaskType
from app.models.service import ModelService
from app.versions.service import VersionService


class TestChangeLogCreate:
    async def test_create_appends_record_with_local_admin_actor(self, db_session):
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
        rows = (
            await db_session.execute(
                select(ChangeLogRow).where(ChangeLogRow.op == "version.create")
            )
        ).scalars().all()
        assert len(rows) == 1
        assert rows[0].target_id == v.id
        assert rows[0].after["status"] == "draft"
        # 收紧断言：占位值确定为 local-admin（D12），误改为 system 应失败
        assert rows[0].actor == "local-admin"
