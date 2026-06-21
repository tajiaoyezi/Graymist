## Why

v1.0 已发布(tag `v1.0.0`,§2.1–2.8 全实现),但推理执行仍是 `asyncio.sleep` + 按 schema 造占位结果的**模拟**。技术方案把下一里程碑定为 **v1.1 南向接入 + 真实数据流**(§11)—— 让平台第一次真正调用外部模型、返回真结果/真延迟/真 usage,并立起 **canonical 内核 + 协议适配器(N+M)** 这条脊柱:Anthropic 南向适配器、v1.1.1 北向对外、v1.1.2 用量计量、v1.1.3 评测都要长在它上面。本 change 是 v1.1 的**第一刀**,只做 **OpenAI 南向**(Anthropic 另起),上游**纯 mock**(httpx 打桩、无 key/无成本、CI 离线全绿)。

## What Changes

- **新增 external-api 来源(§11 1.1-a)**:`Version` 增 `source`(`mock|external-api`,默认 `mock`)及 `{provider, base_url, upstream_model, protocol(openai), auth_ref}`;`auth_ref` 存凭证引用(环境变量名),**非明文密钥**;localhost Ollama = `base_url` 指本机的同一机制,不单列。
- **canonical 内核 + OpenAI 南向适配器(§11 1.1-b/1.1-c,§21)**:统一 chat 表示 + 统一 usage 归一化(`input/output_tokens ↔ prompt/completion_tokens`);南向适配器协议(canonical↔OpenAI wire),`protocol` 列与 system 字段处理已为 Anthropic 留缝。
- **真实数据流(§11 1.1-d)**:external-api 推理**不再 `sleep`**,真用 httpx 转发上游 → 返回真 content/真延迟/真 usage;**上游纯 mock**(httpx `MockTransport` 假 OpenAI server,同 wire 格式、确定性回声 + 固定 usage)。mock 来源的执行路径**字节不变**。
- **北向寻址雏形**:新增 `POST /v1/chat/completions`(body 的 `model` 匹配端点 `url_path` 选部署 → OpenAI 形状响应);`/endpoints/{id}/infer` **原样保留**。该路由**刻意免鉴权**(止步线见下)。技术方案 §11/§21 把北向落点定档 v1.1.1;本 change **有意将北向寻址面(model→url_path,免鉴权)提前至 v1.1** 以演示 external 真网关面,v1.1.1 的实质(鉴权/调用方身份/按调用方限流/Anthropic 入口)严格止步。
- **推理日志加 usage**:`InferenceLog` 增 `prompt/completion/total_tokens`(external 落真值,mock 留空);v1.1.2 成本计量复用此缝,**本刀只落不聚合**。
- **配额按来源跳过(§4.2 / D4)**:external-api 端点**不走本地资源预算检查**、不计入已用配额(判定 = 平台是否管后端生命周期,非物理位置)。
- **单一来源守卫**:同端点绑定要么全 external-api、要么全 mock(混绑 422),使执行分支无歧义。
- **前端(最小可演示)**:版本表单加 source 开关 + external 字段;Playground 对 external-api 端点渲染 chat 编排器并展示真结果/延迟/usage;mock 路径不动。
- **放开 v1.0 范围条款**:`inference-api` 的「不得引入 external-api / token 计量」与 `web-ui`「范围约束与国际化」中禁 external-api/Playground 用量的 v1.0 条款,由本 change 作为**已定档 v1.1** 的正式落点解除(仅就 external-api 来源与 Playground chat/usage)。
- **范围约束(不超纲)**:**仅** OpenAI 南向 + 真实数据流 + 北向寻址雏形;**不做** Anthropic 南向、API Key 鉴权/调用方身份/按调用方限流(v1.1.1)、usage 聚合/成本(v1.1.2)、validating 做实(v1.1.3)、SSE 流式/LLM 指标/local-engine(v1.2)。

## Capabilities

### New Capabilities
<!-- 无:本 change 全部为既有能力的需求变更,不新建 capability。canonical 内核/适配器属 inference-api 的实现层。 -->

### Modified Capabilities
- `inference-api`: 推理执行从「仅模拟」升级为「按来源派发:mock 模拟 / external-api 真转发上游」;新增 canonical 内核与 OpenAI 南向适配器、真实 usage 记录、北向 `/v1/chat/completions` 寻址;解除「不得引入 external-api/token 计量」约束(仅 external-api)。
- `endpoint-deployment`: 端点可按 `url_path` 作为 `model` 名被北向寻址;新增**单一来源绑定守卫**;external-api 端点**跳过 §4.2 资源预算检查与配额计入**。
- `web-ui`: 1 ADDED(external-api 版本注册)+ 2 MODIFIED(推理 Playground 增 external chat 输入与 usage 展示、范围约束与国际化放开 external-api),其余 web-ui 需求不变。

## Impact

- **后端(新增)**:`app/inference/canonical.py`(canonical 类型 + 解析)、`app/inference/http_client.py`(懒建 `httpx.AsyncClient` + `_transport_override` 打桩缝)、`app/inference/external.py`(`ExternalApiExecutor`)、`app/inference/adapters/`(`__init__` 派发 + `openai.py` + 基类 Protocol)。
- **后端(修改)**:`db/tables.py`(`ModelVersionRow` 增来源列、`InferenceLogRow` 增 token 列);`inference/service.py`(`_run_core` 改 executor 派发、`_validate_input` 按来源派发、`_log` 增 token kwargs);`inference/router.py`(新增 `/v1/chat/completions`);`endpoints/service.py`(单一来源守卫 + 配额跳过);`config.py`(`upstream_mock` 等);`versions/schemas.py`、`models` 序列化补来源字段。
- **依赖**:`httpx` 由 `[dev]` 移入运行时依赖(生产路径用到);无其它新依赖。
- **数据/迁移**:新增列均可空 + `source` 默认 `mock`,既有行零回填。新增 Alembic 迁移 `migrations/versions/0005_external_api_source.py`(Revises `0004_inference_tables`,`op.add_column` 加 Version 6 列 + InferenceLog 3 token 列,downgrade 对称),沿用既有 0001–0004 先例;测试/CI 仍走 `create_all` 自带新列,现有 `dev.db` 跑 `alembic upgrade head` 补列保数据。
- **前端**:`components/NewVersionForm.tsx`、`components/CreateModelForm.tsx`、`pages/PlaygroundPage.tsx`、`api/client.ts`、`types.ts`、`i18n/locales/zh.ts`。
- **兼容**:mock 来源端到端行为不变(a3 整套回归全绿);新能力对既有 a1/a2/a4 实体只增不改。
