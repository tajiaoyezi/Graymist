import { Outlet } from "react-router-dom";

import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";

// 应用外壳:深色侧栏(248px) + 顶栏(60px) + 主内容区(Outlet)。
export function AppLayout() {
  return (
    <div
      className="text-text"
      style={{ display: "flex", height: "100vh", width: "100%", overflow: "hidden" }}
    >
      <Sidebar />
      <div style={{ flex: 1, display: "flex", flexDirection: "column", height: "100%", minWidth: 0 }}>
        <Topbar />
        <main style={{ flex: 1, overflowY: "auto", padding: "26px 28px 60px" }}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
