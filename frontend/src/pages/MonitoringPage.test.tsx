import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import "../i18n";
import { MonitoringPage } from "./MonitoringPage";

describe("MonitoringPage 静态骨架", () => {
  it("渲染五项指标卡(含当前并发数)与各图表,且不发网络请求", () => {
    const fetchSpy = vi.fn();
    globalThis.fetch = fetchSpy as never;

    render(<MonitoringPage />);

    // §2.4 五项指标:重点确认「当前并发数」在场
    expect(screen.getByText("当前并发数")).toBeInTheDocument();
    expect(screen.getByText("平均延迟")).toBeInTheDocument();
    expect(screen.getByText("P99 延迟")).toBeInTheDocument();
    // 图表区块
    expect(screen.getByText("延迟分布")).toBeInTheDocument();
    expect(screen.getByText("A/B 版本对比")).toBeInTheDocument();
    expect(screen.getByText("资源总览")).toBeInTheDocument();
    // 控件
    expect(screen.getByText("自动刷新")).toBeInTheDocument();

    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
