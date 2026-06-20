import { useTranslation } from "react-i18next";
import { useLocation } from "react-router-dom";

export function Topbar() {
  const { pathname } = useLocation();
  const { t } = useTranslation();

  const title = (() => {
    if (pathname === "/models") return t("nav.models");
    if (pathname === "/models/new") return t("pageTitle.newModel");
    if (pathname.startsWith("/models/")) return t("pageTitle.modelDetail");
    if (pathname.startsWith("/versions/")) return t("pageTitle.versionDetail");
    if (pathname === "/endpoints") return t("nav.deployments");
    if (pathname === "/endpoints/new") return t("pageTitle.newEndpoint");
    if (pathname === "/playground") return t("nav.playground");
    if (pathname === "/monitoring") return t("nav.monitoring");
    return t("app.title");
  })();

  return (
    <header
      style={{
        height: 60,
        flex: "none",
        background: "var(--panel)",
        borderBottom: "1px solid var(--border)",
        display: "flex",
        alignItems: "center",
        padding: "0 24px",
        gap: 18,
      }}
    >
      <div style={{ fontSize: 16, fontWeight: 800, letterSpacing: -0.3 }}>{title}</div>
    </header>
  );
}
