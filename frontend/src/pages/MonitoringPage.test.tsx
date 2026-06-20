import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../api/client", async (importActual) => {
  const actual = await importActual<typeof import("../api/client")>();
  return {
    ...actual,
    api: { listEndpoints: vi.fn(), getMetrics: vi.fn(), getQuota: vi.fn() },
  };
});

import "../i18n";
import { api } from "../api/client";
import { MonitoringPage } from "./MonitoringPage";

const M = api as unknown as Record<string, ReturnType<typeof vi.fn>>;

const EP = {
  id: "e1", name: "ep", url_path: "/ep", status: "running", replicas: 1,
  resource_quota: { cpu: 1, memory: 100, gpu: 0 }, timeout_ms: 30000, max_concurrency: 4,
  bindings: [{ model_version_id: "v1", weight: 100 }], created_at: "",
};
const BUCKET = { t: "2026-06-20T10:00:00+00:00", qps: 0.5, avg_latency_ms: 46, p99_latency_ms: 232, error_rate: 0.5 };
const METRICS = {
  range: "24h",
  buckets: [BUCKET],
  versions: [{ version_id: "v1abcdef", buckets: [BUCKET] }],
  current_concurrency: 3,
  summary: { qps: 1.2, avg_latency_ms: 46, p99_latency_ms: 232, error_rate: 0.5 },
};
const QUOTA = {
  total: { cpu: 32, memory: 65536, gpu: 8 },
  used: { cpu: 8, memory: 32768, gpu: 6 }, // → 25% / 50% / 75%
  remaining: { cpu: 24, memory: 32768, gpu: 2 },
};

function setup() {
  M.listEndpoints.mockResolvedValue([EP]);
  M.getMetrics.mockResolvedValue(METRICS);
  M.getQuota.mockResolvedValue(QUOTA);
}

afterEach(() => vi.restoreAllMocks());

describe("MonitoringPage 接通监控 API", () => {
  it("由真实数据渲染指标卡与资源总览", async () => {
    setup();
    render(<MonitoringPage />);
    expect(await screen.findByText("232")).toBeInTheDocument(); // P99 卡
    expect(screen.getByText("0.50")).toBeInTheDocument(); // 错误率卡
    expect(screen.getByText("50%")).toBeInTheDocument(); // 内存资源条
    expect(screen.getByText("75%")).toBeInTheDocument(); // GPU 资源条
    expect(M.getMetrics).toHaveBeenCalledWith("e1", "24h");
  });

  it("切换时间范围触发按新分桶重取", async () => {
    setup();
    render(<MonitoringPage />);
    await screen.findByText("232");
    await userEvent.click(screen.getByRole("button", { name: "1 小时" }));
    await waitFor(() => expect(M.getMetrics).toHaveBeenCalledWith("e1", "1h"));
  });

  it("自动刷新按可配置间隔轮询,调整间隔生效", async () => {
    setup();
    const spy = vi.spyOn(window, "setInterval");
    render(<MonitoringPage />);
    await screen.findByText("232");
    expect(spy).toHaveBeenCalledWith(expect.any(Function), 5000); // 默认 5s 轮询
    const sel = screen.getByTestId("mon-interval");
    expect(sel.querySelectorAll("option")).toHaveLength(3); // 5s/10s/30s 可配置
    await userEvent.selectOptions(sel, "10000");
    await waitFor(() => expect(spy).toHaveBeenCalledWith(expect.any(Function), 10000)); // 改间隔生效
  });

  it("不出现超纲控件(成本/token/LLM/告警)", async () => {
    setup();
    render(<MonitoringPage />);
    await screen.findByText("232");
    expect(screen.queryByText(/成本|token|TTFT|TPOT|告警/i)).not.toBeInTheDocument();
  });
});
