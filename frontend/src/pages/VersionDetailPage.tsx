import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useParams } from "react-router-dom";

import { ApiError, api } from "../api/client";
import { VersionActions } from "../components/VersionActions";
import type { Model, Version } from "../types";

const STATUS_ORDER = ["draft", "validating", "ready", "archived"] as const;

export function VersionDetailPage() {
  const { t } = useTranslation();
  const { versionId = "" } = useParams();
  const [version, setVersion] = useState<Version | null>(null);
  const [model, setModel] = useState<Model | null>(null);
  const [error, setError] = useState("");
  const [editMetrics, setEditMetrics] = useState(false);
  const [mAcc, setMAcc] = useState("");
  const [mLat, setMLat] = useState("");
  const [mThr, setMThr] = useState("");

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
  const v = version; // 已过空值守卫,供闭包内稳定引用

  function openMetrics() {
    setMAcc(v.metrics?.accuracy != null ? String(v.metrics.accuracy) : "");
    setMLat(v.metrics?.latency != null ? String(v.metrics.latency) : "");
    setMThr(v.metrics?.throughput != null ? String(v.metrics.throughput) : "");
    setEditMetrics(true);
  }

  const num = (s: string) => {
    const n = Number(s);
    return s.trim() === "" || !Number.isFinite(n) ? null : n;
  };

  async function saveMetrics() {
    try {
      setError("");
      setVersion(
        await api.setMetrics(v.id, {
          accuracy: num(mAcc),
          latency: num(mLat),
          throughput: num(mThr),
        }),
      );
      setEditMetrics(false);
    } catch (e) {
      setError(e instanceof ApiError ? e.detail : t("error.action"));
    }
  }

  const metricField = (
    testid: string,
    label: string,
    value: string,
    set: (s: string) => void,
  ) => (
    <label className="block">
      <span className="text-[10.5px] text-faint font-bold">{label}</span>
      <input
        type="number"
        step="any"
        data-testid={testid}
        value={value}
        onChange={(e) => set(e.target.value)}
        className="border border-border rounded-[9px] px-2.5 py-1.5 w-full bg-panel text-sm outline-none mono mt-0.5"
      />
    </label>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2.5">
        <h2 className="m-0 text-[22px] font-extrabold tracking-tight">
          {model.name} / <span className="mono">{version.version}</span>
        </h2>
      </div>
      {/* 状态阶梯:高亮当前态,把 draft→validating→ready→archived 这条主线讲清楚 */}
      <div className="flex items-center gap-1.5 flex-wrap" data-testid="status-ladder">
        {STATUS_ORDER.map((s, i) => (
          <span key={s} className="flex items-center gap-1.5">
            {i > 0 && <span className="text-faint text-xs">→</span>}
            <span
              data-testid={`ladder-${s}`}
              className={`text-xs font-bold px-2 py-0.5 rounded-md ${
                s === version.status ? "text-white" : "text-faint bg-surface"
              }`}
              style={s === version.status ? { background: "var(--accent)" } : undefined}
            >
              {t(`status.${s}`)}
            </span>
          </span>
        ))}
      </div>
      <div className="text-[13px] text-text2">
        {t("field.deployable")}:{" "}
        <span data-testid="deployable" className="font-bold">
          {version.deployable ? t("field.yes") : t("field.no")}
        </span>
        {!version.deployable && (
          <span className="text-faint"> · {t("version.deployableHint")}</span>
        )}
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
        <div className="flex items-center justify-between mb-2.5">
          <div className="font-extrabold text-[13px]">{t("metrics.title")}</div>
          {!editMetrics && (
            <button
              type="button"
              data-testid="edit-metrics"
              onClick={openMetrics}
              className="border border-border rounded-md px-2.5 py-1 text-[11px] font-bold text-accent bg-accent-soft hover:opacity-80 transition"
            >
              {t("action.edit")}
            </button>
          )}
        </div>
        {editMetrics ? (
          <div className="space-y-2.5">
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 9 }}>
              {metricField("metric-accuracy", t("metrics.accuracy"), mAcc, setMAcc)}
              {metricField("metric-latency", t("metrics.latency"), mLat, setMLat)}
              {metricField("metric-throughput", t("metrics.throughput"), mThr, setMThr)}
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                data-testid="metrics-cancel"
                onClick={() => setEditMetrics(false)}
                className="border border-border rounded-lg px-3 py-1.5 text-xs font-bold text-text2 bg-panel"
              >
                {t("action.cancel")}
              </button>
              <button
                type="button"
                data-testid="metrics-save"
                onClick={() => void saveMetrics()}
                className="bg-accent text-white rounded-lg px-3 py-1.5 text-xs font-bold"
              >
                {t("action.save")}
              </button>
            </div>
          </div>
        ) : (
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
        )}
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
      {version.status === "ready" && (
        <div className="text-[11px]" style={{ color: "#d97706" }}>
          {t("version.archiveIrreversible")}
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
