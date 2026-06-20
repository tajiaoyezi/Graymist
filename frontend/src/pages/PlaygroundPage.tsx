import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { ApiError, api } from "../api/client";
import { type SchemaField, parseSchemaInput, schemaFields } from "../lib/schema";
import type { AsyncTask, Endpoint } from "../types";

// 推理 Playground(§2.7):接通真实推理 API —— 选 running 端点、按 input_schema 动态生成
// 表单、同步/异步调用(异步轮询至终态)、会话历史可回填。严守 v1.0 范围,不含流式/成本/协议切换。
const POLL_MS = 400;

interface HistItem {
  mode: "sync" | "async";
  input: unknown;
  result: unknown;
  latency_ms: number | null;
  version_id: string | null;
  status: string | null;
}

interface Resp {
  result: unknown;
  latency_ms: number | null;
  version_id: string | null;
  status: string | null;
}

export function PlaygroundPage() {
  const { t } = useTranslation();
  const [endpoints, setEndpoints] = useState<Endpoint[]>([]);
  const [endpointId, setEndpointId] = useState("");
  const [fields, setFields] = useState<SchemaField[] | null>(null);
  const [fieldValues, setFieldValues] = useState<Record<string, string | boolean>>({});
  const [rawJson, setRawJson] = useState("{}");
  const [mode, setMode] = useState<"sync" | "async">("sync");
  const [resp, setResp] = useState<Resp | null>(null);
  const [history, setHistory] = useState<HistItem[]>([]);
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);

  const alive = useRef(true);

  // 加载运行中的端点(仅 running 可推理)。
  useEffect(() => {
    alive.current = true;
    void (async () => {
      try {
        const all = await api.listEndpoints();
        if (!alive.current) return;
        const running = all.filter((e) => e.status === "running");
        setEndpoints(running);
        if (running.length && !endpointId) setEndpointId(running[0].id);
      } catch (e) {
        if (alive.current) setError(e instanceof ApiError ? e.detail : t("error.loadEndpoints"));
      }
    })();
    return () => {
      alive.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 选中端点后解析其 input_schema(端点不带 schema,经 binding→version→model 两跳;
  // a2 保证同端点同 Model,任取一条 binding)。
  useEffect(() => {
    if (!endpointId) {
      setFields(null);
      return;
    }
    const ep = endpoints.find((e) => e.id === endpointId);
    const binding = ep?.bindings[0];
    if (!binding) return;
    let cancelled = false;
    void (async () => {
      try {
        const version = await api.getVersion(binding.model_version_id);
        const model = await api.getModel(version.model_id);
        if (cancelled) return;
        setFields(schemaFields(model.input_schema));
        setFieldValues({});
        setRawJson("{}");
      } catch (e) {
        if (!cancelled) setError(e instanceof ApiError ? e.detail : t("error.parseInput"));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [endpointId, endpoints]);

  function setField(name: string, value: string | boolean) {
    setFieldValues((prev) => ({ ...prev, [name]: value }));
  }

  function buildInput(): unknown {
    if (fields) {
      const obj: Record<string, unknown> = {};
      for (const f of fields) {
        const v = fieldValues[f.name];
        if (f.type === "boolean") {
          obj[f.name] = Boolean(v);
        } else if (f.type === "number" || f.type === "integer") {
          if (v !== "" && v !== undefined) obj[f.name] = Number(v);
        } else if (v !== "" && v !== undefined) {
          obj[f.name] = v;
        }
      }
      return obj;
    }
    const parsed = parseSchemaInput(rawJson);
    if (!parsed.ok) throw new Error(parsed.error);
    return parsed.value;
  }

  async function pollTask(taskId: string): Promise<AsyncTask> {
    for (let i = 0; i < 60; i++) {
      const task = await api.getInferenceTask(taskId);
      if (task.status === "succeeded" || task.status === "failed") return task;
      await new Promise((r) => setTimeout(r, POLL_MS));
    }
    throw new Error("任务超时未完成");
  }

  async function send() {
    if (!endpointId) return;
    setError("");
    setSending(true);
    setResp(null);
    try {
      const input = buildInput();
      let item: HistItem;
      if (mode === "sync") {
        const res = await api.infer(endpointId, input);
        const r: Resp = { result: res.result, latency_ms: res.latency_ms, version_id: res.version_id, status: null };
        setResp(r);
        item = { mode, input, result: res.result, latency_ms: res.latency_ms, version_id: res.version_id, status: null };
      } else {
        const { task_id } = await api.submitAsyncInference(endpointId, input);
        const task = await pollTask(task_id);
        const r: Resp = { result: task.result, latency_ms: null, version_id: null, status: task.status };
        setResp(r);
        item = { mode, input, result: task.result, latency_ms: null, version_id: null, status: task.status };
      }
      if (alive.current) setHistory((h) => [item, ...h].slice(0, 20));
    } catch (e) {
      if (alive.current) setError(e instanceof ApiError ? e.detail : e instanceof Error ? e.message : "请求失败");
    } finally {
      if (alive.current) setSending(false);
    }
  }

  function refill(item: HistItem) {
    if (fields) {
      const inp = (item.input ?? {}) as Record<string, unknown>;
      const next: Record<string, string | boolean> = {};
      for (const f of fields) {
        const v = inp[f.name];
        next[f.name] = f.type === "boolean" ? Boolean(v) : v === undefined || v === null ? "" : String(v);
      }
      setFieldValues(next);
    } else {
      setRawJson(JSON.stringify(item.input, null, 2));
    }
  }

  const card = "bg-panel border border-border rounded-[14px]";
  const modeBtn = (active: boolean) =>
    `px-3.5 py-1.5 rounded-lg text-[12.5px] font-bold ${active ? "text-white" : "text-text2"}`;
  const inputCls =
    "h-[36px] w-full rounded-[9px] border border-border bg-panel px-2.5 text-sm outline-none";

  return (
    <div className="space-y-4">
      <div>
        <div className="flex items-center gap-2.5">
          <h2 className="m-0 text-xl font-extrabold tracking-tight">{t("nav.playground")}</h2>
          <span className="mono text-[10px] font-extrabold text-accent bg-accent-soft px-2 py-0.5 rounded-md">
            v1.0
          </span>
        </div>
        <div className="text-muted text-[12.5px] mt-1">{t("playground.subtitle")}</div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, alignItems: "start" }}>
        {/* 请求面板 */}
        <div className={card} style={{ padding: "18px 20px" }}>
          <div className="text-[11px] text-faint font-bold mb-1.5">{t("playground.selectEndpoint")}</div>
          <select
            data-testid="pg-endpoint"
            value={endpointId}
            onChange={(e) => setEndpointId(e.target.value)}
            className={`${inputCls} mb-4`}
          >
            <option value="">
              {endpoints.length ? t("playground.selectEndpointHint") : t("playground.noEndpoints")}
            </option>
            {endpoints.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name} · {e.url_path}
              </option>
            ))}
          </select>

          <div className="flex items-center gap-2.5 mb-4">
            <div className="flex rounded-[9px] p-[3px]" style={{ background: "var(--surface)" }}>
              <button
                type="button"
                onClick={() => setMode("sync")}
                className={modeBtn(mode === "sync")}
                style={mode === "sync" ? { background: "var(--accent)" } : undefined}
              >
                {t("playground.syncMode")}
              </button>
              <button
                type="button"
                onClick={() => setMode("async")}
                className={modeBtn(mode === "async")}
                style={mode === "async" ? { background: "var(--accent)" } : undefined}
              >
                {t("playground.asyncMode")}
              </button>
            </div>
          </div>

          <div className="text-[11px] text-faint font-bold mb-1.5">{t("playground.inputLabel")}</div>
          {fields ? (
            <div className="space-y-3 mb-4">
              {fields.map((f) => (
                <div key={f.name}>
                  <label className="text-[11px] text-faint font-bold mb-1 block">
                    {f.name}
                    {f.required ? " *" : ""} <span className="text-faint2">· {f.type}</span>
                  </label>
                  {f.type === "boolean" ? (
                    <input
                      type="checkbox"
                      data-testid={`pg-field-${f.name}`}
                      checked={Boolean(fieldValues[f.name])}
                      onChange={(e) => setField(f.name, e.target.checked)}
                    />
                  ) : f.type === "enum" ? (
                    <select
                      data-testid={`pg-field-${f.name}`}
                      value={String(fieldValues[f.name] ?? "")}
                      onChange={(e) => setField(f.name, e.target.value)}
                      className={inputCls}
                    >
                      <option value="">--</option>
                      {f.enumValues!.map((ev) => (
                        <option key={String(ev)} value={String(ev)}>
                          {String(ev)}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      data-testid={`pg-field-${f.name}`}
                      type={
                        f.type === "number" || f.type === "integer"
                          ? "number"
                          : f.format === "uri" || f.format === "url"
                            ? "url"
                            : "text"
                      }
                      value={String(fieldValues[f.name] ?? "")}
                      onChange={(e) => setField(f.name, e.target.value)}
                      className={inputCls}
                    />
                  )}
                </div>
              ))}
            </div>
          ) : (
            <textarea
              data-testid="pg-raw-input"
              value={rawJson}
              onChange={(e) => setRawJson(e.target.value)}
              className="w-full rounded-[9px] border border-border bg-panel px-3 py-2.5 text-sm outline-none mb-4 mono"
              style={{ height: 120, resize: "vertical" }}
            />
          )}

          {error && (
            <div data-testid="pg-error" className="text-red-600 text-[12.5px] mb-3">
              {error}
            </div>
          )}

          <button
            type="button"
            onClick={() => void send()}
            disabled={!endpointId || sending}
            className="w-full h-[40px] rounded-[10px] text-white font-bold text-sm disabled:opacity-40"
            style={{ background: "var(--accent)" }}
          >
            {sending ? t("playground.sending") : t("playground.send")}
          </button>
        </div>

        {/* 响应 + 历史 */}
        <div className="space-y-3.5">
          <div className={card} style={{ padding: "18px 20px", minHeight: 200 }}>
            <div className="font-extrabold text-[13px] mb-3">{t("playground.response")}</div>
            {resp ? (
              <div className="space-y-2">
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11.5px] text-text2">
                  {resp.version_id && (
                    <span>
                      {t("playground.version")}: <span className="mono text-accent">{resp.version_id}</span>
                    </span>
                  )}
                  {resp.latency_ms != null && (
                    <span>
                      {t("playground.latency")}: <span className="mono">{`${resp.latency_ms} ms`}</span>
                    </span>
                  )}
                  {resp.status && (
                    <span>
                      {t("playground.taskStatus")}: <span className="mono">{resp.status}</span>
                    </span>
                  )}
                </div>
                <pre
                  data-testid="pg-result"
                  className="mono text-[12px] bg-surface2 rounded-lg p-3 overflow-auto"
                  style={{ maxHeight: 260 }}
                >
                  {JSON.stringify(resp.result, null, 2)}
                </pre>
              </div>
            ) : (
              <div className="text-faint2 text-[13px] text-center" style={{ padding: "30px 0" }}>
                {t("playground.responseEmpty")}
              </div>
            )}
          </div>

          <div className={card} style={{ overflow: "hidden" }}>
            <div className="px-[18px] py-3 border-b border-border-soft font-extrabold text-[13px]">
              {t("playground.history")}
            </div>
            {history.length === 0 ? (
              <div className="text-faint2 text-[12.5px] text-center" style={{ padding: 18 }}>
                {t("playground.histEmpty")}
              </div>
            ) : (
              <div data-testid="pg-history">
                {history.map((item, i) => (
                  <button
                    key={i}
                    type="button"
                    data-testid={`pg-hist-${i}`}
                    onClick={() => refill(item)}
                    className="w-full text-left px-[18px] py-2.5 border-b border-border-soft hover:bg-surface text-[12px]"
                  >
                    <span className="mono text-[10px] text-accent bg-accent-soft px-1.5 py-0.5 rounded mr-2">
                      {item.mode}
                    </span>
                    <span className="mono text-text2">{JSON.stringify(item.input)}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
