## Why

a1/a2 的前端功能已交付,但只用了最小化 Tailwind 样式,与已确认的原型(`UI/Graymist AI 平台-原型设计.html`,品牌 ModelMesh)视觉相差很大——原型的设计系统(配色/字体/侧栏外壳/卡片/表格)一直没被落地。当前是把这套视觉统一落地的合适节点:在 a3/a4 继续堆功能前先立住设计语言,避免后续每个 change 各画各的、反复返工。

> 原型经解包确认是**整平台全景图**(10 个页面 + 主题/角色/通知/里程碑/EN 等)。本 change **只取 v1.0 范围内的 4 个页面 + 视觉框架 + 主题切换**,其余一律列为非目标(见下),严守 v1.0 不超纲。

## What Changes

- **设计系统(design tokens)**:落地原型的 CSS 变量令牌(浅/深两套),变量名与原型一致。浅色取值:`--accent:#4f46e5`(可切)、`--accent-soft`(由 `--accent` 经 `color-mix` 派生)、`--bg:#f1f5f9`、`--panel:#fff`、`--surface:#f1f5f9`、`--surface2:#f8fafc`、`--border:#e2e8f0`、`--border-soft:#f1f5f9`、文字 `--text:#0f172a / --text2:#475569 / --muted:#64748b / --faint:#94a3b8 / --faint2:#cbd5e1`、`--sidebar:#0e1525`、`--sidebar-line:rgba(255,255,255,.06)`;深色为同名变量的另一套取值(见 spec/design)。字体 **Manrope**(正文)+ **JetBrains Mono**(代码/数字,`.mono`);中文由系统字体(PingFang SC / Microsoft YaHei)承载——与原型一致。
- **应用外壳(app shell)**:深色侧栏(248px,ModelMesh 品牌标 + 分组导航)+ 顶栏(页面标题 + 中文 + 主题切换)+ 主内容区。侧栏导航**只列 4 个 v1.0 页面**:模型仓库 / 部署管控台 / 推理 Playground / 监控仪表盘。**「创建模型」不再作导航项**,入口移到模型仓库页内按钮(同原型)。
- **主题切换**:浅色/深色 + 主题色(6 色)切换,纯前端、`localStorage` 持久化,不联后端。
- **模型仓库(a1)视觉还原**:列表(任务类型 tab + 搜索 + 卡片网格 + 页内「创建模型」按钮)、模型详情(顶部「← 返回列表」+ 左版本列表与指标对比表 / 右基本信息与输入/输出 Schema 代码块)、**版本详情**(Schema 格式化渲染 + 性能指标 + 变更说明 + 状态流转按钮)、**创建模型/新建版本表单(含 Schema 编辑器)**。仅复用 a1 现有数据与功能,不改行为、不新增字段。
- **部署管控台(a2)视觉还原**:端点表格(状态徽章 + creating 脉冲 + 模型·版本(A/B) + 资源占用 + 操作);**创建端点为部署管控台内弹窗(Modal)**(忠实原型;**移除 /endpoints/new 独立路由**),含选模型 → A/B 多选 + **权重滑块 + 同步数值框**(实时求和、非 100% 报错、保留单条越界校验) + 资源配额输入 + 平台剩余配额**双段条(已用 + 本次待占叠加,超额变色)** + 超时/并发。
- **推理 Playground 静态骨架(§2.7)**:左请求面板(端点选择 + Schema 动态表单占位 + 同步/异步切换 + 发送)、右响应面板(结果/延迟占位)+ 会话历史。**仅静态外观,不联后端、不发请求**,行为留给 a3。
- **监控仪表盘静态骨架(§2.8)**:端点选择 + 时间范围(1h/24h/7d)+ 自动刷新开关、指标卡(QPS / 平均延迟 / P99 / 错误率 / **当前并发数** —— §2.4 五项)、QPS/延迟(均值+P99)/错误率图、A/B 对比、资源总览。**仅静态外观 + 模拟数据,不联后端**,采集与聚合留给 a4。
- **i18n**:新增页面文案沿用 react-i18next 资源表(zh),不硬编码;延续 §8.4。

> **非目标(Non-goals,均超纲 v1.0)**:原型其余 6 页(网关/对外服务、成本与用量、告警与通知中心、审计日志、团队权限审批、平台设置);顶栏/侧栏的角色切换、通知中心、里程碑版本条、EN 双语;页面内的超纲元素——模型/端点的 external-api 来源、Playground 的 OpenAI/Anthropic 协议与 SSE 流式与成本估算(v1.1.2)、监控的 token 用量/花费(v1.1.2)与 LLM 指标(v1.2)。**无任何后端 / 数据库 / 接口改动;Playground 与监控仅静态骨架,不引入新功能行为。**
>
> **范围透明度——§2.6「编辑端点」**:原需求 §2.6 为「创建/编辑端点」,但 a2 实际只交付了「创建」前端入口(后端有 `PATCH /endpoints/{id}` 与 `updateEndpoint` client,但**无任何界面调用**)。本 change 是**视觉还原**,只还原既有界面、不补功能,故不实现「编辑端点」UI;补该入口属功能缺口,留作后续 change,不在本视觉 change 范围内(在此显式声明,避免被视作对 §2.6 的静默削弱)。

## Capabilities

### New Capabilities
- `web-ui`: 平台前端的设计系统与页面外观契约 —— 设计令牌与主题(light/dark/accent)、应用外壳(侧栏+顶栏+主区)、模型仓库与部署管控台的视觉呈现、推理 Playground 与监控仪表盘的静态页面骨架。

### Modified Capabilities
<!-- 无。model-registry 与 endpoint-deployment 的功能性需求不变,本 change 只改前端呈现,不触碰其 spec 行为。 -->

## Impact

- **前端(唯一影响面)**:
  - 新增设计令牌(CSS 变量含 `--accent-soft`/`--sidebar-line` / Tailwind theme extend)与主题上下文(ThemeProvider + localStorage)。
  - 新增共享外壳组件(Sidebar / Topbar / AppLayout)与基础视觉组件(Card / Badge / Button / 表格样式)。
  - 重构现有页面/组件样式:ModelsPage(含页内创建入口)、ModelDetailPage(含返回按钮)、VersionDetailPage、CreateModelPage、DeploymentConsolePage(含创建端点弹窗)、EndpointFormPage(改为弹窗内容组件)、AbWeightEditor(滑块+数值框)、QuotaUsage(双段条)、ConfirmDialog。
  - 新增静态页面:PlaygroundPage(§2.7 骨架)、MonitoringPage(§2.8 骨架)+ 路由 `/playground`、`/monitoring`;**移除 `/endpoints/new` 路由**(创建端点改弹窗)。
  - 字体资源:自托管原型解包出的 Manrope / JetBrains Mono woff2(各 6 个按 unicode-range 子集化、跨字重复用;交付方式见 design)。
  - i18n:新增 zh 文案 key(命名空间见 tasks)。
- **既有测试(随结构同步更新,行为不变)**:因还原会改 DOM 结构(列表→表格、创建端点→弹窗、权重→滑块、删导航项),既有 vitest/RTL 与 Playwright E2E 的**选择器需同步调整**,被测行为与断言保持不变,关键 `data-testid` 予以保留(详见 design D5 与 tasks)。
- **后端 / 数据库 / 接口**:无改动。
- **依赖**:Recharts 已在依赖中(监控图表);字体自托管,无新增 npm 运行时依赖。
- **路线图约定**:本 change 命名 `ui-redesign`,不占 aN 主序;commit 前缀 `[ui-redesign]`。推理 API 仍预留 a3、监控后端 a4,各自联通本 change 搭好的 Playground / 监控页面骨架。
