import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

// 保留真实 ApiError,仅覆盖 api(沿用既有页面测试模式)。
vi.mock("../api/client", async (importActual) => {
  const actual = await importActual<typeof import("../api/client")>();
  return {
    ...actual,
    api: {
      listEndpoints: vi.fn(),
      getVersion: vi.fn(),
      getModel: vi.fn(),
      infer: vi.fn(),
      submitAsyncInference: vi.fn(),
      getInferenceTask: vi.fn(),
    },
  };
});

import "../i18n";
import { api } from "../api/client";
import { PlaygroundPage } from "./PlaygroundPage";

const M = api as unknown as Record<string, ReturnType<typeof vi.fn>>;

const RUNNING_EP = {
  id: "e1",
  name: "ep",
  url_path: "/ep",
  status: "running",
  replicas: 1,
  resource_quota: { cpu: 1, memory: 100, gpu: 0 },
  timeout_ms: 30000,
  max_concurrency: 4,
  bindings: [{ model_version_id: "v1", weight: 100 }],
  created_at: "",
};
const INPUT_SCHEMA = {
  type: "object",
  properties: { text: { type: "string" }, top_k: { type: "integer" } },
  required: ["text"],
};

function setupSchema() {
  M.listEndpoints.mockResolvedValue([RUNNING_EP]);
  M.getVersion.mockResolvedValue({ id: "v1", model_id: "m1" });
  M.getModel.mockResolvedValue({ id: "m1", input_schema: INPUT_SCHEMA, output_schema: {} });
}

describe("PlaygroundPage 接通推理 API", () => {
  it("按 input_schema 各字段生成独立控件(非单一 JSON 文本域)", async () => {
    setupSchema();
    render(<PlaygroundPage />);
    const textField = await screen.findByTestId("pg-field-text");
    const topkField = await screen.findByTestId("pg-field-top_k");
    expect(textField).toBeInTheDocument();
    expect(topkField).toBeInTheDocument();
    expect(topkField).toHaveAttribute("type", "number"); // integer → number 控件
    expect(screen.queryByTestId("pg-raw-input")).not.toBeInTheDocument(); // 非单一 JSON 文本域
  });

  it("同步发送展示结果 + 延迟,并计入历史", async () => {
    setupSchema();
    M.infer.mockResolvedValue({ result: { label: "猫" }, version_id: "v1", latency_ms: 42 });
    render(<PlaygroundPage />);
    await userEvent.type(await screen.findByTestId("pg-field-text"), "hello");
    await userEvent.click(screen.getByRole("button", { name: "发送请求" }));
    await waitFor(() => expect(screen.getByTestId("pg-result")).toHaveTextContent("猫"));
    expect(screen.getByText("42 ms")).toBeInTheDocument();
    expect(M.infer).toHaveBeenCalledWith("e1", { text: "hello" });
    expect(screen.getByTestId("pg-history")).toBeInTheDocument();
  });

  it("异步模式提交后轮询至终态再展示结果", async () => {
    setupSchema();
    M.submitAsyncInference.mockResolvedValue({ task_id: "t1", status: "queued" });
    M.getInferenceTask
      .mockResolvedValueOnce({
        id: "t1", endpoint_id: "e1", status: "running", result: null, created_at: "", finished_at: null,
      })
      .mockResolvedValue({
        id: "t1", endpoint_id: "e1", status: "succeeded", result: { label: "狗" }, created_at: "", finished_at: "x",
      });
    render(<PlaygroundPage />);
    await screen.findByTestId("pg-field-text");
    await userEvent.click(screen.getByRole("button", { name: "异步" }));
    await userEvent.type(screen.getByTestId("pg-field-text"), "hi");
    await userEvent.click(screen.getByRole("button", { name: "发送请求" }));
    await waitFor(() => expect(screen.getByTestId("pg-result")).toHaveTextContent("狗"), {
      timeout: 3000,
    });
    expect(M.submitAsyncInference).toHaveBeenCalled();
  });

  it("历史回填:点击历史项把输入填回表单", async () => {
    setupSchema();
    M.infer.mockResolvedValue({ result: { label: "x" }, version_id: "v1", latency_ms: 1 });
    render(<PlaygroundPage />);
    await userEvent.type(await screen.findByTestId("pg-field-text"), "abc");
    await userEvent.click(screen.getByRole("button", { name: "发送请求" }));
    await waitFor(() => expect(screen.getByTestId("pg-hist-0")).toBeInTheDocument());
    await userEvent.clear(screen.getByTestId("pg-field-text"));
    expect(screen.getByTestId("pg-field-text")).toHaveValue("");
    await userEvent.click(screen.getByTestId("pg-hist-0"));
    expect(screen.getByTestId("pg-field-text")).toHaveValue("abc");
  });

  it("不出现超纲控件(协议切换/SSE 流式/成本)", async () => {
    setupSchema();
    render(<PlaygroundPage />);
    await screen.findByTestId("pg-field-text");
    expect(screen.queryByText(/流式|SSE|成本|协议/)).not.toBeInTheDocument();
  });
});
