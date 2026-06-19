"""§8.1 变更日志缝 —— 向 append-only 表追加不可变记录。

操作人 actor 在 v1.5/E7 建立真实身份前记占位（local-admin/system），历史不回填（D12）。
"""
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.db.tables import ChangeLogRow

DEFAULT_ACTOR = "local-admin"  # D12 占位标识


async def append(
    session: AsyncSession,
    *,
    target_type: str,
    target_id: str,
    op: str,
    before: dict[str, Any] | None = None,
    after: dict[str, Any] | None = None,
    actor: str = DEFAULT_ACTOR,
) -> ChangeLogRow:
    row = ChangeLogRow(
        target_type=target_type,
        target_id=target_id,
        op=op,
        before=before,
        after=after,
        actor=actor,
    )
    session.add(row)
    await session.flush()
    return row
