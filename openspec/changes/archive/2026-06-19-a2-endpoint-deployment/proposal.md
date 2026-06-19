## Why

主链路是「模型注册 → 版本就绪 → **端点部署 → 路由** → 推理 → 监控」。a1 已落地 Model/Version 与版本状态机(只有 `ready` 可部署),但"可部署"目前没有承接对象。本 change 落地**第二环:把 `ready` 版本部署为可调用的推理端点**——这是原始需求明确标注的**后端核心难点**,集中了三个最难的约束:异步部署反馈、A/B 权重原子一致性、平台资源配额累计校验。端点是后续推理 API(a3)与监控(a4)的承接实体,不先把它做扎实,后两环无从长上去。

对应原始需求:**2.2 推理端点部署(后端)** + **2.6 部署管控台(前端)**。

## What Changes

- **Endpoint 实体**:独立调用入口,`url_path` 唯一;部署配置含 `replicas`、`resource_quota`(CPU/内存/GPU)、`timeout_ms`、`max_concurrency`。`timeout_ms`/`max_concurrency` 在本 change 仅作为端点配置**存储**,其真正的执行/限流在推理 API(a3)。
- **端点状态机**(第二个状态机,独立建模):`creating → running → stopped` 及 `failed`;支持**启动/停止/重启**,**重启统一为"重新部署"(经 creating 重走),故 `failed` 非终态、可经重启恢复**。与版本状态机不共享字段、不互相触发(§6.2)。
- **A/B 流量分配**:一个端点可挂载同一 Model 下多个 `ready` 版本(`EndpointVersionBinding` 带 `weight`),按权重百分比分流;**同端点所有绑定 weight 之和必须 = 100**;改权重为**整体替换、单事务原子**,绝不出现权重和 ≠ 100 的中间态(§6.3)。
- **异步操作**:部署/更新/停止/重启操作 **API 立即返回**,后台**进程内 asyncio 任务**模拟耗时(默认 3~10s,可配)后回写终态(部署/更新/重启经 `creating`;停止保持 `running` 后转 `stopped`),客户端**轮询**端点状态获取结果(本 change 采用进程内 asyncio,Redis Streams 留待 a3 异步推理引入)。
- **资源预算累计校验**:端点占用 = `副本数 × 单副本 resource_quota`,按 CPU/内存/GPU **三维分别**计算;剩余 = 平台总配额 − 所有 `creating/running` 端点占用之和;**任一维度超出剩余则拒绝部署**。平台总配额走**配置项/Settings**(`GRAYMIST_` 注入),并提供 `GET /quota` 返回总量与实时剩余。
- **部署管控台(前端)**:端点列表(状态/关联模型版本/资源占用);创建/编辑端点(选模型 → 多选 `ready` 版本用于 A/B → 权重配置**实时显示和、非 100 报错**;资源配额配置**实时显示平台剩余配额**);状态实时刷新(部署中加载态、完成自动刷新);操作按钮(启动/停止/重启,**危险操作二次确认**)。
- **复用 §8.1 变更日志缝**:端点状态每次流转、A/B 权重每次变更,向 a1 已建的 append-only `change_log` 表追加不可变记录(操作/前后值/时间/操作人占位 `local-admin`,沿用技术方案 §22 Decision Log 的 D12)。
- **复用 §8.4 i18n 缝**:管控台全部文案走 react-i18next 资源表,时间 UTC 存储、locale 展示。延续 a1,不硬编码。

> 非目标(Non-goals):推理调用 / 同步异步推理 / Schema 校验请求 / **限流 429 的真实执行**(均属 a3 推理 API);监控指标采集与聚合(a4);推理 Playground(a3 前端);真实模型运行时与 GPU(v1.0 全模拟);部署的**回调(webhook)**反馈(本 change 仅做轮询);**端点删除(DELETE)**(原需求端点操作仅含启停重启,本 change 不提供,下线走停止);来源差异化配额(v1.1.2)。`max_concurrency`/`timeout_ms` 本 change 只存不执行。

## Capabilities

### New Capabilities
- `endpoint-deployment`: 推理端点的部署与流量管理 —— Endpoint 实体与唯一 URL 路径、端点状态机(creating→running→stopped/failed)、A/B 版本绑定与权重原子一致性、异步部署(立即返回+后台执行+轮询)、平台资源配额累计校验,以及部署管控台前端页面(端点列表/创建编辑/权重与配额配置/状态刷新/启停重启)。

### Modified Capabilities
<!-- 无。本 change 消费 model-registry 的「仅 ready 可部署」契约,但不改变其任何需求;新增端点能力独立成 spec。 -->

## Impact

- **新增代码(后端)**:`endpoints` 领域模块(Endpoint/EndpointVersionBinding 实体、仓储、服务、API)、端点状态机、异步部署执行器(asyncio)、资源预算校验组件、平台配额读取(Settings)+ `GET /quota`;复用 a1 的 `change_log` 写入端点流转与权重变更。
- **新增代码(前端)**:部署管控台相关页面与组件(端点列表、创建/编辑端点表单、A/B 权重编辑器、配额占用展示、状态轮询与加载态、二次确认弹窗)。
- **数据库迁移**:新增 `endpoint`、`endpoint_version_binding` 两张表(Alembic 增量迁移);`change_log` 复用 a1 既有表,无结构变更。
- **新增配置**:`GRAYMIST_` 前缀的平台总配额(total_cpu/total_memory/total_gpu)与部署模拟耗时区间(可配,默认 3~10s)。
- **对 a1 的依赖(只读契约,不修改)**:仅 `ready` 版本可绑定;Endpoint N—N Version、两个状态机独立等已在 a1 design 锁定的语义。
- **对后续 change 的约定**:Endpoint 与 EndpointVersionBinding 是 a3 推理路由(按权重选版本、记录命中版本)与 a4 监控(按端点/版本聚合指标)的承接实体,其关系与状态机语义在本 change 锁定后不得被后续 change 改动。
