## Context

a5/a6 的上游凭证是「引用」式:版本存 `auth_ref`(环境变量名),`external._auth_headers` 用 `os.environ.get(auth_ref)` 取真密钥并按协议注入,平台不存明文(web-ui 规格明文「MUST NOT 收集明文密钥」)。自托管用户要接公网模型时只能去后端配环境变量,无法在控制台直接填 key。本 change 在保持「不落明文」底线的前提下,让用户在 UI 填 key,平台**加密存储、调用时解密注入**。

现状关键缝:`external._auth_headers(version_row, headers, adapter)`(a6)已是按协议注入;`ModelVersionRow` 已承载 external 连接字段;迁移序列到 `0005`;`config.py` 用 pydantic-settings(前缀 `GRAYMIST_`)。

## Goals / Non-Goals

**Goals:**
- UI 直填上游 API Key(password),平台 Fernet 加密存 `auth_secret_enc` 列。
- 推理时解密注入,优先级:存储 key > `auth_ref` 环境变量 > 无。
- 响应/界面/日志**永不回显**明文或密文,仅 `has_api_key` 布尔。
- 轮换入口 `PUT /versions/{id}/credential`(set/rotate/clear)。
- 未配主密钥保存 key → 清晰 4xx 拒绝。

**Non-Goals:**
- 北向调用方鉴权(v1.1.1)、独立 Credential 实体 / 跨版本复用、KMS/HSM、主密钥轮换重加密、凭证操作审计(v1.3)。
- 明文密钥的二次展示(永不回显)、SSE/成本(他版本)。

## Decisions

### D1：Fernet 对称加密,主密钥来自 `GRAYMIST_SECRET_KEY`
新增 `app/common/crypto.py`:`encrypt_secret(plaintext)->str` / `decrypt_secret(token)->str`,基于 `cryptography.fernet.Fernet(settings.secret_key)`。Fernet = AES-CBC + HMAC 认证加密,密文为 urlsafe-base64 文本,直接进 `Text` 列。`settings.secret_key`(`GRAYMIST_SECRET_KEY`)是唯一引导密钥(一个 Fernet key);为空时 `encrypt_secret` 抛 `SecretKeyNotConfiguredError`。
**为何 Fernet 而非自造**:认证加密防篡改、库成熟、密文自带版本/时间戳;KMS/HSM 对 v1.1 自托管过重。

### D2：凭证存在 Version 上(`auth_secret_enc` 列),非独立实体
延续 a5/a6「上游连接挂在 Version」的建模,新增可空 `auth_secret_enc: Text`。
**为何不抽独立 Credential 实体**:跨版本复用/共享凭证是更重的建模(新实体 + CRUD + 引用),v1.1 最小化;代价是 key 绑在版本上,故补 `PUT /versions/{id}/credential` 轮换入口避免「换 key 要重建版本」。独立凭证实体留作后续。

### D3：加密在服务层,Pydantic 不做 IO/crypto
`VersionCreate` 增**只写**字段 `api_key: str | None`(随请求传入、不回包);`VersionService.create` 在 `source=external-api` 且带 `api_key` 时调 `encrypt_secret` → 存 `auth_secret_enc`,**绝不**持久化明文。`VersionOut` 增 `has_api_key: bool`(由 `ModelVersionRow.has_api_key` 属性 = `auth_secret_enc is not None` 派生),**不含** `api_key`/`auth_secret_enc`。

### D4：鉴权解析优先级(`external._auth_headers`)
真实推理(`upstream_mock=false`)时:`auth_secret_enc` 有 → `decrypt_secret` 得 key;否则 `auth_ref` 有 → `os.environ.get`;否则不注入。拿到 key 后 `{**headers, **adapter.auth_headers(key)}`(协议派发不变)。`upstream_mock=true` 仍最先短路、不碰密钥。

### D5：未配/非法主密钥 与 解密失败的处置
- 保存路径:`GRAYMIST_SECRET_KEY` 未配置(空)**或非法**(非 Fernet key)而带 `api_key` → `_fernet()` 统一抛 `SecretKeyNotConfiguredError` → 400,不落明文(创建/轮换整体失败,发生在写库前)。
- 推理路径:`auth_secret_enc` 存在但解密失败(主密钥丢失/被换/非法)→ 记一条 warning、`_resolve_key` **`return None`**:**不**回退到 `auth_ref` env、不注入任何 key,请求照发 → 上游 401 使「存储凭证不可解」可见,不因解密失败崩 500(对齐下文优先级语义,避免静默用回退凭证掩盖问题)。

### D6：迁移与依赖
新增 Alembic `0006_auth_secret.py`(`down_revision=0005`,`add_column model_version.auth_secret_enc` 可空 / 对称 drop),沿用 0001–0005 先例;`dev.db` 跑 `0006` 加列保数据;测试/CI `create_all` 自带。`cryptography` 进 `pyproject.toml` 运行时依赖。测试用固定 `GRAYMIST_SECRET_KEY`(monkeypatch `settings.secret_key`)做加解密 round-trip 与注入断言。

## Risks / Trade-offs

- [主密钥丢失 → 已存密文不可解] → 文档化:key 可经轮换入口重填;主密钥务必持久保管。属运维约束,非代码缺陷。
- [明文 key 在请求体/内存中短暂存在] → 仅写入路径短暂持有;`VersionOut` 不回显;推理日志只摘要 chat 输入、不含版本创建载荷;确保 `api_key` 不进任何 `log`/`_summary`。
- [放宽了「禁收明文」安全条款] → 明文仅作写入输入、加密 at rest、永不回显;引导密钥仍仅 1 个环境变量。多人/生产可后续上 KMS/独立凭证实体。
- [`upstream_mock=false` 全局] → 沿用 a5:翻 false 后所有 external 端点转真;文档提示。

## Migration Plan

- `0006` 加 `auth_secret_enc`(可空),`dev.db` `alembic upgrade head` 或等价 ALTER;旧 external 版本 `auth_secret_enc=NULL`、`has_api_key=false`、行为不变(仍走 `auth_ref`)。
- 回滚:drop 列 + 删 `crypto.py`/`credential` 路由 + 还原 `_auth_headers` 到 a6 形态;已存密文随列删除。

## Open Questions

- 解密失败(主密钥被换/损坏)当前取「`_resolve_key` return None 跳过注入 + warning,不回退 auth_ref」,让上游 401 暴露问题;是否进一步升级为显式 412/500「凭证不可解,请重填」留待真上游联调期定。
- 独立 Credential 实体 + 跨版本/跨端点复用、主密钥轮换重加密 → 后续 change。
