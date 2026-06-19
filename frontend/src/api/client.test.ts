import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "./client";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("api client", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("listModels 把筛选/搜索拼进 query", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue(jsonResponse([]));
    await api.listModels({ task_type: "embedding", q: "alpha" });
    const url = (fetch as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(url).toContain("/models");
    expect(url).toContain("task_type=embedding");
    expect(url).toContain("q=alpha");
  });

  it("transitionVersion POST 目标状态", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      jsonResponse({ id: "v1", status: "validating" }),
    );
    await api.transitionVersion("v1", "validating");
    const [url, opts] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toContain("/versions/v1/transition");
    expect(opts.method).toBe("POST");
    expect(JSON.parse(opts.body)).toEqual({ target: "validating" });
  });

  it("非 2xx 抛错", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      jsonResponse({ detail: "x" }, 422),
    );
    await expect(api.createModel({} as never)).rejects.toThrow();
  });
});
