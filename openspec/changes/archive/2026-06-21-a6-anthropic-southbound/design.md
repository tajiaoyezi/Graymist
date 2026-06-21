## Context

a5 已落地 v1.1 的 canonical 内核 + OpenAI 南向 + 真实数据流 + 北向 OpenAI 寻址,并**刻意按 N+M 预埋了 Anthropic 接入缝**:

- `canonical.parse_to_canonical`(`canonical.py:48`)已把首条 `role:system` 提到顶层 `system` 字段——Anthropic「顶层 system」无需再改。
- `adapters.get_adapter(protocol)`(`adapters/__init__.py:24`)按 `protocol` 派发,目前 `openai` 返回 `OpenAIAdapter`,其余抛 `InferenceInputInvalidError`。
- `SouthboundAdapter` Protocol(`adapters/__init__.py:12`)已定义 `build_request`/`parse_response` 双向接口。
- `external.run`(`external.py:26`)已是 `parse_to_canonical → get_adapter(version.protocol).build_request → post_upstream → parse_response`,协议无关。
- `http_client`(`http_client.py`)有 `_transport_override` 测试缝 + `upstream_mock` 内置打桩。
- `ModelVersionRow.protocol` 列 a5 已加(无新迁移)。

三处显式的「openai-only」闸口需解除:`versions/schemas.py:42`(`protocol != "openai"` 抛错)、`NewVersionForm.tsx:174`(只读 `openai`)、`get_adapter` 的非 openai 分支。本 change = 在这些缝上挂一个 Anthropic 适配器,补齐 v1.1 §11 的 1.1-b 另一半。

## Goals / Non-Goals

**Goals:**
- 新增 `AnthropicAdapter`,使 `source=external-api`、`protocol=anthropic` 的版本能真实转发到 Claude 系上游(打桩),返回真结果/真延迟/真 usage。
- 解除三处 openai-only 闸口,前后端均支持 `protocol ∈ {openai, anthropic}`。
- 打桩上游按路径同时供 OpenAI / Anthropic 两种 wire,CI 离线、无密钥仍端到端绿。
- 证明 N+M:北向 OpenAI 入口 → canonical → Anthropic 南向出,跨协议链路自动成立。

**Non-Goals:**
- **北向 Anthropic 入口**(`/v1/messages`)——属 v1.1.1,本 change 不做(仅南向)。
- 调用方鉴权 / 按调用方限流 / 成本计量聚合 / SSE 流式 / LLM 专属指标(分属 v1.1.1 / v1.1.2 / v1.2)。
- local-engine / uploaded-file 来源、真上游密钥联调(纯 mock)。

## Decisions

### D1：Anthropic 适配器 = 新增文件,不碰 canonical 内核
`adapters/anthropic.py` 新增 `AnthropicAdapter`,实现既有 `SouthboundAdapter` 协议。`build_request`:path=`/messages`,body 含顶层 `system`(来自 canonical.system)、`messages`、**必填 `max_tokens`**、可选 `temperature`;headers 含 `anthropic-version`(常量,如 `2023-06-01`)。`parse_response`:**遍历 `content` 数组、过滤 `type=="text"` 的 block 并拼接其 `text`**(Anthropic `content` 是 block 数组,首块不保证是 text——thinking 块会前置、也可能多个 text 块,不能照搬 OpenAI 的 `[0]` 索引),取 `stop_reason`;usage 直接读 `input_tokens`/`output_tokens`(无总数则 `total=input+output`,该命名已是 canonical 风、仅响应方向免一次改名)。找不到任何 text block 或响应体不可解析 → 抛**裸 `UpstreamError`**(502 由 `main.py` 统一映射,不在适配器内构造 502),与 OpenAI 适配器一致。
**为何不抽公共基类**:两个适配器各自 wire 差异大、各约 30 行纯映射,强抽基类反而增耦合;Protocol 鸭子类型已够(简单优先)。

### D2：`max_tokens` 必填的兜底
Anthropic 的 `max_tokens` 必填而 OpenAI 可选。canonical 未携带 `max_tokens` 时,`AnthropicAdapter` MUST 用模块常量默认值(`DEFAULT_MAX_TOKENS = 4096`,取较安全量级避免静默截断;1024 偏低)兜底,避免真上游 400。OpenAI 适配器行为不变(`max_tokens` 仍可选、不兜底)。注:本刀不透出 `stop_reason`/截断状态(沿用 a5 北向硬编码 `finish_reason`),故默认值与截断可见性留待真上游接入复核(见 Open Questions)。

### D3：鉴权头按协议派发——适配器自报,external.py 仍集中读密钥
当前 `external._auth_headers`(`external.py:16`)硬编码 `Authorization: Bearer`。改为:`SouthboundAdapter` 增一个 `auth_headers(key) -> dict` 方法(OpenAI 返回 `{"Authorization": f"Bearer {key}"}`,Anthropic 返回 `{"x-api-key": key}`);`external.run` 在拿到 `adapter` 后,把 `_auth_headers` 改为「mock 或无 auth_ref → 原样;否则 `key = os.environ.get(auth_ref)`,**`key` 为空(环境变量缺失)仍原样返回、不调 `adapter.auth_headers`**(保留 a5 现有的『有 auth_ref 但 key 缺失→不注入头』兜底,避免注入 `Bearer None`/`x-api-key: None` 脏头);有 key 才 `{**headers, **adapter.auth_headers(key)}` 合并」。
**为何密钥读取仍留在 external.py**:安全上密钥读取(`os.environ`)集中一处便于审计,适配器只声明「头长什么样」不接触 `os.environ`;`anthropic-version` 这类**非密钥常量头**则由 `build_request` 自带(它属 wire 形状,不属凭证)。

### D4：打桩上游按请求路径派发 wire
`http_client._default_mock_handler`(`http_client.py:26`)当前恒返回 OpenAI 形状。改为按 `request.url.path` 派发:以 `/messages` 结尾 → 返回 Anthropic 形状假响应(`content:[{type:"text",text:"echo: ..."}]` + `stop_reason:"end_turn"` + `usage:{input_tokens,output_tokens}`);否则 → 现有 OpenAI 形状(**字节不变**)。回声逻辑(取最后一条 user content)两路一致,仅外层 wire 不同;usage 计法两路同源(分词计数),但 Anthropic 的 `system` 在顶层、不计入 `messages`,带 system 时 `input_tokens` 可能与 OpenAI 路径略异——属 mock 内部细节,不影响 canonical 归一契约,**勿写跨协议 usage 数值相等断言**。
**为何用路径而非 header**:路径由各适配器的 `build_request` 决定,天然是协议判别式,无需额外约定;mock 自路由,新增协议时只加一个分支。

### D5：北向不动,跨协议自动成立
北向 `/v1/chat/completions`(a5)做的是 OpenAI-in → canonical → `infer_sync`,`infer_sync` 内按版本 `source`/`protocol` 派发南向适配器。故当端点绑定 `protocol=anthropic` 版本时,北向请求自动走 OpenAI-in → Anthropic-out,**北向路由零改动**。返回仍是 OpenAI 形状(北向编码器读 canonical usage,与南向协议无关)。本 change 仅以测试**证明**该链路,不新增北向代码。

### D6：版本注册放开 protocol
后端 `versions/schemas.py:42` 的 `if self.protocol != "openai": raise` 改为 `if self.protocol not in ("openai", "anthropic"): raise`,默认仍 `openai`。前端 `NewVersionForm.tsx` 把只读 `openai` 输入框换成 `<select>{openai, anthropic}`,提交透传 `protocol` 状态(原硬编码 `protocol: "openai"` 改为变量)。i18n 增协议项文案。

## Risks / Trade-offs

- [Anthropic `max_tokens` 真上游必填,mock 下不暴露] → D2 适配器侧兜底默认值,真上游接入前即正确;并以单测断言「canonical 无 max_tokens 时 Anthropic 请求体仍含 max_tokens」。
- [打桩按路径派发,若某协议路径约定变化会漏配] → 路径来自适配器 `build_request`,与 mock 同源;新增协议时单测覆盖「打桩按协议返回对应 wire」即可暴露。
- [鉴权头改造可能回归 OpenAI 现有行为] → a5 **无**非-mock 鉴权注入回归用例(既有 external 用例全在 `upstream_mock=True` 下、`_auth_headers` 第一项即短路,Bearer 分支零覆盖);故 2.3 是**首次**为出站鉴权落测——用 capturing-transport(复用 `test_external_inference.py` 的 `_reflect_model` 模式)+ `monkeypatch.setenv(auth_ref)` + `upstream_mock=False`,钉死 OpenAI 注入 `Authorization: Bearer <key>`、Anthropic 注入 `x-api-key: <key>`,并各补 `auth_ref` 缺失→不注入用例。`OpenAIAdapter.auth_headers` 严格复刻原 `Authorization: Bearer`(纯重构、行为等价)。
- [前端 protocol 由只读改 select,可能影响 a5 表单测试] → 更新 `NewVersionForm.test.tsx`:默认 openai 提交不变(回归)、切 anthropic 提交 `protocol=anthropic`(新增)。
- [非首位或多条 `role:system` 消息仍留在 `messages`,真 Anthropic `/messages` 会 400] → canonical 仅提升首条 system(`canonical.py:53`),本刀不改 canonical(超纲);mock 不校验角色故不暴露,属真上游已知限制(见 Open Questions)。

## Migration Plan

- **数据库**:无迁移——`protocol` 列 a5 已存在,旧 external 版本 `protocol="openai"` 不受影响。
- **回滚**:纯加挂,回滚 = 还原三处闸口 + 删 `anthropic.py`;不影响既有 mock/OpenAI 数据与行为。
- **dev.db**:无需改动(无新列)。

## Open Questions

- `anthropic-version` 常量值固定为 `2023-06-01`(稳定且广泛兼容);真上游联调期如需更新,改一处适配器常量即可——本 change 不参数化。
- `DEFAULT_MAX_TOKENS=4096` 仅在 mock 下无影响;真上游接入(v1.1.1+)前需结合目标模型 output 上限复核,并决定是否透出 `stop_reason`/截断状态。
- 非首位/多条 `role:system` 消息在真 Anthropic 上游会 400(mock 不暴露);留待真上游联调期在 canonical 层处理,本刀不做。
