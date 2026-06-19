import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ModelList } from "./ModelList";

function mkApi(models: { id: string; name: string; task_type: string }[]) {
  return { listModels: vi.fn().mockResolvedValue(models) };
}

// 6.1：模型列表页 —— 按任务类型筛选 + 按名称搜索。
describe("ModelList", () => {
  it("渲染来自 api 的模型名", async () => {
    const api = mkApi([{ id: "1", name: "alpha", task_type: "classification" }]);
    render(<ModelList api={api as never} />);
    expect(await screen.findByText("alpha")).toBeInTheDocument();
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
