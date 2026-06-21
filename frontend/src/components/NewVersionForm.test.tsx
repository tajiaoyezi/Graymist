import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import "../i18n";
import { NewVersionForm } from "./NewVersionForm";

describe("NewVersionForm", () => {
  it("资源需求用数字字段填写,提交组装成 resource_req 对象", async () => {
    const onSubmit = vi.fn();
    render(<NewVersionForm onSubmit={onSubmit} />);
    await userEvent.type(screen.getByTestId("nv-version"), "v1");

    const cpu = screen.getByTestId("nv-cpu");
    await userEvent.clear(cpu);
    await userEvent.type(cpu, "2");
    const gpu = screen.getByTestId("nv-gpu-vram");
    await userEvent.clear(gpu);
    await userEvent.type(gpu, "2048");
    // memory 保持默认 1024

    await userEvent.click(screen.getByTestId("nv-submit"));
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit.mock.calls[0][0]).toMatchObject({
      version: "v1",
      resource_req: { cpu: 2, memory: 1024, gpu_vram: 2048 },
    });
  });

  it("不再有原始 JSON 文本框(nv-resource-req 已移除)", () => {
    render(<NewVersionForm onSubmit={vi.fn()} />);
    expect(screen.queryByTestId("nv-resource-req")).toBeNull();
  });

  it("文件路径占位示例随推理框架变化(扩展名对应)", async () => {
    render(<NewVersionForm onSubmit={vi.fn()} />);
    const fp = screen.getByTestId("nv-file-path");
    expect(fp).toHaveAttribute("placeholder", "/data/model.onnx"); // 默认 ONNX
    await userEvent.selectOptions(screen.getByTestId("nv-framework"), "TensorRT");
    expect(fp).toHaveAttribute("placeholder", "/data/model.engine");
    await userEvent.selectOptions(screen.getByTestId("nv-framework"), "PyTorch");
    expect(fp).toHaveAttribute("placeholder", "/data/model.pt");
  });

  it("默认 mock 来源:提交带 source=mock 与 file_path/framework", async () => {
    const onSubmit = vi.fn();
    render(<NewVersionForm onSubmit={onSubmit} />);
    await userEvent.type(screen.getByTestId("nv-version"), "v1");
    await userEvent.type(screen.getByTestId("nv-file-path"), "/m/v1.onnx");
    await userEvent.click(screen.getByTestId("nv-submit"));
    expect(onSubmit.mock.calls[0][0]).toMatchObject({
      version: "v1",
      source: "mock",
      file_path: "/m/v1.onnx",
      framework: "ONNX",
    });
  });

  it("切换 external-api:隐藏 file_path/framework、显示上游字段,提交带来源", async () => {
    const onSubmit = vi.fn();
    render(<NewVersionForm onSubmit={onSubmit} />);
    await userEvent.type(screen.getByTestId("nv-version"), "v1");
    await userEvent.click(screen.getByTestId("nv-source-external-api"));
    expect(screen.queryByTestId("nv-file-path")).toBeNull(); // mock 字段隐藏
    expect(screen.queryByTestId("nv-framework")).toBeNull();
    await userEvent.type(screen.getByTestId("nv-base-url"), "http://up/v1");
    await userEvent.type(screen.getByTestId("nv-upstream-model"), "gpt-4o-mini");
    await userEvent.click(screen.getByTestId("nv-submit"));
    expect(onSubmit.mock.calls[0][0]).toMatchObject({
      version: "v1",
      source: "external-api",
      base_url: "http://up/v1",
      upstream_model: "gpt-4o-mini",
      protocol: "openai",
    });
  });

  it("external-api 选 anthropic 协议:提交载荷 protocol=anthropic", async () => {
    const onSubmit = vi.fn();
    render(<NewVersionForm onSubmit={onSubmit} />);
    await userEvent.type(screen.getByTestId("nv-version"), "v1");
    await userEvent.click(screen.getByTestId("nv-source-external-api"));
    await userEvent.type(screen.getByTestId("nv-base-url"), "http://up/v1");
    await userEvent.type(
      screen.getByTestId("nv-upstream-model"),
      "claude-3-5-sonnet",
    );
    await userEvent.selectOptions(screen.getByTestId("nv-protocol"), "anthropic");
    await userEvent.click(screen.getByTestId("nv-submit"));
    expect(onSubmit.mock.calls[0][0]).toMatchObject({
      version: "v1",
      source: "external-api",
      protocol: "anthropic",
    });
  });

  it("external-api 填 API Key:提交载荷含 api_key(password 输入)", async () => {
    const onSubmit = vi.fn();
    render(<NewVersionForm onSubmit={onSubmit} />);
    await userEvent.type(screen.getByTestId("nv-version"), "v1");
    await userEvent.click(screen.getByTestId("nv-source-external-api"));
    await userEvent.type(screen.getByTestId("nv-base-url"), "http://up/v1");
    await userEvent.type(screen.getByTestId("nv-upstream-model"), "gpt-4o-mini");
    await userEvent.type(screen.getByTestId("nv-api-key"), "sk-real-123");
    await userEvent.click(screen.getByTestId("nv-submit"));
    expect(onSubmit.mock.calls[0][0]).toMatchObject({
      source: "external-api",
      api_key: "sk-real-123",
    });
  });

  it("external-api 不填 API Key:提交载荷不含 api_key", async () => {
    const onSubmit = vi.fn();
    render(<NewVersionForm onSubmit={onSubmit} />);
    await userEvent.type(screen.getByTestId("nv-version"), "v1");
    await userEvent.click(screen.getByTestId("nv-source-external-api"));
    await userEvent.type(screen.getByTestId("nv-base-url"), "http://up/v1");
    await userEvent.type(screen.getByTestId("nv-upstream-model"), "gpt-4o-mini");
    await userEvent.click(screen.getByTestId("nv-submit"));
    expect(onSubmit.mock.calls[0][0]).not.toHaveProperty("api_key");
  });
});
