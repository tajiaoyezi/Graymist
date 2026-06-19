## 1. 领域基座与配置(后端 · TDD 单元)

- [x] 1.1 [RED] 写 `tests/unit/test_endpoint_state_machine.py`:覆盖全部合法流转(`creating→running`、`creating→failed`、`creating→stopped`、`running→creating`、`running→stopped`、`running→failed`、`stopped→creating`、`failed→creating`)、非法流转被拒(停止 stopped / 任意到 running 的跨越 / 未列出的流转)、`is_active`(creating/running 计占用,stopped/failed 不计)语义。先失败。
- [x] 1.2 [GREEN] 实现 `app/domain/endpoint_state_machine.py`(显式允许集 + `assert_transition` 抛 `InvalidTransitionError`,沿用 a1 模式;独立于版本状态机)。跑绿 1.1。
- [x] 1.3 扩展 `app/config.py`:新增平台总配额 `total_cpu`/`total_memory`/`total_gpu` 与部署模拟耗时区间 `deploy_delay_min_seconds`/`deploy_delay_max_seconds`(默认 3/10,测试设 0),均 `GRAYMIST_` 前缀(env 全名如 `GRAYMIST_DEPLOY_DELAY_MIN_SECONDS`)。
- [x] 1.4 [RED] 写 `tests/unit/test_quota.py`:三维占用 = `replicas × resource_quota`;累计扣减在用端点;**占用恰等于剩余允许**、`占用 > 剩余` 才拒;`stopped`/`failed` 不计占用。先失败。
- [x] 1.5 [GREEN] 实现 `app/common/quota.py`(占用计算 + 剩余计算 + `占用 > 剩余` 判定,抛 `QuotaExceededError`)。跑绿 1.4。

## 2. 数据层与迁移

- [x] 2.1 在 `app/db/tables.py` 新增 `EndpointRow`(`url_path` 唯一索引、`resource_quota` 用 `_json()`、UUID hex 主键、UTC 时间戳)与 `EndpointVersionBindingRow`(endpoint_id / model_version_id / weight)。
- [x] 2.2 新增 Alembic 增量迁移 `migrations/versions/0002_endpoint_tables.py`:建 `endpoint`、`endpoint_version_binding` 两表(`change_log` 复用 a1,不动);ASCII-only 注释。

## 3. 后端服务与 API(TDD · 集成)

- [x] 3.1 [RED] 写 `tests/integration/test_endpoint_create.py`:创建端点(name/url_path/replicas/resource_quota/timeout_ms/max_concurrency + 至少一条 ready 绑定)→ 返回 `creating`;缺必填被拒;绑定引用不存在的 version 被拒;重复 `url_path` 409。先失败。
- [x] 3.2 [RED] 写 `tests/integration/test_ab_binding.py`:多版本权重和=100 接受;和≠100 被拒;**单条权重 <1/>100/非整数被拒(即便和=100)**;绑定**非 ready** 版本被拒;绑定**跨模型**版本被拒;改权重为原子整体替换(断言对外可见权重和恒 100)。
- [x] 3.3 [RED] 写 `tests/integration/test_quota_check_api.py`:配额内允许;**占用恰等于剩余允许**;任一维度 `>剩余` 拒绝(`QuotaExceededError`→**409**);累计扣减已有 creating/running 端点;**启动/重启 stopped/failed 端点时重新计入累计校验、剩余不足则拒**;`GET /quota` 返回 total/used/remaining。
- [x] 3.4 [RED] 写 `tests/integration/test_endpoint_lifecycle.py`:**四类操作均异步**且 API 立即返回——部署→creating(耗时设 0 时轮询转 running)、**停止 running**→立即返回仍 running、后台转 stopped、**重启 failed/stopped**→经 creating 回 running(恢复)、**取消卡住 creating**(停止)→stopped、更新增占配置→经 creating 重部署;非法流转(停止 stopped 等)409。
- [x] 3.5 [GREEN] 实现 `app/endpoints/service.py`:创建(同事务内配额校验 + 绑定校验[同 model & ready & 存在] + 权重和=100 且单条 1..100 + 落库)、**异步执行器**(`asyncio.create_task`,**经 `get_sessionmaker()` 开独立会话**回写终态;`try/except` 任何异常→`failed` + 日志;保留任务强引用防 GC)、状态流转(启停重启走端点状态机;启动/重启重跑配额校验)、配置更新(增占→异步重部署 + 配额复核)、权重整体替换(单事务整删整插)、每次流转/权重变更写 a1 `change_log`(actor=local-admin)。
- [x] 3.6 [GREEN] 实现 `app/endpoints/api.py`:`POST /endpoints`、`GET /endpoints`、`GET /endpoints/{id}`、`PATCH /endpoints/{id}`(改配置/权重)、`POST /endpoints/{id}/start|stop|restart`、`GET /quota`。**不提供 DELETE**(端点下线走停止;原需求未要求删除)。
- [x] 3.7 [GREEN] 在 `app/main.py` 注册端点路由与异常处理:`QuotaExceededError`→**409**、复用 `InvalidTransitionError`→409、url_path 唯一冲突→409、绑定/引用无效→422。跑绿 3.1–3.4。
- [x] 3.8 [RED→GREEN] 写并跑绿 `tests/integration/test_endpoint_change_log.py`:端点流转与权重变更各向 `change_log` 追加 1 条不可变记录(op/before/after/actor)。

## 4. 后端全量回归

- [x] 4.1 跑 `tests/unit` + `tests/integration` 全绿(含 a1 既有用例不回归)。
- [x] 4.2 自检异步:确认执行器在耗时=0 下确定性收敛;**通过一次新的 API 读取断言后台写回的终态**(验证独立会话写路径,规避 StaticPool 内存对象可见性陷阱),无轮询 flake。

## 5. 前端部署管控台(TDD · vitest/RTL)

- [x] 5.1 扩展 `src/types.ts`(Endpoint/Binding/Quota)、`src/domain/endpointStateMachine.ts`(允许集/可启停重启判定,镜像后端含 `failed` 可重启)、`src/api/client.ts`(端点 创建/列表/详情/更新/启停重启/getQuota,无 delete)。
- [x] 5.2 在 `src/i18n/locales/zh.ts` 补端点相关文案 key(状态含 creating/running/stopped/failed、操作启停重启、配额/权重/二次确认),不硬编码。
- [x] 5.3 [RED→GREEN] 写 `src/components/AbWeightEditor.test.tsx` 并实现 `AbWeightEditor`:多版本权重输入,实时显示和,非 100 报错并禁用提交。
- [x] 5.4 [RED→GREEN] 写 `src/components/QuotaUsage.test.tsx` 并实现 `QuotaUsage`:按表单副本数×配额实时显示平台剩余,并叠加待占用预览部署后剩余,超额高亮。
- [x] 5.5 [RED→GREEN] 写 `src/components/ConfirmDialog.test.tsx` 并实现危险操作二次确认(停止/重启)。
- [x] 5.6 实现 `src/pages/DeploymentConsolePage.tsx`(端点列表:状态/关联模型版本+权重/资源占用 + 启停重启按钮)与状态轮询(creating/停止中/重启中加载态,终态自动刷新);含错误态 `data-testid="page-error"`。
- [x] 5.7 实现 `src/pages/EndpointFormPage.tsx`(创建/编辑:选模型→多选 ready 版本→AbWeightEditor→QuotaUsage),提交前拦截非法权重与超额。
- [x] 5.8 [RED→GREEN] 写 `src/pages/DeploymentConsolePage.test.tsx`:加载失败→错误态;轮询 creating→running 自动刷新展示。
- [x] 5.9 [RED→GREEN] 写 `src/pages/EndpointFormPage.test.tsx`:权重和≠100 时阻止提交;实时剩余/预览随副本数×配额更新;超额阻止提交。

## 6. E2E(Playwright)

- [x] 6.1 写 `e2e/endpoint-deployment.spec.ts`:经 API 预置一个含 ≥2 个 `ready` 版本的模型 → 管控台创建端点(A/B 双版本权重 80/20,和=100)→ 端点 creating→running(轮询)→ 列表展示状态与权重 → 停止(二次确认)→ 后台转 stopped → 重启 → 回 running。
- [x] 6.2 确认 `playwright.config.ts` 后端 webServer 注入 `GRAYMIST_DEPLOY_DELAY_MIN_SECONDS=0` 与 `GRAYMIST_DEPLOY_DELAY_MAX_SECONDS=0` + 平台配额环境变量,使 E2E 确定且不超额。

## 7. 验证与收尾

- [x] 7.1 后端 `tests/unit`+`tests/integration`、前端 vitest、E2E 全量一起跑绿;`tsc` 零错。
- [x] 7.2 `openspec validate --changes a2-endpoint-deployment` 通过;复核未触碰 a1 的 model-registry 主规格与原始需求文档(只读)。
- [x] 7.3 复核范围:`timeout_ms`/`max_concurrency` 仅存储未执行、Redis 未引入、配额走 Settings、**无 DELETE API** —— 与 design 决策一致,无 超纲。
