import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

function readyV(id: string, version: string) {
  return {
    id,
    model_id: "m1",
    version,
    file_path: "",
    framework: "ONNX",
    resource_req: {},
    change_note: "",
    status: "ready",
    metrics: null,
    created_at: "",
    deployable: true,
  };
}

const endpoint = {
  id: "e1",
  name: "EP1",
  url_path: "/ep1",
  status: "running",
  replicas: 1,
  resource_quota: { cpu: 1, memory: 100, gpu: 0 },
  timeout_ms: 30000,
  max_concurrency: 4,
  bindings: [{ model_version_id: "v1", weight: 100 }],
  created_at: "",
};

vi.mock("../api/client", async (importActual) => {
  const actual = await importActual<typeof import("../api/client")>();
  return {
    ...actual,
    api: {
      listModels: vi.fn().mockResolvedValue([{ id: "m1", name: "M1" }]),
      listVersions: vi.fn().mockResolvedValue([readyV("v1", "V1"), readyV("v2", "V2")]),
      getVersion: vi.fn().mockResolvedValue({ id: "v1", model_id: "m1" }),
      getQuota: vi.fn().mockResolvedValue({
        total: { cpu: 10, memory: 1000, gpu: 4 },
        used: { cpu: 1, memory: 100, gpu: 0 },
        remaining: { cpu: 9, memory: 900, gpu: 4 },
      }),
      updateEndpoint: vi.fn().mockResolvedValue({ id: "e1" }),
      createEndpoint: vi.fn().mockResolvedValue({ id: "e1" }),
    },
  };
});

import { api } from "../api/client";
import { EndpointForm } from "./EndpointForm";

// mock 调用计数按用例隔离(clearAllMocks 保留 mockResolvedValue 实现)。
beforeEach(() => {
  vi.clearAllMocks();
});

describe("EndpointForm 编辑模式", () => {
  it("预填配置、name/url 只读,提交走 updateEndpoint(仅可改字段)", async () => {
    render(<EndpointForm endpoint={endpoint as never} onSuccess={() => {}} />);

    const nameInput = (await screen.findByTestId("ep-name")) as HTMLInputElement;
    const urlInput = screen.getByTestId("ep-url") as HTMLInputElement;
    expect(nameInput.value).toBe("EP1");
    expect(urlInput.value).toBe("/ep1");
    expect(nameInput.readOnly).toBe(true); // 后端不可改 → 只读
    expect(urlInput.readOnly).toBe(true);

    // 绑定从 endpoint 预填(v1=100%),待 model→versions 解析后权重编辑器出现
    await waitFor(() => expect(screen.getByTestId("weight-input-v1")).toBeInTheDocument());

    fireEvent.click(screen.getByTestId("submit-endpoint"));
    // 运行中端点 → 先二次确认,确认前不提交
    expect(await screen.findByTestId("confirm-dialog")).toBeInTheDocument();
    expect(api.updateEndpoint).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId("confirm-yes"));
    await waitFor(() =>
      expect(api.updateEndpoint).toHaveBeenCalledWith(
        "e1",
        expect.objectContaining({
          replicas: 1,
          timeout_ms: 30000,
          max_concurrency: 4,
          resource_quota: { cpu: 1, memory: 100, gpu: 0 },
          bindings: [{ model_version_id: "v1", weight: 100 }],
        }),
      ),
    );
    expect(api.createEndpoint).not.toHaveBeenCalled(); // 编辑不应走创建
  });
});

describe("EndpointForm 编辑在线端点警告", () => {
  it("编辑运行中端点 → 显示线上影响警告", async () => {
    render(<EndpointForm endpoint={endpoint as never} onSuccess={() => {}} />);
    expect(await screen.findByTestId("edit-running-warn")).toBeInTheDocument();
  });

  it("编辑已停止端点 → 不显示警告(不在线,无线上影响)", async () => {
    render(
      <EndpointForm
        endpoint={{ ...endpoint, status: "stopped" } as never}
        onSuccess={() => {}}
      />,
    );
    expect(await screen.findByTestId("ep-model")).toBeInTheDocument();
    expect(screen.queryByTestId("edit-running-warn")).toBeNull();
  });

  it("新建端点 → 不显示警告", async () => {
    render(<EndpointForm onSuccess={() => {}} />);
    expect(await screen.findByTestId("ep-model")).toBeInTheDocument();
    expect(screen.queryByTestId("edit-running-warn")).toBeNull();
  });

  it("运行中端点保存 → 弹二次确认,取消则不提交", async () => {
    render(<EndpointForm endpoint={endpoint as never} onSuccess={() => {}} />);
    await waitFor(() =>
      expect(screen.getByTestId("weight-input-v1")).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByTestId("submit-endpoint"));
    fireEvent.click(await screen.findByTestId("confirm-no"));
    expect(api.updateEndpoint).not.toHaveBeenCalled();
    expect(screen.queryByTestId("confirm-dialog")).toBeNull();
  });

  it("已停止端点保存 → 直接提交,无需二次确认", async () => {
    render(
      <EndpointForm
        endpoint={{ ...endpoint, status: "stopped" } as never}
        onSuccess={() => {}}
      />,
    );
    await waitFor(() =>
      expect(screen.getByTestId("weight-input-v1")).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByTestId("submit-endpoint"));
    await waitFor(() => expect(api.updateEndpoint).toHaveBeenCalled());
    expect(screen.queryByTestId("confirm-dialog")).toBeNull();
  });
});
