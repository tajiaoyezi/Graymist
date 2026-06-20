import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import "../i18n";
import { ModelList } from "./ModelList";

type Fixture = {
  id: string;
  name: string;
  task_type: string;
  version_count?: number;
  latest_version_status?: string | null;
};

function mkApi(models: Fixture[]) {
  const full = models.map((m) => ({
    description: "",
    version_count: 0,
    latest_version_status: null,
    ...m,
  }));
  return { listModels: vi.fn().mockResolvedValue(full) };
}

// 6.1：模型列表页 —— 按任务类型筛选 + 按名称搜索。
describe("ModelList", () => {
  it("渲染来自 api 的模型名", async () => {
    const api = mkApi([{ id: "1", name: "alpha", task_type: "classification" }]);
    render(<ModelList api={api as never} />);
    expect(await screen.findByText("alpha")).toBeInTheDocument();
  });

  it("卡片显示版本数与最新版本状态点", async () => {
    const api = mkApi([
      {
        id: "1",
        name: "alpha",
        task_type: "classification",
        version_count: 3,
        latest_version_status: "ready",
      },
    ]);
    render(<ModelList api={api as never} />);
    expect(await screen.findByText("3 个版本")).toBeInTheDocument();
    expect(screen.getByTestId("model-status")).toHaveTextContent("就绪");
  });

  it("搜索框输入 → 以 q 调用 api", async () => {
    const api = mkApi([{ id: "1", name: "alpha", task_type: "classification" }]);
    render(<ModelList api={api as never} />);
    await userEvent.type(screen.getByTestId("search-input"), "al");
    await waitFor(() =>
      expect(api.listModels).toHaveBeenLastCalledWith(
        expect.objectContaining({ q: "al" }),
      ),
    );
  });

  it("选择任务类型 → 以 task_type 调用 api", async () => {
    const api = mkApi([{ id: "1", name: "alpha", task_type: "embedding" }]);
    render(<ModelList api={api as never} />);
    await userEvent.selectOptions(screen.getByTestId("filter-task-type"), "embedding");
    await waitFor(() =>
      expect(api.listModels).toHaveBeenLastCalledWith(
        expect.objectContaining({ task_type: "embedding" }),
      ),
    );
  });
});
