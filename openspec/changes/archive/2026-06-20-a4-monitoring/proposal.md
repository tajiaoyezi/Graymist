## Why

v1.0 八节功能已完成七节(模型注册 a1、端点部署 a2、推理调用 a3、四页视觉 ui-redesign),**只剩监控**。a3 起每次推理都落 `inference_log`(端点/实际命中版本/延迟/状态/时间),但还没有「按时间窗聚合 + 按版本分组」的查询 API,§5.4 监控仪表盘也仍是 ui-redesign 留下的 Recharts mock。a4 补上 §4.4 + §5.4 —— **v1.0 自此完整闭环**。

## What Changes

- **新增监控指标查询 API(后端,§4.4)**:
  - **采集指标**:QPS、平均延迟、P99 延迟、错误率、当前并发数(覆盖原 §2.4 五项)。
  - **按时间窗聚合**:最近 1 小时按分钟、24 小时按小时、7 天按天 —— 从 `inference_log` **按需聚合**(不新建指标表)。
  - **按版本分组**:同一端点各命中版本分系列,支撑 A/B 效果对比。
  - **资源总览**:复用 a2 `/quota`(CPU/内存/GPU 已用/总量),不重复实现。
  - **当前并发数**:实时读 a3 进程内并发控制器(`CapacityController.in_flight`)的在飞数。
- **聚合方式**:**Python 端从 `inference_log` 取时间窗行后分桶计算**(QPS/均值/P99/错误率/按版本),SQLite/PostgreSQL 通用;查询服务留作接缝,生产可改 SQL 时间分桶。
- **接通 §5.4 监控仪表盘前端**:把现有静态骨架接到真实 API —— 端点选择、时间范围(1h/24h/7d)切换、自动刷新(可配置间隔轮询)、五项指标卡、QPS/延迟(均值+P99)/错误率折线、A/B 版本对比、资源总览,均喂真实数据(布局不变,仅换数据源)。
- **范围约束(不超纲)**:**仅** v1.0 §4.4 + §5.4;**不**引入成本/用量维度(v1.1.2)、token/LLM 指标(v1.2)、告警与通知(v1.4)、分布式追踪(E12)。

## Capabilities

### New Capabilities
- `monitoring`: 监控指标的聚合与查询契约 —— 按端点/时间窗(1h·24h·7d)聚合 QPS、平均延迟、P99 延迟、错误率,按命中版本分组(A/B 对比),当前并发数实时 gauge,资源总览(复用配额)。对应原始需求 §4.4 / 2.4。

### Modified Capabilities
- `web-ui`: 「监控仪表盘」需求从「静态骨架(mock、不联后端)」升级为「接通 monitoring API」—— 真实指标卡/折线/A-B 对比/资源总览、时间范围切换、自动刷新轮询(其余 web-ui 需求不变)。

## Impact

- **后端**:新增 `app/monitoring/`(router / service / schemas);聚合从 `inference_log` 计算;当前并发数读 `app/inference/concurrency` 注册表;资源总览复用 `EndpointService.quota`;`main.py` 注册 router。无新表、无新第三方依赖。
- **前端**:`pages/MonitoringPage.tsx` 接通后端;`api/client.ts` 增监控查询方法;`types.ts` 增监控类型;`i18n/locales/zh.ts` 视需要补文案。
- **数据/兼容**:只新增只读聚合路由,不改 a1/a2/a3 既有实体与行为。
