## 1. 依赖、配置、加密工具(test-first)

- [x] 1.1 先写 `tests/unit/test_crypto.py`:`encrypt_secret`/`decrypt_secret` round-trip(固定 Fernet `GRAYMIST_SECRET_KEY`,monkeypatch `settings.secret_key`);密文 ≠ 明文且不可读;未配主密钥时 `encrypt_secret` 抛 `SecretKeyNotConfiguredError`;密文被篡改 → 解密抛错
- [x] 1.2 实现 `app/common/crypto.py`(`Fernet` 加解密 + `SecretKeyNotConfiguredError`);`config.py` 增 `secret_key: str = ""`(`GRAYMIST_SECRET_KEY`);`pyproject.toml` 加 `cryptography` 运行时依赖并装进 Python314

## 2. 数据表 + 迁移

- [x] 2.1 `db/tables.py`:`ModelVersionRow` 增可空 `auth_secret_enc: Mapped[str | None]`(`Text`)+ `has_api_key` 属性(`auth_secret_enc is not None`);新增迁移 `migrations/versions/0006_auth_secret.py`(`down_revision="0005_external_api_source"`,`add_column`/对称 `drop_column`);`dev.db` 跑 `0006`(或等价幂等 ALTER)加列保数据

## 3. 版本写入:加密存储 + has_api_key 出参(test-first)

- [x] 3.1 先写 `tests/integration/test_credential_store.py`:配主密钥下带 `api_key` 创建 external 版本 → 201、`has_api_key=true`、响应体**不含** `api_key`/`auth_secret_enc`(明文或密文);未配主密钥带 `api_key` → 4xx 且不落明文;不带 `api_key`(走 `auth_ref`)与 mock 版本创建回归不变
- [x] 3.2 `versions/schemas.py`:`VersionCreate` 增**只写** `api_key: str | None`;`VersionOut` 增 `has_api_key: bool`(经 ORM 属性派生),确认 OUT **不含** `api_key`/`auth_secret_enc`;`versions/service.py` 在 `source=external-api` 且带 `api_key` 时 `encrypt_secret` 存 `auth_secret_enc`,未配主密钥 → 400(不落明文)

## 4. 凭证轮换端点(test-first)

- [x] 4.1 先写测试:`PUT /versions/{id}/credential` 设/换 key → `has_api_key=true`、响应不回显明文;传空/null → 清除、`has_api_key=false`;对非 external-api 版本 → 拒绝;未配主密钥设 key → 4xx
- [x] 4.2 `versions/router.py` 增 `PUT /versions/{id}/credential`(body `{api_key: str | null}`)+ `versions/service.py` 对应方法(加密/清除,只回 `has_api_key`)

## 5. external 解密注入与优先级(test-first)

- [x] 5.1 先写测试(capturing `MockTransport` + `upstream_mock=False` + 配主密钥):存储 key 优先 → 注入解密后的 key;无存储 key 但有 `auth_ref` 环境变量 → 回退注入;`upstream_mock=True` → 不解密、不注入仍成功;`auth_secret_enc` 存在但解密失败(换主密钥)→ 不注入 + 不崩(请求照发)
- [x] 5.2 `external.py` `_auth_headers`:优先 `decrypt_secret(version_row.auth_secret_enc)`,否则 `os.environ.get(auth_ref)`,皆无则不注入;解密失败记 warning 并跳过(不崩 500);协议派发注入不变

## 6. 前端(test-first)

- [x] 6.1 先更新 `NewVersionForm.test.tsx`:external-api 填 API Key → 提交载荷含 `api_key`(password 输入);不填则不带 `api_key`(回归)
- [x] 6.2 `components/NewVersionForm.tsx` 加 password「API Key(可选)」输入(`nv-api-key`)+ 提交透传;`types.ts` 增只写 `api_key?` 入参与 `has_api_key?` 出参
- [x] 6.3 模型详情版本列表行显示「已配置密钥」徽标(`has_api_key=true` 时;未配置不标,**不显示**任何明文);`i18n/locales/zh.ts` 补 `field.apiKey`/`field.apiKeyHint`(含 mock 提示)/「已配置」文案,无硬编码、取语义令牌

## 7. 校验与收尾

- [x] 7.1 后端 `pytest`(从 `backend/` 跑)全绿:含 crypto/版本加密/轮换/注入优先级/解密失败兜底 + a5/a6/a3 整套回归不变
- [x] 7.2 前端 `tsc --noEmit` 无错、`vitest` 全绿
- [x] 7.3 `openspec validate a7-southbound-credential-store --strict` 通过;确认未超纲(无北向鉴权/独立凭证实体/KMS/审计)
- [x] 7.4 E2E 冒烟(配 `GRAYMIST_SECRET_KEY`,`upstream_mock=true`):UI 填 key 建 external 版本 → `has_api_key=true` 且响应无明文/密文;轮换/清除生效;mock 路径端到端成功(无真 key 不打公网)
- [x] 7.5 sync/archive 时把 `southbound-credentials`(新 capability,ADDED)、`web-ui`「external-api 版本注册」MODIFIED、`inference-api`(external-api 来源真实推理 / canonical 内核与南向协议适配器 —— 改密钥来源优先级)MODIFIED 并入主规格(**依赖 a6:应在 a6 sync/archive 之后**,避免覆盖 a6 的 protocol/Anthropic 改动)
