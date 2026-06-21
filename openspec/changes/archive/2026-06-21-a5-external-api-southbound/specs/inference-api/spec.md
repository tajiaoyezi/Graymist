## ADDED Requirements

### Requirement: external-api 来源真实推理

平台 SHALL 支持 `source = external-api` 的版本:推理时**真用 HTTP(httpx)转发到上游模型后端**(由版本的 `base_url`/`upstream_model`/`protocol`/`auth_ref` 决定),返回**真实结果、真实延迟与真实 token 用量**,取代 mock 来源的 `sleep` + 占位输出。external-api 推理 MUST 复用既有的 A/B 路由、每端点并发限流与推理日志(其行为对外不变),仅执行内核按版本 `source` 分派。上游连接的认证 MUST 以引用(`auth_ref`,如环境变量名)持有,MUST NOT 在版本记录中存明文密钥。v1.1 上游对接 MAY 由内置打桩(确定性假上游、同 wire 格式)提供,使无密钥/无网络下仍可端到端运行。

#### Scenario: external-api 同步推理返回真实结果与用量
- **WHEN** 业务调用方对一个绑定了 external-api 版本的 `running` 端点发起同步推理且输入为合法 chat
- **THEN** 平台经 httpx 转发上游、返回上游的真实结果、真实墙钟延迟与归一化 token 用量,并写入一条状态为成功、含 token 用量的推理日志

#### Scenario: 上游错误映射
- **WHEN** external-api 推理时上游返回非 2xx 响应
- **THEN** 平台以上游错误(502)返回(同步)或将异步任务置为 `failed`,并写入一条状态为错误的推理日志

#### Scenario: 上游超时
- **WHEN** external-api 推理的上游往返耗时超过端点 `timeout_ms`
- **THEN** 平台以超时(504)返回而非正常结果,并写入一条状态为超时的推理日志

### Requirement: canonical 内核与 OpenAI 南向适配器

平台 SHALL 以一套与协议无关的 **canonical 表示**(统一 chat 请求/结果 + 统一 usage)承载执行层的 Schema 校验、A/B、日志与指标;南向(消费上游)协议适配通过**适配器**完成,适配器在 canonical 与具体上游 wire 格式之间双向转换。本 change MUST 提供 **OpenAI 兼容**南向适配器;适配器接口 MUST 设计为可加挂(后续 Anthropic 等为纯新增,不改 canonical 内核,即 N+M 而非 N×M)。usage MUST 归一化(`input/output_tokens ↔ prompt/completion_tokens`)。请求解析 MUST 把首条 `role:"system"` 消息提取为 canonical 的顶层 `system` 字段。

#### Scenario: OpenAI 适配器双向转换
- **WHEN** 一个 canonical chat 请求经 OpenAI 南向适配器发往上游、上游返回 OpenAI 形状响应
- **THEN** 适配器把 canonical 转为 OpenAI 请求体(含 `model`/`messages`/可选 `max_tokens`),并把响应的 `choices[0].message.content` 与 `usage.prompt_tokens/completion_tokens` 解析回 canonical(归一为 `input_tokens/output_tokens`)

#### Scenario: 不支持的协议被拒绝
- **WHEN** 某 external-api 版本声明的 `protocol` 在本 change 尚不支持(非 `openai`)
- **THEN** 平台以清晰错误拒绝该推理,不发往上游

### Requirement: 北向 OpenAI 兼容寻址

平台 SHALL 额外提供 OpenAI 兼容的北向调用入口 `POST /v1/chat/completions`:请求体的 `model` 字段用于**寻址到某个端点**(匹配端点的 `url_path`),命中后复用既有同步推理链路(A/B、限流、日志),并以 **OpenAI 形状**返回响应(`choices[].message` + `usage`)。该入口 MUST 仅解析"选哪个部署 + chat 输入",MUST NOT 引入调用方鉴权、调用方身份或按调用方限流(均属 v1.1.1);若请求带鉴权头 MUST 予以忽略。既有 `POST /endpoints/{id}/infer` 入口 MUST 保留不变。成功响应 MUST 含 `usage`(由推理服务透出);错误响应本期沿用平台 `{detail}` 形状(404/409/502/504),OpenAI 风 `{error:{...}}` 错误体留待 v1.1.1 网关化对齐。

#### Scenario: 凭 model 寻址并返回 OpenAI 形状
- **WHEN** 调用方对 `POST /v1/chat/completions` 提交 `{model: <某 running 端点的 url_path>, messages: [...]}`
- **THEN** 平台寻址到该端点、执行推理,并返回 OpenAI 形状的 `chat.completion`(含 `choices[].message.content` 与 `usage`)

#### Scenario: 未知 model 与非 running 端点
- **WHEN** `model` 不匹配任何端点 `url_path`,或匹配的端点非 `running`
- **THEN** 平台分别返回 404(未知)或 409(非 running),不执行推理

#### Scenario: 北向入口不做鉴权
- **WHEN** 调用方携带 `Authorization`/`x-api-key` 头请求 `POST /v1/chat/completions`
- **THEN** 平台忽略该头、按既有(端点级)规则执行,不据此识别调用方或施加按调用方限流

### Requirement: 推理用量(usage)记录

平台 SHALL 在推理日志中记录每次调用的 token 用量(`prompt_tokens`/`completion_tokens`/`total_tokens`)。external-api 来源 MUST 记录上游返回并归一化后的真实用量;mock 来源无真实用量,其用量字段 MUST 留空(NULL)。本 change MUST 仅**记录**用量,MUST NOT 做用量聚合、成本计价或成本维度监控(均属 v1.1.2)。

#### Scenario: external-api 调用记录真实用量
- **WHEN** 一次 external-api 推理成功完成
- **THEN** 其推理日志含来自上游、经归一化的 `prompt/completion/total_tokens`

#### Scenario: mock 调用用量留空
- **WHEN** 一次 mock 来源推理成功完成
- **THEN** 其推理日志的用量字段为空(NULL),不臆造 token 数

## MODIFIED Requirements

### Requirement: 推理输入 Schema 校验

平台 SHALL 在执行推理前按版本来源**分派**输入校验(Schema 一等公民的语义在各家族内保持):对 **mock** 来源,按命中 Model 的 `input_schema` 校验请求输入(贯穿版本定义→推理校验→Playground 表单);对 **external-api**(LLM chat)来源,改为校验输入是否为合法 **canonical chat 形状**(含 `messages`),不按任意 `input_schema` 校验。任一家族校验不通过时 MUST 拒绝(返回 422)且 MUST NOT 进入执行、MUST NOT 占用并发额度(422-前置契约对两家族一致)。

#### Scenario: 非法输入被 Schema 校验拦截(mock)
- **WHEN** mock 来源端点的同步或异步推理输入不符合命中 Model 的 `input_schema`
- **THEN** 平台返回 422 校验错误,不执行推理、不占用端点并发额度

#### Scenario: 非 chat 形状输入被拦截(external-api)
- **WHEN** external-api 来源端点的推理输入不是合法 chat 形状(缺少 `messages`)
- **THEN** 平台返回 422 校验错误,不发往上游、不占用端点并发额度

### Requirement: 推理日志与命中记录

平台 SHALL 为每一次推理调用(成功/超时/错误/429)记录一条推理日志,内容 MUST 覆盖:端点、**实际命中版本**、模式(sync/async)、输入摘要、输出摘要、延迟、状态,并 MUST 含 token 用量字段(`prompt/completion/total_tokens`;external-api 落真实归一化用量,mock 留空)。命中版本的记录 MUST 支撑后续(监控)按版本分组的 A/B 效果分析(对在选版本之前即被拒的 429 调用,实际命中版本可为空)。输入/输出摘要 MUST 为截断摘要以避免存储超大内容。

#### Scenario: 每次调用落一条日志
- **WHEN** 任意一次同步或异步推理结束(无论成功、超时、错误或 429)
- **THEN** 平台写入一条推理日志,含端点、实际命中版本、模式、输入/输出摘要、延迟、状态,以及 token 用量(external-api 为真实值、mock 为空)

### Requirement: 推理前置约束与范围边界

平台 MUST 仅允许对 `running` 端点发起推理;对 `creating/stopped/failed` 端点的推理请求 MUST 被拒绝。推理执行 MUST 按命中版本的 `source` **分派**:`mock` 来源为**模拟**(`sleep` 计时 + 按命中 Model 的 `output_schema` 生成占位结果,行为与 v1.0 一致,不调用任何外部后端);`external-api` 来源为**真实转发上游**(httpx,返回真结果/真延迟/真用量)。本能力据已定档 v1.1 解除 v1.0 对 external-api 来源的禁入约束,但 MUST 仍不引入:流式 SSE、用量聚合/成本计价、token/LLM 专属指标、北向 Anthropic 协议、调用方鉴权/按调用方限流、local-engine/uploaded-file 来源(分属 v1.1.1 / v1.1.2 / v1.2 / v2.0)。

#### Scenario: 非 running 端点拒绝推理
- **WHEN** 调用方对一个 `creating`、`stopped` 或 `failed` 端点发起推理
- **THEN** 平台拒绝该请求(不执行推理)

#### Scenario: mock 来源仍模拟执行
- **WHEN** 推理命中一个 mock 来源版本并成功执行
- **THEN** 平台不调用任何外部后端,返回符合命中 Model 的 `output_schema` 形态的占位结果(行为与 v1.0 一致)

#### Scenario: external-api 来源真实转发
- **WHEN** 推理命中一个 external-api 来源版本
- **THEN** 平台经 httpx 转发上游执行,返回真实结果/延迟/用量,不再使用 `sleep` 或占位输出

#### Scenario: output_schema 为空或含未覆盖构造时安全回退(mock)
- **WHEN** mock 来源命中 Model 的 `output_schema` 为空(`{}`)、缺失或含 mock 生成器未覆盖的构造
- **THEN** 平台返回安全占位结果、不抛错,仍按成功路径执行并落一条成功状态的推理日志
