## RENAMED Requirements

- FROM: `### Requirement: 推理 Playground 静态骨架`
- TO: `### Requirement: 推理 Playground`

## MODIFIED Requirements

### Requirement: 推理 Playground
平台 SHALL 在推理 Playground 页面接通真实推理 API(对应原始需求 §2.7),布局为左右双栏:左为请求面板 —— 选择目标端点(列出可推理的 `running` 端点)、按命中 Model 的 `input_schema` **动态生成输入表单**(按字段渲染对应控件,而非单一 JSON 文本域)、同步/异步模式切换、发送;右为响应面板 —— 展示格式化 JSON 结果与延迟(异步模式显示轮询直至终态),以及本次会话的请求/响应历史区、可回填。调用 MUST 经由 `inference-api`(Schema 校验、并发限流、超时等行为由后端决定并在前端如实呈现)。本页 MUST 严守 v1.0 §2.7 范围,MUST NOT 引入协议切换、SSE 流式、成本估算等超纲元素;所有文案 MUST 走 react-i18next(zh),MUST NOT 硬编码。

#### Scenario: 动态表单按字段生成并同步推理
- **WHEN** 用户选择一个 `running` 端点,页面按命中 Model 的 `input_schema` 各字段生成对应控件(如文本字段→文本框、图片 URL 字段→URL 输入框,而非单一 JSON 文本域),用户填写后以同步模式发送
- **THEN** 页面经推理 API 发起调用,在响应面板展示格式化 JSON 结果与延迟,并把本次请求/响应计入会话历史

#### Scenario: 异步推理轮询至终态
- **WHEN** 用户切换为异步模式并发送
- **THEN** 页面取得任务 ID 后轮询任务状态,直至终态再展示最终结果

#### Scenario: 会话历史回填
- **WHEN** 用户点击会话历史中的某条记录
- **THEN** 该条的输入被回填到请求面板以便再次发送

#### Scenario: 不出现超纲元素
- **WHEN** 浏览推理 Playground 页面
- **THEN** 不存在协议切换、SSE 流式、成本估算等超纲控件,文案均来自 zh 资源表
