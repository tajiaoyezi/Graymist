## MODIFIED Requirements

### Requirement: external-api 版本注册

模型仓库的新建版本表单 SHALL 支持注册 `external-api` 来源版本:提供来源切换(`mock` / `external-api`);选择 `external-api` 时,表单 MUST 显示上游连接字段(`provider`、`base_url`、`upstream_model`、`protocol`(本期为 `{openai, anthropic}` 可选,默认 `openai`)、`auth_ref`)并隐藏与该来源无关的字段(`framework` / `file_path` / `resource_req`);选择 `mock` 时表单与既有行为完全一致。`auth_ref` 为凭证引用(如环境变量名),界面 MUST NOT 收集或展示明文密钥。所有新增文案 MUST 走 react-i18next(zh),MUST NOT 硬编码;新增视觉元素 MUST 取语义设计令牌。

#### Scenario: 切换到 external-api 显示上游字段
- **WHEN** 用户在新建版本表单将来源切到 `external-api`
- **THEN** 表单显示 provider/base_url/upstream_model/protocol/auth_ref 字段、隐藏 framework/file_path/resource_req,提交后创建一个 external-api 来源版本

#### Scenario: 选择 Anthropic 协议
- **WHEN** 用户在 external-api 来源下把 `protocol` 选为 `anthropic` 并提交
- **THEN** 提交载荷的 `protocol` 为 `anthropic`,创建一个 Anthropic 南向的 external-api 版本

#### Scenario: mock 来源表单不变
- **WHEN** 用户保持来源为 `mock`
- **THEN** 新建版本表单与字段与既有 v1.0 完全一致

#### Scenario: 创建 external 模型时预填只读 chat schema
- **WHEN** 用户创建用于 external-api 的模型
- **THEN** 创建表单预填只读的固定 canonical chat schema(`{type:object, properties:{messages, system}}`)以满足必填的 input/output_schema,用户无需手写
