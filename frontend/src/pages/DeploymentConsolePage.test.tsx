import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

// 保留真实 ApiError,仅覆盖 api(沿用 ModelDetailPage 测试模式)。
vi.mock("../api/client", async (importActual) => {
  const actual = await importActual<typeof import("../api/client")>();
  return {
    ...actual,
    api: {
      listEndpoints: vi.fn(),
      startEndpoint: vi.fn().mockResolvedValue({}),
      stopEndpoint: vi.fn().mockResolvedValue({}),
      restartEndpoint: vi.fn().mockResolvedValue({}),
    },
  };
});

import { ApiError, api } from "../api/client";
import { DeploymentConsolePage } from "./DeploymentConsolePage";

function ep(status: string) {
  return {
    id: "e1",
    name: "ep",
    url_path: "/ep",
    status,
    replicas: 1,
    resource_quota: { cpu: 1, memory: 100, gpu: 0 },
    timeout_ms: 1,
    max_concurrency: 1,
    bindings: [{ model_version_id: "v1", weight: 100 }],
    created_at: "",
  };
}

function renderPage() {
  return render(
    <MemoryRouter>
      <DeploymentConsolePage />
    </MemoryRouter>,
  );
}

describe("DeploymentConsolePage", () => {
  it("加载失败 → 显示错误态而非白屏", async () => {
    (api.listEndpoints as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("boom"));
    renderPage();
    expect(await screen.findByTestId("page-error")).toBeInTheDocument();
  });

  it("轮询 creating→running 自动刷新展示", async () => {
    (api.listEndpoints as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce([ep("creating")])
      .mockResolvedValue([ep("running")]);
    renderPage();
    expect(await screen.findByTestId("loading-e1")).toBeInTheDocument();
    await waitFor(
      () => expect(screen.getByTestId("status-e1")).toHaveTextContent("运行中"),
      { timeout: 3000 },
    );
  });
});

describe("DeploymentConsolePage 行操作(启停合一 + ⋮ 菜单)", () => {
  it("运行中:主按钮=停止,⋮ 菜单含重启与编辑", async () => {
    vi.mocked(api.listEndpoints).mockResolvedValue([ep("running")] as never);
    renderPage();
    expect(await screen.findByTestId("stop-e1")).toBeInTheDocument();
    // 未展开时菜单项不在 DOM(收纳成功)
    expect(screen.queryByTestId("restart-e1")).toBeNull();
    expect(screen.queryByTestId("edit-e1")).toBeNull();
    fireEvent.click(screen.getByTestId("more-e1"));
    expect(screen.getByTestId("menu-e1")).toBeInTheDocument();
    expect(screen.getByTestId("restart-e1")).toBeInTheDocument();
    expect(screen.getByTestId("edit-e1")).toBeInTheDocument();
  });

  it("模型·版本列:展示模型名 + 可读版本号(非 UUID)", async () => {
    const enriched = {
      ...ep("running"),
      model_name: "文本分类器",
      bindings: [
        { model_version_id: "ver-uuid-aaaa", weight: 60, version: "v1.0.0" },
        { model_version_id: "ver-uuid-bbbb", weight: 40, version: "v1.1.0" },
      ],
    };
    vi.mocked(api.listEndpoints).mockResolvedValue([enriched] as never);
    renderPage();
    const row = await screen.findByTestId("status-e1");
    const cell = row.closest("tr")!;
    expect(cell).toHaveTextContent("文本分类器");
    // 版本号与权重分列展示(各占一行,不再 v:weight 黏在一起)
    expect(cell).toHaveTextContent("v1.0.0");
    expect(cell).toHaveTextContent("v1.1.0");
    expect(cell).toHaveTextContent("60%");
    expect(cell).toHaveTextContent("40%");
    expect(cell).toHaveTextContent("A"); // A/B 灰度槽位标签
    expect(cell).toHaveTextContent("B");
    expect(cell).not.toHaveTextContent("ver-uuid-aaaa"); // 不再甩 UUID
  });

  it("已停止:主按钮=启动", async () => {
    vi.mocked(api.listEndpoints).mockResolvedValue([ep("stopped")] as never);
    renderPage();
    expect(await screen.findByTestId("start-e1")).toBeInTheDocument();
  });

  it("失败:主按钮=重启,菜单仅编辑(重启不重复出现)", async () => {
    vi.mocked(api.listEndpoints).mockResolvedValue([ep("failed")] as never);
    renderPage();
    expect(await screen.findByTestId("restart-e1")).toBeInTheDocument(); // 主按钮
    fireEvent.click(screen.getByTestId("more-e1"));
    expect(screen.getByTestId("edit-e1")).toBeInTheDocument();
    expect(screen.getAllByTestId("restart-e1")).toHaveLength(1); // 仅主按钮,菜单不重复
  });

  it("部署中:主按钮=「部署中…」禁用,无 ⋮(进行中不可操作)", async () => {
    vi.mocked(api.listEndpoints).mockResolvedValue([ep("creating")] as never);
    renderPage();
    const btn = await screen.findByTestId("deploying-e1");
    expect(btn).toBeDisabled();
    expect(btn).toHaveTextContent("部署中");
    expect(screen.queryByTestId("more-e1")).toBeNull();
  });

  it("点主按钮「停止」→ 二次确认,确认后才调 stopEndpoint", async () => {
    vi.mocked(api.listEndpoints).mockResolvedValue([ep("running")] as never);
    vi.mocked(api.stopEndpoint).mockClear();
    renderPage();
    fireEvent.click(await screen.findByTestId("stop-e1"));
    expect(screen.getByTestId("confirm-dialog")).toBeInTheDocument();
    expect(api.stopEndpoint).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId("confirm-yes"));
    await waitFor(() => expect(api.stopEndpoint).toHaveBeenCalledWith("e1"));
  });

  it("停止确认后 → 主按钮变「停止中…」且禁用,停止完成后恢复", async () => {
    // 停止异步:后端暂仍 running,后台才转 stopped(用 phase 模拟)。
    let phase = "running";
    vi.mocked(api.listEndpoints).mockImplementation(
      async () => [ep(phase)] as never,
    );
    renderPage();
    fireEvent.click(await screen.findByTestId("stop-e1"));
    fireEvent.click(screen.getByTestId("confirm-yes"));
    // 停止中:主按钮禁用 + 文案变化,防重复点击
    await waitFor(() => {
      const btn = screen.getByTestId("stop-e1");
      expect(btn).toBeDisabled();
      expect(btn).toHaveTextContent("停止中");
    });
    expect(screen.getByTestId("stopping-e1")).toBeInTheDocument();
    // 后台停止完成 → 轮询见 stopped → 标记清除、恢复为「启动」主按钮
    phase = "stopped";
    await waitFor(() => expect(screen.getByTestId("start-e1")).toBeInTheDocument(), {
      timeout: 3000,
    });
  });

  it("停止中:▾ 触发器也禁用,点击无法展开菜单", async () => {
    let phase = "running";
    vi.mocked(api.listEndpoints).mockImplementation(
      async () => [ep(phase)] as never,
    );
    renderPage();
    fireEvent.click(await screen.findByTestId("stop-e1"));
    fireEvent.click(screen.getByTestId("confirm-yes"));
    await waitFor(() => expect(screen.getByTestId("stop-e1")).toBeDisabled());
    // ▾ 同步禁用,点击不展开菜单(整组锁住)
    expect(screen.getByTestId("more-e1")).toBeDisabled();
    fireEvent.click(screen.getByTestId("more-e1"));
    expect(screen.queryByTestId("menu-e1")).toBeNull();
    phase = "stopped"; // 收尾:停止完成,避免遗留进行中态
    await waitFor(() => expect(screen.getByTestId("start-e1")).toBeInTheDocument(), {
      timeout: 3000,
    });
  });

  it("启动资源超额 → 错误横幅持久(不被轮询清空),可手动关闭", async () => {
    vi.mocked(api.listEndpoints).mockResolvedValue([ep("stopped")] as never);
    vi.mocked(api.startEndpoint).mockRejectedValue(
      new ApiError(409, "资源预算超额(cpu: 需 4.0 > 剩余 0.0)"),
    );
    renderPage();
    fireEvent.click(await screen.findByTestId("start-e1"));
    expect(await screen.findByTestId("action-error")).toHaveTextContent("资源预算超额");
    // 等至少一轮后台轮询(listEndpoints 再被调)后,横幅仍在 → 未被 load 清空
    const calls = vi.mocked(api.listEndpoints).mock.calls.length;
    await waitFor(
      () => expect(vi.mocked(api.listEndpoints).mock.calls.length).toBeGreaterThan(calls),
      { timeout: 2000 },
    );
    expect(screen.getByTestId("action-error")).toHaveTextContent("资源预算超额");
    // 手动关闭
    fireEvent.click(screen.getByTestId("action-error-dismiss"));
    expect(screen.queryByTestId("action-error")).toBeNull();
  });
});
