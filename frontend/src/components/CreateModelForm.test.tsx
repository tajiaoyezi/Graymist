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

  it("勾选 external-chat → 预填只读 chat schema,取消后恢复可编辑(fe-1)", async () => {
    render(<CreateModelForm onSubmit={vi.fn()} />);
    await userEvent.click(screen.getByTestId("model-external-chat"));
    const inputSchema = screen.getByTestId("input-schema") as HTMLTextAreaElement;
    expect(inputSchema.value).toContain("messages"); // 预填 canonical chat schema
    expect(inputSchema).toHaveAttribute("readonly");
    expect(screen.getByTestId("output-schema")).toHaveAttribute("readonly");
    await userEvent.click(screen.getByTestId("model-external-chat")); // 取消勾选
    expect(screen.getByTestId("input-schema")).not.toHaveAttribute("readonly");
  });

  it("后端报错（onSubmit reject）→ 表单显示服务端错误（M1）", async () => {
    const onSubmit = vi.fn().mockRejectedValue(new ApiError(422, "名称重复"));
    render(<CreateModelForm onSubmit={onSubmit} />);
    await userEvent.type(screen.getByTestId("input-name"), "m1");
    await userEvent.click(screen.getByTestId("submit"));
    expect(await screen.findByTestId("schema-error")).toHaveTextContent("名称重复");
  });

  it("空名称 → 前端拦截,不提交(不撞后端 422)", async () => {
    const onSubmit = vi.fn();
    render(<CreateModelForm onSubmit={onSubmit} />);
    fireEvent.change(screen.getByTestId("input-schema"), {
      target: { value: '{"type":"object"}' },
    });
    await userEvent.click(screen.getByTestId("submit"));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByTestId("schema-error")).toBeInTheDocument();
  });

  it("非自定义 → 不显示自定义类型名输入", () => {
    render(<CreateModelForm onSubmit={vi.fn()} />);
    expect(screen.queryByTestId("input-custom-task-type")).toBeNull();
  });

  it("选自定义 → 显示输入,提交含 custom_task_type", async () => {
    const onSubmit = vi.fn();
    render(<CreateModelForm onSubmit={onSubmit} />);
    await userEvent.type(screen.getByTestId("input-name"), "m1");
    await userEvent.selectOptions(screen.getByTestId("input-task-type"), "custom");
    await userEvent.type(screen.getByTestId("input-custom-task-type"), "目标检测");
    fireEvent.change(screen.getByTestId("input-schema"), {
      target: { value: '{"type":"object"}' },
    });
    await userEvent.click(screen.getByTestId("submit"));
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit.mock.calls[0][0]).toMatchObject({
      task_type: "custom",
      custom_task_type: "目标检测",
    });
  });

  it("选自定义但未填名 → 拦截不提交", async () => {
    const onSubmit = vi.fn();
    render(<CreateModelForm onSubmit={onSubmit} />);
    await userEvent.type(screen.getByTestId("input-name"), "m1");
    await userEvent.selectOptions(screen.getByTestId("input-task-type"), "custom");
    fireEvent.change(screen.getByTestId("input-schema"), {
      target: { value: '{"type":"object"}' },
    });
    await userEvent.click(screen.getByTestId("submit"));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByTestId("schema-error")).toBeInTheDocument();
  });

  it("一键格式化:合法 JSON → 美化为 2 空格缩进", () => {
    render(<CreateModelForm onSubmit={vi.fn()} />);
    const ta = screen.getByTestId("input-schema") as HTMLTextAreaElement;
    const raw = '{"type":"object","properties":{"x":{"type":"string"}}}';
    fireEvent.change(ta, { target: { value: raw } });
    fireEvent.click(screen.getByTestId("format-input-schema"));
    expect(ta.value).toBe(JSON.stringify(JSON.parse(raw), null, 2));
    expect(ta.value).toContain("\n  "); // 含缩进
  });

  it("一键格式化:非法 JSON → 显示错误且不改内容", () => {
    render(<CreateModelForm onSubmit={vi.fn()} />);
    const ta = screen.getByTestId("output-schema") as HTMLTextAreaElement;
    fireEvent.change(ta, { target: { value: "{ not json" } });
    fireEvent.click(screen.getByTestId("format-output-schema"));
    expect(screen.getByTestId("schema-error")).toBeInTheDocument();
    expect(ta.value).toBe("{ not json");
  });

  it("空 {} → 缺 properties 警告;插入示例后填入含 properties 的 Schema 且警告消失", async () => {
    render(<CreateModelForm onSubmit={vi.fn()} />);
    // 默认 "{}" 缺 properties → 非阻断警告
    expect(screen.getByTestId("schema-noprops-warn")).toBeInTheDocument();
    await userEvent.click(screen.getByTestId("example-input-schema"));
    const ta = screen.getByTestId("input-schema") as HTMLTextAreaElement;
    expect(ta.value).toContain('"properties"');
    expect(screen.queryByTestId("schema-noprops-warn")).toBeNull();
  });
});
