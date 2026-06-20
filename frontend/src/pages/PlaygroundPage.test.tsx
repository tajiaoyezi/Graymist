import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import "../i18n";
import { PlaygroundPage } from "./PlaygroundPage";

describe("PlaygroundPage 静态骨架", () => {
  it("渲染请求/响应/历史三区,且不发任何网络请求", async () => {
    const fetchSpy = vi.fn();
    globalThis.fetch = fetchSpy as never;

    render(<PlaygroundPage />);

    // 请求面板:同步/异步 + 发送
    expect(screen.getByRole("button", { name: "同步" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "异步" })).toBeInTheDocument();
    const send = screen.getByRole("button", { name: "发送请求" });
    expect(send).toBeInTheDocument();
    // 响应空态 + 会话历史
    expect(screen.getByText("发送请求以查看返回结果与延迟")).toBeInTheDocument();
    expect(screen.getByText("会话历史")).toBeInTheDocument();

    await userEvent.click(send);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
