import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import "../i18n";
import { ModelList } from "./ModelList";

// 卡片现为 <Link>,需 Router 上下文。
function renderList(api: unknown) {
  return render(
    <MemoryRouter>
      <ModelList api={api as never} />
    </MemoryRouter>,
  );
}

type Fixture = {
  id: string;
  name: string;
  task_type: string;
  custom_task_type?: string | null;
  version_count?: number;
  latest_version_status?: string | null;
};

function mkApi(models: Fixture[]) {
  const full = models.map((m) => ({
    description: "",
    custom_task_type: null,
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
    renderList(api);
    expect(await screen.findByText("alpha")).toBeInTheDocument();
  });

  it("custom 模型卡片显示自定义类型名而非「自定义」", async () => {
    const api = mkApi([
      { id: "1", name: "alpha", task_type: "custom", custom_task_type: "目标检测" },
    ]);
    renderList(api);
    // 卡片任务类型徽章显示自定义名(而非固定的「自定义」标签)
    expect(await screen.findByTestId("model-item")).toHaveTextContent("目标检测");
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
    renderList(api);
    expect(await screen.findByText("3 个版本")).toBeInTheDocument();
    expect(screen.getByTestId("model-status")).toHaveTextContent("就绪");
  });

  it("搜索框输入 → 以 q 调用 api", async () => {
    const api = mkApi([{ id: "1", name: "alpha", task_type: "classification" }]);
    renderList(api);
    await userEvent.type(screen.getByTestId("search-input"), "al");
    await waitFor(() =>
      expect(api.listModels).toHaveBeenLastCalledWith(
        expect.objectContaining({ q: "al" }),
      ),
    );
  });

  it("选择任务类型 → 以 task_type 调用 api", async () => {
    const api = mkApi([{ id: "1", name: "alpha", task_type: "embedding" }]);
    renderList(api);
    await userEvent.selectOptions(screen.getByTestId("filter-task-type"), "embedding");
    await waitFor(() =>
      expect(api.listModels).toHaveBeenLastCalledWith(
        expect.objectContaining({ task_type: "embedding" }),
      ),
    );
  });

  it("响应非数组(如异构后端 {items:[]})→ 不崩溃,兜底空列表", async () => {
    const api = { listModels: vi.fn().mockResolvedValue({ items: [] }) };
    renderList(api);
    // 过滤器仍渲染(未崩溃),且无模型卡片
    expect(await screen.findByTestId("search-input")).toBeInTheDocument();
    expect(screen.queryByTestId("model-item")).toBeNull();
  });

  it("加载失败 → 显示错误态而非空白", async () => {
    const api = { listModels: vi.fn().mockRejectedValue(new Error("boom")) };
    renderList(api);
    expect(await screen.findByTestId("list-error")).toBeInTheDocument();
  });

  it("卡片为链接(可键盘聚焦/复制/新开),href 指向详情", async () => {
    const api = mkApi([{ id: "42", name: "alpha", task_type: "classification" }]);
    renderList(api);
    const card = await screen.findByTestId("model-item");
    expect(card.tagName).toBe("A");
    expect(card).toHaveAttribute("href", "/models/42");
  });

  it("按版本状态筛选(客户端)", async () => {
    const api = mkApi([
      { id: "1", name: "ready-model", task_type: "classification", latest_version_status: "ready" },
      { id: "2", name: "draft-model", task_type: "classification", latest_version_status: "draft" },
    ]);
    renderList(api);
    await screen.findByText("ready-model");
    await userEvent.selectOptions(screen.getByTestId("filter-status"), "ready");
    expect(screen.getByText("ready-model")).toBeInTheDocument();
    expect(screen.queryByText("draft-model")).toBeNull();
  });

  it("按名称排序", async () => {
    const api = mkApi([
      { id: "1", name: "banana", task_type: "classification" },
      { id: "2", name: "apple", task_type: "classification" },
    ]);
    renderList(api);
    await screen.findByText("apple");
    await userEvent.selectOptions(screen.getByTestId("sort-by"), "name");
    const cards = screen.getAllByTestId("model-item");
    expect(cards[0]).toHaveTextContent("apple");
    expect(cards[1]).toHaveTextContent("banana");
  });

  it("筛选无结果 → 空态 + 清除筛选恢复", async () => {
    const api = mkApi([
      { id: "1", name: "only-draft", task_type: "classification", latest_version_status: "draft" },
    ]);
    renderList(api);
    await screen.findByText("only-draft");
    await userEvent.selectOptions(screen.getByTestId("filter-status"), "ready");
    expect(await screen.findByTestId("list-empty")).toBeInTheDocument();
    expect(screen.queryByTestId("model-item")).toBeNull();
    await userEvent.click(screen.getByTestId("clear-filters"));
    expect(screen.getByText("only-draft")).toBeInTheDocument();
  });

  it("初次加载显示加载态", () => {
    const api = { listModels: vi.fn().mockReturnValue(new Promise(() => {})) }; // 永不 resolve
    renderList(api);
    expect(screen.getByTestId("list-loading")).toBeInTheDocument();
  });
});
