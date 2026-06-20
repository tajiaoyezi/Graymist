## 1. 聚合内核(从 inference_log 分桶)

- [x] 1.1 先写测试:分桶聚合(QPS/平均延迟/P99/错误率)经**可注入 now** 确定性验证;整窗 summary 数值断言;空窗口与非空窗口内空桶均返零值不报错;**rate_limited 与 error 行(latency_ms=0)不计入延迟样本但计入错误率分母**
- [x] 1.2 实现 `app/monitoring/service.py` 聚合:按 range(1h-分钟/24h-小时/7d-天)取窗口行 → 分桶 → QPS/均值/P99(nearest-rank)/错误率(**延迟样本仅 success+timeout**;错误率分母含全部);空桶补零;并产出整窗 summary(整窗视为单桶套同口径)
- [x] 1.3 先写测试:同端点按 `version_id` 分组各返一条序列(A/B 对比);version_id 为空的行不单列为版本
- [x] 1.4 实现按版本分组聚合

## 2. 当前并发数 + 资源总览

- [x] 2.1 先写测试:`concurrency.current_in_flight(endpoint_id)` —— 有控制器返在飞数、无控制器返 0 且**不创建**控制器
- [x] 2.2 在 `app/inference/concurrency.py` 增只读 `current_in_flight`;监控 service 汇总 `current_concurrency`(资源总览复用 a2 `/quota`,不重造)

## 3. 监控查询 API

- [x] 3.1 先写测试:`GET /monitoring/metrics?endpoint_id&range` → 200 返回 buckets+versions+current_concurrency+summary(数值口径正确);端点不存在→404;range 非 1h/24h/7d→422(复用 `InvalidSchemaError→422`)
- [x] 3.2 实现 `app/monitoring/{schemas,service,router}.py` + 在 `main.py` 注册 router(异常映射复用既有)

## 4. 前端接通监控仪表盘

- [x] 4.1 `types.ts` 增监控类型;`api/client.ts` 增 `getMetrics`(资源总览复用既有 `getQuota`)
- [x] 4.2 **重写** `MonitoringPage.test.tsx`(移除旧『不发请求』断言、describe 改名):mock api 后断言五卡 + QPS/延迟(avg+P99)/错误率/A-B/资源由**真实数据**渲染、range 切换重取、autoRefresh 按可配置间隔轮询、调整间隔生效、无超纲(无成本/token/LLM/告警)
- [x] 4.3 改造 `MonitoringPage.tsx`:端点下拉用 `listEndpoints`、range 切换、**自动刷新间隔可配置(下拉/分段,默认 5s)轮询**、五卡/四图喂真实数据、资源条用 `getQuota`(布局不变,仅换数据源)
- [x] 4.4 `i18n/locales/zh.ts` 补监控文案(含刷新间隔 `monitoring.refreshInterval` 等,无硬编码)

## 5. 校验与收尾

- [x] 5.1 后端 `pytest` 全绿(148);前端 `vitest` 全绿(51);前端 `tsc` 无错
- [x] 5.2 手动/E2E 冒烟:seed + 跑若干次推理后,仪表盘出真实曲线与并发/资源 —— Playwright 驱动浏览器跑通(隔离栈 8021/5175,30+ 推理),五卡(P99 50ms/avg 29ms)+ QPS/延迟/错误率/A-B 四图 + 资源条 + 可配置间隔均真实渲染,临时栈已拆
- [x] 5.3 `openspec validate --changes a4-monitoring --strict` 通过;确认无超纲(无成本/token/LLM 指标、无告警)
