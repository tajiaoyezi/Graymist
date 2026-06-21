## ADDED Requirements

### Requirement: 端点绑定单一来源

同一端点的所有版本绑定 MUST 来源一致——要么全部为 `mock` 来源版本,要么全部为 `external-api` 来源版本;系统 MUST 拒绝把不同来源的版本混绑到同一端点。此约束使推理执行可按端点命中版本的 `source` 无歧义地分派(模拟 vs 真实转发),并与既有"同一端点仅可绑定同一 Model 的版本"约束并存。

#### Scenario: 混绑不同来源被拒绝
- **WHEN** 用户尝试把一个 `mock` 来源版本与一个 `external-api` 来源版本绑定到同一端点
- **THEN** 系统拒绝该配置并返回"同一端点绑定来源必须一致"错误

#### Scenario: 同来源多版本 A/B 允许
- **WHEN** 用户为端点绑定同一 Model 下两个 `external-api`(或两个 `mock`)`ready` 版本并配置权重
- **THEN** 系统接受该 A/B 配置

## MODIFIED Requirements

### Requirement: 平台资源配额累计校验

任何使**非 external-api 来源**端点进入或重新进入占用状态的操作(创建、启动、重启、增大占用的更新)MUST 校验请求资源是否超出平台总配额(`PlatformQuota`,可配置)。端点资源占用 = `副本数 × 单副本 resource_quota`,按 CPU / 内存 / GPU **三维分别**计算;剩余配额 = 平台总配额 − 所有 `creating`/`running` 的**非 external-api 端点**占用之和(**累计**;`stopped`/`failed` 端点不计占用);**当且仅当某维度"请求占用 > 该维度剩余"时 MUST 拒绝**(占用恰好等于剩余允许通过)。

**external-api 来源端点 MUST 跳过本资源预算校验,且其占用恒计为 0、不纳入累计扣减**(判定依据 = 平台是否管理该后端生命周期,非物理位置——含 base_url 指 localhost 的上游)。其用量/成本治理在 v1.1.2 落地,本能力不做。

#### Scenario: 资源在配额内允许部署
- **WHEN** 用户请求的非 external-api 端点占用(副本数×单副本配额)在各维度剩余配额之内
- **THEN** 系统允许创建该端点

#### Scenario: 占用恰好等于剩余配额允许
- **WHEN** 用户请求的非 external-api 端点占用在每一维度恰好等于剩余配额
- **THEN** 系统允许部署(判定为"超出"当且仅当 占用 > 剩余)

#### Scenario: 任一维度超额被拒绝
- **WHEN** 用户请求的非 external-api 端点占用在 CPU/内存/GPU 任一维度超出剩余配额
- **THEN** 系统拒绝部署并返回资源预算超额错误

#### Scenario: 累计扣减在用端点占用
- **WHEN** 平台已有处于 `creating`/`running` 的非 external-api 端点占用部分配额
- **THEN** 新端点的可用配额为总配额减去这些在用端点的占用之和

#### Scenario: 启动/重启重新计入累计校验
- **WHEN** 用户启动或重启一个 `stopped`/`failed` 的非 external-api 端点,而当前剩余配额已不足以容纳其占用
- **THEN** 系统拒绝该启动/重启并返回资源预算超额错误

#### Scenario: external-api 端点跳过配额校验且不计占用
- **WHEN** 用户创建/启动/重启/更新一个 external-api 来源端点,即便其 `resource_quota × 副本数` 在数值上超过平台剩余配额
- **THEN** 系统不执行资源预算校验、允许该操作,且该端点不计入平台已用配额(剩余配额查询不因其减少)

### Requirement: 平台配额查询

系统 SHALL 提供查询接口返回平台总配额与实时剩余配额(各按 CPU/内存/GPU 三维),供前端在配置时实时展示剩余量。剩余配额的口径与「平台资源配额累计校验」一致——**仅扣减所有 `creating`/`running` 的非 external-api 端点占用**,external-api 端点不计入。

#### Scenario: 查询平台配额与剩余
- **WHEN** 前端请求平台配额信息
- **THEN** 系统返回总配额与当前剩余(总量减去所有 `creating`/`running` 的**非 external-api 端点**占用)
