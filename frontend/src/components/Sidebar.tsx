import { useTranslation } from "react-i18next";
import { NavLink } from "react-router-dom";

import { ThemeControl } from "./ThemeControl";

// v1.0 仅 4 个页面;「创建模型」入口在模型仓库页内,不作导航项(spec: 导航仅含四页)。
const NAV = [
  { to: "/models", key: "nav.models" },
  { to: "/endpoints", key: "nav.deployments" },
  { to: "/playground", key: "nav.playground" },
  { to: "/monitoring", key: "nav.monitoring" },
];

export function Sidebar() {
  const { t } = useTranslation();
  return (
    <aside
      style={{
        width: 248,
        flex: "none",
        background: "var(--sidebar)",
        display: "flex",
        flexDirection: "column",
        height: "100%",
      }}
    >
      {/* brand */}
      <div style={{ padding: "22px 22px 16px", display: "flex", alignItems: "center", gap: 11 }}>
        <div
          style={{
            width: 34,
            height: 34,
            borderRadius: 9,
            background: "linear-gradient(135deg,#6366f1,#8b5cf6)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flex: "none",
          }}
        >
          <div style={{ width: 13, height: 13, border: "2.5px solid #fff", borderRadius: 4 }} />
        </div>
        <div>
          <div style={{ color: "#fff", fontWeight: 800, fontSize: 15, letterSpacing: -0.2 }}>
            {t("brand.name")}
          </div>
          <div style={{ color: "var(--muted)", fontSize: 11, fontWeight: 600 }}>
            {t("brand.tagline")}
          </div>
        </div>
      </div>

      {/* nav */}
      <nav
        aria-label={t("nav.group")}
        style={{ flex: 1, overflowY: "auto", padding: "6px 12px 18px" }}
      >
        <div style={{ marginTop: 14 }}>
          <div
            style={{
              color: "var(--text2)",
              fontSize: 10.5,
              fontWeight: 700,
              letterSpacing: 1.2,
              padding: "0 10px 7px",
            }}
          >
            {t("nav.group")}
          </div>
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              style={({ isActive }) => ({
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "9px 10px",
                borderRadius: 8,
                marginBottom: 2,
                fontSize: 13,
                fontWeight: 700,
                textDecoration: "none",
                color: isActive ? "#fff" : "#8b97ad",
                background: isActive ? "rgba(255,255,255,.08)" : "transparent",
              })}
            >
              {({ isActive }) => (
                <>
                  <span
                    style={{
                      width: 7,
                      height: 7,
                      borderRadius: "50%",
                      background: isActive ? "var(--accent)" : "#475569",
                    }}
                  />
                  <span style={{ flex: 1 }}>{t(item.key)}</span>
                </>
              )}
            </NavLink>
          ))}
        </div>
      </nav>

      <ThemeControl />
    </aside>
  );
}
