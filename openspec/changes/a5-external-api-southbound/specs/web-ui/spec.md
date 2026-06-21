## ADDED Requirements

### Requirement: external-api 版本注册

模型仓库的新建版本表单 SHALL 支持注册 `external-api` 来源版本:提供来源切换(`mock` / `external-api`);选择 `external-api` 时,表单 MUST 显示上游连接字段(`provider`、`base_url`、`upstream_model`、`protocol`(本期锁定 `openai`)、`auth_ref`)并隐藏与该来源无关的字段(`framework` / `file_path` / `resource_req`);选择 `mock` 时表单与既有行为完全一致。`auth_ref` 为凭证引用(如环境变量名),界面 MUST NOT 收集或展示明文密钥。所有新增文案 MUST 走 react-i18next(zh),MUST NOT 硬编码;新增视觉元素 MUST 取语义设计令牌。

#### Scenario: 切换到 external-api 显示上游字段
- **WHEN** 用户在新建版本表单将来源切到 `external-api`
- **THEN** 表单显示 provider/base_url/upstream_model/protocol/auth_ref 字段、隐藏 framework/file_path/resource_req,提交后创建一个 external-api 来源版本

#### Scenario: mock 来源表单不变
- **WHEN** 用户保持来源为 `mock`
- **THEN** 新建版本表单与字段与既有 v1.0 完全一致

#### Scenario: 创建 external 模型时预填只读 chat schema
- **WHEN** 用户创建用于 external-api 的模型
- **THEN** 创建表单预填只读的固定 canonical chat schema(`{type:object, properties:{messages, system}}`)以满足必填的 input/output_schema,用户无需手写

## MODIFIED Requirements

### Requirement: 推理 Playground
平台 SHALL 在推理 Playground 页面接通真实推理 API(对应原始需求 §2.7),布局为左右双栏:左为请求面板 —— 选择目标端点(列出可推理的 `running` 端点)、按命中版本来源生成输入区(**mock 来源**按命中 Model 的 `input_schema` 动态生成字段表单;**external-api 来源**生成 chat 编排器:可选 system 框 + 可增删的 role/content 消息行)、同步/异步模式切换、发送;右为响应面板 —— 展示格式化结果与延迟,对 external-api 来源**额外展示 token 用量(prompt/completion/total)**(异步模式显示轮询直至终态),以及本次会话的请求/响应历史区、可回填。调用 MUST 经由 `inference-api`(Schema/chat 校验、并发限流、超时等行为由后端决定并在前端如实呈现)。本页对 external-api 仅呈现真实结果/延迟/用量,MUST NOT 引入 SSE 流式、成本估算/计价、北向协议切换等超纲元素;所有文案 MUST 走 react-i18next(zh),MUST NOT 硬编码。

#### Scenario: 动态表单按字段生成并同步推理(mock)
- **WHEN** 用户选择一个 mock 来源的 `running` 端点,页面按命中 Model 的 `input_schema` 各字段生成对应控件,用户填写后以同步模式发送
- **THEN** 页面经推理 API 发起调用,在响应面板展示格式化 JSON 结果与延迟,并把本次请求/响应计入会话历史

#### Scenario: chat 编排器发送并展示用量(external-api)
- **WHEN** 用户选择一个 external-api 来源的 `running` 端点,在 chat 编排器中填写 system/消息并发送
- **THEN** 页面经推理 API 调用上游,在响应面板展示真实结果、延迟与 token 用量(prompt/completion/total)

#### Scenario: external-api 端点不渲染动态表单
- **WHEN** 用户选择一个 external-api 来源端点(其 Model 的 `input_schema` 形如 object)
- **THEN** 页面先按端点来源分流、强制渲染 chat 编排器,**不**由 `input_schema` 生成动态表单字段

#### Scenario: 异步推理轮询至终态
- **WHEN** 用户切换为异步模式并发送
- **THEN** 页面取得任务 ID 后轮询任务状态,直至终态再展示最终结果

#### Scenario: 会话历史回填
- **WHEN** 用户点击会话历史中的某条记录
- **THEN** 该条的输入被回填到请求面板以便再次发送

#### Scenario: 不出现超纲元素
- **WHEN** 浏览推理 Playground 页面
- **THEN** 不存在 SSE 流式、成本估算/计价、北向协议切换等超纲控件,文案均来自 zh 资源表

### Requirement: 范围约束与国际化
本前端 MUST 限定在四个页面与视觉框架内,MUST NOT 引入原型中的超纲页面(网关/成本/告警/审计/团队/设置)与超纲功能件(角色切换、通知中心、里程碑版本条、EN 语言)。据已定档 v1.1,前端 MAY 在模型仓库注册 external-api 来源版本、在 Playground 对 external-api 端点提供 chat 输入并展示 token 用量;但仍 MUST NOT 引入:SSE 流式、成本/计价、监控 token 用量/花费/LLM 指标、北向 Anthropic 协议切换、调用方鉴权 UI(分属 v1.1.1 / v1.1.2 / v1.2)。所有界面文案 MUST 走 react-i18next(zh)资源表,MUST NOT 硬编码。

#### Scenario: 不出现超纲入口
- **WHEN** 浏览任一页面与导航
- **THEN** 不存在网关/成本/告警/审计/团队/设置入口,也不存在角色切换、通知中心、里程碑条、EN 切换

#### Scenario: external-api 呈现限定在来源注册与 Playground 用量
- **WHEN** 浏览模型仓库与 Playground
- **THEN** external-api 仅体现为版本来源注册与 Playground 的 chat 输入/用量展示,不出现 SSE 流式、成本计价、监控成本维度、北向协议切换等超纲元素

#### Scenario: 文案走资源表
- **WHEN** 新增页面渲染文案
- **THEN** 文案来自 zh 资源表的 key,而非硬编码字符串
