## 1. 脚手架与基础设施(地基)

- [x] 1.1 初始化 `backend/` FastAPI 工程(Python 3.12 + Pydantic v2),按 `models`/`versions`/`common` 分模块
- [x] 1.2 初始化 `frontend/` React + Vite + TypeScript + Tailwind 工程,接入图表库(Recharts)
- [x] 1.3 配置 PostgreSQL 连接 + SQLAlchemy 2.0 + Alembic 迁移骨架
- [x] 1.4 配置 Redis Streams 连接与健康检查骨架(本 change 不写业务逻辑,仅建立连接,验证可达)
- [x] 1.5 前端接入 react-i18next:建立文案资源表(key→文案,单语言),约定"界面文案不硬编码";封装 UTC→locale 的日期/数字格式化工具(§8.4 缝)

## 2. 数据模型与迁移

- [x] 2.1 Alembic 首个迁移:建 `model` 表(id/name/description/task_type/input_schema(jsonb)/output_schema(jsonb)/created_at/updated_at)
- [x] 2.2 建 `model_version` 表(id/model_id(FK)/version/file_path/framework/resource_req(jsonb)/change_note/status/metrics(jsonb)/created_at)
- [x] 2.3 建 `change_log` 表(id/target_type/target_id/op/before(jsonb)/after(jsonb)/actor/created_at),append-only(§8.1 缝)
- [x] 2.4 在 design 中锁定但本 change 不建表:Endpoint/Binding/InferenceLog/AsyncTask/PlatformQuota — 仅在代码注释/文档标注"留待 change 2–4",不创建迁移

## 3. 后端 — Model CRUD 与 Schema 一等公民

- [x] 3.1 Model 实体 + 仓储 + 服务层
- [x] 3.2 `task_type` 枚举校验(classification/generation/embedding/custom),非法值返回校验错误
- [x] 3.3 input/output Schema 持久化为 jsonb;保存时校验其本身为合法 JSON Schema,非法则拒绝
- [x] 3.4 Model CRUD API:创建(校验必填 name/description/task_type/input_schema/output_schema)、查询、更新、删除
- [x] 3.5 模型列表查询 API:支持按 task_type 筛选 + 按 name 搜索

## 4. 后端 — Version 管理与版本状态机

- [x] 4.1 ModelVersion 实体 + 仓储 + 服务层;版本归属某 Model,支持同模型多版本
- [x] 4.2 新建版本 API:指定 file_path(模拟)/framework/resource_req/change_note,初始状态 `draft`
- [x] 4.3 `framework` 枚举校验(PyTorch/ONNX/TensorRT)
- [x] 4.4 版本状态机:仅允许相邻前向流转(draft→validating→ready→archived),拒绝跨级/逆向;archived 为终态
- [x] 4.5 暴露"是否可部署"判定:仅 status=ready 返回可部署(供 change 2 端点部署消费)
- [x] 4.6 每次版本状态流转向 `change_log` 追加不可变记录(op/before/after/created_at;actor 记占位 local-admin/system,D12)

## 5. 后端 — 版本指标对比

- [x] 5.1 版本 `metrics`(准确率/延迟/吞吐)读写;数据"测试时写入"(本 change 不做自动评测)
- [x] 5.2 版本对比查询 API:返回同一模型下多个版本的指标,供前端并列展示

## 6. 前端 — 模型仓库页面

- [x] 6.1 模型列表页:卡片/表格展示 + 按 task_type 筛选 + 按名称搜索
- [x] 6.2 模型详情页:基本信息 + 版本列表(状态/创建时间/资源需求)+ 版本间指标对比(表格/图表)
- [x] 6.3 版本详情页:Schema 格式化 JSON 渲染 + 性能指标 + 变更说明 + 状态流转操作按钮(按钮触发合法流转)
- [x] 6.4 创建模型表单:含 Schema 编辑器(JSON 输入起步 + 提交前合法性校验)
- [x] 6.5 新建版本表单:file_path/framework/resource_req/change_note 录入
- [x] 6.6 所有界面文案走 i18n 资源表、时间按 locale 展示(校验无硬编码文案)

## 7. 验证

- [x] 7.1 后端单元/接口测试:覆盖 task_type/framework 枚举校验、Schema 合法性校验、版本状态机合法与非法流转、仅 ready 可部署、版本对比查询
- [x] 7.2 验证每次版本状态流转都写入了 change_log 不可变记录
- [x] 7.3 前端联调:列表筛选/搜索、详情、版本详情状态流转、创建模型/版本表单提交与 Schema 校验拦截
- [x] 7.4 运行 `openspec validate model-registry --strict` 确认本 change 通过校验
