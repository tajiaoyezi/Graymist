import { describe, expect, it } from "vitest";
import { parseSchemaInput } from "./schema";

// 6.4：创建模型表单的 Schema 编辑器，提交前合法性校验。
describe("parseSchemaInput", () => {
  it("合法 JSON 对象 → ok", () => {
    const r = parseSchemaInput('{"type":"object"}');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toEqual({ type: "object" });
  });

  it("非法 JSON → 报错且不通过", () => {
    const r = parseSchemaInput("{ not json");
    expect(r.ok).toBe(false);
  });

  it("JSON 数组（非对象）→ 拒绝", () => {
    const r = parseSchemaInput("[1,2,3]");
    expect(r.ok).toBe(false);
  });
});
