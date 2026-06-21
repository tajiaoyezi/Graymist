## Why

a5/a6 把上游凭证设计成「引用」(`auth_ref` = 环境变量名,平台不碰明文),自托管用户要接公网模型时必须去后端配环境变量,无法在平台界面里直接填 key——与「自托管控制台」的使用预期不符。本 change 让用户**在平台 UI 里配置上游 API Key**,平台**加密存储、调用时解密注入**,补上「真实对接公网模型」的最后一段易用性缺口。

## What Changes

- **UI 直填 API Key**:external-api 版本注册表单新增 password 类型「API Key(可选)」输入;`auth_ref`(环境变量引用)保留为兜底/高级用法。
- **加密存储(at rest)**:新增版本列 `auth_secret_enc` 存 **Fernet 密文**;主密钥来自环境变量 `GRAYMIST_SECRET_KEY`(唯一引导密钥)。未配置主密钥而尝试保存 key → 清晰 4xx 拒绝。
- **推理时解密注入**:`external.py` 鉴权解析优先级 = **存储的加密 key(解密)> `auth_ref` 环境变量 > 无**;按协议注入(OpenAI `Authorization: Bearer` / Anthropic `x-api-key`)。
- **永不回显**:响应只暴露 `has_api_key: true/false`,**MUST NOT** 返回明文或密文;UI 仅显示「已配置/未配置」。
- **轮换入口**:新增 `PUT /versions/{id}/credential`(set/rotate/clear key),免去仅为换 key 重建整个版本。
- **放宽规格安全条款**:web-ui「external-api 版本注册」原「MUST NOT 收集明文密钥」改为「**MAY 收集明文 key 作为写入输入,但 MUST NOT 回显、MUST 加密存储**」。
- **新依赖**:`cryptography`(Fernet)进运行时依赖。
- **不涉及**:北向调用方鉴权(v1.1.1)、密钥的独立凭证实体/跨版本复用(后续)、KMS/HSM、密钥轮换审计(v1.3)。

## Capabilities

### New Capabilities
- `southbound-credentials`: 上游 API 凭证的加密存储与调用时解密注入(主密钥引导、优先级、永不回显、轮换、未配置主密钥拒绝)。

### Modified Capabilities
- `web-ui`: external-api 版本注册表单从「仅 `auth_ref` 环境变量引用、禁收明文」放宽为「可填明文 API Key(password 输入,加密存储、不回显),`auth_ref` 保留兜底」。

## Impact

- **后端新增**:`app/common/crypto.py`(Fernet 加解密 + 主密钥校验)、迁移 `0006_auth_secret.py`。
- **后端修改**:`db/tables.py`(`ModelVersionRow.auth_secret_enc` 列 + `has_api_key` 属性)、`config.py`(`secret_key`)、`versions/schemas.py`(`api_key` 写入字段 / `has_api_key` 出参)、`versions/service.py`(创建/轮换时加密)、`versions/router.py`(`PUT /versions/{id}/credential`)、`external.py`(解密优先注入)、`pyproject.toml`(加 `cryptography`)。
- **前端修改**:`components/NewVersionForm.tsx`(API Key 输入)、`types.ts`、`i18n/locales/zh.ts`、版本详情「已配置密钥」标识。
- **数据**:`dev.db` 跑 `0006` ALTER 加列(保数据);测试/CI `create_all` 自带新列;测试设固定 `GRAYMIST_SECRET_KEY`。
- **运维**:接公网时需配 `GRAYMIST_SECRET_KEY`(Fernet key)+ `GRAYMIST_UPSTREAM_MOCK=false`;丢失主密钥 = 已存密文不可解(需重填 key)。
