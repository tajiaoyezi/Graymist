import { expect, test } from "@playwright/test";

const API = "http://127.0.0.1:8010";
const VALID_SCHEMA = { type: "object", properties: { text: { type: "string" } } };

// 端到端(原需求 2.2 + 2.6):经 API 预置含 2 个 ready 版本的模型 →
// 管控台创建端点(A/B 80/20)→ creating→running(轮询)→ 停止(二次确认)→ stopped → 重启 → running。
test("端点部署 → A/B → 异步状态流转 全流程", async ({ page, request }) => {
  const stamp = Date.now();
  const modelName = `EP-Model-${stamp}`;
  const epName = `EP-${stamp}`;
  const urlPath = `/ep/${stamp}`;

  // 1) 经 API 预置模型 + 两个 ready 版本
  const model = await (
    await request.post(`${API}/models`, {
      data: {
        name: modelName,
        description: "e2e",
        task_type: "classification",
        input_schema: VALID_SCHEMA,
        output_schema: { type: "object" },
      },
    })
  ).json();

  const versionIds: string[] = [];
  for (const v of ["v1", "v2"]) {
    const ver = await (
      await request.post(`${API}/models/${model.id}/versions`, {
        data: {
          version: v,
          file_path: `/mock/${v}.onnx`,
          framework: "ONNX",
          resource_req: { cpu: 1, memory: 100, gpu: 0 },
          change_note: "init",
        },
      })
    ).json();
    for (const target of ["validating", "ready"]) {
      await request.post(`${API}/versions/${ver.id}/transition`, { data: { target } });
    }
    versionIds.push(ver.id);
  }

  // 2) 管控台 → 打开「创建端点」弹窗(忠实原型:控制台内 Modal)
  await page.goto("/endpoints");
  await page.getByRole("button", { name: "创建端点" }).click();
  await page.getByTestId("ep-name").fill(epName);
  await page.getByTestId("ep-url").fill(urlPath);
  await page.getByTestId("ep-model").selectOption(model.id);

  // 3) 多选两个版本(A/B),配权重 80/20
  await page.getByTestId(`version-${versionIds[0]}`).check();
  await page.getByTestId(`version-${versionIds[1]}`).check();
  await page.getByTestId(`weight-input-${versionIds[0]}`).fill("80");
  await page.getByTestId(`weight-input-${versionIds[1]}`).fill("20");

  // 4) 提交 → 跳转管控台
  await page.getByTestId("submit-endpoint").click();
  await expect(page).toHaveURL(/\/endpoints$/);

  // 5) 端点行:creating → running(后台耗时 0,轮询自动刷新)
  const row = page.getByRole("row").filter({ hasText: epName });
  await expect(row.getByText("运行中")).toBeVisible();

  // 6) 停止(危险操作二次确认)→ 后台转 stopped
  await row.getByRole("button", { name: "停止" }).click();
  await page.getByTestId("confirm-yes").click();
  await expect(row.getByText("已停止")).toBeVisible();

  // 7) 重启(二次确认)→ 经 creating 回 running
  await row.getByRole("button", { name: "重启" }).click();
  await page.getByTestId("confirm-yes").click();
  await expect(row.getByText("运行中")).toBeVisible();
});
