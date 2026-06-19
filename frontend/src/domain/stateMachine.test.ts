import { describe, expect, it } from "vitest";
import { isDeployable, nextStatuses } from "./stateMachine";

// 6.3：版本详情的状态流转按钮只渲染合法的下一个状态（镜像后端状态机）。
describe("nextStatuses", () => {
  it("draft → [validating]", () => {
    expect(nextStatuses("draft")).toEqual(["validating"]);
  });
  it("validating → [ready]", () => {
    expect(nextStatuses("validating")).toEqual(["ready"]);
  });
  it("ready → [archived]", () => {
    expect(nextStatuses("ready")).toEqual(["archived"]);
  });
  it("archived → [] （终态）", () => {
    expect(nextStatuses("archived")).toEqual([]);
  });
});

describe("isDeployable", () => {
  it("仅 ready 可部署", () => {
    expect(isDeployable("ready")).toBe(true);
    expect(isDeployable("draft")).toBe(false);
    expect(isDeployable("validating")).toBe(false);
    expect(isDeployable("archived")).toBe(false);
  });
});
