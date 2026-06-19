import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

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

vi.mock("../api/client", async (importActual) => {
  const actual = await importActual<typeof import("../api/client")>();
  return {
    ...actual,
    api: {
      listModels: vi.fn().mockResolvedValue([{ id: "m1", name: "M1" }]),
      listVersions: vi.fn().mockResolvedValue([readyV("v1", "V1"), readyV("v2", "V2")]),
      getQuota: vi.fn().mockResolvedValue({
        total: { cpu: 10, memory: 1000, gpu: 4 },
        used: { cpu: 0, memory: 0, gpu: 0 },
        remaining: { cpu: 10, memory: 1000, gpu: 4 },
      }),
      createEndpoint: vi.fn().mockResolvedValue({ id: "e1" }),
    },
  };
});

import { EndpointFormPage } from "./EndpointFormPage";

function renderPage() {
  return render(
    <MemoryRouter>
      <EndpointFormPage />
    </MemoryRouter>,
  );
}

describe("EndpointFormPage", () => {
  it("权重和≠100 阻止提交;修正为 100 后可提交", async () => {
    renderPage();
    fireEvent.change(await screen.findByTestId("ep-model"), { target: { value: "m1" } });
    fireEvent.click(await screen.findByTestId("version-v1"));
    fireEvent.click(screen.getByTestId("version-v2"));
    fireEvent.change(await screen.findByTestId("weight-input-v1"), { target: { value: "80" } });
    fireEvent.change(screen.getByTestId("weight-input-v2"), { target: { value: "10" } });
    fireEvent.change(screen.getByTestId("ep-name"), { target: { value: "ep" } });
    fireEvent.change(screen.getByTestId("ep-url"), { target: { value: "/ep" } });

    expect(screen.getByTestId("weight-error")).toBeInTheDocument();
    expect(screen.getByTestId("submit-endpoint")).toBeDisabled();

    fireEvent.change(screen.getByTestId("weight-input-v2"), { target: { value: "20" } });
    expect(screen.queryByTestId("weight-error")).toBeNull();
    expect(screen.getByTestId("submit-endpoint")).toBeEnabled();
  });

  it("超额时高亮并阻止提交", async () => {
    renderPage();
    fireEvent.change(await screen.findByTestId("ep-model"), { target: { value: "m1" } });
    fireEvent.click(await screen.findByTestId("version-v1"));
    fireEvent.change(await screen.findByTestId("weight-input-v1"), { target: { value: "100" } });
    fireEvent.change(screen.getByTestId("ep-name"), { target: { value: "ep" } });
    fireEvent.change(screen.getByTestId("ep-url"), { target: { value: "/ep" } });
    // 副本数放大到 100 → 待占用 cpu 100 > 剩余 10
    fireEvent.change(screen.getByTestId("ep-replicas"), { target: { value: "100" } });

    expect(screen.getByTestId("quota-over")).toBeInTheDocument();
    expect(screen.getByTestId("submit-endpoint")).toBeDisabled();
  });

  it("replicas=0 时阻止提交(与后端 ge=1 对齐)", async () => {
    renderPage();
    fireEvent.change(await screen.findByTestId("ep-model"), { target: { value: "m1" } });
    fireEvent.click(await screen.findByTestId("version-v1"));
    fireEvent.change(await screen.findByTestId("weight-input-v1"), { target: { value: "100" } });
    fireEvent.change(screen.getByTestId("ep-name"), { target: { value: "ep" } });
    fireEvent.change(screen.getByTestId("ep-url"), { target: { value: "/ep" } });
    // 清空副本数 → 0
    fireEvent.change(screen.getByTestId("ep-replicas"), { target: { value: "" } });
    expect(screen.getByTestId("submit-endpoint")).toBeDisabled();
  });
});
