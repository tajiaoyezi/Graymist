## Context

v1.0 仅剩监控。a3 起每次推理落 `inference_log`(`endpoint_id / version_id(实际命中) / mode / latency_ms / status / created_at`),是 §4.4 指标的原料;a2 的 `/quota` 已提供平台资源总览;a3 的进程内 `CapacityController` 持有实时在飞数。ui-redesign 的 `MonitoringPage` 已是数据驱动的静态骨架(图表按 props 注入,「a4 只换数据源、不改布局」)。a4 在此之上补齐 §4.4 聚合查询 + §5.4 仪表盘接通,**不超纲**(无成本/token/LLM 指标、无告警)。

## Goals / Non-Goals

**Goals:**
- 按端点 + 时间窗(1h-分钟 / 24h-小时 / 7d-天)聚合 QPS、平均延迟、P99、错误率,返回时间序列。
- 按实际命中版本分组(A/B 对比)。
- 当前并发数实时 gauge(读 a3 在飞计数)。
- 资源总览(复用 a2 `/quota`)。
- 接通 §5.4 仪表盘:端点选择、范围切换、自动刷新轮询、五卡 + 四图 + 资源条喂真实数据。

**Non-Goals(留待后续,绝不进 a4):**
- 成本/用量维度(v1.1.2)、token/LLM 指标 TTFT/TPOT(v1.2)、告警与通知(v1.4)、分布式追踪(E12)。
- 指标持久化/物化表、预聚合管道(v1.0 按需算)。
- 跨进程并发计数(多 worker)—— 与 a3 同一已知边界。

## Decisions

### D-a4-1:按需聚合,不建指标表(Python 端分桶)
查询时从 `inference_log` 取该端点 + 时间窗内的行,在应用层分桶并计算指标。**否决** SQL 时间分桶(§7「Postgres 时间分桶」):P99 在 SQLite 无原生支持、分桶表达式分方言(测试用 SQLite),且 v1.0 为模拟、数据量小。聚合封装在 `monitoring/service.py`,作为**查询接缝**——生产高 QPS 时可替换为 SQL 物化/时序库,API 契约不变。

### D-a4-2:时间窗/分桶/指标口径
锚点 `now = datetime.now(utc)`(**可注入**以便测试确定性)。`1h→60×分钟桶 / 24h→24×小时桶 / 7d→7×天桶`。每桶:
- **QPS** = 桶内调用数 / 桶秒数;
- **平均延迟 / P99** = 桶内**已实际执行**调用(`status ∈ {success, timeout}`)的 `latency_ms` 统计;**`error` 与 `rate_limited` 行 `latency_ms` 恒为 0、不代表真实执行延迟,MUST NOT 计入延迟样本**(否则把均值/P99 拉向 0),但仍计入错误率分母;P99 用 nearest-rank(样本少时 ≈ max,v1.0 近似可接受);
- **错误率** = 非 success(timeout / error / `rate_limited`「HTTP 429」)/ 桶内全部调用;
- 空桶补零(qps/avg/p99/error_rate 均为 0),不报错。

**整窗 summary**:把所选窗口视为单一桶,套用以上同一组口径(整窗 QPS=全窗调用数/全窗秒数;平均延迟/P99 取全窗 success+timeout 的 `latency_ms`、P99 nearest-rank;错误率=全窗非 success/全窗全部),**非各桶指标再平均**。`summary` 供**前四项**指标卡(整窗汇总),第五张并发卡由 `current_concurrency` 供。

### D-a4-3:按版本分组
对同一端点的窗口行按 `version_id` 分组,各组各跑 D-a4-2 的分桶 → per-version 序列(A/B 对比)。`version_id` 为空的行(429 被拒、或无 ready 版本等未命中版本的非成功调用)计入端点总序列的错误率,但**不单列为某版本**。

### D-a4-4:当前并发数(读 a3 在飞计数,只读不创建)
在 `app/inference/concurrency` 增只读 `current_in_flight(endpoint_id) -> int`:查注册表,有控制器返其 `in_flight`,**无则返 0 且不创建控制器**(避免查询产生副作用)。监控 service 调用它得 gauge。**注**:这是瞬时采样值;v1.0 模拟负载(每次推理 0.1~3s 内完成、无持续压测)下,查询时刻 `in_flight` 常为 0,属预期、非缺陷。

### D-a4-5:资源总览复用 `/quota`
不在监控侧重造资源口径:仪表盘资源总览直接复用 a2 `EndpointService.quota`(前端调 `api.getQuota()`)。满足 spec「与配额口径一致」。

### D-a4-6:API 形态
- `GET /monitoring/metrics?endpoint_id={id}&range={1h|24h|7d}` → `{ range, buckets:[{t, qps, avg_latency_ms, p99_latency_ms, error_rate}], versions:[{version_id, buckets:[...]}], current_concurrency, summary:{qps, avg_latency_ms, p99_latency_ms, error_rate} }`。`summary` 供**前四项**指标卡(QPS/平均延迟/P99/错误率,整窗汇总),`current_concurrency` 供**第五张**并发卡。端点不存在 → **404**;`range` 非 1h/24h/7d → **422**(复用既有 `InvalidSchemaError→422`,不回退默认)。
- 资源总览复用既有 `GET /quota`,不新增。
- 异常映射复用既有(NotFoundError→404);无需新领域异常。

### D-a4-7:前端接通
`MonitoringPage` 端点下拉用 `api.listEndpoints()`(全部端点,含历史);range tabs 切换触发重取;autoRefresh 开启时按**用户可选间隔(如 5s/10s/30s,默认 5s)**轮询 metrics、关闭停止(间隔选择器复用现有 header 工具栏,不改图表/卡片布局);五卡读 `summary`(前四) + `current_concurrency`(第五),QPS/延迟(avg+p99)/错误率/A-B 折线读 `buckets`/`versions`,资源条读 `api.getQuota()`。布局/图表组件不变,仅替换 mock 数据源。`api/client.ts` 增 `getMetrics`;`types.ts` 增监控类型;文案按需补 `zh.ts`。

## Risks / Trade-offs

- **内存聚合在大数据量下成本** → v1.0 模拟量小;service 为查询接缝,生产可换 SQL/物化,契约不变。聚合依赖 `inference_log.endpoint_id` 索引缩小范围(`created_at` 未单独建索引,v1.0 数据量可接受);生产化随物化方案评估 `(endpoint_id, created_at)` 复合索引。
- **当前并发数进程内、多 worker 下不跨进程** → 与 a3 限流同一已知边界;v1.0 单进程准确。
- **P99 少样本近似(nearest-rank)** → v1.0 模拟数据可接受;design/spec 标注为近似。
- **资源总览为平台级而非按端点** → 与原型「资源总览(CPU/内存/GPU 已用/总量)」一致(平台维度),非端点维度,符合 §2.8。
- **now 锚点/时区** → 一律 UTC 存储与聚合;前端按 locale 展示;聚合 now 可注入,测试用固定时间种入日志行确定性验证。
