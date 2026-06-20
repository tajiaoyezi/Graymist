## Why

平台已具备模型注册(a1)、端点部署(a2)与前端外壳(ui-redesign),但**端点部署好后还无法真正被调用** —— 推理调用 API(§4.3 / 原需求 2.3)是把「已部署端点」变成「可被业务调用的服务」的闭环关键一环,也是点亮 §5.3 推理 Playground(当前仅静态骨架)的前置依赖。`tables.py` 已注明 InferenceLog/AsyncTask「留待 a3」,`deploy.py` 已注明「Redis 留到 a3」—— 现在补上。

## What Changes

- **新增推理调用 API(后端,§4.3)**:
  - **同步推理**:请求命中端点 → 按 A/B 权重选版本 → 模拟执行(耗时 100ms~3s)→ 返回结果;超过端点 `timeout_ms` 返回超时错误。
  - **异步推理**:提交任务 → 返回任务 ID → 后台排队执行 → 凭任务 ID 查询结果(`AsyncInferenceTask`:queued/running/succeeded/failed)。
  - **Schema 校验**:推理输入按命中 Model 的 `input_schema` 校验(复用既有 `jsonschema`,Schema 一等公民)。
  - **并发限流(必做)**:每端点 `max_concurrency` 限制 —— 同步超并发返 **429**,异步**排队等待**。
  - **推理日志**:`InferenceLog`(端点/版本/输入摘要/输出摘要/延迟/状态:成功·超时·错误·429)。
  - **A/B 命中记录**:记录实际命中版本,供后续(a4 监控)按版本分组分析。
- **模拟执行**:沿用 a2 的**进程内 asyncio** 执行器(不引入 Redis);**按命中 Model 的 `output_schema` 生成占位结果**。
- **数据表**:新增 `inference_log`、`async_inference_task` 两张表(`tables.py` 已留位说明)。
- **接通 §5.3 Playground 前端**:把现有静态骨架接到真实推理 API —— 选端点、按 Model Schema 动态生成输入表单、发送展示结果(格式化 JSON + 延迟)、同步/异步切换(异步轮询至终态)、本次会话请求/响应历史可回填。
- **范围约束(不超纲)**:**仅** v1.0 §4.3 + §5.3;不引入 external-api 来源、流式 SSE、成本/用量计量、token/LLM 指标(均属 v1.1+ 已定档,绝不进 a3);仅对 `running` 端点可推理。

## Capabilities

### New Capabilities
- `inference-api`: 同步/异步推理调用、输入 Schema 校验、A/B 权重路由与命中记录、每端点并发限流(429/排队)、推理日志记录(对应原需求 §4.3 / 2.3)。

### Modified Capabilities
- `web-ui`: 「推理 Playground 静态骨架」需求从「纯静态、不联后端」升级为「接通推理 API」—— 动态表单、真实同步/异步调用与轮询、会话历史回填(其余 web-ui 需求不变)。

## Impact

- **后端**:新增 `app/inference/`(router / service / schemas / executor / errors);`db/tables.py` 增 `inference_log` + `async_inference_task` 两表;`main.py` 注册 router 并加 429/422/超时异常映射(推理输入校验用新增 `InferenceInputInvalidError`,**不复用** `InvalidSchemaError`);`config.py` 增推理模拟耗时区间配置。
- **前端**:`pages/PlaygroundPage.tsx` 接通后端 + **新增 schema→表单渲染器**(现有 `lib/schema.ts` 仅做 JSON 校验、不生成表单);`api/client.ts` 增推理方法;`types.ts` 增推理相关类型;`i18n/locales/zh.ts` 补文案。
- **依赖**:无新增第三方依赖(`asyncio` / `jsonschema` 均已在用);**不引入 Redis**。
- **数据/兼容**:仅新增表与只读路由,不改 a1/a2 既有实体与行为。
