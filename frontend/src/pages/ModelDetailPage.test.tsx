import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

// 模拟 api：getModel 失败，验证页面进入错误态而非永久白屏（M1）。
// 用 importActual 保留真实 ApiError，只覆盖 api，避免 `instanceof ApiError` 失效。
vi.mock("../api/client", async (importActual) => {
  const actual = await importActual<typeof import("../api/client")>();
  return {
    ...actual,
    api: {
      getModel: vi.fn().mockRejectedValue(new Error("boom")),
      listVersions: vi.fn().mockResolvedValue([]),
      compareVersions: vi.fn().mockResolvedValue([]),
      createVersion: vi.fn(),
    },
  };
});

import { ModelDetailPage } from "./ModelDetailPage";

describe("ModelDetailPage 错误处理", () => {
  it("加载失败 → 显示错误态而非白屏", async () => {
    render(
      <MemoryRouter initialEntries={["/models/m1"]}>
        <Routes>
          <Route path="/models/:modelId" element={<ModelDetailPage />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(await screen.findByTestId("page-error")).toBeInTheDocument();
  });
});
