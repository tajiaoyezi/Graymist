# model-registry Specification

## Purpose

模型与版本的完整生命周期管理 —— Model/Version CRUD、任务类型与框架枚举、输入输出 Schema(一等公民)、版本状态机(draft→validating→ready→archived)、版本间指标对比,以及模型仓库前端页面(列表/详情/版本详情/创建表单/Schema 编辑器)。对应原始需求 2.1(模型注册与版本管理)+ 2.5(模型仓库页面),属 v1.0 核心能力。
## Requirements
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

### Requirement: 任务类型枚举

模型的 `task_type` MUST 为 `classification` / `generation` / `embedding` / `custom` 之一。当 `task_type` 为 `custom` 时,模型 MUST 额外携带一个非空的 `custom_task_type`(自定义类型名,用于展示与区分不同自定义任务);当 `task_type` 不为 `custom` 时,`custom_task_type` MUST 为空。前端创建表单在选择"自定义"时 MUST 收集该名并校验非空;模型列表与详情页对 `custom` 模型 MUST 以 `custom_task_type` 展示其任务类型(为空时回退为"自定义"标签),其余三类仍以固定 i18n 标签展示。任务类型的筛选维度仍为该 4 值闭合枚举,MUST NOT 因自定义名而扩展。

#### Scenario: 非法任务类型被拒绝
- **WHEN** 用户提交 task_type="foo"
- **THEN** 系统拒绝并返回枚举校验错误

#### Scenario: 自定义类型必须命名
- **WHEN** 用户提交 task_type=custom 但未提供 custom_task_type(或为空白)
- **THEN** 系统拒绝创建并返回校验错误(422)

#### Scenario: 自定义类型名被持久化并用于展示
- **WHEN** 用户以 task_type=custom 且 custom_task_type="目标检测" 创建模型
- **THEN** 系统保存该名,列表与详情以"目标检测"展示其任务类型

#### Scenario: 非自定义类型不保留自定义名
- **WHEN** 用户以 task_type=classification 同时提交了 custom_task_type
- **THEN** 系统忽略该名,持久化结果中 custom_task_type 为空

### Requirement: 输入输出 Schema 是一等公民

模型的输入输出 Schema MUST 作为一等数据持久化,并在保存时校验其本身为合法的 JSON Schema。该 Schema 定义推理接口的请求/响应格式,后续 Playground 表单生成与推理 API 校验均依赖它(请求数据对 Schema 的校验在推理 API change 中实现,本 change 仅负责 Schema 本身的存储与合法性校验)。

#### Scenario: 合法 Schema 被接受
- **WHEN** 用户提交结构合法的 input_schema / output_schema
- **THEN** 系统保存该 Schema 供后续消费

#### Scenario: 非法 Schema 被拒绝
- **WHEN** 用户提交语法非法或不是合法 JSON Schema 的内容
- **THEN** 系统拒绝保存并返回 Schema 校验错误

### Requirement: 版本上传与管理

系统 SHALL 允许在某个模型下上传新版本,指定 `file_path`(模拟,不需真实上传)、`framework`、`resource_req`(CPU/内存/GPU 显存)、`change_note`。一个模型 MUST 可拥有多个版本,每个版本对应一次训练产物。系统 SHALL 允许删除单个版本;但当该版本被任一端点绑定时 MUST 拒绝删除并返回 409 冲突(避免孤儿化端点绑定),该守卫与版本状态无关;无端点绑定时直接删除该版本。删除单版本独立于"归档"(`archived` 仍为软退役终态),二者并存。

#### Scenario: 在模型下新建版本
- **WHEN** 用户为某模型上传新版本并指定 file_path(模拟路径)、framework、resource_req、change_note
- **THEN** 系统创建该版本,初始状态为 `draft`,并归属到该模型

#### Scenario: 同一模型下多版本共存
- **WHEN** 用户在同一模型下先后创建 v1、v2
- **THEN** 两个版本同时存在且可分别查询

#### Scenario: 删除未被端点绑定的版本
- **WHEN** 用户删除一个没有任何端点绑定的版本
- **THEN** 该版本被删除,不再出现在该模型的版本列表与详情中

#### Scenario: 删除被端点绑定的版本被拒绝
- **WHEN** 用户尝试删除一个仍被端点绑定的版本
- **THEN** 系统返回 409 冲突,该版本保持不变

### Requirement: 框架枚举

版本的 `framework` MUST 为 `PyTorch` / `ONNX` / `TensorRT` 之一。

#### Scenario: 非法框架被拒绝
- **WHEN** 用户提交 framework="Caffe"
- **THEN** 系统拒绝并返回枚举校验错误

### Requirement: 版本状态机

版本状态 MUST 按 `draft → validating → ready → archived` 流转;系统 MUST 仅允许相邻的前向流转(draft→validating、validating→ready、ready→archived),拒绝跨级或逆向流转;`archived` 为终态。只有 `ready` 状态的版本 MUST 被标记为可部署。`validating` 在 v1.0 为轻量过渡态,不强制其判定逻辑。

#### Scenario: 合法的相邻前向流转
- **WHEN** 一个 `draft` 版本被推进
- **THEN** 其状态变为 `validating`

#### Scenario: 跨级流转被拒绝
- **WHEN** 用户尝试把 `draft` 版本直接置为 `ready`
- **THEN** 系统拒绝该状态流转

#### Scenario: 仅 ready 可部署
- **WHEN** 查询某版本是否可部署
- **THEN** 仅当其状态为 `ready` 时返回"可部署"

### Requirement: 版本间指标对比

每个版本承载性能指标 `metrics`(准确率/延迟/吞吐,数据由测试时写入)。系统 SHALL 允许查询同一模型下多个版本的指标用于对比。

#### Scenario: 对比同一模型的多个版本指标
- **WHEN** 用户请求对比某模型下 v1、v2 的指标
- **THEN** 系统返回各版本的 准确率/延迟/吞吐,供并列展示

### Requirement: 模型仓库列表页

前端 SHALL 以卡片或表格展示模型列表,支持按 `task_type` 筛选与按名称搜索。

#### Scenario: 按任务类型筛选
- **WHEN** 用户选择筛选 task_type=embedding
- **THEN** 列表只展示 task_type 为 embedding 的模型

#### Scenario: 按名称搜索
- **WHEN** 用户输入搜索关键字
- **THEN** 列表只展示名称匹配关键字的模型

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

### Requirement: 版本详情页

前端 SHALL 在版本详情页展示 Schema 的格式化 JSON 渲染、性能指标、变更说明,以及状态流转操作按钮。前端 SHALL 在版本详情页提供删除该版本的入口:删除 MUST 经二次确认;当该版本被端点绑定时,删除入口 MUST 禁用并提示原因(从源头避免确认后被 409 拒绝);删除成功后 MUST 返回所属模型详情页,失败(如 409)MUST 在页面内如实提示而非崩溃。所有文案 MUST 走 react-i18next(zh)。

#### Scenario: 渲染 Schema 并执行状态流转
- **WHEN** 用户打开某版本详情并点击状态流转按钮
- **THEN** 页面格式化展示该版本的 Schema/指标/变更说明,且按钮触发合法的版本状态流转

#### Scenario: 删除未绑定版本经二次确认
- **WHEN** 用户在版本详情页对一个未被端点绑定的版本点击删除并确认
- **THEN** 该版本被删除,页面返回所属模型详情

#### Scenario: 被绑定版本的删除入口禁用
- **WHEN** 用户打开一个仍被端点绑定的版本详情
- **THEN** 删除入口处于禁用态并提示需先在管控台改绑

### Requirement: 创建模型与新建版本表单

前端 SHALL 提供创建模型与新建版本的表单,其中包含 Schema 编辑器(支持 JSON 输入或结构化表单)。

#### Scenario: 通过表单创建模型
- **WHEN** 用户在创建模型表单中填写字段并用 Schema 编辑器录入输入输出 Schema
- **THEN** 提交后成功创建模型,非法 Schema 在提交前被表单校验拦截

#### Scenario: 通过表单新建版本
- **WHEN** 用户在新建版本表单中填写 file_path/framework/resource_req/change_note
- **THEN** 提交后在该模型下创建新版本(初始 `draft`)

