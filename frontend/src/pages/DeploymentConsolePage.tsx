import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

import { ApiError, api } from "../api/client";
import { ConfirmDialog } from "../components/ConfirmDialog";
import {
  canRestart,
  canStart,
  canStop,
  isTransitioning,
} from "../domain/endpointStateMachine";
import type { Endpoint } from "../types";

type DangerOp = "stop" | "restart";

export function DeploymentConsolePage() {
  const { t } = useTranslation();
  const [endpoints, setEndpoints] = useState<Endpoint[]>([]);
  const [error, setError] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [confirm, setConfirm] = useState<{ id: string; op: DangerOp; message: string } | null>(
    null,
  );

  const alive = useRef(true);

  async function load() {
    try {
      const data = await api.listEndpoints();
      if (!alive.current) return; // 审查 L3:卸载后不再 setState
      setError("");
      setEndpoints(data);
      setLoaded(true);
    } catch (e) {
      if (!alive.current) return;
      setError(e instanceof ApiError ? e.detail : "加载失败");
    }
  }

  useEffect(() => {
    alive.current = true;
    void load();
    // 状态实时刷新:异步部署/停止/重启完成后自动反映最新态(2.6)。
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
      setError(e instanceof ApiError ? e.detail : "操作失败");
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
      <div data-testid="page-error" className="text-red-600">
        {error}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">{t("endpoint.console")}</h2>
        <Link to="/endpoints/new" className="text-blue-600">
          {t("endpoint.create")}
        </Link>
      </div>
      {error && (
        <div data-testid="action-error" className="text-red-600 text-sm">
          {error}
        </div>
      )}
      {endpoints.length === 0 ? (
        <p className="text-sm text-gray-500">{t("endpoint.empty")}</p>
      ) : (
        <ul className="space-y-2">
          {endpoints.map((ep) => (
            <li key={ep.id} data-testid={`endpoint-${ep.id}`} className="border rounded p-3">
              <div className="flex items-center justify-between">
                <div>
                  <span className="font-medium">{ep.name}</span>{" "}
                  <span className="text-xs text-gray-500">{ep.url_path}</span>
                </div>
                <span data-testid={`status-${ep.id}`} className="text-sm">
                  {t(`endpointStatus.${ep.status}`)}
                  {isTransitioning(ep.status) && (
                    <span data-testid={`loading-${ep.id}`} className="ml-1 animate-pulse">
                      …
                    </span>
                  )}
                </span>
              </div>
              <div className="text-xs text-gray-600 mt-1">
                {ep.bindings.map((b) => `${b.model_version_id}:${b.weight}%`).join("  ")}
              </div>
              <div className="text-xs text-gray-600">
                {t("endpoint.replicas")} {ep.replicas} · {t("quota.cpu")} {ep.resource_quota.cpu} ·{" "}
                {t("quota.memory")} {ep.resource_quota.memory} · {t("quota.gpu")}{" "}
                {ep.resource_quota.gpu}
              </div>
              <div className="flex gap-2 mt-2">
                <button
                  type="button"
                  data-testid={`start-${ep.id}`}
                  disabled={!canStart(ep.status)}
                  onClick={() => void act(ep.id, "start")}
                  className="border rounded px-2 py-1 text-sm disabled:opacity-40"
                >
                  {t("action.start")}
                </button>
                <button
                  type="button"
                  data-testid={`stop-${ep.id}`}
                  disabled={!canStop(ep.status)}
                  onClick={() => requestDanger(ep.id, "stop")}
                  className="border rounded px-2 py-1 text-sm disabled:opacity-40"
                >
                  {t("action.stop")}
                </button>
                <button
                  type="button"
                  data-testid={`restart-${ep.id}`}
                  disabled={!canRestart(ep.status)}
                  onClick={() => requestDanger(ep.id, "restart")}
                  className="border rounded px-2 py-1 text-sm disabled:opacity-40"
                >
                  {t("action.restart")}
                </button>
              </div>
            </li>
          ))}
        </ul>
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
