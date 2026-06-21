import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { AbWeightEditor } from "./AbWeightEditor";

describe("AbWeightEditor", () => {
  it("权重和为 100 时显示和、不报错", () => {
    render(
      <AbWeightEditor
        bindings={[
          { model_version_id: "v1", weight: 80, label: "v1" },
          { model_version_id: "v2", weight: 20, label: "v2" },
        ]}
        onChange={vi.fn()}
      />,
    );
    expect(screen.getByTestId("weight-sum")).toHaveTextContent("100");
    expect(screen.queryByTestId("weight-error")).toBeNull();
  });

  it("权重和不为 100 时报错", () => {
    render(
      <AbWeightEditor
        bindings={[
          { model_version_id: "v1", weight: 80, label: "v1" },
          { model_version_id: "v2", weight: 10, label: "v2" },
        ]}
        onChange={vi.fn()}
      />,
    );
    expect(screen.getByTestId("weight-error")).toBeInTheDocument();
  });

  it("单版本只能 100%:修改也被规整为 100", () => {
    const onChange = vi.fn();
    render(
      <AbWeightEditor
        bindings={[{ model_version_id: "v1", weight: 80, label: "v1" }]}
        onChange={onChange}
      />,
    );
    fireEvent.change(screen.getByTestId("weight-input-v1"), { target: { value: "50" } });
    expect(onChange).toHaveBeenCalledWith([
      { model_version_id: "v1", weight: 100, label: "v1" },
    ]);
  });

  it("权重联动:调一个版本,另一个自动补足至和为 100", () => {
    const onChange = vi.fn();
    render(
      <AbWeightEditor
        bindings={[
          { model_version_id: "v1", weight: 50, label: "v1" },
          { model_version_id: "v2", weight: 50, label: "v2" },
        ]}
        onChange={onChange}
      />,
    );
    fireEvent.change(screen.getByTestId("weight-input-v1"), { target: { value: "70" } });
    expect(onChange).toHaveBeenCalledWith([
      { model_version_id: "v1", weight: 70, label: "v1" },
      { model_version_id: "v2", weight: 30, label: "v2" },
    ]);
  });
});
