## ADDED Requirements

### Requirement: 端点创建与部署配置

系统 SHALL 允许将一个或多个 `ready` 版本部署为推理端点(Endpoint)。创建端点时 MUST 指定 `name`、`url_path`、`replicas`(副本数)、`resource_quota`(CPU/内存/GPU)、`timeout_ms`、`max_concurrency`,以及至少一条引用**存在且为 `ready`** 的版本绑定。`timeout_ms` 与 `max_concurrency` 在本 change 仅作为端点配置**持久化存储**,其超时与并发限流的**执行**属推理 API(后续 change),本 change 不对其做运行时强制。

#### Scenario: 创建端点并指定全部部署配置
- **WHEN** 用户提交合法的 name、url_path、replicas、resource_quota、timeout_ms、max_concurrency 及至少一条 `ready` 版本绑定,且资源预算未超
- **THEN** 系统创建该端点,初始状态为 `creating`,并返回其 `id` 与 `url_path`

#### Scenario: 缺少必填部署配置被拒绝
- **WHEN** 用户提交的请求缺少 replicas 或 resource_quota 或版本绑定
- **THEN** 系统拒绝创建并返回字段校验错误

#### Scenario: 绑定引用不存在的版本被拒绝
- **WHEN** 用户提交的版本绑定引用了一个不存在的 version id
- **THEN** 系统拒绝创建并返回引用无效错误

### Requirement: 端点 URL 路径唯一

端点的 `url_path` MUST 在平台内唯一;系统 MUST 拒绝创建与已有端点 `url_path` 冲突的端点。

#### Scenario: 重复 url_path 被拒绝
- **WHEN** 用户创建端点时指定的 url_path 已被另一端点占用
- **THEN** 系统拒绝创建并返回唯一性冲突错误

### Requirement: 端点状态机

端点状态 MUST 取 `creating` / `running` / `stopped` / `failed` 之一,并仅允许以下流转(其它一律拒绝):`creating→running`、`creating→failed`、`creating→stopped`(取消进行中/卡住的部署)、`running→creating`(更新/重启重新部署)、`running→stopped`(停止完成)、`running→failed`、`stopped→creating`(启动/重启重新部署)、`failed→creating`(重启重新部署,恢复)。系统 SHALL 支持**启动 / 停止 / 重启**操作:**重启**对 `running`/`stopped`/`failed` 端点统一定义为"重新部署"(经 `creating` 重新异步部署回到 `running`);**启动**对 `stopped` 端点同样经 `creating` 重新部署;故 `failed` **不是终态**,可经重启恢复。端点状态机与版本状态机 MUST 相互独立——不共享状态字段、不互相触发。

#### Scenario: 部署成功后进入 running
- **WHEN** 一个 `creating` 端点的后台部署成功完成
- **THEN** 其状态变为 `running`

#### Scenario: 部署失败进入 failed
- **WHEN** 一个 `creating` 端点的后台部署执行失败
- **THEN** 其状态变为 `failed`

#### Scenario: 重启 failed 端点恢复
- **WHEN** 用户对一个 `failed` 端点执行重启
- **THEN** 端点经 `creating` 重新异步部署,成功后回到 `running`

#### Scenario: 启动已停止端点
- **WHEN** 用户对一个 `stopped` 端点执行启动
- **THEN** 端点经 `creating` 重新异步部署,成功后回到 `running`

#### Scenario: 取消卡住的部署
- **WHEN** 用户对一个长时间处于 `creating` 的端点执行停止
- **THEN** 端点变为 `stopped`,其占用的平台配额随之释放

#### Scenario: 非法流转被拒绝
- **WHEN** 用户尝试停止一个已处于 `stopped` 的端点(或其它不在允许集内的流转)
- **THEN** 系统拒绝该状态流转并返回非法流转错误

### Requirement: 异步操作与状态轮询

端点的**部署 / 更新 / 停止 / 重启**操作 MUST 是异步的:API 立即返回(不阻塞等待后台完成),后台执行(v1.0 为模拟耗时,默认 3~10 秒,可配置),客户端通过**轮询端点状态**获取最终结果。其中**部署 / 更新 / 重启**将端点置于 `creating` 期间执行;**停止**提交后端点保持 `running`,后台完成后转 `stopped`(不经 `creating`)。本 change 仅提供轮询反馈,不提供回调(webhook)。

#### Scenario: 部署 API 立即返回
- **WHEN** 用户提交端点部署请求
- **THEN** API 不阻塞等待部署完成,立即返回处于 `creating` 状态的端点

#### Scenario: 停止 API 立即返回并后台转停
- **WHEN** 用户对 `running` 端点提交停止
- **THEN** API 立即返回(端点暂仍为 `running`),后台执行完成后端点转为 `stopped`,客户端轮询获知最终态

#### Scenario: 轮询获取最终状态
- **WHEN** 客户端在异步操作提交后轮询该端点状态
- **THEN** 在后台执行完成前返回过渡态(部署/重启为 `creating`),完成后返回终态(`running`/`stopped`/`failed`)

### Requirement: 端点配置更新

系统 SHALL 允许更新已有端点的部署配置(`replicas` / `resource_quota` / `timeout_ms` / `max_concurrency`)。改变资源占用的更新 MUST 触发**异步重新部署**(经 `creating` 回到 `running`),并在重新部署前**重新执行资源预算累计校验**,超额则拒绝更新并保留原配置。版本绑定与权重的更新见"A/B 流量分配与权重一致性"(原子整体替换,不经重新部署)。

#### Scenario: 更新资源配置触发异步重部署
- **WHEN** 用户更新一个 `running` 端点的 replicas 或 resource_quota,且更新后占用在配额内
- **THEN** 端点经 `creating` 异步重新部署回到 `running`,新配置生效

#### Scenario: 更新导致超额被拒绝
- **WHEN** 用户更新端点配置使其占用在任一维度超出剩余配额
- **THEN** 系统拒绝该更新并保留端点原有配置

### Requirement: A/B 流量分配与权重一致性

一个端点 MUST 可同时绑定**同一 Model 下**的多个 `ready` 版本(EndpointVersionBinding),每条绑定带 `weight`(取值为 `1..100` 的整数)。同一端点下所有绑定的 **weight 之和 MUST 恰好等于 100**。权重的修改 MUST 以**整体替换、单事务原子**方式进行——校验"和=100"在提交前的同一事务内完成,失败则整体回滚;外部读取在独立事务中进行,MUST 绝不观察到权重之和 ≠ 100 的中间态。系统 MUST 拒绝绑定非 `ready` 版本,且 MUST 拒绝把分属**不同 Model** 的版本绑定到同一端点。

#### Scenario: 多版本按权重绑定且和为 100
- **WHEN** 用户为端点绑定 v2(权重 80)与 v3(权重 20)
- **THEN** 系统接受该绑定并按权重记录分流配置

#### Scenario: 权重之和不为 100 被拒绝
- **WHEN** 用户提交的绑定权重之和不等于 100
- **THEN** 系统拒绝该配置并返回权重一致性错误

#### Scenario: 单条权重越界被拒绝
- **WHEN** 任一绑定的 weight 小于 1、大于 100 或非整数(即便所有绑定之和恰为 100)
- **THEN** 系统拒绝该配置并返回权重取值错误

#### Scenario: 绑定非 ready 版本被拒绝
- **WHEN** 用户尝试把 `draft`/`validating`/`archived` 状态的版本绑定到端点
- **THEN** 系统拒绝绑定并返回"仅 ready 可部署"错误

#### Scenario: 绑定跨模型版本被拒绝
- **WHEN** 用户尝试把分属不同 Model 的版本绑定到同一端点
- **THEN** 系统拒绝绑定并返回"同一端点仅可绑定同一模型的版本"错误

#### Scenario: 单一版本不可重复绑定
- **WHEN** 用户尝试在同一端点对同一个 version id 提交多条绑定(即便权重之和为 100)
- **THEN** 系统拒绝该配置并返回"同一版本不可在一个端点重复绑定"错误

#### Scenario: 原子整体替换权重
- **WHEN** 用户更新某端点的版本绑定权重
- **THEN** 系统在单个事务内整体替换全部绑定,任一时刻外部可见的权重和恒为 100

### Requirement: 平台资源配额累计校验

任何使端点进入或重新进入占用状态的操作(创建、启动、重启、增大占用的更新)MUST 校验请求资源是否超出平台总配额(`PlatformQuota`,可配置)。端点资源占用 = `副本数 × 单副本 resource_quota`,按 CPU / 内存 / GPU **三维分别**计算;剩余配额 = 平台总配额 − 所有 `creating`/`running` 端点占用之和(**累计**;`stopped`/`failed` 端点不计占用);**当且仅当某维度"请求占用 > 该维度剩余"时 MUST 拒绝**(占用恰好等于剩余允许通过)。

#### Scenario: 资源在配额内允许部署
- **WHEN** 用户请求的端点占用(副本数×单副本配额)在各维度剩余配额之内
- **THEN** 系统允许创建该端点

#### Scenario: 占用恰好等于剩余配额允许
- **WHEN** 用户请求的端点占用在每一维度恰好等于剩余配额
- **THEN** 系统允许部署(判定为"超出"当且仅当 占用 > 剩余)

#### Scenario: 任一维度超额被拒绝
- **WHEN** 用户请求的端点占用在 CPU/内存/GPU 任一维度超出剩余配额
- **THEN** 系统拒绝部署并返回资源预算超额错误

#### Scenario: 累计扣减在用端点占用
- **WHEN** 平台已有处于 `creating`/`running` 的端点占用部分配额
- **THEN** 新端点的可用配额为总配额减去这些在用端点的占用之和

#### Scenario: 启动/重启重新计入累计校验
- **WHEN** 用户启动或重启一个 `stopped`/`failed` 端点,而当前剩余配额已不足以容纳其占用
- **THEN** 系统拒绝该启动/重启并返回资源预算超额错误(`stopped`/`failed` 重新上线同样计入累计校验)

### Requirement: 平台配额查询

系统 SHALL 提供查询接口返回平台总配额与实时剩余配额(各按 CPU/内存/GPU 三维),供前端在配置时实时展示剩余量。

#### Scenario: 查询平台配额与剩余
- **WHEN** 前端请求平台配额信息
- **THEN** 系统返回总配额与当前剩余(总量减去所有 `creating`/`running` 端点占用)

### Requirement: 部署管控台端点列表页

前端 SHALL 以列表展示所有端点,每项含端点状态、关联的模型/版本及其权重、资源占用。

#### Scenario: 展示端点列表
- **WHEN** 用户打开部署管控台
- **THEN** 列表展示各端点的状态、关联模型版本(含权重)与资源占用

### Requirement: 创建/编辑端点表单

前端 SHALL 提供创建/编辑端点的表单:选择模型 → 多选该模型下的 `ready` 版本用于 A/B → 配置各版本流量权重并**实时显示权重之和、非 100% 时报错**;配置资源配额(副本数/CPU/内存/GPU)并**实时显示平台剩余配额**(叠加当前表单将占用量,预览部署后剩余)。

#### Scenario: 权重之和实时校验
- **WHEN** 用户在 A/B 权重编辑器中调整各版本权重
- **THEN** 界面实时显示权重之和,且当和不为 100% 时给出报错、阻止提交

#### Scenario: 实时显示剩余配额并预览
- **WHEN** 用户在表单中配置副本数与资源配额
- **THEN** 界面展示平台剩余配额,并叠加当前表单将占用量(副本数×配额)预览部署后剩余,便于用户判断是否会超额

### Requirement: 端点状态实时刷新

前端 SHALL 在端点处于异步操作(部署中/停止中/重启中)时显示加载/进行中态,并在后台操作完成后自动刷新为最新状态。

#### Scenario: 异步操作中加载态与自动刷新
- **WHEN** 用户提交部署/停止/重启后端点处于异步执行中
- **THEN** 界面显示加载/进行中态,并在端点转为终态(`running`/`stopped`/`failed`)后自动刷新展示最终状态

### Requirement: 端点操作与危险操作二次确认

前端 SHALL 提供启动/停止/重启操作按钮;其中停止/重启等**危险操作 MUST 二次确认**后才执行。

#### Scenario: 危险操作需二次确认
- **WHEN** 用户点击停止或重启端点
- **THEN** 界面要求二次确认,确认后才触发对应的状态流转操作
