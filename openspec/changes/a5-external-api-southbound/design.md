## Context

v1.0(a1 模型/版本、a2 端点/A-B/异步部署/配额、a3 推理调用、a4 监控、ui-redesign)已交付并打 tag `v1.0.0`。a3 确立的推理脊柱:`inference/service.py` `_run_core` 是同步/异步共用的执行点(模拟延迟 `asyncio.sleep` + 按 `output_schema` 造占位输出);`executor.py` 持纯函数(加权 A-B 选版本、模拟延迟、schema→mock);`concurrency.py` 每端点进程内限流;`runner.py` `_spawn_fn` 测试接缝。a3 明确**严守不超纲**(无 external-api/流式/成本/token)。

本 change 是技术方案 **v1.1 南向接入 + 真实数据流(§11)** 的第一刀,在 a3 脊柱上引入「按来源真转发上游」的执行路径与 **canonical 内核 + 协议适配器(P2,§21)**,并把推理从「纯模拟」变成「mock 模拟 / external-api 真实」二选一。约束:**上游纯 mock**(httpx 打桩,无 key/无成本,CI 离线全绿);**dev.db 保数据不重建**;mock 来源行为字节不变;只做 OpenAI 南向(Anthropic 另起)。

## Goals / Non-Goals

**Goals:**
- `Version` 新增 `source=external-api` 及上游连接字段;同端点单一来源守卫。
- canonical 内核(统一 chat + 统一 usage)+ OpenAI 南向适配器(canonical↔wire),适配器是 **N+M**(为 Anthropic / 北向留缝)。
- external-api 真实数据流:真 httpx 转发 → 真 content/真延迟/真 usage;mock 路径不变。
- 北向 `POST /v1/chat/completions`(body `model` → 端点 `url_path` 寻址),OpenAI 形状响应;`/endpoints/{id}/infer` 保留。
- 推理日志记录真实 token usage;external-api 端点跳过 §4.2 本地资源配额(D4)。
- 前端最小可演示:external-api 版本注册 + Playground chat 输入 + usage 展示。

**Non-Goals(留待后续,绝不进本刀):**
- Anthropic 南向适配器(下一个 change 的纯 add-on)。
- API Key 鉴权 / 调用方身份 / 按调用方限流配额 / 北向 Anthropic `/v1/messages`(v1.1.1)。
- usage **聚合** / 成本 / 计费 / 监控成本维度(v1.1.2)——本刀只**落** token、不聚合。
- validating 做实(v1.1.3)、SSE 流式 / LLM 指标(TTFT/TPOT)/ local-engine(v1.2)。
- 真上游 key/成本(纯 mock)、完整 model-family 分类(按 `source` 派发即可,family 留到 v1.2 第二个 LLM 来源)。

## Decisions

### D-a5-1:来源建模在 Version,执行按 `source` 派发,端点单一来源
`source` 落在 **Version**(文档 1.1-a:一个 Model = 一种 chat 能力,每 Version 指向具体 provider/model/base_url;两个 external-api 版本可在同端点 A-B = 两个上游模型一根路由)。新增可空列 `source`(默认 `"mock"`)、`provider`、`base_url`、`upstream_model`、`protocol`、`auth_ref`。
- **`upstream_model` 而非 `model`**:避免与 OpenAI wire body 的 `model` 字段及库内 `model_id`/`model_version_id` 语义混淆,命名更自描述(项目已统一 `protected_namespaces=()`,裸 `model` 本不触发 Pydantic 告警)。
- **`auth_ref` 存引用非密钥**:存环境变量名(如 `GRAYMIST_UPSTREAM_KEY_OPENAI`)或空(Ollama 无 key);解析成真 header 值留到接真上游时,mock 上游无需真 key。
- **版本必填集按来源派发**:`VersionCreate`/`VersionService.create` 按 source 分必填——mock 必填 `file_path`/`framework`;external-api 把这两列改**可空**(`tables.py` 去 NOT NULL),改由 `provider`/`base_url`/`upstream_model`/`protocol` 必填(否则前端隐藏=不传会撞 NOT NULL/枚举校验 422)。
- **单一来源守卫**:`endpoints/service._validate_bindings` 增「同端点绑定要么全 external-api、要么全 mock」(混绑 422),使 `_run_core` 按所选版本 `.source` 分支判定**无歧义**。
- **备选**:把 `source` 放 Model。**否决**:A-B 在「同 Model 多 Version」语义下展开,版本才是「可部署制品」(§2),来源是制品属性。

### D-a5-2:Schema vs Chat —— Executor 协议作「家族缝」,校验按家族派发
v1.0「Schema 一等公民」(任意 input/output_schema + 校验 + 动态表单 + 按 schema 造 mock);external-api 是 **LLM chat I/O**(`messages`,文档 P4)。解法:**reframe 不 rewrite** —— 把现有模拟路径收敛成 `SchemaMockExecutor`(内部仍调 `executor.py` 既有纯函数,逻辑零删除),新增 `ExternalApiExecutor`,二者实现同一 `Executor` 协议;`_run_core` 变直线编排器:A-B 选版本 → `executor_for(version)` → `run(ctx)` → 超时计账 + 日志。校验/日志/A-B 仍在 canonical 层(对齐 §21「校验/日志/指标/A-B 全在 canonical 层」),**只是校验按家族派发**:mock 校验 `input_schema`(`Draft202012Validator` 实例校验,不变);external 跳 `input_schema`、改轻量「是否 chat 形状(有 `messages`)」校验,**保 422-前置契约**(校验失败不占额度、不落日志、异步不建任务)。
- external-api 的 Model 仍存一份**只描述、不强校验**的固定 canonical chat schema(确定性内容 `{type:"object", properties:{messages, system}}`,external 推理按 `is_chat_like` 校验、忽略它),使模型/版本详情页等**盲读 `model.input_schema` 处不崩**。写入责任见 D-a5-9(前端 CreateModelForm 预填)。
- **备选 (a)**:给 external 套个 chat 形状 input_schema 复用现有校验/表单。**否决**:chat 是递归 `messages` 数组,现有表单生成器(`lib/schema.ts schemaFields`)只摊平顶层标量;且真上游响应可能过不了我们自造的 output_schema 校验,对透传网关无意义。
- **备选 (b)**:彻底引入 model-family 分类。**否决**:把 P4 家族分类、taxonomy 提前拉满,超出本刀;按 `source` 派发是更小的切口,family 待 v1.2 第二个 LLM 来源再立。

### D-a5-3:canonical 内核 + 南向适配器协议(N+M)
新模块 `inference/canonical.py`(纯逻辑无 I/O):`CanonicalChatRequest{messages, system, max_tokens, temperature}`、`CanonicalChatResult{content, finish_reason, usage, raw}`、`CanonicalUsage{input_tokens, output_tokens, total_tokens}`;`parse_to_canonical(body)` 把 OpenAI 风格 body 解析进 canonical 并**把首条 `role:system` 提到 `system` 字段**(已为 Anthropic「顶层 system」铺好,§21)。
- **usage 命名**:canonical 内部用 `input/output_tokens`(Anthropic 风,文档 1.1-c 指定);**日志列**用 `prompt/completion_tokens`(OpenAI 风);OpenAI 适配器入向映射 `prompt→input`,日志写出向映射 `input→prompt`,各一处集中映射。
- 南向适配器协议 `SouthboundAdapter`(`adapters/__init__.py` 基类 + `openai.py`):`build_request(canonical, upstream_model) -> (path, json, headers)` + `parse_response(status, body) -> CanonicalChatResult`;`get_adapter(protocol)` 派发,非 `openai` 抛清晰「本刀未支持」。**Anthropic = 下一个 change 加一个 `anthropic.py` + 一行注册**(兑现 N+M)。

### D-a5-4:真实数据流 + httpx 打桩(纯 mock 上游)
新模块 `inference/http_client.py`:模块级懒建 `httpx.AsyncClient` + `_transport_override` 缝(仿 `deploy._spawn_fn`/`runner._spawn_fn` 既有测试注入约定);`post_upstream(base_url, path, json, headers, timeout_s) -> (status, dict)`。`inference/external.py` `ExternalApiExecutor.run`:`parse_to_canonical → get_adapter(protocol).build_request → post_upstream → parse_response`,量**真实墙钟延迟**(取代 `sleep`)、归一 usage。
- **打桩(CI 离线、确定性)**:conftest 把 `_transport_override` 设为 `httpx.MockTransport(handler)`,`handler` = 进程内假 OpenAI server(解析入向 body、回确定性回声 + 固定 usage,同 wire 格式)。**真实序列化/超时/usage 解析全程被走到**,只换 transport。
- **config**:`upstream_mock: bool = True`(本地 demo 默认走假 transport,无 key/成本;接真上游=翻转此项,脊柱零改)+ `upstream_connect_timeout_seconds`(httpx 连接级兜底)。整体往返超时统一走端点 `timeout_ms`(`asyncio.wait_for`),**不另设上游请求超时 config**;external 版本各自带 `base_url`,**不设全局默认 base_url**。
- **httpx 依赖**:由 `[dev]` 移入运行时依赖(生产路径用)。

### D-a5-5:北向寻址 `/v1/chat/completions` —— ADD 不 MIGRATE,免鉴权止步线
新增 `POST /v1/chat/completions`(body `{model, messages, ...}`):`model` 匹配 `EndpointRow.url_path`(既有唯一/索引/对外标识,复用为「网关暴露的模型名」,**不新增列**)解析运行中端点 → 复用 `infer_sync` 服务入口(A-B/限流/日志全复用)→ 回 OpenAI 形状体(`{id, object:"chat.completion", choices:[{message}], usage}`)。
- **ADD 不 MIGRATE**:`/endpoints/{id}/infer` **原样保留**(Playground、a3 测试、日志查看器都在用;迁移=回归风险且属 v1.1.1)。两种寻址并存,新路由是 external-api 的「真网关」演示面。
- **免鉴权止步线(对 v1.1.1)**:新路由**不读 `Authorization`/`x-api-key` 认调用方、不解析调用方、不做按调用方限流**;若带鉴权头则忽略。这些是 v1.1.1。仅有的限流是既有**每端点并发**(非按调用方)。测试显式断言「无需鉴权且忽略 Authorization 头」锁住此线。
- **错误体形状**:本刀北向错误沿用平台 `{detail}`(404/409/502/504 同既有路径);OpenAI 风 `{error:{message,type,code}}` 错误体对齐留 v1.1.1 网关化(见 Open Questions)。响应的 `usage` 来自 `infer_sync` 返回值(须扩展透出,见 D-a5-8 与任务)。
- **里程碑偏离声明**:技术方案 §11 1.1-c 注「北向在 v1.1.1」、§12/§21 把北向对外入口定档 v1.1.1;本 change 有意将「北向寻址面(model→url_path,免鉴权)」提前至 v1.1,理由=演示 external 真网关面;v1.1.1 实质(鉴权/身份/按调用方限流/Anthropic 入口)止步。
- **备选**:把端点寻址整体迁到 `model`-in-body、删内部路由。**否决**:与 Q1「最小切片」冲突、回归面大,留作 v1.1.1 网关化的事。

### D-a5-6:external-api 跳过 §4.2 本地资源配额(D4)
`endpoints/service` 的 `create/start/restart/update` 在绑定为 external-api 时**跳过 `check_within_quota`**、且**不计入** `_active_usages`。端点来源判定走 endpoint→任一 binding→`version.source`(单一来源守卫保证同质、无歧义),抽成一个共享 helper 供五处(含 `quota()` 查询)复用以保口径一致;`_active_usages` 用一次性批量 join 取各端点首个 binding 的 source(避免逐行 `session.get` 的 N+1)。判定依据 = **平台是否管后端生命周期(P3),非物理位置**(localhost Ollama 也跳)。其用量/成本治理在 v1.1.2(本刀不做)。前端「剩余配额」与 `GET /quota` 自然不计入这些端点。
- **运营盲区(文档 D4)**:localhost 上「平台不托管」的引擎仍真占本机资源但不进账本;spec 留一行运维须自留余量的注记,非代码功能。

### D-a5-7:数据列与迁移(Alembic 增量 revision)
新增列均可空 + `source` 默认 `mock`,既有行**零回填**。`InferenceLog` 增 `prompt/completion/total_tokens`(mock 留空、external 落真值)——v1.1.2 成本计量复用此缝。
- **迁移机制**:仓库已有完整 Alembic runner(`alembic.ini` `script_location = migrations`,`migrations/env.py` + `versions/0001…0004`,a3 的推理表正是 `0004_inference_tables` 增量加的)。本 change **新增 `migrations/versions/0005_external_api_source.py`**(`down_revision = "0004_inference_tables"`),`upgrade()` 用 `op.add_column` 加 `model_version` 的 6 个来源列 + `inference_log` 的 3 个 token 列,`downgrade()` 对称 `op.drop_column`,与 0001–0004 先例一致。
- **测试/CI**:`auto_create_tables` 默认 False(prod 走迁移);测试用 `Base.metadata.create_all` fresh 库自带新列,零改。现有本地 `dev.db` 跑 `alembic upgrade head` 即补列保数据。

### D-a5-8:错误映射
external 路径:上游**非 2xx → 502**(新增 `UpstreamError`,落 `ST_ERROR` 日志)、**超时 → 复用 504**(`asyncio.wait_for(timeout_ms)` → `InferenceTimeoutError`,落 **`ST_TIMEOUT`** 日志)、**适配/解析失败 → 422**。注意 a3 既有 `except (InferenceTimeoutError, ConflictError): raise` 分支**不写日志**,故 external 超时**必须在抛 `InferenceTimeoutError` 前先写 `ST_TIMEOUT` 日志并 commit**(与 mock 超时对齐),否则 spec 要求的超时日志会落空。异步 worker 照旧标 `failed`。mock 路径错误映射不变。

### D-a5-9:前端最小
`NewVersionForm` 加 source 开关(external 显 provider/base_url/upstream_model/protocol(锁 openai)/auth_ref、隐 framework/file_path/resource_req);`CreateModelForm` external 模型预填只读 canonical chat schema(满足必填列,**沿用既有 model-registry「创建模型」表单需求、仅做默认值预填,不新增 model-registry 需求**)。`PlaygroundPage` **先按端点来源分流**(source 经 binding→`version.source` 下发):external-api 端点**强制走 chat 编排器、绝不调 `schemaFields`/不渲 `input_schema` 动态表单**(即便其预填 schema 形如 object),展示真 content/真 `latency_ms`/新 usage 行;mock 端点才走 `schemaFields` 动态表单(不动)。`types.ts`/`client.ts` 补来源字段 + `InferResult.usage` + chat 发送;`i18n/locales/zh.ts` 补全 key(**无硬编码**),新 chip 用语义色令牌。

## Risks / Trade-offs

- **纯 mock 上游 ≠ 真上游兼容性** → 假 server 严格按 OpenAI wire 格式收发,真实序列化/usage 解析被走到;接真上游仅翻 `upstream_mock`、补 `auth_ref` 解析。残余风险标注。
- **`url_path` 双重语义**(端点地址 + 对外模型名) → 本刀可接受、贴近真实网关按名暴露;专用 `served_model_name` 是 v1.2(local-engine)的事。
- **external 真延迟占并发槽更久** → 正确行为(真往返),限流语义不变、无需改。
- **Executor 重构触碰 a3 共享路径** → mock 分支保持 `sleep`+`generate_output` 字节不变 + a3 整套回归全绿(`source` 默认 `mock` 是关键保证)作硬门禁。
- **dev.db 漏迁移** → `0005` revision 与 0001–0004 同管线,本地 `alembic upgrade head` 即补列保数据;CI 走 create_all 不依赖迁移。

## Migration Plan

1. 新增 `0005_external_api_source.py` revision + 代码与新列上线(可空 + 默认 mock,向后兼容)。
2. 现有 `dev.db`:`alembic upgrade head`(保数据);新环境/测试走 `create_all`。
3. 回滚:`downgrade` drop 新列;mock 路径不变 → 回退代码即恢复 v1.0 行为。
4. sync/archive 时同步重写 `inference-api` 与 `endpoint-deployment` 的 Purpose 段(把 v1.0 mock-only/禁 external-api 措辞更新为 mock 模拟 / external-api 真转发二选一,external-api 已于 v1.1 定档解禁)——本仓库 Purpose 一向在 sync 时人工维护、不来自 delta。

## Open Questions

- 真上游接入时 `auth_ref → 真 header` 的凭证存储形态(env / secret store)留到接真上游再定,不阻塞本刀。
- 北向 `/v1/chat/completions` 是否最终取代内部路由、错误体是否对齐 OpenAI `{error:{message,type,code}}`,随 v1.1.1 网关化一并定。
