import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import "../i18n";
import { EditModelForm } from "./EditModelForm";
import type { Model } from "../types";

const model: Model = {
  id: "m1",
  name: "alpha",
  description: "desc",
  task_type: "classification",
  custom_task_type: null,
  input_schema: {},
  output_schema: {},
  version_count: 0,
  latest_version_status: null,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

describe("EditModelForm", () => {
  it("预填 name/description,改名后保存回传编辑值", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<EditModelForm model={model} onSubmit={onSubmit} onCancel={() => {}} />);

    const name = screen.getByTestId("edit-name") as HTMLInputElement;
    expect(name.value).toBe("alpha");
    expect((screen.getByTestId("edit-description") as HTMLInputElement).value).toBe("desc");

    await userEvent.clear(name);
    await userEvent.type(name, "beta");
    await userEvent.click(screen.getByTestId("edit-save"));

    expect(onSubmit).toHaveBeenCalledWith({ name: "beta", description: "desc" });
  });

  it("名称为空 → 拦截,不提交", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<EditModelForm model={model} onSubmit={onSubmit} onCancel={() => {}} />);

    await userEvent.clear(screen.getByTestId("edit-name"));
    await userEvent.click(screen.getByTestId("edit-save"));

    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByTestId("edit-error")).toBeInTheDocument();
  });

  it("展示编辑锁定说明(为何 task_type/Schema 不可改)", () => {
    render(<EditModelForm model={model} onSubmit={vi.fn()} onCancel={() => {}} />);
    expect(screen.getByTestId("edit-lock-hint")).toBeInTheDocument();
  });

  it("点取消 → 回调 onCancel", async () => {
    const onCancel = vi.fn();
    render(<EditModelForm model={model} onSubmit={vi.fn()} onCancel={onCancel} />);
    await userEvent.click(screen.getByTestId("edit-cancel"));
    expect(onCancel).toHaveBeenCalled();
  });

  it("仅暴露 name/description,不渲染 task_type / Schema 字段(锁决策1)", () => {
    render(<EditModelForm model={model} onSubmit={vi.fn()} onCancel={() => {}} />);
    // 恰好两个文本输入(name + description),无结构身份字段
    expect(screen.getAllByRole("textbox")).toHaveLength(2);
    expect(screen.queryByRole("combobox")).toBeNull(); // 无 task_type 下拉
    expect(screen.queryByTestId("input-task-type")).toBeNull();
    expect(screen.queryByTestId("input-schema")).toBeNull();
    expect(screen.queryByTestId("output-schema")).toBeNull();
  });
});
