## ADDED Requirements

### Requirement: 时间窗聚合指标查询
平台 SHALL 提供按端点 + 时间范围查询的聚合指标:**QPS、平均延迟、P99 延迟、错误率**(覆盖原 §2.4 采集指标)。时间范围 MUST 支持最近 1 小时(按分钟分桶)、最近 24 小时(按小时分桶)、最近 7 天(按天分桶);每个桶返回一组指标,形成可供前端图表直接消费的时间序列。指标 MUST 从推理日志(`inference_log`)按需聚合。**错误率** = 非成功调用(`timeout` / `error` / `rate_limited`「HTTP 429」)/ 全部调用。**平均延迟与 P99 MUST 仅基于实际执行的调用(`status ∈ {success, timeout}`)统计;未实际执行、`latency_ms` 记为 0 的调用(`rate_limited` / `error`)MUST 计入错误率分母但 MUST NOT 计入延迟样本**。除按桶返回时间序列外,平台 SHALL 一并返回**整窗汇总**(QPS/平均延迟/P99/错误率,把整窗视为单一桶套用同口径)供指标卡呈现。

#### Scenario: 按时间窗返回聚合序列
- **WHEN** 用户查询某端点最近 24 小时的指标
- **THEN** 平台返回按小时分桶的 QPS、平均延迟、P99 延迟、错误率时间序列

#### Scenario: 窗口内无调用
- **WHEN** 某端点在所选时间范围内没有任何推理调用
- **THEN** 平台返回空或零值序列而非报错

#### Scenario: 非空窗口内的空桶取值
- **WHEN** 窗口内有调用但某分桶(分钟/小时/天)内无任何调用
- **THEN** 该桶 QPS/平均延迟/P99/错误率均返回 0(空桶补零,不报错)

#### Scenario: 被拒/未执行调用不污染延迟统计
- **WHEN** 某桶内既有已执行调用(success/timeout)又有 `rate_limited` 或 `error`(`latency_ms=0`、未代表真实延迟)调用
- **THEN** 该桶平均延迟/P99 仅按已执行调用计算,`rate_limited`/`error` 仅计入错误率分母而不拉低延迟

#### Scenario: 端点不存在被拒绝
- **WHEN** 查询的 `endpoint_id` 不存在
- **THEN** 平台返回 404

#### Scenario: 非法时间范围被拒绝
- **WHEN** `range` 不是 1h/24h/7d
- **THEN** 平台返回 422

### Requirement: 按版本分组与 A/B 对比
平台 SHALL 支持将某端点的指标**按实际命中版本分组**返回,使前端可按版本分系列对比 A/B 效果。分组依据为 `inference_log.version_id`(实际命中版本)。

#### Scenario: 多版本端点按版本分组
- **WHEN** 用户查询一个挂载 A/B 多版本的端点并要求按版本分组
- **THEN** 平台为各命中版本分别返回其指标序列,供前端做 A/B 对比

#### Scenario: 无命中版本的行不单列为版本
- **WHEN** 端点窗口内存在 `version_id` 为空的调用(429 被拒、或无 ready 版本的 error 等未命中版本的非成功调用)
- **THEN** 这些行不形成任何版本系列,但其非成功状态仍计入端点总序列的错误率

### Requirement: 当前并发数实时 gauge
平台 SHALL 提供端点**当前在执行的并发推理数**(实时 gauge)。该值来自推理执行期的在飞计数(进程内并发控制),而非历史日志聚合。

#### Scenario: 查询当前并发数
- **WHEN** 用户查询某端点的当前并发数
- **THEN** 平台返回该端点此刻在执行中的并发推理数(无在飞调用时为 0)

### Requirement: 资源总览
平台 SHALL 提供平台资源总览(CPU/内存/GPU 的已用 / 总量),口径与端点部署的资源配额累计校验一致(复用平台配额,不另起一套口径)。

#### Scenario: 资源总览呈现已用与总量
- **WHEN** 用户查看资源总览
- **THEN** 平台返回 CPU/内存/GPU 三维的已用与总量(与 `endpoint-deployment` 配额口径一致)

### Requirement: 监控范围边界
监控能力 MUST 严守 v1.0 §4.4 范围,MUST NOT 引入成本/用量计量维度(v1.1.2)、token/LLM 专属指标(TTFT/TPOT/tokens-s,v1.2)、告警与通知(v1.4)、分布式追踪(E12)。聚合 MUST 只读推理日志/配额/并发计数,MUST NOT 改变 a1/a2/a3 的功能行为。

#### Scenario: 不出现超纲指标
- **WHEN** 查询或浏览监控数据
- **THEN** 仅含 QPS/平均延迟/P99/错误率/当前并发数与资源总览,不含成本、token、LLM 专属指标或告警
