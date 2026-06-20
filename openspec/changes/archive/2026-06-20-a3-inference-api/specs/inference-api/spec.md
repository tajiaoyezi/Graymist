## ADDED Requirements

### Requirement: 同步推理调用
平台 SHALL 提供同步推理调用:请求命中某 `running` 端点后,按 A/B 权重选定一个 ready 版本,模拟执行(耗时 100ms~3s),返回结果。响应 MUST 包含推理结果、实际命中版本与延迟(ms)。当本次模拟延迟超过该端点 `timeout_ms` 时,MUST 以超时错误返回(不返回正常结果),且该次调用 MUST 记入推理日志(状态=超时)。

#### Scenario: 同步推理成功返回
- **WHEN** 业务调用方对一个 `running` 端点发起同步推理且输入合法、并发未满
- **THEN** 平台选定一个 ready 版本、模拟执行后返回结果、命中版本与延迟,并写入一条状态为成功的推理日志

#### Scenario: 同步推理超时
- **WHEN** 同步推理的模拟执行耗时超过端点 `timeout_ms`
- **THEN** 平台返回超时错误而非正常结果,并写入一条状态为超时的推理日志

### Requirement: 异步推理调用
平台 SHALL 提供异步推理调用:提交任务后 API 立即返回任务 ID,后台排队执行;调用方凭任务 ID 查询状态与结果。异步任务状态机 MUST 为 `queued → running → succeeded/failed`(与版本/端点状态机相互独立)。任务执行完成后,结果 MUST 可凭任务 ID 查询到。

#### Scenario: 提交异步任务并轮询结果
- **WHEN** 调用方提交异步推理任务
- **THEN** 平台立即返回任务 ID,任务在后台经 `queued→running→succeeded` 执行,调用方凭该 ID 可查询到最终状态与结果

#### Scenario: 异步任务执行失败
- **WHEN** 异步任务在后台执行中发生错误
- **THEN** 任务状态置为 `failed`,凭任务 ID 可查询到失败状态,并写入一条状态为错误的推理日志

### Requirement: 推理输入 Schema 校验
平台 SHALL 在执行推理前,按命中 Model 的 `input_schema` 校验请求输入(Schema 一等公民,贯穿版本定义→推理校验→Playground 表单)。输入不符合 Schema 时 MUST 拒绝(返回 422)且 MUST NOT 进入执行、MUST NOT 占用并发额度。

#### Scenario: 非法输入被 Schema 校验拦截
- **WHEN** 同步或异步推理的输入不符合命中 Model 的 `input_schema`
- **THEN** 平台返回 422 校验错误,不执行推理、不占用端点并发额度

### Requirement: A/B 权重路由
平台 SHALL 在端点挂载多个版本(A/B)时,按各绑定的 `weight` 百分比将每次推理分流到某一具体版本(权重之和为 100 由端点部署保证)。单版本端点 MUST 恒命中该版本。路由 MUST 只在该端点绑定中**当前仍为 `ready`** 的版本里选择(版本绑定后可能被 archived),并 MUST 将实际命中的版本贯穿到执行与日志。

#### Scenario: 多版本端点按权重分流
- **WHEN** 一个端点挂载 A/B 两个版本且权重分别为 60/40
- **THEN** 多次推理按约 60:40 的比例分流到两个版本,每次命中的具体版本被记录

#### Scenario: 单版本端点恒命中
- **WHEN** 一个端点仅挂载单个版本
- **THEN** 每次推理均命中该版本

#### Scenario: 绑定版本已非 ready 时的路由
- **WHEN** 端点某绑定的版本在绑定后被 archived(不再 ready)
- **THEN** 路由不再把流量分给该版本(仅在仍为 ready 的绑定中选);若该端点全部绑定均已非 ready,则推理被拒绝(返回 409 并落日志)

### Requirement: 每端点并发限流
平台 SHALL 对每个端点按其 `max_concurrency` 限制在执行中的并发推理数(限流为必做项,非可选)。当端点在执行并发已达上限时:同步推理 MUST 立即返回 **429**;异步推理 MUST 排队等待空位、不立即返回 429。429 拒绝的同步调用 MUST 记入推理日志(状态=429)。

#### Scenario: 同步推理并发超限返回 429
- **WHEN** 端点在执行并发已达 `max_concurrency`,此时再来一个同步推理
- **THEN** 平台立即返回 429,并写入一条状态为 429 的推理日志

#### Scenario: 异步推理并发超限时排队
- **WHEN** 端点在执行并发已达 `max_concurrency`,此时提交异步推理
- **THEN** 任务进入排队等待,待出现空位后再执行,不返回 429

#### Scenario: 执行结束/异常/超时后名额释放
- **WHEN** 某次同步或异步推理在成功、模拟执行异常或超时任一出口结束
- **THEN** 该端点占用的并发额度 MUST 被释放,使下一个到达的请求能拿到该名额(同步不再因满而 429、异步可出队执行)

### Requirement: 推理日志与命中记录
平台 SHALL 为每一次推理调用(成功/超时/错误/429)记录一条推理日志,内容 MUST 覆盖:端点、**实际命中版本**、模式(sync/async)、输入摘要、输出摘要、延迟、状态。命中版本的记录 MUST 支撑后续(监控)按版本分组的 A/B 效果分析(对在选版本之前即被拒的 429 调用,实际命中版本可为空)。输入/输出摘要 MUST 为截断摘要以避免存储超大内容。

#### Scenario: 每次调用落一条日志
- **WHEN** 任意一次同步或异步推理结束(无论成功、超时、错误或 429)
- **THEN** 平台写入一条推理日志,含端点、实际命中版本、模式、输入/输出摘要、延迟与状态

### Requirement: 推理前置约束与范围边界
平台 MUST 仅允许对 `running` 端点发起推理;对 `creating/stopped/failed` 端点的推理请求 MUST 被拒绝。推理执行在 v1.0 为**模拟**(`sleep` 计时 + 按命中 Model 的 `output_schema` 生成占位结果),MUST NOT 调用任何外部模型后端。本能力 MUST 严守 v1.0 §4.3 范围,MUST NOT 引入 external-api 来源、流式 SSE、成本/用量计量、token/LLM 专属指标(均属 v1.1+ 已定档)。

#### Scenario: 非 running 端点拒绝推理
- **WHEN** 调用方对一个 `creating`、`stopped` 或 `failed` 端点发起推理
- **THEN** 平台拒绝该请求(不执行推理)

#### Scenario: 模拟执行按输出 Schema 生成结果
- **WHEN** 推理在 `running` 端点上成功执行
- **THEN** 平台不调用任何外部后端,返回的结果符合命中 Model 的 `output_schema` 形态(占位数据)

#### Scenario: output_schema 为空或含未覆盖构造时安全回退
- **WHEN** 命中 Model 的 `output_schema` 为空(`{}`)、缺失或含 mock 生成器未覆盖的构造
- **THEN** 平台返回安全占位结果、不抛错,仍按成功路径执行并落一条成功状态的推理日志
