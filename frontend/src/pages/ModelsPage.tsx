import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

import { api } from "../api/client";
import { ModelList } from "../components/ModelList";

export function ModelsPage() {
  const { t } = useTranslation();
  return (
    <div className="space-y-4">
      <div className="flex items-end gap-3.5 flex-wrap">
        <div>
          <div className="flex items-center gap-2.5">
            <h2 className="m-0 text-xl font-extrabold tracking-tight">{t("nav.models")}</h2>
            <span className="mono text-[10px] font-extrabold text-accent bg-accent-soft px-2 py-0.5 rounded-md">
              v1.0
            </span>
          </div>
          <div className="text-muted text-[12.5px] mt-1">{t("models.subtitle")}</div>
        </div>
        <div className="flex-1" />
        <Link
          to="/models/new"
          className="inline-flex items-center h-[38px] px-4 rounded-[10px] font-bold text-sm text-white"
          style={{ background: "var(--accent)" }}
        >
          + {t("nav.create")}
        </Link>
      </div>
      <ModelList api={api} />
    </div>
  );
}
