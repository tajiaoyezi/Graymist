import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { VersionActions } from "./VersionActions";

// 6.3：状态流转按钮只给合法的下一个状态；点击触发流转。
describe("VersionActions", () => {
  it("draft 只渲染「→ validating」按钮，点击触发 onTransition('validating')", async () => {
    const onTransition = vi.fn();
    render(<VersionActions status="draft" onTransition={onTransition} />);
    const btn = screen.getByTestId("transition-validating");
    await userEvent.click(btn);
    expect(onTransition).toHaveBeenCalledWith("validating");
    expect(screen.queryByTestId("transition-ready")).toBeNull();
  });

  it("archived 为终态，不渲染任何流转按钮", () => {
    render(<VersionActions status="archived" onTransition={vi.fn()} />);
    expect(screen.queryByRole("button")).toBeNull();
  });
});
