## Context

a1/a2 前端用最小 Tailwind 样式实现,功能可用但视觉与原型(ModelMesh)相差很大。原型经解包为 `dc-runtime` 驱动的单页应用:CSS 变量令牌(light/dark)+ Manrope/JetBrains Mono 字体 + 深色侧栏外壳。本 change 把这套设计语言落到现有 React + Vite + Tailwind 栈上,且**严格限定在 v1.0 的 4 个页面 + 视觉框架 + 主题切换**,不碰后端、不引入超纲功能。

约束:不改 `model-registry`/`endpoint-deployment` 的功能行为;不新增后端/接口/迁移;a1/a2 既有单测与 E2E 的**被测行为**须继续通过(选择器随 DOM 结构同步调整,见 D5);沿用 §8.4 i18n(zh)。

## Goals / Non-Goals

**Goals:**
- 落地原型设计令牌(配色/字体/圆角/间距)为可主题化的 CSS 变量 + Tailwind 语义色。
- 用侧栏+顶栏+主区外壳替换现有顶部导航;侧栏只列 4 个 v1.0 页面。
- 还原模型仓库(列表/模型详情/版本详情/创建表单)、部署管控台(端点表格 + 创建端点弹窗)的原型视觉(复用既有数据与功能,不改行为)。
- 搭出推理 Playground、监控仪表盘的**静态**页面骨架(占位/模拟数据,不联后端)。
- 浅/深主题 + 主题色切换,localStorage 持久化。

**Non-Goals:**
- 原型其余 6 页(网关/成本/告警/审计/团队/设置)与角色切换/通知中心/里程碑条/EN。
- 页面内超纲元素:external-api 来源、Playground 协议/SSE 流式/成本估算(v1.1.2)、监控 token 用量/花费(v1.1.2)/LLM 指标(v1.2)。
- 任何后端、数据库、API 改动;Playground/监控的真实数据联通(归 a3/a4)。
- 「编辑端点」功能 UI(§2.6 该入口 a2 未交付,本视觉 change 不补;见 proposal 范围透明度)。

## Decisions

### D1 — 令牌落地:CSS 变量 + Tailwind 语义色映射
在 `index.css` 的 `:root` 与 `:root[data-theme="dark"]` 定义原型全部同名变量:`--accent`、**`--accent-soft`(由 `--accent` 经 `color-mix(in srgb, var(--accent) 13%, #fff)` 派生;深色 `color-mix(... 30%, #131a2b)`)**、`--bg/--panel/--surface/--surface2/--border/--border-soft/--text/--text2/--muted/--faint/--faint2/--sidebar`、**`--sidebar-line`**。`tailwind.config.js` 的 `theme.extend.colors` 把语义名映射到变量(如 `panel:'var(--panel)'`、`muted:'var(--muted)'`、`accent:'var(--accent)'`),组件用 `bg-panel text-muted border-border` 等类。
- **理由**:主题切换只需切 `data-theme` 属性即可全局换肤;`--accent-soft` 让徽章/激活态底色随主题色联动(否则会被写死、切色不变)。
- **透明度坑(必须遵守)**:语义色是**十六进制** `var()`,**禁用 Tailwind 透明度修饰符 `bg-x/NN`**(会编译成 `rgb(#4f46e5/0.2)` 非法色、静默失效)。需要半透明/柔色时,沿用原型做法:用 `--accent-soft`/预定义 `--*-soft`、`color-mix(...)` 或写死 `rgba(...)`。
- **备选**:纯内联 style(同原型)→ 弃,丢失 Tailwind 一致性;Tailwind 暗色 `dark:` 变体 → 弃,无法支持"主题色可切"且要双写。

### D2 — 主题:ThemeProvider + data-theme + 内联 --accent
React Context `ThemeProvider` 持有 `{theme:'light'|'dark', accent:string}`,写 `document.documentElement.dataset.theme` 与 `style.setProperty('--accent', accent)`;初值读 localStorage(默认 `light` / `#4f46e5`),变更即持久化。入口在 `<head>` 前置一小段内联脚本按 localStorage 设初始 `data-theme`/`--accent`,避免首屏闪烁(FOUC)。主题色 6 选:`#4f46e5 #2563eb #0d9488 #7c3aed #e11d48 #ea580c`(同原型 data-props)。

### D3 — 字体:自托管原型解包出的 woff2(如实)
把 bundle 解出的 **Manrope 6 个 + JetBrains Mono 6 个** woff2(按 `unicode-range` 子集化:Latin/Latin-ext/Cyrillic/Greek/Vietnamese,**不含 CJK**;同一物理文件被多个字重 `@font-face` 复用——并非每字重一份文件)放入 `frontend/public/fonts/`,`index.css` 按原型 `unicode-range` 写 `@font-face`(`font-display:swap`)。`.mono` = JetBrains Mono。
- **效果**:与原型字形一致——拉丁字符/数字/代码走 Manrope/JetBrains,**中文落系统字体 `'PingFang SC','Microsoft YaHei'` 回退(与原型完全相同,可接受)**。
- 实现照搬解包目录里实际存在的 12 个 woff2 + 照抄 `@font-face`,**不要去找/造不存在的"5 份字重文件"**。
- **理由**:离线、零新增 npm 依赖;Manrope/JetBrains 均 OFL,可自托管。**备选** `@fontsource`/CDN → 弃。

### D4 — 应用外壳与路由
新增 `AppLayout`(侧栏 `Sidebar` + 顶栏 `Topbar` + `<Outlet/>`),`App.tsx` 由顶部导航改为该布局包裹路由。`Sidebar` 仅 4 项导航(模型仓库/部署管控台/推理 Playground/监控仪表盘),`NavLink`/`useLocation` 高亮当前页;`Topbar` 显示当前页标题 + 中文标 + 主题切换。
- **路由变更**:新增 `/playground`、`/monitoring`;**移除 `/endpoints/new`**(创建端点改为部署管控台内弹窗,见 D6);**「创建模型」不再是导航项**,入口移到模型仓库页内按钮(`/models/new` 路由保留,由该按钮进入)。其余既有路由不变。

### D5 — 还原既有页面:只改呈现、不动行为;测试随结构同步更新
重构 a1/a2 页面与组件的 JSX 结构/类名以贴合原型。**被测「行为」不变**(同样的输入→同样的 API 调用→同样的结果/跳转),但 DOM 结构会变(列表 `<li>`→表格 `<tr>`、创建端点页→弹窗、权重数字框→滑块+数值框、删「创建模型」导航项),因此既有 vitest/RTL 与 Playwright E2E 的**选择器需同步调整**。原则:
- **保留关键 `data-testid`**:`endpoint-${id}`/`status-${id}`/`loading-${id}`(DeploymentConsolePage 单测)、`weight-input-${id}`(权重数值框,见 D6)、`quota-${d}`/`quota-over`(配额条)、`ep-name`/`ep-url`/`submit-endpoint` 等;能用 `getByRole('row')` 替代 `locator('li')`。
- **明确的 E2E 同步修改(列入 tasks,属"调选择器不改行为"):**
  1. `model-registry.spec.ts`:`getByRole('link',{name:'创建模型'})` → 模型仓库页内「创建模型」按钮选择器;返回用侧栏「模型仓库」(仍在)。
  2. `endpoint-deployment.spec.ts`:`goto('/endpoints/new')` → 在部署管控台点「创建端点」打开弹窗;`locator('li').filter` → `getByRole('row')`/`endpoint-${id}`;权重经保留的 `weight-input-${id}` 数值框输入(见 D6)。
- 改完每页跑全套测试为门禁(tasks 4.4/5.4/8.3)。

### D6 — 部署管控台:创建端点弹窗 + 控件形态
- **创建端点 = 部署管控台内弹窗(Modal)**,忠实原型(`_template.html` ~730 `create endpoint modal`)。`EndpointFormPage` 改造为弹窗内容组件,由控制台「创建端点」按钮触发;移除 `/endpoints/new` 路由。保留 `ep-url` 字段(原型创建弹窗无 URL,但既有 E2E/单测与 `createEndpoint` 依赖 `url_path`,故**保留**该输入,不删)。
- **A/B 权重 = 滑块 + 同步数值框**:滑块还原原型观感,旁置同步的 `<input type=number data-testid=weight-input-${id}>` 保住测试语义、无障碍可达与单条越界(1..100)校验展示。二者双向同步。
- **配额条 = 双段叠加**:同一进度条内 已用段(实色)+ 本次待占段(半透明 .55)叠加,超额变色(忠实原型 780-782);保留 `quota-${d}`/`quota-over` testid。

### D7 — Playground/监控为纯静态骨架(无 api 调用)
两页组件只用本地 mock/占位 state 渲染,**不 import api client、不发请求**。
- Playground:左请求面板(端点下拉占位、Schema 动态表单占位区、同步/异步切换、发送占位)、右响应面板(空态/结果占位)+ 会话历史(空态)。仅按 §2.7 字段,不含协议/SSE/成本。
- 监控:端点选择 + 时间范围 + 自动刷新开关(纯 UI 态)、**5 张指标卡(QPS / 平均延迟 / P99 / 错误率 / 当前并发数 —— §2.4 五项)**、QPS/延迟(均值+P99)/错误率/A-B 对比图、资源总览。图表用 **Recharts(已依赖)+ 硬编码 mock 序列**,封装为"数据 props 注入",a4 接真实数据时只换数据源不改布局。仅按 §2.8,不含成本/LLM 指标。

### D8 — i18n
`i18n/locales/zh.ts` 增补命名空间(沿用现有 `nav.*` 风格):`nav.playground`/`nav.monitoring`、`theme.{light,dark,accent}`、`playground.{request,response,history,syncMode,asyncMode,send,…}`、`monitoring.{endpoint,range1h,range24h,range7d,autoRefresh,qps,latency,p99,errorRate,concurrency,abCompare,resource}`。仅 zh,不加 en。

## Risks / Trade-offs

- **重构破坏既有测试** → D5:守住被测行为与 `data-testid`,选择器随结构同步改(行为/断言不变);每完成一页跑 `vitest` + 相关 E2E,红了即修,不顺带改逻辑。
- **主题首屏闪烁(FOUC)** → D2 入口内联脚本先置 `data-theme`/`--accent` 再渲染。
- **Tailwind 透明度修饰符踩 `<alpha-value>` 坑** → D1 明令禁用 `bg-x/NN`,改用 `--accent-soft`/`color-mix`/`rgba`。
- **静态监控/Playground 被误认为已联通** → 保留 `v1.0` 版本徽章与空态文案;design/spec 明确其为骨架,真实数据归 a3/a4。
- **Recharts mock 与 a4 真实接口形状不一致** → 监控图表以"数据 props 注入"封装,a4 只换数据源不改布局。

## Migration Plan

纯前端、无数据迁移。部署 = 前端重新构建;回滚 = 还原本 change 提交。逐页重构、每页测试通过后推进,保证任一中间态前端可运行。

## Open Questions

无。创建端点形态(D6 弹窗)、权重控件(D6 滑块+数值框)、令牌落地(D1)、字体(D3)、监控图表(D7 Recharts+mock)、测试同步策略(D5)均已定。
