## Why

a5 点亮了 v1.1「南向接入 + 真实数据流」的大半:external-api 来源(1.1-a)、canonical 内核(1.1-c)、真实数据流(1.1-d),以及南向双协议(1.1-b)的 **OpenAI 一半**。技术方案 §11 里 v1.1 唯一未交付的就是 **1.1-b 的 Anthropic 一半**——平台还不能调用 Claude 系上游。a5 已按 N+M(非 N×M)把所有缝预留到位(`protocol` 列、canonical 顶层 `system` 提升、`get_adapter` 派发、`SouthboundAdapter` 协议、transport 打桩缝),本 change 是把这一半补齐的**纯 add-on**,补完即 v1.1 收口、方可进 v1.1.1(对外服务层/鉴权)。

## What Changes

- **新增 Anthropic 南向适配器** `adapters/anthropic.py`:canonical → Anthropic `/messages` wire(顶层 `system` 字段、`max_tokens` **必填**、messages),响应 `content:[{type:"text",text}]` + `stop_reason`、usage `input_tokens`/`output_tokens` 归一回 canonical。
- **放开协议派发**:`get_adapter("anthropic")` 返回新适配器(原仅 `openai`,非 openai 抛错);`versions/schemas.py` 解除 `protocol != "openai"` 拦截,改为接受 `{openai, anthropic}`。
- **打桩上游支持 Anthropic wire**:`http_client._default_mock_handler` 按请求**路径**派发(`/messages` → Anthropic 形状假响应;`/chat/completions` → 现有 OpenAI 形状),确定性回声 + 固定 usage,CI 离线不变。
- **鉴权头按协议**:`_auth_headers` 由适配器提供注入方式——OpenAI=`Authorization: Bearer`,Anthropic=`x-api-key`(+ 适配器在 `build_request` 内置 `anthropic-version` 常量头);mock 上游下仍不解析真密钥。
- **前端协议选择器**:`NewVersionForm.tsx` 的 protocol 由只读 `openai` 改为 `{openai, anthropic}` 下拉,提交载荷透传所选 protocol;新增对应 i18n 文案。
- **北向不变(明确止步)**:北向仍仅 OpenAI 入口(`/v1/chat/completions`);**OpenAI-in → canonical → Anthropic-out** 的跨协议链路经现有北向路由自动成立(N+M 验证),Anthropic **北向入口**(`/v1/messages`)属 v1.1.1,本 change 不做。

## Capabilities

### New Capabilities
<!-- 无新增 capability;均为既有 spec 的扩展 -->

### Modified Capabilities
- `inference-api`: 南向适配器家族从「仅 OpenAI」扩展到「OpenAI + Anthropic」;`protocol` 取值放开为 `{openai, anthropic}`;鉴权头按协议派发;打桩上游按路径提供 Anthropic wire;**北向暴露形态不变**(仍仅 OpenAI 入口)。
- `web-ui`: external-api 版本注册的 protocol 字段从只读 `openai` 改为 `{openai, anthropic}` 可选。

## Impact

- **后端新增**:`app/inference/adapters/anthropic.py`。
- **后端修改**:`adapters/__init__.py`(`get_adapter` 派发 + Protocol 增鉴权注入)、`adapters/openai.py`(实现新增的鉴权注入方法,保持行为不变)、`http_client.py`(mock 按路径派发)、`external.py`(`_auth_headers` 改为问适配器)、`versions/schemas.py`(解除 openai-only 拦截)。
- **前端修改**:`components/NewVersionForm.tsx`、`i18n/locales/zh.ts`。
- **测试**:新增 Anthropic 适配器单测、Anthropic external 集成(含 OpenAI-in→Anthropic-out 跨协议)、前端 protocol 选择器;a5/a3 全量回归不变。
- **不涉及**:数据库 schema(`protocol` 列 a5 已加,无迁移)、北向路由、鉴权层、成本计量、SSE。
- **依赖**:无新增运行时依赖(httpx 已在 a5 落地)。
