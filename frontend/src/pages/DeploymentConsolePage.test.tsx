import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

// 保留真实 ApiError,仅覆盖 api(沿用 ModelDetailPage 测试模式)。
vi.mock("../api/client", async (importActual) => {
  const actual = await importActual<typeof import("../api/client")>();
  return { ...actual, api: { listEndpoints: vi.fn() } };
});

import { api } from "../api/client";
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

describe("DeploymentConsolePage", () => {
  it("加载失败 → 显示错误态而非白屏", async () => {
    (api.listEndpoints as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("boom"));
    render(
      <MemoryRouter>
        <DeploymentConsolePage />
      </MemoryRouter>,
    );
    expect(await screen.findByTestId("page-error")).toBeInTheDocument();
  });

  it("轮询 creating→running 自动刷新展示", async () => {
    (api.listEndpoints as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce([ep("creating")])
      .mockResolvedValue([ep("running")]);
    render(
      <MemoryRouter>
        <DeploymentConsolePage />
      </MemoryRouter>,
    );
    expect(await screen.findByTestId("loading-e1")).toBeInTheDocument();
    await waitFor(
      () => expect(screen.getByTestId("status-e1")).toHaveTextContent("运行中"),
      { timeout: 3000 },
    );
  });
});
