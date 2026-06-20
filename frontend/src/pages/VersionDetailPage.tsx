import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useParams } from "react-router-dom";

import { ApiError, api } from "../api/client";
import { VersionActions } from "../components/VersionActions";
import type { Model, Version } from "../types";

export function VersionDetailPage() {
  const { t } = useTranslation();
  const { versionId = "" } = useParams();
  const [version, setVersion] = useState<Version | null>(null);
  const [model, setModel] = useState<Model | null>(null);
  const [error, setError] = useState("");

  async function load() {
    try {
      setError("");
      const v = await api.getVersion(versionId);
      setVersion(v);
      setModel(await api.getModel(v.model_id));
    } catch (e) {
      setError(e instanceof ApiError ? e.detail : t("error.load"));
    }
  }

  useEffect(() => {
    void load();
  }, [versionId]);

  if (error && !version) {
    return (
      <div data-testid="page-error" className="text-red-600">
        {error}
      </div>
    );
  }
  if (!version || !model) return null;

  const card = "bg-panel border border-border rounded-[14px]";

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2.5">
        <h2 className="m-0 text-[22px] font-extrabold tracking-tight">
          {model.name} / <span className="mono">{version.version}</span>
        </h2>
      </div>
      <div className="text-[13px] text-text2">
        {t("field.status")}: {t(`status.${version.status}`)} · {t("field.deployable")}:{" "}
        <span data-testid="deployable" className="font-bold">
          {version.deployable ? t("field.yes") : t("field.no")}
        </span>
      </div>

      <div className={card} style={{ padding: "16px 18px" }}>
        <div className="font-extrabold text-[13px] mb-1.5">{t("field.inputSchema")}</div>
        <pre className="mono m-0 mb-3.5 p-3 rounded-[9px] text-[11px] leading-relaxed overflow-x-auto whitespace-pre-wrap"
          style={{ background: "#0e1525", color: "#a5b4fc" }}>
          {JSON.stringify(model.input_schema, null, 2)}
        </pre>
        <div className="font-extrabold text-[13px] mb-1.5">{t("field.outputSchema")}</div>
        <pre className="mono m-0 p-3 rounded-[9px] text-[11px] leading-relaxed overflow-x-auto whitespace-pre-wrap"
          style={{ background: "#0e1525", color: "#86efac" }}>
          {JSON.stringify(model.output_schema, null, 2)}
        </pre>
      </div>

      <div className={card} style={{ padding: "16px 18px" }}>
        <div className="font-extrabold text-[13px] mb-2.5">{t("metrics.title")}</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 9 }}>
          {[
            { k: "accuracy", v: version.metrics?.accuracy },
            { k: "latency", v: version.metrics?.latency },
            { k: "throughput", v: version.metrics?.throughput },
          ].map((m) => (
            <div key={m.k} className="bg-surface2 border border-border-soft rounded-[9px] p-2.5">
              <div className="text-[10.5px] text-faint font-bold">{t(`metrics.${m.k}`)}</div>
              <div className="mono text-base font-extrabold mt-0.5">{m.v ?? "—"}</div>
            </div>
          ))}
        </div>
      </div>

      <div className={card} style={{ padding: "16px 18px" }}>
        <div className="font-extrabold text-[13px] mb-1.5">{t("field.changeNote")}</div>
        <p className="text-[13px] text-text2 m-0">{version.change_note}</p>
      </div>

      {error && (
        <div data-testid="action-error" className="text-red-600 text-sm">
          {error}
        </div>
      )}
      <VersionActions
        status={version.status}
        onTransition={async (target) => {
          try {
            setError("");
            setVersion(await api.transitionVersion(version.id, target));
          } catch (e) {
            setError(e instanceof ApiError ? e.detail : t("error.action"));
          }
        }}
      />
    </div>
  );
}
