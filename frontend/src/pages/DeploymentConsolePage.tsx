import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { ApiError, api } from "../api/client";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { EndpointForm } from "../components/EndpointForm";
import { isTransitioning } from "../domain/endpointStateMachine";
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
  const [error, setError] = useState(""); // 加载错误(首次失败 → 整页错误态)
  // 操作错误(启动/停止/重启,如资源超额 409)单列:由用户操作产生,持久展示,
  // 不被每 600ms 轮询的 load() 清空(否则会一闪而过)。
  const [actionError, setActionError] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Endpoint | null>(null);
  const [confirm, setConfirm] = useState<{ id: string; op: DangerOp; message: string } | null>(
    null,
  );
  // ⋮ 行菜单:记录展开的端点 id 与浮层锚点坐标(避开表格 overflow 裁剪,用 fixed 定位)。
  const [menu, setMenu] = useState<{ id: string; top: number; right: number } | null>(null);
  // 停止为异步(后端暂仍 running,后台才转 stopped),前端记「停止中」端点 → 禁用主按钮 + 状态提示。
  const [stopping, setStopping] = useState<Record<string, boolean>>({});

  const alive = useRef(true);

  async function load() {
    try {
      const data = await api.listEndpoints();
      if (!alive.current) return;
      setError("");
      setEndpoints(data);
      // 停止完成(状态已非 running)或端点消失 → 清除「停止中」标记。
      setStopping((prev) => {
        const runningIds = new Set(
          data.filter((e) => e.status === "running").map((e) => e.id),
        );
        const next: Record<string, boolean> = {};
        for (const id of Object.keys(prev)) if (runningIds.has(id)) next[id] = true;
        return next;
      });
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
      setActionError("");
      if (op === "start") await api.startEndpoint(id);
      else if (op === "stop") {
        await api.stopEndpoint(id);
        // 后端停止异步:立即标记「停止中」,后续轮询见非 running 再由 load 清除。
        setStopping((s) => ({ ...s, [id]: true }));
      } else await api.restartEndpoint(id);
      await load();
    } catch (e) {
      // 用 actionError(非 error),否则会被轮询 load 的 setError("") 清掉而一闪而过。
      setActionError(e instanceof ApiError ? e.detail : t("error.action"));
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

  // 行操作:启停合一为主按钮(按状态三选一),其余收进 ⋮ 菜单。
  const primaryFor = (ep: Endpoint) => {
    if (ep.status === "stopped")
      return { op: "start" as const, label: t("action.start"), danger: false, disabled: false, run: () => void act(ep.id, "start") };
    if (ep.status === "failed")
      return { op: "restart" as const, label: t("action.restart"), danger: true, disabled: false, run: () => requestDanger(ep.id, "restart") };
    // 部署中:异步过渡态,主按钮禁用展示「部署中…」(与「停止中」一致,进行中不可操作)
    if (ep.status === "creating")
      return { op: "deploying" as const, label: t("endpoint.creatingMsg"), danger: false, disabled: true, run: () => {} };
    // 停止中:running 但已发起停止 → 禁用「停止中…」防重复点击(后端停止异步、状态暂仍 running)
    if (stopping[ep.id])
      return { op: "stop" as const, label: t("endpoint.stopping"), danger: true, disabled: true, run: () => {} };
    // running → 停止
    return { op: "stop" as const, label: t("action.stop"), danger: true, disabled: false, run: () => requestDanger(ep.id, "stop") };
  };
  // 菜单项:重启(running/stopped;failed 时重启已是主按钮)+ 编辑(creating 禁用)。
  const menuFor = (ep: Endpoint) => [
    ...(ep.status === "running" || ep.status === "stopped"
      ? [{ op: "restart", label: t("action.restart"), danger: true, disabled: false, run: () => requestDanger(ep.id, "restart") }]
      : []),
    { op: "edit", label: t("action.edit"), danger: false, disabled: isTransitioning(ep.status), run: () => setEditing(ep) },
  ];

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

      {actionError && (
        <div
          data-testid="action-error"
          className="flex items-start gap-2.5 rounded-[10px] px-3.5 py-2.5 text-[13px]"
          style={{
            background: "var(--danger-soft)",
            border: "1px solid color-mix(in srgb, var(--danger) 35%, transparent)",
            color: "var(--danger)",
          }}
        >
          <span aria-hidden className="font-extrabold leading-none mt-0.5">
            !
          </span>
          <span className="flex-1 font-bold leading-snug">{actionError}</span>
          <button
            type="button"
            data-testid="action-error-dismiss"
            aria-label={t("action.cancel")}
            onClick={() => setActionError("")}
            className="font-extrabold leading-none opacity-70 hover:opacity-100"
          >
            ×
          </button>
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
                        {ep.status === "running" && stopping[ep.id] && (
                          <div
                            data-testid={`stopping-${ep.id}`}
                            className="text-[10px] mt-1 animate-pulse text-faint"
                          >
                            {t("endpoint.stopping")}
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
                        <div className="flex justify-end">
                          {(() => {
                            const p = primaryFor(ep);
                            const hasMenu = menuFor(ep).some((it) => !it.disabled);
                            // 分段按钮:主操作 + ▾ 触发器合为一体,同色整体、中间分隔线。
                            return (
                              <div
                                className="inline-flex items-stretch rounded-lg overflow-hidden"
                                style={{ background: p.danger ? "var(--danger)" : "var(--accent)" }}
                              >
                                <button
                                  type="button"
                                  data-testid={`${p.op}-${ep.id}`}
                                  disabled={p.disabled}
                                  onClick={p.run}
                                  className="px-3 h-[30px] text-white font-bold text-xs disabled:opacity-60 disabled:cursor-not-allowed"
                                >
                                  {p.label}
                                </button>
                                {hasMenu && (
                                  <button
                                    type="button"
                                    data-testid={`more-${ep.id}`}
                                    aria-label={t("endpoint.colOps")}
                                    disabled={p.disabled}
                                    onClick={(e) => {
                                      const r = e.currentTarget.getBoundingClientRect();
                                      setMenu(
                                        menu?.id === ep.id
                                          ? null
                                          : { id: ep.id, top: r.bottom + 4, right: window.innerWidth - r.right },
                                      );
                                    }}
                                    className="px-2 h-[30px] inline-flex items-center justify-center text-white text-[10px] border-l border-white/25 hover:bg-black/10 transition disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:bg-transparent"
                                  >
                                    {menu?.id === ep.id ? "▴" : "▾"}
                                  </button>
                                )}
                              </div>
                            );
                          })()}
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

      {menu &&
        (() => {
          const ep = endpoints.find((e) => e.id === menu.id);
          if (!ep) return null; // 端点被轮询移除 → 菜单自动关闭
          if (primaryFor(ep).disabled) return null; // 进行中(停止中/部署中)→ 不展示菜单
          return (
            <>
              <div
                className="fixed inset-0"
                style={{ zIndex: 80 }}
                onClick={() => setMenu(null)}
              />
              <div
                data-testid={`menu-${ep.id}`}
                className="fixed bg-panel border border-border rounded-[10px] py-1"
                style={{
                  top: menu.top,
                  right: menu.right,
                  zIndex: 81,
                  minWidth: 124,
                  boxShadow: "0 12px 30px rgba(15,23,42,.18)",
                }}
              >
                {menuFor(ep).map((it) => (
                  <button
                    key={it.op}
                    type="button"
                    data-testid={`${it.op}-${ep.id}`}
                    disabled={it.disabled}
                    onClick={() => {
                      setMenu(null);
                      it.run();
                    }}
                    className={`block w-full text-left px-3.5 py-1.5 text-xs font-bold hover:bg-surface disabled:opacity-40 disabled:cursor-not-allowed ${
                      it.danger ? "text-danger" : "text-text2"
                    }`}
                  >
                    {it.label}
                  </button>
                ))}
              </div>
            </>
          );
        })()}

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
