import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";

import { ThemeControl } from "../components/ThemeControl";
import "../i18n";
import { ThemeProvider } from "./ThemeProvider";

function setup() {
  return render(
    <ThemeProvider>
      <ThemeControl />
    </ThemeProvider>,
  );
}

describe("ThemeProvider + ThemeControl", () => {
  beforeEach(() => {
    localStorage.clear();
    const r = document.documentElement;
    r.removeAttribute("data-theme");
    r.style.removeProperty("--accent");
  });

  it("默认浅色,并写入 data-theme", () => {
    setup();
    expect(document.documentElement.dataset.theme).toBe("light");
  });

  it("切换深色:data-theme=dark 且持久化", async () => {
    const user = userEvent.setup();
    setup();
    await user.click(screen.getByRole("button", { name: /深色/ }));
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(localStorage.getItem("graymist-theme")).toBe("dark");
  });

  it("切换主题色:--accent 变更且持久化", async () => {
    const user = userEvent.setup();
    setup();
    await user.click(screen.getByRole("button", { name: "#0d9488" }));
    expect(
      document.documentElement.style.getPropertyValue("--accent").trim(),
    ).toBe("#0d9488");
    expect(localStorage.getItem("graymist-accent")).toBe("#0d9488");
  });
});
