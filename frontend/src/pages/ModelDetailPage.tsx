import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useParams } from "react-router-dom";

import { ApiError, api } from "../api/client";
import { NewVersionForm } from "../components/NewVersionForm";
import { formatDateTime } from "../lib/format";
import type { Model, Version, VersionMetrics } from "../types";

interface CompareRow {
  version: string;
  version_id: string;
  metrics: VersionMetrics | null;
}

const STATUS_BADGE: Record<string, string> = {
  draft: "text-text2 bg-surface",
  validating: "text-accent bg-accent-soft",
  ready: "text-white",
  archived: "text-faint bg-surface",
};

export function ModelDetailPage() {
  const { t, i18n } = useTranslation();
  const { modelId = "" } = useParams();
  const [model, setModel] = useState<Model | null>(null);
  const [versions, setVersions] = useState<Version[]>([]);
  const [compare, setCompare] = useState<CompareRow[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState("");

  async function reload() {
    try {
      setError("");
      setModel(await api.getModel(modelId));
      setVersions(await api.listVersions(modelId));
      setCompare(await api.compareVersions(modelId));
    } catch (e) {
      setError(e instanceof ApiError ? e.detail : t("error.load"));
    }
  }

  useEffect(() => {
    void reload();
  }, [modelId]);

  if (error) {
    return (
      <div data-testid="page-error" className="text-red-600">
        {error}
      </div>
    );
  }
  if (!model) return null;

  // 版本资源需求摘要(spec 版本列表三要素之一:状态/创建时间/资源需求)。
  function resourceSummary(rr: Record<string, unknown>): string {
    const parts: string[] = [];
    if (rr.cpu != null) parts.push(`${t("quota.cpu")} ${rr.cpu}`);
    if (rr.memory != null) parts.push(`${t("quota.memory")} ${rr.memory}`);
    const gpu = rr.gpu_vram ?? rr.gpu;
    if (gpu != null) parts.push(`${t("quota.gpu")} ${gpu}`);
    return parts.join(" · ");
  }

  const fmtMetric = (v: number | null | undefined) => (v == null ? "—" : String(v));

  const card = "bg-panel border border-border rounded-[14px]";

  return (
    <div className="space-y-4">
      <Link
        to="/models"
        className="inline-block text-muted text-[13px] font-bold no-underline"
      >
        {t("models.back")}
      </Link>

      <div>
        <div className="flex items-center gap-2.5 flex-wrap">
          <h2 className="m-0 text-[22px] font-extrabold tracking-tight">{model.name}</h2>
          <span className="text-[11px] font-bold px-2 py-0.5 rounded-md text-text2 bg-surface">
            {t(`taskType.${model.task_type}`)}
          </span>
        </div>
        <div className="text-muted text-[13px] mt-1">
          {model.description} · {t("field.createdAt")}{" "}
          {formatDateTime(model.created_at, i18n.language)}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 360px", gap: 16, alignItems: "start" }}>
        {/* left: versions + compare */}
        <div className="space-y-4">
          <div className={card} style={{ overflow: "hidden" }}>
            <div className="flex justify-between items-center px-[18px] py-3.5 border-b border-border-soft">
              <span className="font-extrabold text-sm">{t("version.list")}</span>
              <button
                type="button"
                className="text-accent text-[13px] font-bold"
                onClick={() => setShowForm((v) => !v)}
              >
                {t("action.newVersion")}
              </button>
            </div>
            {showForm && (
              <div className="px-[18px] py-2">
                <NewVersionForm
                  onSubmit={async (body) => {
                    await api.createVersion(modelId, body);
                    setShowForm(false);
                    await reload();
                  }}
                />
              </div>
            )}
            {versions.map((v) => (
              <Link
                key={v.id}
                to={`/versions/${v.id}`}
                className="flex items-center gap-3 px-[18px] py-3 border-b border-border-soft no-underline text-text hover:bg-surface2"
              >
                <span className="mono font-bold text-[13px] w-[42px]">{v.version}</span>
                <span
                  className={`text-[10.5px] font-bold px-2 py-0.5 rounded-md ${STATUS_BADGE[v.status] ?? "text-text2 bg-surface"}`}
                  style={v.status === "ready" ? { background: "var(--accent)" } : undefined}
                >
                  {t(`status.${v.status}`)}
                </span>
                <span className="mono text-[11px] text-faint2" title={t("field.resourceReq")}>
                  {resourceSummary(v.resource_req)}
                </span>
                <span className="flex-1" />
                <span className="text-[11.5px] text-faint">{t(`framework.${v.framework}`)}</span>
                <span className="mono text-[11px] text-faint2">
                  {formatDateTime(v.created_at, i18n.language)}
                </span>
              </Link>
            ))}
          </div>

          <div className={card} style={{ padding: "16px 18px" }}>
            <div className="font-extrabold text-sm mb-2.5">{t("version.compare")}</div>
            <table className="w-full text-[12.5px]" style={{ borderCollapse: "collapse" }}>
              <thead>
                <tr className="text-muted font-bold text-left">
                  <th className="py-1.5 pr-3">{t("version.name")}</th>
                  <th className="py-1.5 px-3 text-right">{t("metrics.accuracy")}</th>
                  <th className="py-1.5 px-3 text-right">{t("metrics.latency")}</th>
                  <th className="py-1.5 pl-3 text-right">{t("metrics.throughput")}</th>
                </tr>
              </thead>
              <tbody>
                {compare.map((c) => (
                  <tr key={c.version_id} className="border-t border-border-soft">
                    <td className="py-2 pr-3 mono font-bold">{c.version}</td>
                    <td className="py-2 px-3 text-right mono">{fmtMetric(c.metrics?.accuracy)}</td>
                    <td className="py-2 px-3 text-right mono">{fmtMetric(c.metrics?.latency)}</td>
                    <td className="py-2 pl-3 text-right mono">{fmtMetric(c.metrics?.throughput)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* right: meta + schema */}
        <div className="space-y-4">
          <div className={card} style={{ padding: "16px 18px" }}>
            <div className="font-extrabold text-[13px] mb-3">{t("field.inputSchema")}</div>
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
        </div>
      </div>
    </div>
  );
}
