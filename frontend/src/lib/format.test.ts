import { describe, expect, it } from "vitest";
import { formatDateTime, formatNumber } from "./format";

// §8.4：时间 UTC 存储、展示层按 locale 格式化。
describe("formatNumber 按 locale", () => {
  it("en-US 用逗号分组、点作小数点", () => {
    expect(formatNumber(1234.5, "en-US")).toBe("1,234.5");
  });
  it("de-DE 用点分组、逗号作小数点", () => {
    expect(formatNumber(1234.5, "de-DE")).toBe("1.234,5");
  });
});

describe("formatDateTime UTC→locale", () => {
  it("把 UTC ISO 格式化成含年份的本地化字符串", () => {
    expect(formatDateTime("2026-06-19T08:30:00Z", "en-US")).toContain("2026");
  });
});
