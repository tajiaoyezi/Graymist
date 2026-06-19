import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { ConfirmDialog } from "./ConfirmDialog";

describe("ConfirmDialog", () => {
  it("open 时渲染,点击确认触发 onConfirm", async () => {
    const onConfirm = vi.fn();
    render(
      <ConfirmDialog open message="确认停止该端点？" onConfirm={onConfirm} onCancel={vi.fn()} />,
    );
    await userEvent.click(screen.getByTestId("confirm-yes"));
    expect(onConfirm).toHaveBeenCalled();
  });

  it("点击取消触发 onCancel", async () => {
    const onCancel = vi.fn();
    render(<ConfirmDialog open message="x" onConfirm={vi.fn()} onCancel={onCancel} />);
    await userEvent.click(screen.getByTestId("confirm-no"));
    expect(onCancel).toHaveBeenCalled();
  });

  it("未 open 时不渲染", () => {
    render(<ConfirmDialog open={false} message="x" onConfirm={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.queryByTestId("confirm-dialog")).toBeNull();
  });
});
