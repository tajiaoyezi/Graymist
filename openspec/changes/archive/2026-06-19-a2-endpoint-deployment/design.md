## Context

本 change 是 v1.0 能力拆分的**第二个 change**,对应原始需求 2.2(推理端点部署,后端核心难点)+ 2.6(部署管控台前端)。它在 a1 锁定的领域模型与版本状态机之上,落地第二个一等概念 **Endpoint** 与其 A/B 绑定,并实现 v1.0 三个最难约束:异步部署反馈、A/B 权重原子一致性、平台资源配额累计校验。

约束来源:
- 《AI 模型管理与推理服务平台.md》(原始需求,唯一权威基准,只读):2.2 / 2.6 / 特别提醒第 2/3/4 条。
- 《…技术方案.md》:§2 Endpoint/EndpointVersionBinding/PlatformQuota 字段、§3 端点状态机、§4.2 部署(含资源配额校验口径)、§5.2 部署管控台、§6 约束、§7 技术栈、§8.1/§8.2 留缝、§22 Decision Log。
- a1 已锁定且不可改动:Endpoint N—N Version(经 A/B 绑定带权重)、两个状态机独立、仅 `ready` 可部署、`change_log` append-only 缝、i18n 缝。

本次 change 级子决策由用户拍板(2026-06-19):前后端合并为一个 change;异步执行用**进程内 asyncio**(Redis Streams 留到 a3);PlatformQuota 用**配置项/Settings**;**部署/更新/停止/重启四类操作均异步**(忠实原需求 2.2);**`failed` 可经重启恢复**(非终态)。

## Goals / Non-Goals

**Goals:**
- 落地 Endpoint + EndpointVersionBinding 实体与端点状态机(creating/running/stopped/failed,启停重启,failed 可恢复)。
- 异步操作:部署/更新/重启经 `creating` 异步执行、停止异步转 `stopped`;API 立即返回、客户端轮询终态。
- A/B 权重原子一致性(和恒为 100、整体替换、绝无中间态);仅绑定**同 Model 下 `ready`** 版本;单条权重取值 `1..100`。
- 平台资源配额三维累计校验(创建/启动/重启/增占更新均校验,边界含等于)+ `GET /quota`(总量与实时剩余)。
- 部署管控台前端:端点列表、创建/编辑(A/B 权重编辑器 + 配额配置 + 实时剩余/预览)、状态轮询与加载态、启停重启 + 危险操作二次确认。
- 复用 a1 的 `change_log` 缝记录端点流转与权重变更;延续 i18n。

**Non-Goals:**
- 推理调用 / 同步异步推理 / Schema 校验请求 / **限流 429 的真实执行**(a3);`timeout_ms`、`max_concurrency` 本 change 只存不执行。
- 监控指标采集与聚合(a4);推理 Playground(a3 前端)。
- 真实模型运行时与 GPU(v1.0 全模拟);部署**回调(webhook)**反馈(仅轮询)。
- **端点删除(DELETE)**:原需求 2.2/2.6 的端点操作仅含 启动/停止/重启,未要求删除;为避免超纲,本 change **不提供 DELETE 端点 API**(端点下线走停止)。
- 来源差异化配额(v1.1.2);运行时改平台配额(v1.0 走配置项,无管理身份)。
- InferenceLog / AsyncInferenceTask 实体的实现(a3)。
- 服务重启后对在途/卡住端点的自动清扫(见风险,v1.0 走人工重启恢复)。

## Decisions

### 决策 1:端点状态机(第二个状态机,独立建模)
- 状态:`creating` / `running` / `stopped` / `failed`。允许流转集合(其它一律 `assert_transition` 拒绝):
  `creating→running`、`creating→failed`、`creating→stopped`、`running→creating`、`running→stopped`、`running→failed`、`stopped→creating`、`failed→creating`。
- **操作 → 流转映射**:
  - **部署(create)**:落库即 `creating`,异步执行后 → `running`/`failed`。
  - **停止(stop)**:对 `running` 异步转 `stopped`(API 立即返回,端点暂仍 `running`,后台完成置 `stopped`,**不经 creating**);对**卡住的 `creating`** 执行停止 → `stopped`(取消,释放配额)。
  - **启动(start)**:对 `stopped` → `creating` → 异步重部署 → `running`。
  - **重启(restart)**:对 `running`/`stopped`/`failed` 统一定义为"重新部署" → `creating` → 异步 → `running`。因此 **`failed` 非终态**,可经重启恢复(H1)。
  - **更新(update)**:见决策 4'(改占用配置 → `running→creating` 异步重部署 + 配额复核)。
- 与版本状态机**不共享字段、不互相触发**(§6.2)。沿用 a1 `state_machine.py` 的"显式允许集 + assert_transition" 模式,新增独立的 `endpoint_state_machine.py`,不与版本状态机混用。

### 决策 2:异步执行 = 进程内 asyncio 后台任务(用户拍板,Redis 留到 a3)
- **四类操作均异步**(忠实原需求 2.2"部署/更新/停止操作是异步的"):部署/更新/重启把端点写为 `creating` 并提交后,`asyncio.create_task` 触发后台协程模拟耗时(默认 3~10s,**区间可配**)后回写终态;停止亦异步(端点保持 `running`,后台完成后置 `stopped`)。API 一律不阻塞,立即返回当前态,客户端轮询 `GET /endpoints/{id}`。
- **会话生命周期(H3)**:后台协程 MUST 通过 `get_sessionmaker()` 打开**自己的独立 AsyncSession** 写回状态并在其内提交,**绝不复用请求级 session**(请求 session 在 API 返回后已 commit/close,且 `AsyncSession` 不跨任务并发安全)。
- **任务健壮性(M3)**:执行器 body 全程 `try/except`,**任何**异常(含 DB 写失败)都回写 `failed` 并记录日志(不仅模拟失败);对 `create_task` 返回值**保留强引用**(放入集合,完成回调移除)以防被 GC 提前回收导致静默丢任务。
- **可测性**:模拟耗时区间走 Settings,测试设为 0 → 后台任务即时完成;提供"等待端点稳定"helper,并通过**一次新的 API 读取**断言后台写回的终态(验证独立会话写路径,规避 StaticPool 下的内存对象可见性陷阱)。
- 备选 **Redis Streams worker**(§7 字面把"后台部署执行"列给 Redis):放弃于本 change。理由:v1.0 部署是模拟 sleep,不需持久队列/跨进程消费;Redis Streams 的真实价值在 a3(异步推理排队 + 并发限流计数),届时统一引入。与 a1 design 的 Redis 风险缓解一致。

### 决策 3:A/B 权重原子一致性(§6.3 不可削弱)
- 绑定建模为**可整体替换的配置**(§8.2 留缝):创建/改权重时在**单事务内整删整插**,"和恰为 100"校验在**提交前同一事务**完成,失败整体回滚。
- **隔离前提(L2)**:外部读取在**独立事务**中进行,Postgres 默认 READ COMMITTED 下不会观察到本事务未提交的整删整插中间态,故"对外可见权重和恒为 100"成立;此前提在此显式记录(方法本身正确,补全其依赖)。
- 绑定校验:所有被绑定版本 MUST 属**同一 Model** 且状态为 `ready`(消费 a1 的"仅 ready 可部署"契约,a1 spec 不变;"同一 Model"忠实 tech §2);单条 `weight` 取值 `1..100` 整数(M5)。
- §8.2 留缝即由此满足:整体替换的数据模型为 v1.1 渐进发布(E2)留好接口,本 change 不实现渐进发布逻辑。

### 决策 4:平台资源配额三维累计校验
- 占用算法(§4.2 澄清口径,不新增功能):端点占用 = `replicas × resource_quota`,CPU/内存/GPU 三维分别求;剩余 = 总配额 − Σ(所有 `creating`/`running` 端点占用);**判定为"超出"当且仅当某维度 `请求占用 > 剩余`**(占用恰等于剩余允许通过,边界含等于,M5)。`stopped`/`failed` 端点**不计**占用。
- **触发时机**:创建、启动(`stopped`/`failed`→上线)、重启、增大占用的更新——凡使端点进入/重新进入占用状态者均校验(M5)。
- **并发一致性(M4,诚实化)**:校验与落库放在同一事务,占用基于已提交端点重算。但**须诚实承认**:在 Postgres 默认 READ COMMITTED 下,两个并发部署互不可见对方未提交的行,可能双双通过校验后双双提交,导致瞬时轻微超额——本机制**降低而非消除**该竞态。v1.0 管理操作低频且为模拟,**接受该残余风险**;若将来需严格防超额,升级路径为对单行"配额哨兵"加 `SELECT ... FOR UPDATE`(或 SERIALIZABLE 部署事务)串行化部署,不引入分布式锁(超纲)。

### 决策 4':端点配置更新(M2)
- 更新 `replicas`/`resource_quota`/`timeout_ms`/`max_concurrency`:改变占用者触发**异步重部署**(`running→creating→running`),并在重部署前**重跑配额累计校验**(超额拒绝、保留原配置)。
- 权重/绑定的更新走决策 3 的原子整体替换(同步,不经重部署)。

### 决策 5:PlatformQuota = 配置项 / Settings(用户拍板)
- 平台总配额走 `GRAYMIST_` 前缀 Settings(`total_cpu` / `total_memory` / `total_gpu`),启动时固定;满足原需求"平台总配额可配置"。
- 提供 `GET /quota` 返回 `{total, used, remaining}`(各三维),`used` 由在用端点占用实时聚合,供前端表单实时展示剩余。
- **错误码统一(L1)**:资源预算超额抛 `QuotaExceededError` → **HTTP 409**(资源可用性冲突,与 a1 `InvalidTransitionError`→409、url_path 唯一冲突→409 一致)。
- 备选**单行 DB 配置表**(运行时可改):放弃于本 change(v1.0 无管理身份,价值有限且多一张表+一套写接口;配置项已满足"可配置")。

### 决策 6:复用 a1 的 §8.1 变更日志缝(实现地基,非用户功能)
- 端点状态每次流转、A/B 权重每次变更,向 a1 已建的 append-only `change_log` 表追加不可变记录:`{target_type=endpoint/binding, target_id, op, before, after, actor, created_at}`,`actor` 记占位 `local-admin`(沿用**技术方案 §22 Decision Log 的 D12**;a1 已采用)。
- 直接复用 a1 的 `change_log` 组件与表,**无结构变更、无新迁移**。与 a1 一致,不写进行为 spec(仅作实现地基 + 任务)。

### 决策 7:数据模型与工程结构
- 新增两张表:`endpoint`(id / name / url_path[unique] / status / replicas / resource_quota[jsonb] / timeout_ms / max_concurrency / created_at / updated_at)、`endpoint_version_binding`(endpoint_id / model_version_id / weight)。沿用 a1 的 `JSON().with_variant(JSONB,"postgresql")`、UUID hex 主键、UTC 时间戳约定。
- Alembic **增量迁移**(`0002`)建上述两表;`change_log` 复用 a1 既有表。
- 后端新增 `app/endpoints/` 模块(service + api),复用 `app/common`(change_log/errors)、`app/domain`(新增端点状态机)、`app/db`。前端新增部署管控台 pages/components,复用 a1 的 api client、i18n、format。

### 决策 8:模拟性质延续
- 部署/停止执行为模拟 `sleep`(无真实容器/调度);资源配额为逻辑账面校验(无真实资源分配)。符合 §7 模拟约定。

## Risks / Trade-offs

- **[进程内 asyncio 不持久 → 卡住 + 配额泄漏(M6)]** 服务重启会丢失在途后台任务,端点可能永久卡在 `creating`;且 `creating` **计入配额占用**,故卡住会**持续占额**。→ 缓解:v1.0 模拟、低频可接受;状态机提供出路——用户可对卡住的 `creating` 端点执行**停止(`creating→stopped`)释放配额**,再重启重走部署(决策 1)。不做启动期 stale-creating 自动清扫(超纲)。
- **[配额校验 TOCTOU 竞态]** 见决策 4:READ COMMITTED 下并发部署可能瞬时轻微超额。→ 缓解:已诚实记录为接受的残余风险,给出 `SELECT FOR UPDATE` 哨兵的升级路径;不在 v1.0 引锁。
- **[A/B 权重中间态]** 改权重若非原子会出现和 ≠ 100。→ 缓解:单事务整删整插 + 事务内校验 + 回滚;隔离前提见决策 3。
- **[两套异步机制]** a2 用 asyncio、a3 用 Redis。→ 缓解:已与用户确认;职责不同(模拟部署 vs 持久推理队列),不构成重复。
- **[只存不执行的端点配置]** `timeout_ms`/`max_concurrency` 本 change 不强制。→ 缓解:spec 与 proposal 明确标注其执行属 a3。

## Migration Plan

Greenfield 增量,无既有数据迁移:
1. Alembic 增量迁移 `0002`:创建 `endpoint`、`endpoint_version_binding` 两表(`change_log` 复用)。
2. 后端:端点状态机 → 资源配额校验组件 → EndpointService(创建/绑定/流转/异步执行器/更新)→ API(创建/查询/列表/更新/启停重启 + `GET /quota`,**无 DELETE**)+ change_log 写入。
3. 前端:部署管控台端点列表 → 创建/编辑表单(A/B 权重编辑器 + 配额实时剩余/预览)→ 状态轮询/加载态 → 启停重启 + 二次确认。
4. 回滚:代码层删 `app/endpoints/` 与前端管控台模块;数据库 `alembic downgrade` 退回 `0001`。

## Open Questions

- 暂无阻塞性开放问题:异步机制(asyncio)、配额形态(Settings)、前后端合并、四类操作均异步、`failed` 可恢复 均已拍板。
- 待 a3 决定(不阻塞本 change):`timeout_ms`/`max_concurrency` 的执行口径、A/B 路由按权重选版本的实现、InferenceLog 记录命中版本的方式。
