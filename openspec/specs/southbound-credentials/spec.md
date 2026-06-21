# southbound-credentials Specification

## Purpose

平台内对**上游 API 凭证**的安全存储与使用:在平台 UI/接口填入的上游 API Key 经对称加密(Fernet,主密钥取自环境变量 `GRAYMIST_SECRET_KEY`)存于版本记录(`auth_secret_enc` 密文列),推理时按优先级解密注入到南向请求;明文与密文 MUST NOT 经任何 API 响应、日志或界面回显,仅暴露 `has_api_key` 布尔。由 `a7-southbound-credential-store` 引入(v1.1 系列 add-on,补「平台内配置上游密钥、真连公网」的易用性)。不含:独立凭证实体 / 跨版本复用、KMS/HSM、主密钥轮换重加密、凭证操作审计(后续 / v1.3)。

## Requirements

### Requirement: 上游凭证加密存储

平台 SHALL 支持为 `external-api` 版本在平台内存储上游 API Key,且 MUST **加密存储(at rest)**:明文经对称加密(Fernet)后存入版本的 `auth_secret_enc` 列,加密主密钥取自环境变量 `GRAYMIST_SECRET_KEY`。平台 MUST NOT 以明文持久化 key;MUST NOT 在任何 API 响应、日志或界面回显该明文或其密文——版本响应仅暴露 `has_api_key` 布尔。当未配置(或配置非法)`GRAYMIST_SECRET_KEY` 而尝试保存 key 时,平台 MUST 以清晰错误拒绝且不落任何明文。

#### Scenario: 保存 API Key 加密落库
- **WHEN** 创建一个 external-api 版本并带 `api_key`、且已配置 `GRAYMIST_SECRET_KEY`
- **THEN** 平台将其加密后存入 `auth_secret_enc`,响应 `has_api_key=true` 且不含明文或密文

#### Scenario: 未配置主密钥拒绝保存
- **WHEN** 带 `api_key` 创建/更新版本但未配置 `GRAYMIST_SECRET_KEY`
- **THEN** 平台以清晰错误拒绝(4xx),不存储任何明文

#### Scenario: 响应永不回显凭证
- **WHEN** 查询一个已配置 key 的 external-api 版本
- **THEN** 响应含 `has_api_key=true`,且不包含 `api_key`、`auth_secret_enc` 的明文或密文

### Requirement: 上游凭证解密注入与优先级

平台 SHALL 在 external-api **真实**推理(`upstream_mock=false`)时解析上游鉴权,优先级为:**版本存储的加密 key(解密)> `auth_ref` 指向的环境变量 > 无**;二者皆无则不注入鉴权头(请求照发,由上游决定是否 401)。注入方式按协议派发(OpenAI=`Authorization: Bearer`;Anthropic=`x-api-key`)。`upstream_mock=true` 时平台 MUST NOT 解密或注入真密钥。版本存储的加密 key **解密失败**(主密钥丢失/被换)时,平台 MUST 跳过注入(不回退到 `auth_ref`),使上游 401 暴露「凭证不可解」问题,且 MUST NOT 因解密失败崩溃。

#### Scenario: 存储 key 优先于环境变量
- **WHEN** 某版本同时有加密 key 与 `auth_ref`,且为真实推理
- **THEN** 平台用解密后的存储 key 注入鉴权头(不读 `auth_ref`)

#### Scenario: 回退到环境变量
- **WHEN** 某版本无加密 key 但有 `auth_ref` 且该环境变量存在,且为真实推理
- **THEN** 平台用该环境变量值注入鉴权头

#### Scenario: 解密失败不回退、不崩溃
- **WHEN** 某版本存储的加密 key 因主密钥被换/损坏而解密失败(即便同时配了 `auth_ref`)
- **THEN** 平台跳过注入(不回退到 `auth_ref` env)、不崩溃,请求照发由上游 401 暴露问题

#### Scenario: mock 上游不注入真密钥
- **WHEN** `upstream_mock=true`
- **THEN** 平台不解密、不注入真密钥,external-api 推理仍端到端成功

### Requirement: 上游凭证轮换

平台 SHALL 提供更新某 external-api 版本上游 API Key 的入口(`PUT /versions/{id}/credential`),支持设置/轮换/清除(传空或 null 即清除);成功响应仅含 `has_api_key`,MUST NOT 回显明文。对非 external-api 版本调用 MUST 拒绝。

#### Scenario: 轮换 key
- **WHEN** 对一个已有 external-api 版本 `PUT /versions/{id}/credential` 传入新 `api_key`
- **THEN** 平台重新加密存储,`has_api_key=true`,后续真实推理使用新 key

#### Scenario: 清除 key
- **WHEN** `PUT /versions/{id}/credential` 传入空/null `api_key`
- **THEN** 平台清空 `auth_secret_enc`,`has_api_key=false`
