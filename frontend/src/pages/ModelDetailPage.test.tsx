import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import "../i18n";

// 捕获 useNavigate(删除成功后跳回列表),其余 react-router-dom 保留真实实现。
const mockNavigate = vi.fn();
vi.mock("react-router-dom", async (importActual) => {
  const actual = await importActual<typeof import("react-router-dom")>();
  return { ...actual, useNavigate: () => mockNavigate };
});

// 覆盖 api,保留真实 ApiError(否则 `instanceof ApiError` 失效)。
vi.mock("../api/client", async (importActual) => {
  const actual = await importActual<typeof import("../api/client")>();
  return {
    ...actual,
    api: {
      getModel: vi.fn(),
      listVersions: vi.fn(),
      compareVersions: vi.fn(),
      createVersion: vi.fn(),
      updateModel: vi.fn(),
      deleteModel: vi.fn(),
      listEndpoints: vi.fn(),
    },
  };
});

import { ApiError, api } from "../api/client";
import { ModelDetailPage } from "./ModelDetailPage";

const model = {
  id: "m1",
  name: "alpha",
  description: "desc",
  task_type: "classification",
  custom_task_type: null,
  input_schema: {},
  output_schema: {},
  version_count: 0,
  latest_version_status: null,
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
    <MemoryRouter initialEntries={["/models/m1"]}>
      <Routes>
        <Route path="/models/:modelId" element={<ModelDetailPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.getModel).mockResolvedValue(model as never);
  vi.mocked(api.listVersions).mockResolvedValue([]);
  vi.mocked(api.compareVersions).mockResolvedValue([]);
  vi.mocked(api.updateModel).mockResolvedValue(model as never);
  vi.mocked(api.deleteModel).mockResolvedValue(undefined as never);
  vi.mocked(api.listEndpoints).mockResolvedValue([] as never);
});

describe("ModelDetailPage 错误处理", () => {
  it("加载失败 → 显示错误态而非白屏", async () => {
    vi.mocked(api.getModel).mockRejectedValue(new Error("boom"));
    renderPage();
    expect(await screen.findByTestId("page-error")).toBeInTheDocument();
  });
});

describe("ModelDetailPage external-api 版本(REG-1)", () => {
  it("external 版本(framework=null)显示来源标签,不渲染字面量 framework.null", async () => {
    vi.mocked(api.listVersions).mockResolvedValue([
      {
        id: "v1",
        model_id: "m1",
        version: "v1",
        source: "external-api",
        file_path: null,
        framework: null,
        resource_req: {},
        change_note: "",
        status: "ready",
        metrics: null,
        created_at: "2026-01-01T00:00:00Z",
        deployable: true,
      },
    ] as never);
    renderPage();
    expect(await screen.findByText("外部 API")).toBeInTheDocument(); // version.sourceLabel['external-api']
    expect(screen.queryByText("framework.null")).toBeNull();
  });
});

describe("ModelDetailPage 编辑/删除", () => {
  it("编辑 → 改名保存 → 调 updateModel(仅 name/description)并刷新", async () => {
    renderPage();
    await userEvent.click(await screen.findByTestId("edit-model"));

    const name = screen.getByTestId("edit-name") as HTMLInputElement;
    expect(name.value).toBe("alpha");
    await userEvent.clear(name);
    await userEvent.type(name, "beta");
    await userEvent.click(screen.getByTestId("edit-save"));

    expect(api.updateModel).toHaveBeenCalledWith("m1", {
      name: "beta",
      description: "desc",
    });
    // 保存后 reload(getModel 二次调用)
    await waitFor(() => expect(api.getModel).toHaveBeenCalledTimes(2));
  });

  it("删除 → 二次确认 → deleteModel 成功后跳回 /models", async () => {
    renderPage();
    await userEvent.click(await screen.findByTestId("delete-model"));
    await userEvent.click(screen.getByTestId("confirm-yes"));

    await waitFor(() => expect(api.deleteModel).toHaveBeenCalledWith("m1"));
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith("/models"));
  });

  it("删除被端点绑定(409)→ 页内提示、不跳转", async () => {
    vi.mocked(api.deleteModel).mockRejectedValue(
      new ApiError(409, "模型有端点绑定，无法删除"),
    );
    renderPage();
    await userEvent.click(await screen.findByTestId("delete-model"));
    await userEvent.click(screen.getByTestId("confirm-yes"));

    expect(await screen.findByTestId("action-error")).toHaveTextContent(
      "模型有端点绑定",
    );
    expect(mockNavigate).not.toHaveBeenCalled();
  });
});

describe("ModelDetailPage 新手引导", () => {
  it("无版本 → 显示建版本引导空态", async () => {
    renderPage();
    expect(await screen.findByTestId("versions-empty")).toBeInTheDocument();
  });
});

describe("ModelDetailPage 新建版本(选填指标)", () => {
  it("填了准确率 → createVersion 带上 metrics(空项为 null)", async () => {
    vi.mocked(api.createVersion).mockResolvedValue({} as never);
    renderPage();
    // 打开新建版本弹窗(取页头按钮,空态按钮文案相同)
    await userEvent.click(
      (await screen.findAllByRole("button", { name: /新建版本/ }))[0],
    );
    await userEvent.type(screen.getByTestId("nv-version"), "v1.0.0");
    await userEvent.type(screen.getByTestId("nv-accuracy"), "0.9");
    await userEvent.click(screen.getByTestId("nv-submit"));

    await waitFor(() =>
      expect(api.createVersion).toHaveBeenCalledWith(
        "m1",
        expect.objectContaining({
          version: "v1.0.0",
          metrics: { accuracy: 0.9, latency: null, throughput: null },
        }),
      ),
    );
  });

  it("三项指标全空 → createVersion 不带 metrics", async () => {
    vi.mocked(api.createVersion).mockResolvedValue({} as never);
    renderPage();
    await userEvent.click(
      (await screen.findAllByRole("button", { name: /新建版本/ }))[0],
    );
    await userEvent.type(screen.getByTestId("nv-version"), "v2.0.0");
    await userEvent.click(screen.getByTestId("nv-submit"));

    await waitFor(() => expect(api.createVersion).toHaveBeenCalled());
    expect(vi.mocked(api.createVersion).mock.calls[0][1]).not.toHaveProperty(
      "metrics",
    );
  });
});

describe("ModelDetailPage 端点关系/删除守卫", () => {
  it("未被绑定 → 显示「未部署」,删除按钮可用", async () => {
    renderPage();
    expect(await screen.findByTestId("deployed-none")).toBeInTheDocument();
    expect(screen.getByTestId("delete-model")).not.toBeDisabled();
  });

  it("被端点绑定 → 列出端点且删除按钮禁用(从源头避免确认后 409)", async () => {
    vi.mocked(api.listVersions).mockResolvedValue([
      {
        id: "v1",
        model_id: "m1",
        version: "v1",
        file_path: "/x",
        framework: "ONNX",
        resource_req: {},
        change_note: "",
        status: "ready",
        metrics: null,
        created_at: "2026-01-01T00:00:00Z",
        deployable: true,
      } as never,
    ]);
    vi.mocked(api.listEndpoints).mockResolvedValue([boundEndpoint] as never);
    renderPage();
    // 「部署于」列出该端点
    expect(await screen.findByTestId("deployed-on-ep1")).toHaveTextContent("rec-api");
    // 删除按钮被禁用,确认框不会出现 → 杜绝「确认了却 409」
    expect(screen.getByTestId("delete-model")).toBeDisabled();
  });
});
