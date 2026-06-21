## Why

模型仓库(§2.5)自 a1 起后端即提供 Model 完整 CRUD(`PATCH /models/{id}`、`DELETE /models/{id}`),但前端从未接通 —— 用户能创建、查看模型,却无法在界面上**编辑或删除**。这是 v1.0 模型仓库的一处能力缺口(原型/PRD §2.5 未显式拆出,故 a1 接前端时遗漏)。

同时审计发现 `DELETE /models/{id}` 当前会无条件级联删除版本,**不校验是否有端点仍绑定这些版本** —— 删除后端点绑定将指向已不存在的版本(孤儿化),属潜在数据完整性缺陷。

本 change 在不超纲前提下补齐这处缺口:接通编辑/删除前端,并为删除加一道端点绑定守卫。

## What Changes

- **删除守卫(后端,model-registry)**:`DELETE /models/{id}` 在删除前校验 —— 若有任一端点绑定了该模型的任一版本,返回 **409** 拒绝(不孤儿化绑定);无绑定时维持既有「级联删除版本」行为。守卫与端点状态无关(停止中的端点仍可被重启,其绑定同样不可孤儿化);用户需先将相关端点改绑到其它版本后方可删除。
- **编辑/删除前端(model-registry · 模型详情页)**:
  - 模型详情页新增「编辑」入口 —— 弹窗表单**仅**允许改 `name` 与 `description`(`task_type` 与输入/输出 Schema 是模型结构身份,改了会破坏既有版本/端点/Playground 表单契约,故不在此暴露;需换 Schema 应新建模型),保存走 `PATCH /models/{id}`。
  - 模型详情页新增「删除」入口 —— 经二次确认(复用 `ConfirmDialog`),成功后跳回模型列表;被端点绑定导致的 409 在页面内如实提示,不崩页。
- **范围约束(不超纲)**:仅接通已有的 Model update/delete 能力 + 一道删除守卫;**不**新增端点删除、**不**做软删除/归档、**不**开放 task_type/Schema 的可编辑性、**不**引入批量操作。

## Capabilities

### Modified Capabilities
- `model-registry`:「模型 CRUD」需求补充 —— 更新支持部分字段更新(PATCH 语义)并重校验 Schema;删除在有端点绑定时返回 409 拒绝(避免孤儿化绑定),无绑定时维持级联删除。「模型详情页」需求补充 —— 新增仅改 name/description 的编辑入口与经二次确认的删除入口(成功跳列表、409 页内提示)。

## Impact

- **后端**:`app/models/service.py` 的 `delete` 增端点绑定计数守卫(复用 `ConflictError→409`,`EndpointVersionBindingRow ⨝ ModelVersionRow`);无新表、无新依赖、无新路由。
- **前端**:新增 `components/EditModelForm.tsx`(name/description 双字段表单);`pages/ModelDetailPage.tsx` 增编辑弹窗 + 删除二次确认 + 失败页内提示 + 成功 `navigate('/models')`;`i18n/locales/zh.ts` 补 `models.editTitle`/`models.confirmDelete`;复用既有 `api.updateModel`/`api.deleteModel`/`ConfirmDialog`。
- **数据/兼容**:删除语义更严格(从「总是级联删」收紧为「有绑定则拒绝」),对既有无绑定删除路径无影响;`test_model_update_delete.py` 的级联删除用例仍通过。
