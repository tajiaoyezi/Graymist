## 1. 后端:删除 + 守卫

- [x] 1.1 先写测试:无绑定版本 `DELETE /versions/{id}` → 204 且不再可达(404);被端点绑定的版本 → 409 且版本保持、detail 含端点名;未知 id → 404
- [x] 1.2 `VersionService.delete`:先 get(404)→ JOIN `EndpointVersionBindingRow`(model_version_id==该版本)查冲突端点名,有则 `ConflictError`(409、点名),无则删除该版本行;`router.py` 增 `DELETE /versions/{version_id}` status_code=204

## 2. 前端:删除入口

- [x] 2.1 先写测试:`VersionDetailPage` 未绑定→删除可用→二次确认→`deleteVersion` 成功 `navigate('/models/{modelId}')`;被端点绑定→删除按钮禁用;删除 409→页内 action-error、不跳转
- [x] 2.2 `api/client.ts` 增 `deleteVersion`;`VersionDetailPage` 载端点(容错)算本版本是否被绑定→删除按钮(绑定禁用+title 提示)+ `ConfirmDialog` + 成功 navigate + 失败复用页底 action-error;`zh.ts` 补 `version.confirmDelete`/`version.deleteBlockedHint`

## 3. 校验与收尾

- [x] 3.1 后端 `pytest` 全绿(168);前端 `vitest`(92)/`tsc`/`vite build` 全绿;实测删除版本 204→404 通过
- [x] 3.2 `openspec validate --changes version-delete --strict` 通过;确认无超纲(不改归档语义、无批量/回收站)
