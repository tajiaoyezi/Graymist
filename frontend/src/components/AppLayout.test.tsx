import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";

import "../i18n";
import { ThemeProvider } from "../theme/ThemeProvider";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";

function renderAt(path: string) {
  return render(
    <ThemeProvider>
      <MemoryRouter initialEntries={[path]}>
        <Sidebar />
        <Topbar />
      </MemoryRouter>
    </ThemeProvider>,
  );
}

describe("应用外壳与导航", () => {
  it("侧栏导航恰好 4 项,且不含「创建模型」与超纲条目", () => {
    renderAt("/models");
    const nav = screen.getByRole("navigation");
    const links = within(nav).getAllByRole("link");
    expect(links).toHaveLength(4);
    expect(within(nav).getByText("模型仓库")).toBeInTheDocument();
    expect(within(nav).getByText("部署管控台")).toBeInTheDocument();
    expect(within(nav).getByText("推理 Playground")).toBeInTheDocument();
    expect(within(nav).getByText("监控仪表盘")).toBeInTheDocument();
    expect(within(nav).queryByText("创建模型")).toBeNull();
    for (const oob of ["网关", "成本", "告警", "审计", "团队", "设置"]) {
      expect(within(nav).queryByText(new RegExp(oob))).toBeNull();
    }
  });

  it("当前页高亮 + 顶栏标题", () => {
    renderAt("/endpoints");
    const active = screen.getByRole("link", { current: "page" });
    expect(active).toHaveTextContent("部署管控台");
    expect(screen.getByRole("banner")).toHaveTextContent("部署管控台");
  });

  it("范围守卫:外壳不含超纲功能件(角色/通知/里程碑/EN)", () => {
    renderAt("/models");
    for (const oob of ["角色", "通知", "里程碑", "EN", "English"]) {
      expect(screen.queryByText(new RegExp(oob))).toBeNull();
    }
  });
});
