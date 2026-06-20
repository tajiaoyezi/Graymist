import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import "../i18n";
import { ErrorBoundary } from "./ErrorBoundary";

function Boom(): never {
  throw new Error("kaboom");
}

describe("ErrorBoundary", () => {
  it("子树抛错 → 渲染兜底错误态而非白屏", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {}); // 抑制 React 错误日志噪声
    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    );
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByText("kaboom")).toBeInTheDocument(); // 暴露原始错误信息
    spy.mockRestore();
  });

  it("子树正常 → 透传渲染", () => {
    render(
      <ErrorBoundary>
        <div>ok-content</div>
      </ErrorBoundary>,
    );
    expect(screen.getByText("ok-content")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
