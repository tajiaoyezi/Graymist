## Why

模型仓库已支持删除整个模型(model-edit-delete,级联删版本),但**无法删除单个版本** —— 后端 `versions` 路由只有 创建/查询/对比/流转/写指标,没有 DELETE;前端也无入口。现状下退役一个版本只能推进到 `archived` 终态(软退役)。用户需要能**真正删除**某个版本(如误建、废弃的实验版本),而不是只能归档。

## What Changes

- **新增删除单版本(后端)**:`DELETE /versions/{version_id}` → 204。删除前校验 —— 若该版本被**任一端点绑定**,返回 **409** 拒绝(避免孤儿化端点绑定),并在错误中点名冲突端点(与 model 删除守卫一致)。无绑定则删除该版本行。
- **不按状态限制**:只要未被端点绑定,任意状态(draft/validating/ready/archived)的版本均可删除;绑定守卫即安全网(ready 但无绑定=无人使用,可删)。
- **删除入口(前端,版本详情页)**:版本详情页新增「删除」入口,经二次确认(复用 `ConfirmDialog`);被端点绑定时入口**禁用并提示**(从源头避免确认后 409);删除成功后返回所属模型详情页;409 等失败在页内提示、不崩页。
- **范围约束(不超纲)**:仅新增"删除单版本 + 绑定守卫";**不**改归档语义(archived 仍是软退役终态,与删除并存)、**不**做批量删除、**不**加回收站/软删。

## Capabilities

### Modified Capabilities
- `model-registry`:「版本上传与管理」需求补充 —— 系统支持删除单个版本,被端点绑定的版本删除返回 409(避免孤儿化绑定),无绑定则删除。「版本详情页」需求补充 —— 新增经二次确认的删除入口(被绑定时禁用、成功返回模型详情、失败页内提示)。

## Impact

- **后端**:`app/versions/service.py` 增 `delete`(复用 `ConflictError→409`,JOIN `EndpointVersionBindingRow` 查冲突端点名);`app/versions/router.py` 增 `DELETE /versions/{id}`。无新表、无新依赖。
- **前端**:`api/client.ts` 增 `deleteVersion`;`pages/VersionDetailPage.tsx` 增删除按钮 + 二次确认 + 绑定禁用 + 成功 `navigate('/models/{modelId}')`;`i18n/zh.ts` 补文案;复用既有 `ConfirmDialog`。
- **兼容**:纯新增删除路径,不改既有创建/流转/归档行为;删模型的级联删除不受影响。
