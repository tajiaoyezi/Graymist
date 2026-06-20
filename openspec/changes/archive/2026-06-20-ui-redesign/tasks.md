## 1. 设计令牌与字体基建

- [x] 1.1 将解包出的 **Manrope 6 个 + JetBrains Mono 6 个** woff2(按 unicode-range 子集化、跨字重复用,目录里实际存在的文件,不造不存在的字重)放入 `frontend/public/fonts/`
- [x] 1.2 `index.css` 按原型 `unicode-range` 写 `@font-face`(`font-display:swap`)与 `.mono` 工具类(JetBrains Mono);body 用 Manrope + 系统中文回退栈(PingFang SC/Microsoft YaHei)
- [x] 1.3 `index.css` 定义 `:root`(浅色)与 `:root[data-theme="dark"]`(深色)全部语义令牌:accent、**accent-soft(由 accent 经 color-mix 派生)**、bg/panel/surface/surface2/border/border-soft/text/text2/muted/faint/faint2/sidebar、**sidebar-line**
- [x] 1.4 `tailwind.config.js` 的 `theme.extend.colors` 映射语义色到 CSS 变量 → verify: 组件可用 `bg-panel text-muted border-border`;**备注:语义色为 hex 型 var(),禁用 Tailwind 透明度修饰符 `bg-x/NN`,半透明用 accent-soft/color-mix/rgba**
- [x] 1.5 `index.html` `<head>` 前置内联脚本:按 localStorage 设初始 `data-theme` 与 `--accent`,避免首屏闪烁

## 2. 主题切换

- [x] 2.1 新增 `ThemeProvider`(Context:`{theme, accent}`,写 `documentElement.dataset.theme` 与 `--accent`,localStorage 读写;默认 `light`/`#4f46e5`)
- [x] 2.2 `main.tsx` 用 `ThemeProvider` 包裹应用
- [x] 2.3 主题切换控件(浅/深按钮 + 6 主题色色块,色值同原型)放入侧栏底部
- [x] 2.4 测试:切深色后 `data-theme="dark"`、切主题色后 `--accent` 变更、二者刷新后(localStorage)保持 → `vitest` 绿

## 3. 应用外壳与路由

- [x] 3.1 新增 `AppLayout`(侧栏 `Sidebar` + 顶栏 `Topbar` + `<Outlet/>`,flex 100vh)
- [x] 3.2 `Sidebar`:ModelMesh 品牌标 + 分组导航(**仅 4 项**:模型仓库/部署管控台/推理 Playground/监控仪表盘,**不含「创建模型」**)+ `NavLink` 激活高亮 + 底部主题控件
- [x] 3.3 `Topbar`:按当前路由显示页面标题
- [x] 3.4 `App.tsx` 改为 `AppLayout` 包裹路由;**新增 `/playground`、`/monitoring`;移除 `/endpoints/new`**(创建端点改弹窗);`/models/new` 保留(由模型仓库页内按钮进入)
- [x] 3.5 `i18n/locales/zh.ts` 增补 key(去硬编码):`nav.playground`/`nav.monitoring`、页面标题、`theme.{light,dark,accent}`
- [x] 3.6 测试:导航恰好 4 项、不含「创建模型」/超纲条目、当前页高亮、顶栏标题正确 → `vitest` 绿

## 4. 模型仓库视觉还原(a1,只改呈现)

- [x] 4.1 `ModelsPage`:任务类型筛选 tab + 搜索框 + 模型卡片网格(名称/描述/标签/版本数/状态点)+ **页内「创建模型」按钮入口**,套用设计令牌
- [x] 4.2 `ModelDetailPage`:**顶部「← 返回模型列表」入口** + 左右双栏(左版本列表[版本号+状态徽章+框架+时间]+ 指标对比表;右基本信息 + 输入/输出 Schema 代码块,深色 `pre.mono`)
- [x] 4.3 `VersionDetailPage`(Schema 格式化 + 性能指标 + 变更说明 + **保留 VersionActions 状态流转按钮语义**)与 `CreateModelPage`/新建版本表单(**保留 Schema 编辑器**)套用设计令牌 → verify: 状态流转/Schema 校验行为不变
- [x] 4.4 保留所有测试可见语义(可访问名/role/文本/标签/testid);run `vitest` + model-registry E2E → 全绿

## 5. 部署管控台视觉还原(a2,只改呈现)

- [x] 5.1 `DeploymentConsolePage`:端点**表格**(端点/URL、状态徽章、模型·版本(A/B)、资源占用、操作);creating 脉冲提示;**保留 `endpoint-${id}`/`status-${id}`/`loading-${id}` testid**,行用 `getByRole('row')` 可定位
- [x] 5.2 **创建端点弹窗(Modal,由「创建端点」按钮触发,`EndpointFormPage` 改造为弹窗内容组件)**:选模型 + A/B 多选与**权重滑块 + 同步数值框**(实时求和、非 100% 报错、保留单条越界校验,**保留 `weight-input-${id}` testid**)+ 资源配额输入 + 平台剩余配额**双段条(已用+待占叠加、超额变色,保留 `quota-${d}`/`quota-over` testid)**+ 超时/并发;**保留 `ep-url`/`ep-name`/`submit-endpoint`**(既有测试与 createEndpoint 依赖)
- [x] 5.3 `AbWeightEditor`(滑块+数值框双向同步)/ `QuotaUsage`(双段条)/ `ConfirmDialog` 套用设计令牌
- [x] 5.4 **同步更新 endpoint-deployment E2E(只调选择器、不改被测行为)**:`goto('/endpoints/new')` → 在控制台点「创建端点」开弹窗;`locator('li').filter` → `getByRole('row')`/`endpoint-${id}`;权重经 `weight-input-${id}` 数值框输入。run `vitest` + 该 E2E → 全绿

## 6. 推理 Playground 静态骨架(§2.7,纯静态)

- [x] 6.1 `PlaygroundPage`:左请求面板(端点下拉占位 + Schema 动态表单占位区 + 同步/异步切换 + 发送)、右响应面板(结果/延迟占位 + 空态)+ 会话历史(空态)
- [x] 6.2 仅本地占位 state,**不 import api client、不发请求**;`i18n` 增补 `playground.{request,response,history,syncMode,asyncMode,send,…}`
- [x] 6.3 测试:页面渲染三大区块、无任何网络请求(mock fetch 断言未被调用)→ `vitest` 绿

## 7. 监控仪表盘静态骨架(§2.8,纯静态)

- [x] 7.1 `MonitoringPage`:端点选择 + 时间范围(1h/24h/7d)+ 自动刷新开关(纯 UI 态)+ **5 张指标卡(QPS / 平均延迟 / P99 / 错误率 / 当前并发数 —— §2.4 五项)**
- [x] 7.2 图表用 Recharts(已依赖)+ 硬编码 mock:QPS、延迟(均值+P99)、错误率、A/B 对比、资源总览;图表按"数据 props 注入"封装,便于 a4 换真实数据
- [x] 7.3 仅本地 mock,**不发请求**;`i18n` 增补 `monitoring.{endpoint,range1h,range24h,range7d,autoRefresh,qps,latency,p99,errorRate,concurrency,abCompare,resource}`
- [x] 7.4 测试:页面渲染五项指标卡与各图表、无网络请求 → `vitest` 绿

## 8. 范围守卫与回归

- [x] 8.1 守卫测试:全局不出现超纲入口(网关/成本/告警/审计/团队/设置)与超纲功能件(角色/通知/里程碑/EN)
- [x] 8.2 跑全套 `vitest`(含 a1/a2 既有用例,选择器已按 D5 同步)→ 全绿(44/44)
- [x] 8.3 跑全套 Playwright E2E:model-registry(「创建模型」入口子串匹配,免改)+ endpoint-deployment(goto→开弹窗、li→row)→ 全绿(2/2)
- [x] 8.4 浅色/深色各核对 4 页与原型观感一致(Playwright 自起浏览器逐页截图 + 读图核验:模型仓库/详情/部署管控台/创建弹窗/Playground/监控,light+dark 全部通过)
