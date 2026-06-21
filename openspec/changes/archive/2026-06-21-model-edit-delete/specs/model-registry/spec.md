## MODIFIED Requirements

### Requirement: 模型 CRUD

系统 SHALL 允许创建、查询、更新、删除模型(Model)。创建模型时 MUST 指定 `name`、`description`、`task_type`、`input_schema`、`output_schema`。更新 MUST 支持部分字段更新(PATCH 语义),被更新的输入/输出 Schema MUST 重新校验其本身为合法 JSON Schema。删除模型 MUST 连带删除其下所有版本;但当存在任一端点绑定了该模型的任一版本时,系统 MUST 拒绝删除并返回 409 冲突(避免孤儿化端点绑定),该守卫与端点状态无关,用户需先将相关端点改绑到其它版本后方可删除。模型是逻辑实体,本身不可被调用,其下挂载多个版本。

#### Scenario: 创建模型并指定全部必填字段
- **WHEN** 用户提交 name="文本分类器"、description、task_type=classification、合法的 input_schema 与 output_schema
- **THEN** 系统创建该模型并返回其 `id` 与 `created_at`

#### Scenario: 缺少必填字段被拒绝
- **WHEN** 用户提交的请求缺少 task_type 或 input_schema/output_schema
- **THEN** 系统拒绝创建并返回字段校验错误

#### Scenario: 更新模型字段
- **WHEN** 用户对某模型提交部分字段更新(如 name / description)
- **THEN** 系统持久化更新后的字段并返回最新模型;若更新中包含非法 Schema 则拒绝

#### Scenario: 删除无端点绑定的模型
- **WHEN** 用户删除一个没有任何端点绑定其版本的模型
- **THEN** 该模型及其版本不再出现在列表与详情中

#### Scenario: 删除被端点绑定的模型被拒绝
- **WHEN** 用户尝试删除一个其某版本仍被端点绑定的模型
- **THEN** 系统返回 409 冲突,模型与其版本保持不变

### Requirement: 模型详情页

前端 SHALL 在模型详情页展示基本信息、版本列表(含状态、创建时间、资源需求),以及版本间指标对比(表格或图表)。前端 SHALL 在模型详情页提供「编辑」与「删除」模型入口:编辑 MUST 仅允许修改 `name` 与 `description`(`task_type` 与输入/输出 Schema 为模型结构身份,MUST NOT 在此处修改);删除 MUST 经二次确认,成功后跳回模型列表,被端点绑定导致的 409 拒绝 MUST 在页面内如实提示而非使页面崩溃。所有文案 MUST 走 react-i18next(zh)。

#### Scenario: 查看模型详情
- **WHEN** 用户打开某模型详情
- **THEN** 页面展示基本信息、其全部版本(状态/创建时间/资源需求)与版本指标对比

#### Scenario: 编辑模型名称与描述
- **WHEN** 用户在模型详情页点击「编辑」,修改 name / description 并保存
- **THEN** 系统经 PATCH 更新模型,页面刷新为最新信息;编辑表单 MUST NOT 暴露 task_type 与 Schema 字段

#### Scenario: 删除模型经二次确认
- **WHEN** 用户在模型详情页点击「删除」并在二次确认弹窗中确认
- **THEN** 若无端点绑定,模型被删除并跳回模型列表;若被端点绑定,页面内提示 409 拒绝原因且停留在详情页
