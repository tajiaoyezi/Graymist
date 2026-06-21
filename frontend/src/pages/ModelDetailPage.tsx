import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useParams } from "react-router-dom";

import { ApiError, api } from "../api/client";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { EditModelForm } from "../components/EditModelForm";
import { NewVersionForm } from "../components/NewVersionForm";
import { formatDateTime } from "../lib/format";
import type { Endpoint, Model, Version, VersionMetrics } from "../types";

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
  const navigate = useNavigate();
  const [model, setModel] = useState<Model | null>(null);
  const [versions, setVersions] = useState<Version[]>([]);
  const [compare, setCompare] = useState<CompareRow[]>([]);
  const [endpoints, setEndpoints] = useState<Endpoint[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");

  async function reload() {
    try {
      setError("");
      setActionError(""); // 重载成功即清掉上一轮删除/操作失败的残留提示
      setModel(await api.getModel(modelId));
      setVersions(await api.listVersions(modelId));
      setCompare(await api.compareVersions(modelId));
      try {
        // 端点信息是次要的,失败不应让整页崩(用于「部署于」与删除守卫提示)。
        setEndpoints(await api.listEndpoints());
      } catch {
        setEndpoints([]);
      }
    } catch (e) {
      setError(e instanceof ApiError ? e.detail : t("error.load"));
    }
  }

  useEffect(() => {
    void reload();
  }, [modelId]);

  async function handleDelete() {
    try {
      setActionError("");
      await api.deleteModel(modelId);
      navigate("/models");
    } catch (e) {
      // 被端点绑定时后端返回 409;页内如实提示,不崩页、不跳转。
      setActionError(e instanceof ApiError ? e.detail : t("error.action"));
    }
  }

  if (error) {
    return (
      <div data-testid="page-error" className="text-danger">
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

  // 绑定了本模型任一版本的端点 —— 驱动「部署于」展示与删除守卫(被绑定则禁用删除)。
  const versionIds = new Set(versions.map((v) => v.id));
  const boundEndpoints = endpoints.filter((ep) =>
    ep.bindings.some((b) => versionIds.has(b.model_version_id)),
  );
  const deleteBlocked = boundEndpoints.length > 0;

  const card = "bg-panel border border-border rounded-[14px]";

  return (
    <div className="space-y-4">
      <Link
        to="/models"
        className="inline-block text-muted text-[13px] font-bold no-underline"
      >
        {t("models.back")}
      </Link>

      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <div className="flex items-center gap-2.5 flex-wrap">
            <h2 className="m-0 text-[22px] font-extrabold tracking-tight">{model.name}</h2>
            <span className="text-[11px] font-bold px-2 py-0.5 rounded-md text-text2 bg-surface">
              {model.task_type === "custom" && model.custom_task_type
                ? model.custom_task_type
                : t(`taskType.${model.task_type}`)}
            </span>
          </div>
          <div className="text-muted text-[13px] mt-1">
            {model.description} · {t("field.createdAt")}{" "}
            {formatDateTime(model.created_at, i18n.language)}
          </div>
        </div>
        <div className="flex gap-2.5">
          <button
            type="button"
            data-testid="edit-model"
            onClick={() => {
              setActionError(""); // 清掉上一轮删除失败的残留红条,避免跨操作误读
              setEditOpen(true);
            }}
            className="inline-flex items-center h-[38px] px-4 rounded-[10px] font-bold text-sm text-white hover:opacity-90 transition"
            style={{ background: "var(--accent)" }}
          >
            {t("action.edit")}
          </button>
          <button
            type="button"
            data-testid="delete-model"
            disabled={deleteBlocked}
            title={deleteBlocked ? t("models.deleteBlockedHint") : undefined}
            onClick={() => setConfirmDelete(true)}
            className="inline-flex items-center h-[38px] px-4 rounded-[10px] font-bold text-sm text-white hover:opacity-90 transition disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ background: "var(--danger)" }}
          >
            {t("action.delete")}
          </button>
        </div>
      </div>

      {actionError && (
        <div data-testid="action-error" className="text-danger text-sm">
          {actionError}
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 360px", gap: 16, alignItems: "start" }}>
        {/* left: versions + compare */}
        <div className="space-y-4">
          <div className={card} style={{ overflow: "hidden" }}>
            <div className="flex justify-between items-center px-[18px] py-3.5 border-b border-border-soft">
              <span className="font-extrabold text-sm">{t("version.list")}</span>
              <button
                type="button"
                onClick={() => setShowForm(true)}
                className="inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-bold text-accent bg-accent-soft border border-border hover:opacity-80 transition"
              >
                + {t("action.newVersion")}
              </button>
            </div>
            {versions.length === 0 && (
              <div data-testid="versions-empty" className="px-[18px] py-7 text-center">
                <div className="text-faint text-[13px] mb-3 leading-relaxed">
                  {t("version.emptyGuide")}
                </div>
                <button
                  type="button"
                  onClick={() => setShowForm(true)}
                  className="inline-flex items-center h-[34px] px-3.5 rounded-[10px] text-white font-bold text-[13px]"
                  style={{ background: "var(--accent)" }}
                >
                  + {t("action.newVersion")}
                </button>
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
                <span className="text-[11.5px] text-faint">
                  {v.source === "external-api"
                    ? t("version.sourceLabel.external-api")
                    : v.framework
                      ? t(`framework.${v.framework}`)
                      : "—"}
                </span>
                {v.source === "external-api" && v.has_api_key && (
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md text-accent bg-surface">
                    {t("version.keyConfigured")}
                  </span>
                )}
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

        {/* right: deployed-on + schema */}
        <div className="space-y-4">
          <div className={card} style={{ padding: "16px 18px" }}>
            <div className="font-extrabold text-[13px] mb-2">{t("models.deployedOn")}</div>
            {boundEndpoints.length === 0 ? (
              <div data-testid="deployed-none" className="text-faint text-xs">
                {t("models.notDeployed")}
              </div>
            ) : (
              <div className="space-y-1">
                {boundEndpoints.map((ep) => (
                  <Link
                    key={ep.id}
                    to="/endpoints"
                    data-testid={`deployed-on-${ep.id}`}
                    className="flex items-center justify-between gap-2 no-underline rounded-md px-1.5 py-1 hover:bg-surface2"
                  >
                    <span className="font-bold text-[12.5px] text-text">{ep.name}</span>
                    <span className="mono text-[11px] text-faint">{ep.url_path}</span>
                  </Link>
                ))}
              </div>
            )}
          </div>
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

      {/* 新建版本弹窗 */}
      {showForm && (
        <>
          <div
            onClick={() => setShowForm(false)}
            style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,.45)", zIndex: 90 }}
          />
          <div
            role="dialog"
            aria-label={t("action.newVersion")}
            style={{
              position: "fixed",
              top: "50%",
              left: "50%",
              transform: "translate(-50%,-50%)",
              width: 560,
              maxWidth: "94vw",
              maxHeight: "92vh",
              overflowY: "auto",
              zIndex: 91,
              boxShadow: "0 24px 70px rgba(15,23,42,.3)",
            }}
            className="bg-panel rounded-2xl"
          >
            <div className="px-6 py-5 border-b border-border-soft font-extrabold text-base">
              {t("action.newVersion")}
            </div>
            <div className="px-6 py-5">
              <NewVersionForm
                onSubmit={async (body) => {
                  await api.createVersion(modelId, body);
                  setShowForm(false);
                  await reload();
                }}
                onCancel={() => setShowForm(false)}
              />
            </div>
          </div>
        </>
      )}

      {/* 编辑模型弹窗(仅 name/description) */}
      {editOpen && (
        <>
          <div
            onClick={() => setEditOpen(false)}
            style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,.45)", zIndex: 90 }}
          />
          <div
            role="dialog"
            aria-label={t("models.editTitle")}
            style={{
              position: "fixed",
              top: "50%",
              left: "50%",
              transform: "translate(-50%,-50%)",
              width: 460,
              maxWidth: "94vw",
              zIndex: 91,
              boxShadow: "0 24px 70px rgba(15,23,42,.3)",
            }}
            className="bg-panel rounded-2xl"
          >
            <div className="px-6 py-5 border-b border-border-soft font-extrabold text-base">
              {t("models.editTitle")}
            </div>
            <div className="px-6 py-5">
              <EditModelForm
                model={model}
                onSubmit={async (fields) => {
                  await api.updateModel(modelId, fields);
                  setEditOpen(false);
                  await reload();
                }}
                onCancel={() => setEditOpen(false)}
              />
            </div>
          </div>
        </>
      )}

      <ConfirmDialog
        open={confirmDelete}
        title={t("models.deleteTitle", { name: model.name })}
        message={t("models.deleteBody")}
        confirmLabel={t("action.delete")}
        onConfirm={() => {
          setConfirmDelete(false);
          void handleDelete();
        }}
        onCancel={() => setConfirmDelete(false)}
      />
    </div>
  );
}
