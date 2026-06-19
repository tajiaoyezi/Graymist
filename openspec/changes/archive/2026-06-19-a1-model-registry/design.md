## Context

本 change 是 v1.0 核心能力拆分后的**第一个 change**,对应原始需求 2.1(模型注册与版本管理)+ 2.5(模型仓库页面)。因为是首个 change,它额外承担"打地基"的职责:确立四个一等概念的领域模型、两个状态机的概念定义、技术栈脚手架,以及两条架构留缝。

约束来源:
- 《AI 模型管理与推理服务平台.md》(原始需求,唯一权威基准,只读)。
- 《AI 模型管理与推理服务平台-技术方案.md》:§2 领域模型、§3 状态机、§4.1 后端、§5.1 前端、§6 约束、§7 技术栈、§8 架构留缝、§22 Decision Log(D3/D12/D14)。
- 技术栈在本次规划中由用户正式拍板,从 §7 的"推荐(可替换)"转为本项目**已定**。

后续 change(端点部署 / 推理 API / 监控)将在本 change 锁定的领域模型与状态机之上扩展,不得改动已定的实体关系与状态机语义。

## Goals / Non-Goals

**Goals:**
- 落地 Model / Version 两个实体的完整生命周期(CRUD、版本状态机、Schema 一等公民、版本指标对比)。
- 一次性锁定四个一等概念(Model / Version / Endpoint / Inference Task)的领域模型与两个状态机的概念定义,满足"领域理解是前提"(§6.1)。
- 建立后端/前端/存储/异步基础设施的工程脚手架(仅本 change 用到的部分)。
- 采纳两条成本极低的前瞻性留缝:§8.1 变更日志缝、§8.4 i18n 缝。
- 前端模型仓库页面(列表/详情/版本详情/创建表单/Schema 编辑器)。

**Non-Goals:**
- 端点部署、A/B 路由、推理调用、限流、监控指标(分属后续三个 change)。
- `validating` 的真评测门禁(v1.1.3)、真实模型执行(v1.1 起)。本 change 的版本指标为"测试时写入"的占位数据,不含自动评测。
- Endpoint / Binding / InferenceLog / AsyncTask / PlatformQuota 实体的**实现**(仅在本文档锁定其概念定义,留待后续 change 落地)。
- 权限边界 / 多租户(v1.5)。本 change 操作人按 §8.1 记占位标识。

## Decisions

### 决策 1:技术栈(由 §7 推荐项转为已定)
- **后端**:Python 3.12 + FastAPI + asyncio + Pydantic v2。理由:async-native,契合后续异步部署/异步推理/SSE 流式;Pydantic 天然服务"Schema 驱动"(原 §6.6 一等公民)。
- **前端**:React + Vite + TypeScript + Tailwind + 图表库(Recharts 起步,复杂图表可换 ECharts)。理由:与已有原型(React)一致,可直接演进;§8.4 i18n 用 react-i18next。
- **存储**:PostgreSQL。实体/版本/变更日志用关系表;JSON Schema 与 resource_req 用 `jsonb` 列。
- **异步基础设施**:Redis Streams。本 change 仅建立连接与骨架(模型注册无异步需求),异步推理队列/后台部署/并发限流计数在后续 change 使用。
- **ORM/迁移**:SQLAlchemy 2.0 + Alembic(2026-06-19 拍板确认)。Alembic 是 SQLAlchemy 官方的数据库迁移工具(建表/改表结构的版本管理),async 配 asyncpg;非新增功能,只是落地 PostgreSQL 建表的手段。
- **备选与放弃理由**:Node/NestJS(与前端同语言但 Schema 驱动需额外库)、Go(高并发原生但样板多)、Java/Spring(重)——均在用户拍板环节比较后放弃。

### 决策 2:领域模型一次锁定,分 change 实现
四个一等概念及关系在本文档锁定:**Model 1—N Version**,**Endpoint N—N Version(经 A/B 绑定带权重)**,**Inference Task 命中某 Endpoint、路由到某具体 Version**。本 change 仅**实现 Model 与 Version**;其余实体(Endpoint/EndpointVersionBinding/InferenceLog/AsyncInferenceTask/PlatformQuota)的字段定义见技术方案 §2,留待 change 2–4 实现。理由:满足"领域理解是前提"避免返工,同时不为未用到的实体过早建表。

### 决策 3:版本状态机(两个状态机之一,独立建模)
- 状态:`draft → validating → ready → archived`,仅允许相邻前向流转,`archived` 为终态,只有 `ready` 可部署。
- `validating` 在 v1.0 为轻量过渡态,不强制判定逻辑;做实为评测硬门禁是 v1.1.3(独立 `validation_result` 字段,不改本状态机,D1/D6)。
- 版本状态机与端点状态机**不共享字段、不互相触发**(§6.2),端点状态机在 change 2 建模。

### 决策 4:Schema 一等公民的落地边界
- 本 change:Schema 作为 `jsonb` 持久化,保存时校验其**本身**为合法 JSON Schema;前端提供 Schema 编辑器(JSON 输入起步,结构化表单可迭代)与格式化渲染。
- 不在本 change:用 Schema 校验**推理请求数据**(属推理 API change 3)、据 Schema **动态生成 Playground 表单**(属 change 3)。本 change 只保证 Schema 这个一等数据"存得对、看得清"。

### 决策 5:采纳 §8.1 变更日志缝(实现地基,非用户功能)
- 版本状态每次流转,除更新当前态外,向一张 **append-only `change_log` 表**追加不可变记录:`{target_type, target_id, op, before, after, actor, created_at}`。
- 这只是普通 CRUD 表旁的一张只追加日志表,零架构承诺;供 v1.3 审计直接复用("在变更日志上加一个面向人的视图")。
- **操作人**:v1.5/E7 建立管理侧真实身份前记占位标识 `local-admin`/`system`,届时起填真实用户,历史不回填(D12)。
- 该缝是 §8 的"可选实现建议",在本 change 主动采纳;它不构成新增的 v1.0 用户功能(故不写进行为 spec,只作为实现地基 + 任务)。

### 决策 6:采纳 §8.4 i18n 缝(实现地基,非用户功能)
- 前端**不硬编码界面文案**,全部走文案资源表(react-i18next,key→文案)。
- 时间统一以 **UTC 存储**,展示层按 locale 格式化(日期/数字/货币/时区)。
- v1.0 仍是单语言、界面无变化;完整多语言(中/英 + 语言切换)定档 v1.5(D14)。同理只作为实现地基,不写进行为 spec。

### 决策 7:模拟性质
`file_path` 为模拟路径(不真实上传);版本 `metrics` 为"测试时写入"的数据。v1.0 无真实模型执行,符合 §7 的模拟约定。

### 决策 8:工程结构
单仓库双工程:`backend/`(FastAPI 应用,按 `models`/`versions`/`common` 领域分模块)+ `frontend/`(React + Vite)。数据库迁移用 Alembic 管理。

## Risks / Trade-offs

- **[过早建模未用实体]** 锁定四概念但只实现两个,可能与后续 change 的细节出现偏差 → 缓解:仅在 design 锁定**关系与状态机语义**,字段实现以技术方案 §2 为准,后续 change 可在不破坏关系的前提下补字段。
- **[Redis 在本 change 几乎不用]** 引入但仅建骨架,略显超前 → 缓解:只建立连接与健康检查,不写业务逻辑;若评审认为可推迟,可将 Redis 脚手架移到 change 3(异步推理)再引入,本 change 去掉该任务即可。
- **[Schema 编辑器复杂度]** 结构化表单成本高 → 缓解:先做"JSON 文本输入 + 合法性校验"的最小版,结构化表单作为可迭代增强。
- **[变更日志缝被误当强约束]** §8.1/§8.4 是可选实现建议 → 缓解:已明确标注为"实现地基、非 v1.0 用户功能",不进行为 spec;采纳与否不影响 spec 的需求集。

## Migration Plan

Greenfield,无既有数据迁移。部署步骤:
1. 初始化 `backend/` 与 `frontend/` 脚手架;配置 PostgreSQL、Redis 连接。
2. Alembic 首个迁移:创建 `model`、`model_version`、`change_log` 三张表。
3. 实现后端 Model/Version API + Schema 校验 + 变更日志写入。
4. 实现前端模型仓库页面 + Schema 编辑器 + react-i18next 资源表骨架(单语言)。
5. 回滚策略:greenfield 无需数据回滚;代码层回滚即删除本 change 引入的模块与迁移。

## Open Questions

- 暂无阻塞性开放问题:技术栈与 ORM/迁移(SQLAlchemy 2.0 + Alembic)均已拍板确认;图表库(Recharts 起步)取默认推荐,可迭代替换。
- 待后续 change 决定(不阻塞本 change):PlatformQuota 的配置形态(change 2 端点部署时定);Playground 动态表单的 Schema→表单映射规则(change 3 定)。
