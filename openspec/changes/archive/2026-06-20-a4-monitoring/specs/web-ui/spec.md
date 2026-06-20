## RENAMED Requirements

- FROM: `### Requirement: 监控仪表盘静态骨架`
- TO: `### Requirement: 监控仪表盘`

## MODIFIED Requirements

### Requirement: 监控仪表盘
平台 SHALL 在监控仪表盘页面接通真实监控 API(对应原始需求 §2.8):端点选择、时间范围切换(1 小时 / 24 小时 / 7 天)、自动刷新(开启时按**可配置间隔**轮询,对应原始需求 §2.8『可配置刷新间隔』)、指标卡(覆盖 §2.4 五项:QPS、平均延迟、P99 延迟、错误率、当前并发数),以及 QPS、延迟(均值 + P99)、错误率、A/B 版本对比图与资源总览。图表 MUST 由 `monitoring` API 的真实聚合数据驱动(布局不变,仅换数据源)。本页 MUST 严守 v1.0 §2.8 范围,MUST NOT 引入成本/用量、token/LLM 指标、告警等超纲元素;所有文案 MUST 走 react-i18next(zh)。

#### Scenario: 仪表盘呈现真实聚合数据
- **WHEN** 用户进入监控仪表盘、选择端点与时间范围
- **THEN** 五项指标卡与 QPS/延迟(均值+P99)/错误率/A-B 对比/资源总览图表由 monitoring API 的真实数据渲染

#### Scenario: 切换时间范围重新聚合
- **WHEN** 用户在 1 小时 / 24 小时 / 7 天间切换
- **THEN** 图表按对应分桶(分钟/小时/天)重新拉取并渲染

#### Scenario: 自动刷新轮询(间隔可配置)
- **WHEN** 用户开启自动刷新
- **THEN** 页面按当前所选刷新间隔轮询 monitoring API 刷新指标;关闭后停止轮询

#### Scenario: 调整刷新间隔
- **WHEN** 用户更改刷新间隔(如 5s/10s/30s)
- **THEN** 后续轮询按新间隔执行

#### Scenario: 不出现超纲元素
- **WHEN** 浏览监控仪表盘
- **THEN** 不存在成本/用量、token/LLM 指标、告警等超纲控件,文案均来自 zh 资源表
