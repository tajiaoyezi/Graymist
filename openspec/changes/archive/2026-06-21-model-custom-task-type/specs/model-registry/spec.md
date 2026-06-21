## MODIFIED Requirements

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
