import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { ApiError, api } from "../api/client";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { EndpointForm } from "../components/EndpointForm";
import {
  canRestart,
  canStart,
  canStop,
  isTransitioning,
} from "../domain/endpointStateMachine";
import type { Endpoint } from "../types";

type DangerOp = "stop" | "restart";

const STATUS: Record<string, { color: string; bg: string }> = {
  creating: { color: "#2563eb", bg: "#dbeafe" },
  running: { color: "#16a34a", bg: "#dcfce7" },
  stopped: { color: "#64748b", bg: "#f1f5f9" },
  failed: { color: "var(--danger)", bg: "var(--danger-soft)" },
};

export function DeploymentConsolePage() {
  const { t } = useTranslation();
  const [endpoints, setEndpoints] = useState<Endpoint[]>([]);
  const [error, setError] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Endpoint | null>(null);
  const [confirm, setConfirm] = useState<{ id: string; op: DangerOp; message: string } | null>(
    null,
  );

  const alive = useRef(true);

  async function load() {
    try {
      const data = await api.listEndpoints();
      if (!alive.current) return;
      setError("");
      setEndpoints(data);
      setLoaded(true);
    } catch (e) {
      if (!alive.current) return;
      setError(e instanceof ApiError ? e.detail : t("error.load"));
    }
  }

  useEffect(() => {
    alive.current = true;
    void load();
    const id = setInterval(() => void load(), 600);
    return () => {
      alive.current = false;
      clearInterval(id);
    };
  }, []);

  async function act(id: string, op: "start" | DangerOp) {
    try {
      setError("");
      if (op === "start") await api.startEndpoint(id);
      else if (op === "stop") await api.stopEndpoint(id);
      else await api.restartEndpoint(id);
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.detail : t("error.action"));
    }
  }

  function requestDanger(id: string, op: DangerOp) {
    setConfirm({
      id,
      op,
      message: op === "stop" ? t("endpoint.confirmStop") : t("endpoint.confirmRestart"),
    });
  }

  if (error && !loaded) {
    return (
      <div data-testid="page-error" className="text-danger">
        {error}
      </div>
    );
  }

  const card = "bg-panel border border-border rounded-[14px]";
  const opBtn =
    "border border-border rounded-lg px-2.5 py-1 text-xs font-bold text-text2 bg-panel hover:bg-surface disabled:opacity-40";

  return (
    <div className="space-y-4">
      <div className="flex items-end gap-3.5 flex-wrap">
        <div>
          <div className="flex items-center gap-2.5">
            <h2 className="m-0 text-xl font-extrabold tracking-tight">{t("endpoint.console")}</h2>
            <span className="mono text-[10px] font-extrabold text-accent bg-accent-soft px-2 py-0.5 rounded-md">
              v1.0
            </span>
          </div>
          <div className="text-muted text-[12.5px] mt-1">{t("endpoint.subtitle")}</div>
        </div>
        <div className="flex-1" />
        <button
          type="button"
          onClick={() => setModalOpen(true)}
          className="h-[38px] px-4 rounded-[10px] text-white font-bold text-sm"
          style={{ background: "var(--accent)" }}
        >
          + {t("endpoint.create")}
        </button>
      </div>

      {error && (
        <div data-testid="action-error" className="text-danger text-sm">
          {error}
        </div>
      )}

      {endpoints.length === 0 ? (
        <div className={card} style={{ padding: "30px 0" }}>
          <p className="text-sm text-faint2 text-center m-0">{t("endpoint.empty")}</p>
        </div>
      ) : (
        <div className={card} style={{ overflow: "hidden" }}>
          <div style={{ overflowX: "auto" }}>
            <table className="w-full text-[12.5px]" style={{ borderCollapse: "collapse", minWidth: 820 }}>
              <thead>
                <tr className="bg-surface2 text-muted font-bold text-left">
                  <th className="px-[18px] py-2.5">{t("endpoint.colEndpoint")}</th>
                  <th className="px-3.5 py-2.5">{t("endpoint.colStatus")}</th>
                  <th className="px-3.5 py-2.5">{t("endpoint.colModel")}</th>
                  <th className="px-3.5 py-2.5">{t("endpoint.colResource")}</th>
                  <th className="px-[18px] py-2.5 text-right">{t("endpoint.colOps")}</th>
                </tr>
              </thead>
              <tbody>
                {endpoints.map((ep) => {
                  const s = STATUS[ep.status] ?? STATUS.stopped;
                  return (
                    <tr key={ep.id} data-testid={`endpoint-${ep.id}`} className="border-t border-border-soft">
                      <td className="px-[18px] py-3">
                        <div className="font-extrabold text-[13px]">{ep.name}</div>
                        <div className="mono text-faint text-[11px] mt-0.5">{ep.url_path}</div>
                      </td>
                      <td className="px-3.5 py-3">
                        <span
                          data-testid={`status-${ep.id}`}
                          className="inline-flex items-center gap-1.5 text-[11px] font-bold px-2 py-0.5 rounded-md"
                          style={{ color: s.color, background: s.bg }}
                        >
                          <span style={{ width: 6, height: 6, borderRadius: "50%", background: s.color }} />
                          {t(`endpointStatus.${ep.status}`)}
                        </span>
                        {isTransitioning(ep.status) && (
                          <div
                            data-testid={`loading-${ep.id}`}
                            className="text-[10px] mt-1 animate-pulse"
                            style={{ color: "#2563eb" }}
                          >
                            {t("endpoint.creatingMsg")}
                          </div>
                        )}
                      </td>
                      <td className="px-3.5 py-3 mono text-[11px]" style={{ color: "#7c3aed" }}>
                        {ep.bindings.map((b) => `${b.model_version_id}:${b.weight}%`).join("  ")}
                      </td>
                      <td className="px-3.5 py-3 mono text-text2 text-[11.5px]">
                        {t("endpoint.replicas")} {ep.replicas} · {t("quota.cpu")}{" "}
                        {ep.resource_quota.cpu} · {t("quota.memory")} {ep.resource_quota.memory} ·{" "}
                        {t("quota.gpu")} {ep.resource_quota.gpu}
                      </td>
                      <td className="px-[18px] py-3">
                        <div className="flex gap-2 justify-end">
                          <button
                            type="button"
                            data-testid={`edit-${ep.id}`}
                            disabled={isTransitioning(ep.status)}
                            onClick={() => setEditing(ep)}
                            className={opBtn}
                          >
                            {t("action.edit")}
                          </button>
                          <button
                            type="button"
                            data-testid={`start-${ep.id}`}
                            disabled={!canStart(ep.status)}
                            onClick={() => void act(ep.id, "start")}
                            className={opBtn}
                          >
                            {t("action.start")}
                          </button>
                          <button
                            type="button"
                            data-testid={`stop-${ep.id}`}
                            disabled={!canStop(ep.status)}
                            onClick={() => requestDanger(ep.id, "stop")}
                            className={opBtn}
                          >
                            {t("action.stop")}
                          </button>
                          <button
                            type="button"
                            data-testid={`restart-${ep.id}`}
                            disabled={!canRestart(ep.status)}
                            onClick={() => requestDanger(ep.id, "restart")}
                            className={opBtn}
                          >
                            {t("action.restart")}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 创建 / 编辑端点弹窗 */}
      {(modalOpen || editing) && (
        <>
          <div
            onClick={() => {
              setModalOpen(false);
              setEditing(null);
            }}
            style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,.45)", zIndex: 90 }}
          />
          <div
            role="dialog"
            aria-label={editing ? t("endpoint.edit") : t("endpoint.create")}
            style={{
              position: "fixed",
              top: "50%",
              left: "50%",
              transform: "translate(-50%,-50%)",
              width: 620,
              maxWidth: "94vw",
              maxHeight: "92vh",
              overflowY: "auto",
              zIndex: 91,
              boxShadow: "0 24px 70px rgba(15,23,42,.3)",
            }}
            className="bg-panel rounded-2xl"
          >
            <div className="px-6 py-5 border-b border-border-soft font-extrabold text-base">
              {editing ? t("endpoint.edit") : t("endpoint.create")}
            </div>
            <div className="px-6 py-5">
              <EndpointForm
                key={editing?.id ?? "create"}
                endpoint={editing ?? undefined}
                onSuccess={() => {
                  setModalOpen(false);
                  setEditing(null);
                  void load();
                }}
                onCancel={() => {
                  setModalOpen(false);
                  setEditing(null);
                }}
              />
            </div>
          </div>
        </>
      )}

      <ConfirmDialog
        open={confirm !== null}
        message={confirm?.message ?? ""}
        onConfirm={() => {
          if (confirm) void act(confirm.id, confirm.op);
          setConfirm(null);
        }}
        onCancel={() => setConfirm(null)}
      />
    </div>
  );
}
