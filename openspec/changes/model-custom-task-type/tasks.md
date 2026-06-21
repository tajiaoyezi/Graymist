## 1. 后端:字段 + 校验

- [x] 1.1 先写测试:custom 无名(空白或缺字段)→ 422;custom 有名 → 201 且 ModelOut 含 `custom_task_type`;非 custom 传了 `custom_task_type` → 落库为 null
- [x] 1.2 `ModelRow` 增 `custom_task_type`(String(64) 可空);schemas `ModelCreate` 增字段 + `model_validator`(custom 必填非空、非 custom 规范为 null)、`ModelUpdate`/`ModelOut` 增字段;service `create` 透传、`update` 后规范化;router 透传
- [x] 1.3 dev 库 `ALTER TABLE model ADD COLUMN custom_task_type VARCHAR(64)`;重启后端(8021)

## 2. 前端:输入 + 展示

- [x] 2.1 先写测试:`CreateModelForm` 选 custom → 显示自定义名输入且必填(空名拦截)、提交含 `custom_task_type`;非 custom 不显示该输入
- [x] 2.2 `CreateModelForm` 增条件输入 + 校验 + 入参;`types.ts` Model 增字段
- [x] 2.3 先写测试:`ModelList` 卡片对 custom 模型显示 `custom_task_type`
- [x] 2.4 `ModelList` 卡片 + `ModelDetailPage` 头部:custom 显示 `custom_task_type`(空回退 i18n 标签),其余不变;`zh.ts` 增 `field.customTaskType`

## 3. 校验与收尾

- [x] 3.1 后端 `pytest` 全绿(163);前端 `vitest`(68)/`tsc`/`vite build` 全绿
- [x] 3.2 `openspec validate --changes model-custom-task-type --strict` 通过;确认无超纲(枚举其它 3 值/筛选维度不变、无自定义类型全局管理)
