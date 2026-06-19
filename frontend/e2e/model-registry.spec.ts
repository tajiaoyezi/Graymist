import { expect, test } from "@playwright/test";

// 端到端：真实 Chromium → Vite(前端) →(/api 代理)→ FastAPI(后端, SQLite)。
// 覆盖原需求 2.5 主链路：创建模型 → 新建版本 → 版本状态流转 → 仅 ready 可部署 → 列表搜索。
test("模型注册 → 版本 → 状态流转 全流程", async ({ page }) => {
  const name = `E2E-${Date.now()}`;

  await page.goto("/");

  // 1) 创建模型（默认 Schema {} 合法）
  await page.getByRole("link", { name: "创建模型" }).click();
  await page.getByTestId("input-name").fill(name);
  await page.getByTestId("submit").click();

  // 2) 跳转到模型详情，标题含模型名
  await expect(page.getByRole("heading", { name })).toBeVisible();

  // 3) 新建版本 v1
  await page.getByRole("button", { name: "新建版本" }).click();
  await page.getByTestId("nv-version").fill("v1");
  await page.getByTestId("nv-file-path").fill("/mock/v1.onnx");
  await page.getByTestId("nv-submit").click();

  // 4) 版本出现在列表，进入版本详情
  await page.getByRole("link", { name: "v1" }).click();

  // 5) draft 不可部署
  await expect(page.getByTestId("deployable")).toHaveText("否");

  // 6) 合法状态流转 draft → validating → ready
  await page.getByTestId("transition-validating").click();
  await page.getByTestId("transition-ready").click();

  // 7) ready 后变为可部署
  await expect(page.getByTestId("deployable")).toHaveText("是");

  // 8) 回列表按名称搜索，能搜到刚建的模型
  await page.getByRole("link", { name: "模型仓库" }).click();
  await page.getByTestId("search-input").fill(name);
  await expect(page.getByTestId("model-item")).toContainText(name);
});
