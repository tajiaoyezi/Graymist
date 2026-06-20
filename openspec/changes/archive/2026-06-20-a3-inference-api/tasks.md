## 1. 数据表与配置

- [x] 1.1 在 `db/tables.py` 新增 `InferenceLogRow`(id/endpoint_id/version_id(**可空**)/mode/input_summary/output_summary/latency_ms/status/created_at)与 `AsyncInferenceTaskRow`(id/endpoint_id/status/input/result(可空)/created_at/finished_at(可空)),对齐 §2 实体;移除「留待 a3」注释
- [x] 1.2 在 `config.py` 增推理模拟耗时配置 `infer_latency_min_seconds`/`infer_latency_max_seconds`(默认 0.1/3.0,测试可设 0)
- [x] 1.3 新增领域异常 `RateLimitedError`、`InferenceTimeoutError`、`InferenceInputInvalidError`(推理输入实例校验失败→422,**不复用** `InvalidSchemaError`,置 `app/inference/errors.py`),端点非 running 复用 `ConflictError`

## 2. 执行内核(路由 + 校验 + 模拟 + 输出生成)

- [x] 2.1 先写测试:A/B 加权路由(60/40 分流比例、单版本恒命中)经可注入 `_select_fn` 确定性验证
- [x] 2.2 实现 `app/inference/executor.py` 的版本选择(加权随机 + `_select_fn` 接缝,仅在端点已绑定版本中选)
- [x] 2.3 先写测试:`output_schema → mock` 生成器覆盖 object/array/string/number/integer/boolean/enum、**填充 object 的 `required` 字段**、**生成物经 `jsonschema` 反向校验通过**(覆盖子集内),`$ref/oneOf/anyOf` 等未覆盖处回退占位、不抛错
- [x] 2.4 实现 schema→mock 生成器(复用 `jsonschema`,无新增依赖)
- [x] 2.5 实现核心执行函数(**不含校验**,校验前置于 4.2/5.2):选版本(**实时筛选仍为 ready 的绑定**,全非 ready→409)→ 计算模拟延迟 → `asyncio.sleep` → 生成输出 → 返回 {结果, 命中版本, 延迟, 状态};延迟>`timeout_ms` 判超时

## 3. 并发限流(进程内 Semaphore)

- [x] 3.1 先写测试:同步并发达 `max_concurrency` 时立即 429;**带在飞负载调大/调小 `max_concurrency` 时真实在飞数任一时刻不超限、不丢在飞计数**;执行结束/异常/超时后额度被释放、下一请求可获额度
- [x] 3.2 实现端点并发控制器注册表(`endpoint_id → 容量控制器`):同步非阻塞准入(满→429)、异步阻塞准入(排队);**变更 `max_concurrency` 按差值调整目标容量、不重建对象**(不丢在飞许可);占用以 `async with`/`try-finally` 包裹核心执行,各出口释放

## 4. 同步推理 API

- [x] 4.1 先写测试:`POST /endpoints/{id}/infer` —— running 端点成功返回(结果/命中版本/延迟)、非 running→409、非法输入→422(**不占并发额度、不落日志**)、并发满→429、模拟延迟超时→504;成功/超时/错误/429 各落一条对应状态的推理日志(429/超时行 `version_id` 可空)
- [x] 4.2 实现 `app/inference/{schemas,service,router}.py` 同步路由 + service,**次序:解析端点(校验 running)→ 取 Model input_schema 校验输入 → 限流准入 → 执行内核**
- [x] 4.3 在 `main.py` 注册 inference router 并加异常映射(`RateLimitedError→429`、`InferenceTimeoutError→504`)

## 5. 异步推理 API

- [x] 5.1 先写测试:提交→202+task_id;**非法输入在 submit 时即返回 422(不创建任务、不入队)**;查询不存在 task_id→404;后台 `queued→running→succeeded`,凭 ID 查到结果;并发满时排队(不 429);执行错误/超时→`failed`;均落推理日志(经 a2 同款 `_spawn_fn`/`drain()` 接缝确定性执行)
- [x] 5.2 实现异步提交 `POST /endpoints/{id}/infer/async`:**先同步校验(running + input_schema),不合即 422**,通过则建任务+入队、立即返回 task_id;后台执行器沿用 `deploy.py` 进程内 asyncio + 强引用 + `_spawn_fn` 接缝、`get_bg_sessionmaker` 独立会话回写(**无需 a2 代次令牌**)
- [x] 5.3 实现查询 `GET /inference/tasks/{task_id}`(状态+结果)

## 6. 前端接通 Playground

- [x] 6.1 `types.ts` 增推理类型;`api/client.ts` 增 `infer` / `submitAsyncInference` / `getInferenceTask`
- [x] 6.2 先写/更新 `PlaygroundPage.test.tsx`:动态表单**按 `input_schema` 各字段生成独立控件**(断言至少一个非 object 字段渲染出对应控件,而非单一 JSON 文本域)、同步发送展示结果+延迟、异步轮询至终态、历史回填、无超纲控件
- [x] 6.3 改造 `PlaygroundPage.tsx`:端点下拉只列 running、**新写 schema→表单渲染器**按 `input_schema` 各字段生成控件(`lib/schema.ts` 现仅 `parseSchemaInput`、不能生成表单;input_schema 经 `binding→getVersion→getModel` 取得)、同步/异步调用、异步轮询、会话历史可回填
- [x] 6.4 `i18n/locales/zh.ts` 补 playground 相关新增文案(无硬编码)

## 7. 校验与收尾

- [x] 7.1 后端 `pytest` 全绿(140);前端 `vitest` 全绿(48);前端 `tsc` 无错
- [x] 7.2 手动/E2E 冒烟:seed 数据后在 Playground 跑通同步与异步一条链路(running 端点)—— Playwright 驱动浏览器跑通(隔离栈 8021/5175),字段级动态表单 + 同步/异步均通过,临时栈已拆除
- [x] 7.3 `openspec validate --changes a3-inference-api --strict` 通过;确认无超纲(无 external-api/流式/成本/token 指标)
