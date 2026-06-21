import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

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
      listInferenceLogs: vi.fn(),
    },
  };
});

import "../i18n";
import { ApiError, api } from "../api/client";
import { PlaygroundPage } from "./PlaygroundPage";

const M = api as unknown as Record<string, ReturnType<typeof vi.fn>>;

// mock 调用计数按用例隔离(clearAllMocks 保留各 it 内 setupSchema 设的实现)。
beforeEach(() => {
  vi.clearAllMocks();
});

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
  M.listInferenceLogs.mockResolvedValue([]);
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

  it("异步生命周期显式呈现:任务 ID + queued→running→succeeded 时间线 + 入历史", async () => {
    setupSchema();
    M.submitAsyncInference.mockResolvedValue({ task_id: "task-xyz-123", status: "queued" });
    M.getInferenceTask
      .mockResolvedValueOnce({
        id: "task-xyz-123", endpoint_id: "e1", status: "running", result: null, created_at: "", finished_at: null,
      })
      .mockResolvedValue({
        id: "task-xyz-123", endpoint_id: "e1", status: "succeeded", result: { label: "狗" }, created_at: "", finished_at: "x",
      });
    render(<PlaygroundPage />);
    await screen.findByTestId("pg-field-text");
    await userEvent.click(screen.getByRole("button", { name: "异步" }));
    await userEvent.type(screen.getByTestId("pg-field-text"), "hi");
    await userEvent.click(screen.getByRole("button", { name: "发送请求" }));
    // 返回的任务 ID 显式展示(不再隐藏)
    await waitFor(() => expect(screen.getByTestId("pg-async-taskid")).toHaveTextContent("task-xyz-123"));
    // 状态时间线走过 queued → running → succeeded
    await waitFor(
      () => {
        const tl = screen.getByTestId("pg-async-timeline");
        expect(tl).toHaveTextContent("queued");
        expect(tl).toHaveTextContent("running");
        expect(tl).toHaveTextContent("succeeded");
      },
      { timeout: 3000 },
    );
    expect(screen.getByTestId("pg-result")).toHaveTextContent("狗");
    // 历史项带任务 ID 与终态
    expect(screen.getByTestId("pg-hist-0")).toHaveTextContent("task-xyz");
    expect(screen.getByTestId("pg-hist-0")).toHaveTextContent("succeeded");
  });

  it("客户端凭任务 ID 查询结果:手动输入 ID → 调 getInferenceTask 并展示状态/结果", async () => {
    setupSchema();
    M.getInferenceTask.mockResolvedValue({
      id: "manual-task-9", endpoint_id: "e1", status: "succeeded", result: { label: "猫" }, created_at: "", finished_at: "x",
    });
    render(<PlaygroundPage />);
    await screen.findByTestId("pg-field-text");
    await userEvent.click(screen.getByRole("button", { name: "异步" }));
    // 手动查询工具在异步模式下出现(不依赖先提交)
    await userEvent.type(screen.getByTestId("pg-task-query-id"), "manual-task-9");
    await userEvent.click(screen.getByTestId("pg-task-query-btn"));
    // 显式「凭 ID 查询」:确实按该 ID 调用了查询接口,并回显状态+结果
    await waitFor(() => expect(screen.getByTestId("pg-task-query-result")).toHaveTextContent("猫"));
    expect(screen.getByTestId("pg-task-query-result")).toHaveTextContent("succeeded");
    expect(M.getInferenceTask).toHaveBeenCalledWith("manual-task-9");
  });

  it("推理日志表:逐条展示命中版本/输入输出/延迟/状态,可按状态筛选", async () => {
    setupSchema();
    M.listInferenceLogs.mockResolvedValue([
      {
        id: "lg1", endpoint_id: "e1", version_id: "v1abc", version: "v1.0.0", mode: "sync",
        input_summary: '{"text":"hi"}', output_summary: '{"label":"猫"}', latency_ms: 42,
        status: "success", created_at: "2026-06-20T10:00:00+00:00",
      },
      {
        id: "lg2", endpoint_id: "e1", version_id: null, version: null, mode: "sync",
        input_summary: '{"text":"x"}', output_summary: "null", latency_ms: 0,
        status: "rate_limited", created_at: "2026-06-20T10:01:00+00:00",
      },
    ]);
    render(<PlaygroundPage />);
    // 选中端点后自动拉取逐条日志
    await waitFor(() => expect(screen.getByTestId("pg-log-lg1")).toBeInTheDocument());
    const row1 = screen.getByTestId("pg-log-lg1");
    expect(row1).toHaveTextContent("v1.0.0"); // A/B 实际命中版本(可读)
    expect(row1).toHaveTextContent('{"text":"hi"}');
    expect(row1).toHaveTextContent("42 ms");
    expect(row1).toHaveTextContent("成功");
    const row2 = screen.getByTestId("pg-log-lg2");
    expect(row2).toHaveTextContent("未命中"); // 429 未命中版本
    expect(row2).toHaveTextContent("限流");
    expect(M.listInferenceLogs).toHaveBeenCalledWith("e1", { status: undefined, limit: 50 });
    // 状态筛选 → 按状态重取
    await userEvent.selectOptions(screen.getByTestId("pg-log-status"), "success");
    await waitFor(() =>
      expect(M.listInferenceLogs).toHaveBeenCalledWith("e1", { status: "success", limit: 50 }),
    );
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

  it("必填项未填 → 中文提示且不发请求(不甩后端英文 schema 错误)", async () => {
    setupSchema(); // required: ["text"]
    render(<PlaygroundPage />);
    await screen.findByTestId("pg-field-text"); // 不填 text
    await userEvent.click(screen.getByRole("button", { name: "发送请求" }));
    expect(screen.getByTestId("pg-error")).toHaveTextContent("请填写必填项:text");
    expect(M.infer).not.toHaveBeenCalled();
  });

  it("同步+并发:打出 N 个同步请求,汇总命中与限流(429)", async () => {
    setupSchema();
    // 端点 max_concurrency=4;前 4 个命中,其余返回 429(模拟限流)。
    let call = 0;
    M.infer.mockImplementation(async () => {
      call += 1;
      if (call <= 4) return { result: { ok: true }, version_id: "v1", latency_ms: 50 };
      throw new ApiError(429, "端点并发已满");
    });
    render(<PlaygroundPage />);
    await userEvent.type(await screen.findByTestId("pg-field-text"), "hi");
    // 并发是同步之上的开关:默认同步 + 开「并发压测」(不再是独立的「并发」模式)
    await userEvent.click(screen.getByTestId("pg-concurrent-toggle"));
    // 并发数默认 = 端点上限 4 + 2 = 6
    expect(screen.getByTestId("pg-concurrency")).toHaveValue(6);
    await userEvent.click(screen.getByRole("button", { name: "并发发送" }));
    // 6 个结果格出现,汇总成功 4 / 限流 2
    await waitFor(() => expect(screen.getByTestId("pg-conc-5")).toBeInTheDocument());
    expect(M.infer).toHaveBeenCalledTimes(6);
    const summary = screen.getByTestId("pg-conc-summary");
    expect(summary).toHaveTextContent("成功: 4");
    expect(summary).toHaveTextContent("限流 429: 2");
    // 计入会话历史(同步并发汇总),可回填复跑
    const hist = screen.getByTestId("pg-hist-0");
    expect(hist).toHaveTextContent("并发压测");
    expect(hist).toHaveTextContent("6 并发 · 4 命中 · 2 限流");
  });

  it("异步+并发:N 个异步提交全部入队(无 429),展示任务 ID 与入队汇总", async () => {
    setupSchema();
    let n = 0;
    M.submitAsyncInference.mockImplementation(async () => {
      n += 1;
      return { task_id: `task-${n}`, status: "queued" };
    });
    render(<PlaygroundPage />);
    await userEvent.type(await screen.findByTestId("pg-field-text"), "hi");
    await userEvent.click(screen.getByRole("button", { name: "异步" }));
    await userEvent.click(screen.getByTestId("pg-concurrent-toggle"));
    expect(screen.getByTestId("pg-concurrency")).toHaveValue(6);
    await userEvent.click(screen.getByRole("button", { name: "并发发送" }));
    await waitFor(() => expect(screen.getByTestId("pg-conc-5")).toBeInTheDocument());
    // 异步并发:全部走 submit,各自入队、无 429
    expect(M.submitAsyncInference).toHaveBeenCalledTimes(6);
    expect(M.infer).not.toHaveBeenCalled();
    const summary = screen.getByTestId("pg-conc-summary");
    expect(summary).toHaveTextContent("入队: 6");
    expect(summary).not.toHaveTextContent("限流"); // 异步排队而非拒绝
    // 首个任务 ID 自动填入「凭任务 ID 查询」框
    expect(screen.getByTestId("pg-task-query-id")).toHaveValue("task-1");
    // 历史:异步并发汇总
    expect(screen.getByTestId("pg-hist-0")).toHaveTextContent("6 并发(异步)· 6 入队 · 0 拒绝");
  });
});

describe("PlaygroundPage external-api(a5)", () => {
  const EXT_EP = { ...RUNNING_EP, bindings: [{ model_version_id: "ve", weight: 100 }] };
  function setupExternal() {
    M.listEndpoints.mockResolvedValue([EXT_EP]);
    M.getVersion.mockResolvedValue({ id: "ve", model_id: "me", source: "external-api" });
    // input_schema 形如 object(有 properties)——验证 external 仍不生成动态表单(DOM-3)。
    M.getModel.mockResolvedValue({
      id: "me",
      input_schema: { type: "object", properties: { messages: { type: "array" } } },
      output_schema: {},
    });
    M.listInferenceLogs.mockResolvedValue([]);
  }

  it("external-api 端点渲染 chat 编排器,不据 input_schema 生成动态表单", async () => {
    setupExternal();
    render(<PlaygroundPage />);
    expect(await screen.findByTestId("pg-chat-composer")).toBeInTheDocument();
    expect(screen.queryByTestId("pg-field-messages")).toBeNull(); // 即便 schema 形如 object
    expect(screen.queryByTestId("pg-raw-input")).toBeNull();
  });

  it("external-api 同步发送 chat 输入 + 展示真实结果与 usage", async () => {
    setupExternal();
    M.infer.mockResolvedValue({
      result: "echo: hi",
      version_id: "ve",
      latency_ms: 12,
      usage: { prompt_tokens: 1, completion_tokens: 2, total_tokens: 3 },
    });
    render(<PlaygroundPage />);
    await screen.findByTestId("pg-chat-composer");
    await userEvent.type(screen.getByTestId("pg-chat-content-0"), "hi");
    await userEvent.click(screen.getByRole("button", { name: "发送请求" }));
    expect(await screen.findByTestId("pg-usage")).toHaveTextContent("1/2/3"); // prompt/completion/total 数值+顺序
    expect(M.infer).toHaveBeenCalledWith("e1", { messages: [{ role: "user", content: "hi" }] });
  });
});
