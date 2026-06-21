## 1. 删除守卫(后端)

- [x] 1.1 先写测试:`test_model_update_delete.py` 增 —— 模型某版本被端点绑定时 `DELETE /models/{id}` → 409 且模型/版本保持不变(用 `endpoint_client` 夹具在请求内同步建绑定);无绑定时维持 204 级联删除(既有 `TestDeleteCascade` 即回归)
- [x] 1.2 在 `ModelService.delete` 删除前加守卫:`EndpointVersionBindingRow ⨝ ModelVersionRow(model_id==该模型)` 计数 > 0 则 `raise ConflictError`(映射 409);无绑定走既有级联删除

## 2. 编辑/删除前端

- [x] 2.1 先写测试:`EditModelForm.test.tsx` —— 预填 name/description、改名后保存回传 `{name, description}`、空名拦截不提交
- [x] 2.2 新增 `components/EditModelForm.tsx`:name/description 双字段 + 保存/取消,`ApiError` 内联提示
- [x] 2.3 先写测试:`ModelDetailPage.test.tsx` 增 —— 点编辑→改名→保存调 `updateModel('m1',{name,description})` 并 reload;点删除→二次确认→`deleteModel` 成功 `navigate('/models')`;删除 409 → 页内 `action-error`、不跳转
- [x] 2.4 改造 `pages/ModelDetailPage.tsx`:头部加编辑/删除按钮、编辑弹窗(复用 modal 形态)、删除复用 `ConfirmDialog`、失败 `actionError` 页内提示、成功 `navigate('/models')`
- [x] 2.5 `i18n/locales/zh.ts` 补 `models.editTitle`/`models.confirmDelete`(无硬编码)

## 3. 校验与收尾

- [x] 3.1 后端 `pytest` 全绿(158);前端 `vitest` 全绿(63)、`tsc` 无错、`vite build` 通过
- [x] 3.2 `openspec validate --changes model-edit-delete --strict` 通过;确认无超纲(无端点删除/软删除/Schema 可编辑/批量)
- [x] 3.3 多智能体逆向审查(24 agent / 6 维):18 raised → 16 confirmed 全为 low/nit、0 correctness/security/data bug;采纳推荐子集修复 —— `ModelUpdate.name` 补 `min_length=1`(+422 测试)、`reload()` 清 `actionError` 残留、`EditModelForm` 锁决策1负向断言(恰 2 文本框/无 Schema·task_type)、`DELETE 未知 id → 404`、改绑后删除补级联后置断言。后端 160 · 前端 64 全绿
