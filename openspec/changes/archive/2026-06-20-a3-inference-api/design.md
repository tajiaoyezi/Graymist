## Context

a1(模型/版本)、a2(端点/A-B 绑定/异步部署/配额)与 ui-redesign(外壳+主题+四页骨架)已交付。a2 的异步部署执行器(`app/endpoints/deploy.py`)确立了**进程内 asyncio + 代次令牌 + 可替换调度接缝(`_spawn_fn`)**的模式;`tables.py` 已为 `InferenceLog/AsyncTask` 留位,`deploy.py` 注明「Redis 留到 a3」。a3 在此之上补齐原需求 §4.3 推理调用 API,并把 §5.3 Playground 从静态骨架接到真实 API。约束:v1.0 推理为**模拟**(`sleep`),无真实模型运行时;严守不超纲(无 external-api/流式/成本/token 指标)。

## Goals / Non-Goals

**Goals:**
- 同步推理(取端点 Model 的 input_schema 校验输入 → 限流 → 选版本+模拟执行 → 返回结果+命中版本+延迟;超 `timeout_ms` 超时)。
- 异步推理(立即返回任务 ID;后台 `queued→running→succeeded/failed`;凭 ID 查询)。
- 每端点 `max_concurrency` 并发限流:同步超返 429、异步排队。
- A/B 权重路由 + 实际命中版本贯穿执行与日志。
- 推理日志(成功/超时/错误/429)落库。
- 接通 Playground:动态表单、真实同步/异步调用与轮询、会话历史回填。

**Non-Goals(留待后续版本,绝不进 a3):**
- Redis Streams / 跨进程并发计数(v1.1+ 可升级)。
- 真实模型执行、external-api 来源、流式 SSE、成本/token/LLM 指标(v1.1/v1.2)。
- 监控指标聚合与图表真实数据(a4 / §4.4)。
- 异步任务的取消/重试/回调/幂等/结果过期(未定档 E13)。

## Decisions

### D-a3-1:异步执行与并发限流用进程内 asyncio,不引入 Redis
沿用 a2 `deploy.py` 既有模式:`asyncio.create_task` 后台执行 + 强引用防 GC + 可替换 `_spawn_fn` 接缝(测试用收集器 `drain()` 确定性执行)。并发限流用**每端点一个 `asyncio.Semaphore`**(进程内注册表 `endpoint_id → Semaphore(max_concurrency)`)。
- **备选**:Redis Streams(§7 已定栈)。**否决理由**:v1.0 单进程、纯模拟,Redis 是硬运行依赖(当前 dev 未运行 Redis),复杂度不匹配收益;a2 已立进程内先例。§7 属实现层选型、不改需求范围,推理行为(429/排队/超时)对外完全一致。
- 升级点:多 worker 部署下进程内计数不跨进程 —— v1.0 单进程可接受,v1.1+ 换 Redis 时仅替换该接缝。
- **与 a2 的差异**:异步推理任务有独立主键(`async_inference_task.id`)、一任务一行、状态机 `queued→running→succeeded/failed` 单向且无「新操作取代旧代」语义,故 a2 的代次令牌(`deploy_generation`)在此**不适用、不引入**;后台回写仍用 `get_bg_sessionmaker` **独立会话**(对齐 a2 H3,避免复用请求会话导致 MissingGreenlet/会话泄漏)。

### D-a3-2:校验/限流次序与并发额度语义
**次序(关键,修正审查 P1)**:Schema 校验 MUST 先于限流与异步入队 —— `解析端点(校验 running)→ 取端点 Model 的 input_schema 校验输入 → (同步)限流 / (异步)入队 → 执行内核`。校验失败=422,**不占额度、不落日志、异步不创建任务**(异步在 `submit` 时即同步返回 422)。
**额度获取**:同步对端点准入做**非阻塞准入**(有空位即占、否则立即 429);异步**阻塞等待空位**后执行。占额度后,核心执行须以 `async with`/`try-finally` 包裹,确保**成功/异常/超时所有出口都释放**额度。
**容量变更(修正审查 P1)**:端点更新 `max_concurrency` 时**不重建准入对象**(重建会丢弃在飞许可、令真实并发瞬时达 `在飞数+新容量`,突破「限流必做」)——改为在同一长生命周期的容量控制器上**按差值调整目标容量**(调大即增发空位、调小则记账式延迟回收:空位归还时不再补发,直至降到新容量),全程不丢在飞计数。
**FIFO 说明**:排队中的异步任务**计入已占容量**;有异步排队时腾出的空位优先给队首异步,此时同步仍 429,符合「额度已被在执行+已排队占满」语义。

### D-a3-3:A/B 路由 = 加权随机,带可测试接缝
按各绑定 `weight` 做加权随机选版本(`random` + 可注入的选择函数 `_select_fn`,呼应 `_spawn_fn`),测试可替换为确定性选择以验证分流与命中记录。**路由时实时筛选**:只在绑定中**当前仍为 `ready`** 的版本里加权选择(版本绑定后可能被 `archived`,不能依赖「建绑定时均 ready」的历史保证);若某端点全部绑定均已非 ready,则该端点不可推理(返 409 并落日志)。

### D-a3-4:模拟执行 + 按 output_schema 生成结果 + 超时判定
核心执行函数(校验已在 D-a3-2 前置,**不在此函数内**):`选版本 → 计算模拟延迟 → asyncio.sleep → 生成输出 → 写日志`,**同步在请求内 await、异步在后台 task**复用同一函数。(校验依据是端点所属 Model 的 `input_schema`;a2 保证同端点同 Model,故取 schema 无需先选版本。)延迟取 `uniform(min,max)`(配置项,测试设 0/可注入);**超时** = 模拟延迟 > 端点 `timeout_ms` → 状态=超时(同步映射超时错误、异步任务 failed)。输出由**轻量 schema→mock 生成器**按 `output_schema` 造(覆盖 object/array/string/number/integer/boolean/enum 常见子集,**填充 object 的 `required` 字段**,生成物在覆盖子集内须能通过 `jsonschema` 反向校验;`$ref/oneOf/anyOf` 等未覆盖构造回退安全占位、不抛错);`jsonschema` 已在依赖,无新增。

### D-a3-5:数据表(对齐 §2 实体)
- `inference_log`:`id/endpoint_id/version_id(实际命中,**可空** —— 429/422 等在选版本前即被拒的调用无命中版本)/mode/input_summary/output_summary/latency_ms/status/created_at`;摘要截断(沿用 `MAX_*` 上限思路)。
- `async_inference_task`:`id/endpoint_id/status/input/result/created_at/finished_at`。
两表在 `tables.py` 注册(`auto_create_tables` 下随启动建表;生产走 Alembic 与既有一致)。

### D-a3-6:API 形态与异常映射
- `POST /endpoints/{id}/infer`(同步)→ 200 结果 / 422 校验 / 429 限流 / 409 端点非 running / 504 超时。
- `POST /endpoints/{id}/infer/async` → 202 + `{task_id}`;`GET /inference/tasks/{task_id}` → 任务态+结果。
- 新增领域异常 → HTTP 映射在 `main.py`:`RateLimitedError→429`、`InferenceTimeoutError→504`、**推理输入校验失败用新增 `InferenceInputInvalidError→422`**(**不复用** `InvalidSchemaError` —— 其语义是「Schema 本身非法」、报错文案会误导;实现用 `Draft202012Validator(input_schema).iter_errors(payload)` 做**实例校验**而非 `check_schema`);端点非 running 复用 `ConflictError→409`。

### D-a3-7:前端接通
`api/client.ts` 增 `infer / submitAsyncInference / getInferenceTask`;**新增 schema→表单渲染器**(遍历 `input_schema.properties` 按 string/number/integer/boolean/enum 等类型渲染对应控件,未覆盖处回退 textarea)—— **现有 `lib/schema.ts` 仅 `parseSchemaInput`(JSON 合法性校验),不能生成表单**,故表单生成是新增能力,`parseSchemaInput` 至多用于解析/兜底用户填入值;`Endpoint` 对象不带 `input_schema`,需经 `binding.model_version_id → getVersion → getModel.input_schema` 取得(a2 保证同端点同 Model,任取一条 binding 即可,仿 `VersionDetailPage` 既有两跳);端点下拉只列 `running`(复用 `listEndpoints` 过滤);会话历史为页面内 state(可回填);异步模式前端轮询 `getInferenceTask` 至终态;文案补 `i18n/locales/zh.ts`。

## Risks / Trade-offs

- **进程内并发计数在多 worker 下不准** → v1.0 单进程部署;design/spec 标注,v1.1+ 换 Redis 接缝即可。
- **`max_concurrency` 变更与在飞请求** → 见 D-a3-2:按差值调整容量、不重建对象,确保变更窗口内不丢在飞许可、不瞬时超限。
- **异步任务在进程重启后悬挂** → 与 a2 异步部署同类的已知限制;v1.0 内存调度 + DB 任务表,重启后 `running` 任务不自动恢复,标注为已知限制,v1.1+ 持久队列解决。
- **mock 生成器无法覆盖复杂 Schema** → 覆盖常见 JSON Schema 子集,未覆盖处回退安全占位,不抛错(不阻断 Playground 演示)。
- **超时路径默认难触发**(模拟延迟 100ms~3s < 默认 30s timeout) → 延迟与 timeout 均可配置/可注入,测试显式构造超时用例。
