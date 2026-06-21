import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import "../i18n";

const mockNavigate = vi.fn();
vi.mock("react-router-dom", async (importActual) => {
  const actual = await importActual<typeof import("react-router-dom")>();
  return { ...actual, useNavigate: () => mockNavigate };
});

vi.mock("../api/client", async (importActual) => {
  const actual = await importActual<typeof import("../api/client")>();
  return {
    ...actual,
    api: {
      getVersion: vi.fn(),
      getModel: vi.fn(),
      setMetrics: vi.fn(),
      transitionVersion: vi.fn(),
      listEndpoints: vi.fn(),
      deleteVersion: vi.fn(),
    },
  };
});

import { ApiError, api } from "../api/client";
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
const boundEndpoint = {
  id: "ep1",
  name: "rec-api",
  url_path: "/ep/rec",
  status: "running",
  replicas: 1,
  resource_quota: { cpu: 1, memory: 100, gpu: 0 },
  timeout_ms: 30000,
  max_concurrency: 4,
  bindings: [{ model_version_id: "v1", weight: 100 }],
  created_at: "2026-01-01T00:00:00Z",
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
  vi.mocked(api.listEndpoints).mockResolvedValue([] as never);
  vi.mocked(api.deleteVersion).mockResolvedValue(undefined as never);
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

describe("VersionDetailPage 返回上一级", () => {
  it("提供返回所属模型的链接", async () => {
    renderPage();
    const back = await screen.findByTestId("back-to-model");
    expect(back).toHaveAttribute("href", "/models/m1");
    expect(back).toHaveTextContent("alpha");
  });
});

describe("VersionDetailPage 删除版本", () => {
  it("未绑定 → 删除可用 → 二次确认 → deleteVersion 成功后返回模型详情", async () => {
    renderPage();
    const del = await screen.findByTestId("delete-version");
    expect(del).not.toBeDisabled();
    await userEvent.click(del);
    await userEvent.click(screen.getByTestId("confirm-yes"));
    await waitFor(() => expect(api.deleteVersion).toHaveBeenCalledWith("v1"));
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith("/models/m1"));
  });

  it("被端点绑定 → 删除按钮禁用", async () => {
    vi.mocked(api.listEndpoints).mockResolvedValue([boundEndpoint] as never);
    renderPage();
    await waitFor(() => expect(screen.getByTestId("delete-version")).toBeDisabled());
  });

  it("删除 409 → 页内提示、不跳转", async () => {
    vi.mocked(api.deleteVersion).mockRejectedValue(
      new ApiError(409, "版本被端点「rec-api」绑定，无法删除"),
    );
    renderPage();
    await userEvent.click(await screen.findByTestId("delete-version"));
    await userEvent.click(screen.getByTestId("confirm-yes"));
    expect(await screen.findByTestId("action-error")).toHaveTextContent("无法删除");
    expect(mockNavigate).not.toHaveBeenCalled();
  });
});
