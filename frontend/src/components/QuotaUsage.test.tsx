import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { QuotaUsage } from "./QuotaUsage";

const quota = {
  total: { cpu: 10, memory: 1000, gpu: 4 },
  used: { cpu: 2, memory: 200, gpu: 1 },
  remaining: { cpu: 8, memory: 800, gpu: 3 },
};

describe("QuotaUsage", () => {
  it("待占用在剩余之内 → 不显示超额", () => {
    render(<QuotaUsage quota={quota} pending={{ cpu: 4, memory: 400, gpu: 2 }} />);
    expect(screen.queryByTestId("quota-over")).toBeNull();
  });

  it("待占用超出某维剩余 → 高亮超额", () => {
    render(<QuotaUsage quota={quota} pending={{ cpu: 4, memory: 400, gpu: 5 }} />);
    expect(screen.getByTestId("quota-over")).toBeInTheDocument();
  });
});
