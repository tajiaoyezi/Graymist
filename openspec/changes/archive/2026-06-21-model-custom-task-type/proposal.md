## Why

任务类型 §2.1 的「自定义(custom)」目前只是一个**固定的第 4 个枚举桶**:`TaskType` 闭合为 `classification/generation/embedding/custom`,选了 custom 也只能显示"自定义"三个字 —— **无法说明是哪一种**自定义任务,多个 custom 模型彼此无法区分,后端还会拒绝任何枚举外的值。用户期望(选"自定义" → 自己命名一个类型)更符合"自定义"的语义。

## What Changes

- 模型新增可选字段 `custom_task_type`(自定义类型名)。
- `task_type` **仍保持 4 值闭合枚举**(筛选 tab / i18n / 枚举校验不变)。
- 约束:`task_type == custom` 时 `custom_task_type` **必填非空**(创建即校验,空白→422);`task_type != custom` 时该字段被规范化为 `null`(不留残名)。
- 展示:模型卡片与详情页的任务类型 —— custom 显示用户自定义名(为空回退"自定义"标签),其余三类仍走 i18n 固定标签。
- 创建表单:选"自定义"时显示一个"自定义类型名"输入框(必填)。
- **范围约束(不超纲)**:不改枚举的其它 3 值、不改筛选维度(仍按 4 桶)、不做自定义类型的全局管理/去重/联想/校验唯一。

## Capabilities

### Modified Capabilities
- `model-registry`:「任务类型枚举」需求补充 —— `task_type` 仍为 4 值闭合枚举,但当其为 `custom` 时 MUST 附带一个非空 `custom_task_type` 作为展示用类型名,非 custom 时该字段为空;前端创建表单在选 custom 时收集该名,列表/详情以该名展示(为空回退"自定义")。

## Impact

- **后端**:`db/tables.py` ModelRow 增 `custom_task_type`(String(64) 可空);`models/schemas.py`(ModelCreate 增字段 + 跨字段校验、ModelUpdate/ModelOut 增字段);`models/service.py` create 透传 / update 规范化;`models/router.py` 透传。dev 库需 `ALTER TABLE model ADD COLUMN custom_task_type`(生产走 Alembic)。
- **前端**:`types.ts`、`CreateModelForm.tsx`(条件输入 + 校验)、`ModelList.tsx` / `ModelDetailPage.tsx`(展示)、`i18n/zh.ts`(字段标签)。
- **兼容**:既有模型 `custom_task_type=NULL`,展示回退"自定义",行为不变;筛选仍按 4 桶,枚举校验仍拒绝非 4 值。
