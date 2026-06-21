## 1. 数据表、配置与迁移

- [x] 1.1 `db/tables.py`:`ModelVersionRow` 增可空列 `source`(default `"mock"`)、`provider`、`base_url`、`upstream_model`、`protocol`、`auth_ref`,并把 `file_path`/`framework` 改可空(供 external 版本);`InferenceLogRow` 增可空 `prompt_tokens`/`completion_tokens`/`total_tokens`
- [x] 1.2 `config.py` 增 `upstream_mock: bool = True`(本地/测试默认走打桩上游)、`upstream_connect_timeout_seconds`(httpx 连接级兜底;整体往返超时走端点 `timeout_ms`/`asyncio.wait_for`,不另设);**不加全局默认 base_url**(external 版本各自带);`pyproject.toml` 将 `httpx` 从 `[dev]` 移入运行时依赖
- [x] 1.3 新增 Alembic 迁移 `migrations/versions/0005_external_api_source.py`(`down_revision = "0004_inference_tables"`,`upgrade` 用 `op.add_column` 加上述列、`downgrade` 对称 drop),沿用 0001–0004 先例;现有 `dev.db` 跑 `alembic upgrade head` 补列保数据;测试/CI 走 `create_all` 自带新列
- [x] 1.4 `versions/schemas.py`/`VersionService.create` 按 source 派发必填集(mock 必填 file_path/framework;external 必填 provider/base_url/upstream_model/protocol);先写测试:仅带上游字段的 external 版本创建成功、mock 必填校验不变

## 2. canonical 内核 + OpenAI 南向适配器

- [x] 2.1 先写测试 `tests/unit/test_canonical.py`:`parse_to_canonical` 把首条 `role:system` 提升为 `system` 字段;usage 归一化 `prompt/completion ↔ input/output` 双向;`is_chat_like` 接受含 messages、拒绝非 chat
- [x] 2.2 实现 `inference/canonical.py`:`CanonicalChatRequest`/`CanonicalChatResult`/`CanonicalUsage` + `parse_to_canonical` + `is_chat_like`(纯逻辑、无 I/O)
- [x] 2.3 先写测试 `tests/unit/test_openai_adapter.py`:`build_request` 折叠 system/max_tokens、产出 `(path, json, headers)`;`parse_response` 取 `choices[0].message.content`/`finish_reason`、usage 映射;畸形响应体 → 清晰错误
- [x] 2.4 实现 `inference/adapters/`(`__init__.py` 基类 `SouthboundAdapter` Protocol + `get_adapter(protocol)` 派发,非 `openai` 抛"本期未支持";`openai.py` 适配器)

## 3. httpx 客户端 + 打桩上游

- [x] 3.1 实现 `inference/http_client.py`:模块级懒建 `httpx.AsyncClient` + `_transport_override` 缝(仿 `runner._spawn_fn`)+ `post_upstream(base_url, path, json, headers, timeout_s)`
- [x] 3.2 在 `tests/.../conftest.py` 提供 `httpx.MockTransport` 假 OpenAI server(确定性回声 content + 固定 usage,同 wire 格式,**不校验 Authorization**)并接到 `_transport_override`;`upstream_mock=True` 时本地 demo 走同款假 transport;补一条断言:`auth_ref` 对应环境变量不存在时 external 推理仍端到端成功(mock 阶段不解析真密钥)

## 4. external 执行器 + _run_core 派发(保 mock 字节不变)

- [x] 4.1 先写测试 `tests/integration/test_external_inference.py`:external-api 同步链路返回确定性 content + 真 usage 落库;异步变体经 `drain`;上游 5xx→502/error 日志(异步 failed);上游超时→504/timeout 日志;**A-B 双 external 版本经 `_select_fn` 确定性命中某版本 → 打到该版本的 `base_url`/`upstream_model` 假上游、日志 `version_id` 为该版本**
- [x] 4.2 实现 `inference/external.py` `ExternalApiExecutor.run`:`parse_to_canonical → get_adapter().build_request → post_upstream → parse_response`,量真实延迟、归一 usage、`asyncio.wait_for(timeout_ms)` 超时映射、上游非 2xx→`UpstreamError(502)`、适配失败→422
- [x] 4.3 重构 `inference/service.py` `_run_core`:按命中版本 `source` 派发——mock 分支保持 `simulate_latency_seconds`+`sleep`+`generate_output` **不变**(含 `latency_ms>timeout_ms` 事后比较与 latency 取值);external 分支走 `ExternalApiExecutor`;`_log` 增三个可选 token kwargs,两路分别落值/留空;`_run_core`/`infer_sync` 返回值 + `InferSyncOut`/`InferResult` **透出 usage**(供 Playground 与北向取用);external 超时须在抛 `InferenceTimeoutError` 前先写 `ST_TIMEOUT` 日志并 commit(既有 re-raise 分支不写日志)
- [x] 4.4 `main.py` 增 `UpstreamError→502` 异常映射(`InferenceTimeoutError→504`、`InferenceInputInvalidError→422` 已有)

## 5. 来源派发校验

- [x] 5.1 先写测试:external-api 端点非 chat 形状输入→422(不发上游、不占额度、异步不建任务);mock 端点 input_schema 校验不变(a3 回归)
- [x] 5.2 改 `infer_sync`/`submit_async` 的前置校验按来源派发:external 走 `is_chat_like`、mock 走既有 `input_schema` 校验,保 422-前置契约

## 6. 端点单一来源守卫 + 配额跳过

- [x] 6.1 先写测试 `tests/integration/test_external_quota_skip.py`:超预算 external-api 端点建/启/重启**成功**且其占用在 `/quota` 的 **used 与 remaining 均为 0**;超预算 mock 端点仍 409(回归);混绑不同来源→422
- [x] 6.2 `endpoints/service.py`:`_validate_bindings` 加单一来源守卫;`create/start/restart/update` 在 external-api 时跳过 `check_within_quota`、`_active_usages` 排除 external-api 端点

## 7. 北向 OpenAI 兼容寻址

- [x] 7.1 先写测试 `tests/integration/test_chat_completions_route.py`:`POST /v1/chat/completions` 以 `model`=url_path 寻址 running 端点、返回 OpenAI 形状体 + usage;未知 model→404、非 running→409;**带 Authorization 头被忽略、不做按调用方限流**
- [x] 7.2 `inference/router.py` 增 `POST /v1/chat/completions`:解析 body→canonical、`model`→url_path 解析端点、复用 `infer_sync`(取其透出的 usage)、re-encode 为 OpenAI 形状响应(含 usage);错误体沿用平台 `{detail}`(404/409/502/504);`/endpoints/{id}/infer` 原样保留

## 8. 前端(最小可演示)

- [x] 8.1 `types.ts` 增 `Version` 来源字段 + `InferResult.usage`;`api/client.ts` 增 chat 发送方法(或 infer 接受 chat 输入)
- [x] 8.2 先写/更新 `NewVersionForm.test.tsx`:external-api 切换显隐字段、提交载荷含来源字段;mock 表单不变
- [x] 8.3 `components/NewVersionForm.tsx` 加来源开关 + external 字段;`components/CreateModelForm.tsx` external 模型预填只读 canonical chat schema
- [x] 8.4 先写/更新 `PlaygroundPage.test.tsx`:external-api 端点渲染 chat 编排器并展示 content/延迟/usage、且**不渲染由 input_schema 生成的动态表单字段**(即便其 input_schema 形如 object);mock 端点仍动态表单(回归)
- [x] 8.5 `pages/PlaygroundPage.tsx`:external-api 端点渲 chat 编排器(system + 可增删 role/content 行)、发送、展示真结果/延迟/usage;mock 路径不动
- [x] 8.6 `i18n/locales/zh.ts` 补全新增文案 key(来源/上游字段/chat 编排器/usage 标签),无硬编码;新 chip 用语义色令牌

## 9. 校验与收尾

- [x] 9.1 后端 `pytest`(从 `backend/` 跑)全绿:含 external 同步/异步、北向路由、配额跳过、单一来源、来源派发校验 + **a3 整套回归不变**
- [x] 9.2 前端 `tsc --noEmit` 无错、`vitest` 全绿
- [ ] 9.3 手动/E2E 冒烟(`upstream_mock=True`):建 external-api 模型+版本+端点 → Playground chat 发送看到确定性结果+延迟+usage;`POST /v1/chat/completions`(body `model`=url_path)返回 OpenAI 形状体
- [x] 9.4 `openspec validate a5-external-api-southbound --strict` 通过;确认未超纲(无 Anthropic 南向/鉴权/成本聚合/SSE/LLM 指标)
- [ ] 9.5 sync/archive 时同步重写 `inference-api`/`endpoint-deployment` 的 Purpose 段(v1.0 mock-only/禁 external 措辞 → mock 模拟 / external 真转发二选一)
