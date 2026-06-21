## RENAMED Requirements

- FROM: `### Requirement: canonical 内核与 OpenAI 南向适配器`
- TO: `### Requirement: canonical 内核与南向协议适配器`

## MODIFIED Requirements

### Requirement: canonical 内核与南向协议适配器

平台 SHALL 以一套与协议无关的 **canonical 表示**(统一 chat 请求/结果 + 统一 usage)承载执行层的 Schema 校验、A/B、日志与指标;南向(消费上游)协议适配通过**适配器**完成,适配器在 canonical 与具体上游 wire 格式之间双向转换。平台 MUST 同时提供 **OpenAI 兼容**与 **Anthropic 兼容**两个南向适配器;新增协议 MUST 为纯加挂(新增一个适配器 + 一行注册),不改 canonical 内核(即 N+M 而非 N×M)。usage MUST 归一化(`input/output_tokens ↔ prompt/completion_tokens`)。请求解析 MUST 把首条 `role:"system"` 消息提取为 canonical 的顶层 `system` 字段。Anthropic 适配器 MUST 把 canonical 顶层 `system` 映射为 Anthropic 请求体的顶层 `system` 字段、MUST 为 Anthropic 必填的 `max_tokens` 取值(canonical 未给时用平台默认值),并把响应 `content` 数组中 `type=="text"` 的文本块拼接所得文本、`stop_reason` 与 `usage.input_tokens/output_tokens` 解析回 canonical(`content` 是 block 数组,首块不保证是 text,MUST NOT 硬取 `content[0]`)。上游鉴权头 MUST 按协议派发(OpenAI=`Authorization: Bearer`;Anthropic=`x-api-key` + `anthropic-version`),密钥仍以 `auth_ref` 引用持有,mock 上游下 MUST NOT 解析真密钥。

#### Scenario: OpenAI 适配器双向转换
- **WHEN** 一个 canonical chat 请求经 OpenAI 南向适配器发往上游、上游返回 OpenAI 形状响应
- **THEN** 适配器把 canonical 转为 OpenAI 请求体(含 `model`/`messages`/可选 `max_tokens`),并把响应的 `choices[0].message.content` 与 `usage.prompt_tokens/completion_tokens` 解析回 canonical(归一为 `input_tokens/output_tokens`)

#### Scenario: Anthropic 适配器双向转换
- **WHEN** 一个 canonical chat 请求经 Anthropic 南向适配器发往上游、上游返回 Anthropic 形状响应
- **THEN** 适配器把 canonical 转为 Anthropic 请求体(`/messages` 路径、顶层 `system` 字段、必填 `max_tokens`、`messages`),并把响应 `content` 中 `type=="text"` 文本块拼接所得文本、`stop_reason` 与 `usage.input_tokens/output_tokens` 解析回 canonical

#### Scenario: 鉴权头按协议派发
- **WHEN** 平台向上游发起 OpenAI 协议或 Anthropic 协议的请求(非 mock 且 `auth_ref` 指向的密钥存在)
- **THEN** OpenAI 协议注入 `Authorization: Bearer <key>`,Anthropic 协议注入 `x-api-key: <key>` 并带 `anthropic-version` 头

#### Scenario: 不支持的协议被拒绝
- **WHEN** 某 external-api 版本声明的 `protocol` 不在受支持集合 `{openai, anthropic}` 内
- **THEN** 平台以清晰错误拒绝该推理,不发往上游

#### Scenario: 打桩上游按协议提供 wire
- **WHEN** 在内置打桩上游(`upstream_mock=True`)下分别命中 OpenAI 与 Anthropic 协议的 external-api 版本
- **THEN** 打桩上游按请求路径分别返回 OpenAI 形状(`/chat/completions`)与 Anthropic 形状(`/messages`)的确定性响应,使无密钥/无网络下两种协议均可端到端成功

#### Scenario: 北向 OpenAI 入口经 Anthropic 南向转发(N+M 跨协议)
- **WHEN** 北向 `POST /v1/chat/completions` 寻址到一个绑定了 `protocol=anthropic` 的 external-api 端点
- **THEN** 平台以 OpenAI-in → canonical → Anthropic-out 路径转发上游,并以 OpenAI 形状返回响应(usage 经 canonical 归一),北向暴露形态不因南向协议而改变
