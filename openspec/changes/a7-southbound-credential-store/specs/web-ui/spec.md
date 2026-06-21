## MODIFIED Requirements

### Requirement: external-api 版本注册

模型仓库的新建版本表单 SHALL 支持注册 `external-api` 来源版本:提供来源切换(`mock` / `external-api`);选择 `external-api` 时,表单 MUST 显示上游连接字段(`provider`、`base_url`、`upstream_model`、`protocol`(`{openai, anthropic}` 可选,默认 `openai`)、可选 `auth_ref`、可选 **API Key**)并隐藏与该来源无关的字段(`framework` / `file_path` / `resource_req`);选择 `mock` 时表单与既有行为完全一致。**API Key 输入框 MUST 为 password 类型;平台 MAY 收集明文 API Key 作为写入输入,但界面与响应 MUST NOT 回显该明文(或其密文),仅以「已配置 / 未配置」呈现;提交的明文 MUST 加密存储(见 `southbound-credentials` 能力)。** `auth_ref`(凭证引用 / 环境变量名)保留为兜底,界面 MUST NOT 收集或展示 `auth_ref` 指向的真实密钥。所有新增文案 MUST 走 react-i18next(zh),MUST NOT 硬编码;新增视觉元素 MUST 取语义设计令牌。

#### Scenario: 切换到 external-api 显示上游字段
- **WHEN** 用户在新建版本表单将来源切到 `external-api`
- **THEN** 表单显示 provider/base_url/upstream_model/protocol/auth_ref/API Key 字段、隐藏 framework/file_path/resource_req,提交后创建一个 external-api 来源版本

#### Scenario: 选择 Anthropic 协议
- **WHEN** 用户在 external-api 来源下把 `protocol` 选为 `anthropic` 并提交
- **THEN** 提交载荷的 `protocol` 为 `anthropic`,创建一个 Anthropic 南向的 external-api 版本

#### Scenario: 填写 API Key 加密存储且不回显
- **WHEN** 用户在 external-api 表单填入 API Key 并提交(平台已配置主密钥)
- **THEN** 创建成功且响应不含明文/密文 key,版本以 `has_api_key=true` 标识为「已配置」

#### Scenario: mock 来源表单不变
- **WHEN** 用户保持来源为 `mock`
- **THEN** 新建版本表单与字段与既有 v1.0 完全一致

#### Scenario: 创建 external 模型时预填只读 chat schema
- **WHEN** 用户创建用于 external-api 的模型
- **THEN** 创建表单预填只读的固定 canonical chat schema(`{type:object, properties:{messages, system}}`)以满足必填的 input/output_schema,用户无需手写
