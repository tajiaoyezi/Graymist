## 1. Anthropic 南向适配器(test-first)

- [x] 1.1 先写 `tests/unit/test_anthropic_adapter.py`:`build_request` 产出 `/messages` 路径、顶层 `system` 字段、**必填 `max_tokens`**(canonical 未给时用默认 4096)、messages、`anthropic-version` 头;`parse_response` **遍历 `content` 过滤 `type=="text"` 拼接文本**(非取 `content[0]`)、取 `stop_reason`、usage 读 `input_tokens`/`output_tokens`(无总数则 input+output);content 无 text block 或畸形 2xx 响应体 → 裸 `UpstreamError`
- [x] 1.2 实现 `app/inference/adapters/anthropic.py` `AnthropicAdapter`(实现既有 `SouthboundAdapter` 协议 + `auth_headers`),含模块常量 `DEFAULT_MAX_TOKENS=4096`、`ANTHROPIC_VERSION` 常量头

## 2. 协议派发与鉴权头(N+M 放开)

- [x] 2.1 `adapters/__init__.py`:`SouthboundAdapter` Protocol 增 `auth_headers(key) -> dict`;`get_adapter` 增 `anthropic → AnthropicAdapter` 分派,受支持集合改为 `{openai, anthropic}`(其余仍抛 `InferenceInputInvalidError`);**同步改 a5 既有 `test_openai_adapter.py:48-50` 的 `test_get_adapter_unsupported_protocol`:反例协议从 `"anthropic"` 改为仍不支持的值(如 `"cohere"`),并加一条断言 `get_adapter("anthropic")` 返回 `AnthropicAdapter` 实例**(否则该用例必在 7.1 翻红)
- [x] 2.2 `adapters/openai.py`:`OpenAIAdapter` 实现 `auth_headers(key)` 返回 `{"Authorization": f"Bearer {key}"}`(复刻原行为,纯重构)
- [x] 2.3 `external.py`:`_auth_headers` 改为接受 adapter、`key=os.environ.get(auth_ref)`、**`key` 为空仍原样返回(不注入脏头)**、有 key 才 `{**headers, **adapter.auth_headers(key)}` 合并(mock/无 `auth_ref` 时原样);更新 `run` 调用点。**新增**鉴权测试(a5 无此回归基线):①`OpenAIAdapter`/`AnthropicAdapter` 的 `auth_headers(key)` 直接单测返回字典;②集成层用 `monkeypatch.setenv(auth_ref)` + `upstream_mock=False` + capturing `MockTransport` 断言出站头含 `Authorization: Bearer <key>`(OpenAI)/`x-api-key: <key>`(Anthropic);③各补 `auth_ref` 缺失→不注入用例

## 3. 打桩上游按协议供 wire

- [x] 3.1 先更新 `tests/.../conftest.py` 或集成测试:打桩上游对 `/messages` 路径返回 Anthropic 形状(`content:[{type:text,text}]`+`stop_reason`+`usage:{input_tokens,output_tokens}`),对 `/chat/completions` 仍 OpenAI 形状
- [x] 3.2 `http_client._default_mock_handler` 按 `request.url.path` 派发 wire:`/messages` → Anthropic 假响应(确定性回声 + 固定 usage);否则 OpenAI 形状**字节不变**

## 4. external 集成 + 北向跨协议(test-first)

- [x] 4.1 先写 `tests/integration/` Anthropic 变体:`protocol=anthropic` external 端点同步推理 → 确定性 content + 真 usage 落库;上游 5xx→502/error 日志;超时→504;**无 `auth_ref` 环境变量时 mock 下仍端到端成功**
- [x] 4.2 先写北向跨协议用例:`POST /v1/chat/completions` 寻址到 `protocol=anthropic` 端点 → OpenAI-in→canonical→Anthropic-out、返回 OpenAI 形状体 + usage(证明 N+M,北向零改动)。**判别断言**:用 capturing `MockTransport`(复用 `_reflect_model` 模式)断言出站 `request.url.path` 以 `/messages` 结尾、headers 含 `anthropic-version`——否则绑错适配器回退 OpenAI 也会绿、证不了 N+M
- [x] 4.3 跑通上述用例,确认无需改动 `inference/router.py` 北向路由与 `_run_core` 派发(仅靠 `version.protocol` 自动成立);如确有缺口再最小补齐

## 5. 版本注册放开 protocol(后端)

- [x] 5.1 先更新 `tests/.../test_external_version.py`:`protocol=anthropic` 的 external 版本创建成功;`protocol` 非 `{openai, anthropic}` → 422;mock/openai 既有校验不变(回归)
- [x] 5.2 `versions/schemas.py`:`_dispatch_required` 把 `protocol != "openai"` 拦截改为 `protocol not in ("openai","anthropic")`,默认仍 `openai`;**同步把 ValueError 文案从『a5 仅支持 protocol=openai』改为反映 `{openai, anthropic}`**(该串经 422 detail 对用户可见)

## 6. 前端 protocol 选择器(test-first)

- [x] 6.1 先更新 `NewVersionForm.test.tsx`:external-api 下默认 `protocol=openai` 提交不变(回归)、选 `anthropic` 后提交载荷 `protocol=anthropic`(新增)
- [x] 6.2 `components/NewVersionForm.tsx`:protocol 只读输入改 `<select>{openai, anthropic}`(state 化),提交透传所选 `protocol`(替换原硬编码 `"openai"`)
- [x] 6.3 `i18n/locales/zh.ts` 补协议项文案(`protocol.openai`/`protocol.anthropic` 或选择器标签),无硬编码;复用既有语义令牌

## 7. 校验与收尾

- [x] 7.1 后端 `pytest`(从 `backend/` 跑)全绿:含 Anthropic 适配器/集成/北向跨协议/protocol 校验 + a5/a3 整套回归不变(**除 2.1 重指的那条 `get_adapter` 未支持协议反例外**)
- [x] 7.2 前端 `tsc --noEmit` 无错、`vitest` 全绿
- [x] 7.3 `openspec validate a6-anthropic-southbound --strict` 通过;确认未超纲(无北向 Anthropic 入口/鉴权/成本/SSE)
- [x] 7.4 E2E 冒烟(`upstream_mock=True`):建 `protocol=anthropic` external 模型+版本+端点→running;`/endpoints/{id}/infer` 与 `POST /v1/chat/completions` 均回 `echo:...`+延迟+usage;OpenAI 与 Anthropic 两端点并存互不影响
- [x] 7.5 sync/archive 时把 `inference-api` 适配器要求与 `web-ui` 版本注册要求的 delta 并入主规格(RENAMED + MODIFIED);**并同步修订 `inference-api/spec.md` 的 Purpose 段(delta 表达不了 Purpose):排除清单『不含 Anthropic 协议(属 v1.1.1)』改为『不含北向 Anthropic 入口』、南向 Anthropic 移出排除项,『canonical 内核 + OpenAI 南向适配器』更新为含 Anthropic 南向(与 line 83『北向 Anthropic 协议』对齐)**
