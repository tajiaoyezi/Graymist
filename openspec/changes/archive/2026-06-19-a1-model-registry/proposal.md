## Why

平台的主链路是「模型注册 → 版本管理 → 版本就绪 → 端点部署 → 路由 → 推理 → 监控」。其中**模型注册与版本管理是整条链路的入口和数据地基**:没有 Model/Version 实体、没有输入输出 Schema、没有版本状态机,后面的端点部署、推理校验、Playground 表单生成、版本指标对比都无从谈起。

按 v1.0 的能力拆分,这是**第一个 change**,因此它额外承担"打地基"的职责:确立四个一等概念的领域模型、两个状态机的概念定义、技术栈脚手架,以及两条成本极低的前瞻性架构留缝(§8.1 变更日志、§8.4 i18n)。先把地基和入口能力做扎实,后续三个 change(端点部署 / 推理 API / 监控)才能无返工地长上去。

对应原始需求:**2.1 模型注册与版本管理(后端)** + **2.5 模型仓库页面(前端)**。

## What Changes

- **项目脚手架(地基)**:建立后端(Python 3.12 + FastAPI + Pydantic + asyncio)、前端(React + Vite + TS + Tailwind + 图表库)、数据存储(PostgreSQL)与异步基础设施(Redis Streams)的工程骨架。仅供本 change 用到的部分先落地,其余随后续 change 扩展。
- **领域模型确立(地基)**:把四个一等概念(Model / Version / Endpoint / Inference Task)及其关系一次性建模清楚(满足"领域理解是前提");本 change **实现 Model 与 Version 两个实体**,Endpoint / Binding / InferenceLog / AsyncTask / PlatformQuota 仅在 design 中锁定概念定义,留给后续 change 实现。
- **Model CRUD**:创建/查询/更新/删除模型,指定 `name` / `description` / `task_type`(classification/generation/embedding/custom)/ `input_schema` / `output_schema`。
- **版本管理**:上传新版本指定 `file_path`(模拟,不真实上传)/ `framework`(PyTorch/ONNX/TensorRT)/ `resource_req`(CPU/内存/GPU 显存)/ `change_note`;版本间指标对比(准确率/延迟/吞吐,测试时写入)。
- **版本状态机**:`draft → validating → ready → archived`,只有 `ready` 可被部署;`validating` 在 v1.0 为轻量过渡态(不强制判定逻辑,做实的评测门禁留到 v1.1.3)。
- **Schema 驱动(一等公民)**:Model 的输入输出 Schema 作为一等数据,定义推理请求/响应格式,后续 Playground 表单与推理 API 校验均依赖它;本 change 提供 Schema 的存储、校验(合法 JSON Schema)与格式化渲染。
- **模型仓库页面**:模型列表(卡片/表格,按任务类型筛选 + 搜索)、模型详情(基本信息 + 版本列表 + 版本间指标对比)、版本详情(Schema 格式化渲染 + 性能指标 + 变更说明 + 状态流转操作)、创建模型/新建版本表单(含 Schema 编辑器)。
- **§8.1 变更日志缝(采纳为实现地基)**:版本状态每次流转向一张 append-only 变更日志表追加不可变记录(操作/前后值/时间/操作人占位)。`操作人` 在 v1.5/E7 建立真实身份前记为 `local-admin`/`system`(D12)。供后续审计(v1.3)直接复用。
- **§8.4 i18n 缝(采纳为实现地基)**:前端文案不硬编码、全部走文案资源表(react-i18next);时间统一 UTC 存储、展示层按 locale 格式化。v1.0 仍单语言、界面无变化;完整多语言定档 v1.5(D14)。

> 非目标(Non-goals):端点部署、A/B 路由、推理调用、限流、监控指标 —— 分属后续三个 change;`validating` 的真评测门禁(v1.1.3)、真实模型执行(v1.1 起)均不在本 change。本 change 的版本指标为"测试时写入"的数据,不含自动评测。

## Capabilities

### New Capabilities
- `model-registry`: 模型与版本的完整生命周期管理 —— Model/Version CRUD、任务类型、输入输出 Schema(一等公民)、版本状态机(draft→validating→ready→archived)、版本间指标对比,以及模型仓库前端页面(列表/详情/版本详情/创建表单/Schema 编辑器)。

### Modified Capabilities
<!-- 无。本仓库为 greenfield,openspec/specs/ 为空,无既有能力的需求变更。 -->

## Impact

- **新增代码**:后端 `models`/`versions` 领域模块(实体、仓储、服务、API)、Schema 校验与变更日志组件;前端模型仓库相关页面与 Schema 编辑器组件;数据库迁移(model / model_version / change_log 表)。
- **新增依赖/基础设施**:FastAPI、Pydantic、SQLAlchemy 2.0 + Alembic、PostgreSQL、Redis(本 change 仅建立连接与骨架,异步推理队列等在后续 change 使用)、React + Vite + Tailwind + 图表库 + react-i18next。
- **技术决策落档**:§7 推荐技术栈由"可替换"转为本项目**已定**(详见 design.md);§8.1 / §8.4 两条留缝在本 change 落地为实现地基。
- **对后续 change 的约定**:领域模型与两个状态机的概念定义在 design.md 锁定,端点部署(change 2)、推理 API(change 3)、监控(change 4)在此之上扩展,不得改动已定的实体关系与状态机语义。
