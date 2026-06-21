import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import "../i18n";

vi.mock("../api/client", async (importActual) => {
  const actual = await importActual<typeof import("../api/client")>();
  return {
    ...actual,
    api: {
      getVersion: vi.fn(),
      getModel: vi.fn(),
      setMetrics: vi.fn(),
      transitionVersion: vi.fn(),
    },
  };
});

import { api } from "../api/client";
import { VersionDetailPage } from "./VersionDetailPage";

const version = {
  id: "v1",
  model_id: "m1",
  version: "v1",
  file_path: "/x",
  framework: "ONNX",
  resource_req: {},
  change_note: "",
  status: "draft",
  metrics: null,
  created_at: "2026-01-01T00:00:00Z",
  deployable: false,
};
const model = {
  id: "m1",
  name: "alpha",
  description: "",
  task_type: "classification",
  custom_task_type: null,
  input_schema: {},
  output_schema: {},
  version_count: 1,
  latest_version_status: "draft",
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/versions/v1"]}>
      <Routes>
        <Route path="/versions/:versionId" element={<VersionDetailPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.getVersion).mockResolvedValue(version as never);
  vi.mocked(api.getModel).mockResolvedValue(model as never);
  vi.mocked(api.setMetrics).mockImplementation(
    async (_id, m) => ({ ...version, metrics: m }) as never,
  );
});

describe("VersionDetailPage 指标录入", () => {
  it("默认指标为空(—),编辑→填入→保存调 setMetrics 并展示新值", async () => {
    renderPage();
    // 初始无指标:三个 — 占位
    expect((await screen.findAllByText("—")).length).toBe(3);

    await userEvent.click(screen.getByTestId("edit-metrics"));
    await userEvent.type(screen.getByTestId("metric-accuracy"), "0.95");
    await userEvent.click(screen.getByTestId("metrics-save"));

    expect(api.setMetrics).toHaveBeenCalledWith("v1", {
      accuracy: 0.95,
      latency: null,
      throughput: null,
    });
    await waitFor(() => expect(screen.getByText("0.95")).toBeInTheDocument());
  });

  it("取消编辑不调用 setMetrics", async () => {
    renderPage();
    await userEvent.click(await screen.findByTestId("edit-metrics"));
    await userEvent.click(screen.getByTestId("metrics-cancel"));
    expect(api.setMetrics).not.toHaveBeenCalled();
    expect(screen.queryByTestId("metric-accuracy")).toBeNull();
  });
});

describe("VersionDetailPage 状态阶梯", () => {
  it("渲染 4 段状态阶梯,未就绪时显示可部署提示", async () => {
    renderPage(); // fixture: status=draft, deployable=false
    expect(await screen.findByTestId("status-ladder")).toBeInTheDocument();
    expect(screen.getByTestId("ladder-draft")).toBeInTheDocument();
    expect(screen.getByTestId("ladder-ready")).toBeInTheDocument();
    expect(screen.getByText(/需推进到/)).toBeInTheDocument();
  });
});
