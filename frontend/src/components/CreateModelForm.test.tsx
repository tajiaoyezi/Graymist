import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ApiError } from "../api/client";
import { CreateModelForm } from "./CreateModelForm";

// 6.4：创建模型表单，Schema 编辑器非法时提交被拦截。
// 注：JSON 含 `{`，userEvent.type 会把它当特殊键，故 schema 输入用 fireEvent.change。
describe("CreateModelForm", () => {
  it("非法 Schema → 显示错误且不提交", async () => {
    const onSubmit = vi.fn();
    render(<CreateModelForm onSubmit={onSubmit} />);
    await userEvent.type(screen.getByTestId("input-name"), "m1");
    fireEvent.change(screen.getByTestId("input-schema"), {
      target: { value: "{ not json" },
    });
    await userEvent.click(screen.getByTestId("submit"));
    expect(screen.getByTestId("schema-error")).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("合法 Schema → 调用 onSubmit", async () => {
    const onSubmit = vi.fn();
    render(<CreateModelForm onSubmit={onSubmit} />);
    await userEvent.type(screen.getByTestId("input-name"), "m1");
    fireEvent.change(screen.getByTestId("input-schema"), {
      target: { value: '{"type":"object"}' },
    });
    await userEvent.click(screen.getByTestId("submit"));
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit.mock.calls[0][0]).toMatchObject({
      name: "m1",
      input_schema: { type: "object" },
    });
  });

  it("后端报错（onSubmit reject）→ 表单显示服务端错误（M1）", async () => {
    const onSubmit = vi.fn().mockRejectedValue(new ApiError(422, "名称重复"));
    render(<CreateModelForm onSubmit={onSubmit} />);
    await userEvent.type(screen.getByTestId("input-name"), "m1");
    await userEvent.click(screen.getByTestId("submit"));
    expect(await screen.findByTestId("schema-error")).toHaveTextContent("名称重复");
  });
});
