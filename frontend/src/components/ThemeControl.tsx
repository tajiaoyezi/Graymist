import type { CSSProperties } from "react";
import { useTranslation } from "react-i18next";

import { ACCENTS, useTheme } from "../theme/ThemeProvider";

// 侧栏底部主题控件:浅/深切换 + 6 主题色。深色侧栏语境,用 rgba(white) 柔色(同原型)。
export function ThemeControl() {
  const { theme, accent, setTheme, setAccent } = useTheme();
  const { t } = useTranslation();

  const btn = (active: boolean): CSSProperties => ({
    flex: 1,
    border: "none",
    borderRadius: 6,
    padding: "6px 0",
    fontFamily: "inherit",
    fontSize: 11.5,
    fontWeight: 700,
    cursor: "pointer",
    color: active ? "#fff" : "#7c89a0",
    background: active ? "var(--accent)" : "transparent",
  });

  return (
    <div style={{ padding: "13px 16px 14px", borderTop: "1px solid var(--sidebar-line)" }}>
      <div
        style={{
          fontSize: 10,
          fontWeight: 800,
          color: "#5a677e",
          letterSpacing: 1.4,
          marginBottom: 8,
        }}
      >
        {t("theme.title")}
      </div>
      <div
        role="group"
        aria-label={t("theme.title")}
        style={{
          display: "flex",
          background: "rgba(255,255,255,.05)",
          borderRadius: 8,
          padding: 3,
          gap: 3,
          marginBottom: 11,
        }}
      >
        <button
          type="button"
          aria-pressed={theme === "light"}
          onClick={() => setTheme("light")}
          style={btn(theme === "light")}
        >
          ☼ {t("theme.light")}
        </button>
        <button
          type="button"
          aria-pressed={theme === "dark"}
          onClick={() => setTheme("dark")}
          style={btn(theme === "dark")}
        >
          ☾ {t("theme.dark")}
        </button>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
        <span style={{ fontSize: 10, fontWeight: 700, color: "#5a677e" }}>
          {t("theme.accent")}
        </span>
        <div style={{ display: "flex", gap: 6, flex: 1, justifyContent: "flex-end" }}>
          {ACCENTS.map((c) => (
            <button
              key={c}
              type="button"
              aria-label={c}
              aria-pressed={accent === c}
              onClick={() => setAccent(c)}
              style={{
                width: 16,
                height: 16,
                borderRadius: 5,
                cursor: "pointer",
                background: c,
                border: accent === c ? "2px solid #fff" : "2px solid transparent",
                padding: 0,
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
