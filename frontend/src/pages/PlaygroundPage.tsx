import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { ApiError, api } from "../api/client";
import { type SchemaField, parseSchemaInput, schemaFields } from "../lib/schema";
import type { AsyncTask, Endpoint, InferenceLog, TokenUsage } from "../types";

interface ChatMessage {
  role: string;
  content: string;
}

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
  taskId?: string; // 异步任务 ID(凭此查询)
  // 并发压测汇总:并发是同步/异步之上的修饰维度。kind 区分同步并发(429 限流)与异步并发(入队不拒绝)。
  conc?: { kind: "sync" | "async"; n: number; ok: number; limited: number; failed: number };
}

// 异步生命周期轨迹:把「提交→任务ID→排队→凭ID轮询」显式呈现给用户。
interface AsyncTrace {
  taskId: string;
  seen: string[]; // 经历过的状态序列(相邻去重):queued → running → succeeded/failed
  status: string; // 当前/终态
  polls: number; // 已轮询次数
  elapsedMs: number | null; // 终态时的总耗时
}

interface Resp {
  result: unknown;
  latency_ms: number | null;
  version_id: string | null;
  status: string | null;
  usage?: TokenUsage | null; // a5:external-api 真实 token 用量
}

// 并发压测:一次性打出 N 个请求验证端点限流/排队策略。
// 同步并发:status 为 HTTP 码(超限 429 被拒);异步并发:status 为任务态("queued"),全部入队不拒绝、附 taskId。
interface ConcResult {
  i: number;
  ok: boolean;
  status: number | string;
  latency_ms: number | null;
  version_id: string | null;
  taskId?: string; // 异步并发:提交返回的任务 ID
  detail: string;
}

export function PlaygroundPage() {
  const { t } = useTranslation();
  const [endpoints, setEndpoints] = useState<Endpoint[]>([]);
  const [endpointId, setEndpointId] = useState("");
  const [fields, setFields] = useState<SchemaField[] | null>(null);
  const [fieldValues, setFieldValues] = useState<Record<string, string | boolean>>({});
  const [rawJson, setRawJson] = useState("{}");
  // a5:external-api 端点用 chat 编排器(不据 input_schema 生成动态表单)。
  const [isExternal, setIsExternal] = useState(false);
  const [chatSystem, setChatSystem] = useState("");
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([{ role: "user", content: "" }]);
  const [mode, setMode] = useState<"sync" | "async">("sync");
  // 并发 = 同步/异步之上的修饰维度(并非第三种模式):勾上即一次打出 N 个当前模式的请求。
  const [concurrent, setConcurrent] = useState(false);
  const [concKind, setConcKind] = useState<"sync" | "async">("sync");
  const [resp, setResp] = useState<Resp | null>(null);
  const [asyncTrace, setAsyncTrace] = useState<AsyncTrace | null>(null);
  const [copiedTask, setCopiedTask] = useState(false);
  // 「客户端凭任务 ID 查询结果」手动查询工具:让这一步成为用户可见、可操作的显式动作。
  const [queryId, setQueryId] = useState("");
  const [queryResult, setQueryResult] = useState<AsyncTask | null>(null);
  const [querying, setQuerying] = useState(false);
  const [queryError, setQueryError] = useState("");
  const [concurrency, setConcurrency] = useState("6");
  const [concResults, setConcResults] = useState<ConcResult[] | null>(null);
  const [history, setHistory] = useState<HistItem[]>([]);
  const [logs, setLogs] = useState<InferenceLog[]>([]);
  const [logStatus, setLogStatus] = useState(""); // 推理日志状态筛选(空=全部)
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
        const ext = version.source === "external-api";
        setIsExternal(ext);
        // DOM-3:先按来源分流 —— external 端点强制 chat 编排器,绝不据 input_schema 生成动态表单。
        setFields(ext ? null : schemaFields(model.input_schema));
        if (ext) {
          setChatSystem("");
          setChatMessages([{ role: "user", content: "" }]);
        }
        setFieldValues({});
        setRawJson("{}");
        // 会话历史按端点作用域:切端点时清空,避免跨端点(尤其 mock↔external)回填得到错误/空输入(fe-2)。
        setHistory([]);
        setResp(null);
        setConcResults(null);
        setAsyncTrace(null);
        setQueryId("");
        setQueryResult(null);
        setQueryError("");
        // 默认并发数设为端点上限 +2,便于直接观察超限触发 429。
        setConcurrency(String((ep?.max_concurrency ?? 4) + 2));
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
    if (isExternal) {
      const messages = chatMessages
        .filter((m) => m.content.trim() !== "")
        .map((m) => ({ role: m.role, content: m.content }));
      const sys = chatSystem.trim();
      return sys ? { system: sys, messages } : { messages };
    }
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
    if (!parsed.ok) throw new Error(t(parsed.error));
    return parsed.value;
  }

  // 必填校验(仅动态表单模式;raw JSON 模式由用户自行保证)。返回缺失的必填字段名。
  function missingRequired(): string[] {
    if (!fields) return [];
    return fields
      .filter((f) => f.required)
      .filter((f) => {
        if (f.type === "boolean") return false; // 勾选框恒有值
        const v = fieldValues[f.name];
        return v === undefined || (typeof v === "string" && v.trim() === "");
      })
      .map((f) => f.name);
  }

  // 凭任务 ID 轮询,并把每次查询的状态/次数/耗时实时写入 asyncTrace,使异步生命周期可见。
  async function pollTaskTraced(taskId: string, seen: string[], startedAt: number): Promise<AsyncTask> {
    for (let i = 0; i < 60; i++) {
      const task = await api.getInferenceTask(taskId);
      if (!alive.current) return task;
      if (seen[seen.length - 1] !== task.status) seen.push(task.status);
      const terminal = task.status === "succeeded" || task.status === "failed";
      setAsyncTrace({
        taskId,
        seen: [...seen],
        status: task.status,
        polls: i + 1,
        elapsedMs: terminal ? Date.now() - startedAt : null,
      });
      if (terminal) return task;
      await new Promise((r) => setTimeout(r, POLL_MS));
    }
    throw new Error(t("error.taskTimeout"));
  }

  function copyTaskId(id: string) {
    void navigator.clipboard?.writeText(id);
    setCopiedTask(true);
    setTimeout(() => {
      if (alive.current) setCopiedTask(false);
    }, 1500);
  }

  // 客户端凭任务 ID 查询结果:用户显式动作 —— 拿任务 ID 调 GET /inference/tasks/{id}。
  async function queryByTaskId() {
    const id = queryId.trim();
    if (!id) return;
    setQuerying(true);
    setQueryError("");
    try {
      const task = await api.getInferenceTask(id);
      if (alive.current) setQueryResult(task);
    } catch (e) {
      if (alive.current) {
        setQueryResult(null);
        setQueryError(e instanceof ApiError ? e.detail : t("error.requestFailed"));
      }
    } finally {
      if (alive.current) setQuerying(false);
    }
  }

  // 推理日志:逐条调用记录(命中版本/输入·输出摘要/延迟/状态)。发起推理后或手动刷新时拉取。
  async function loadLogs() {
    if (!endpointId) {
      setLogs([]);
      return;
    }
    try {
      const lg = await api.listInferenceLogs(endpointId, { status: logStatus || undefined, limit: 50 });
      if (alive.current) setLogs(lg);
    } catch {
      /* 日志加载失败不打断主流程 */
    }
  }

  // 端点 / 状态筛选变化时刷新日志。
  useEffect(() => {
    void loadLogs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [endpointId, logStatus]);

  async function send() {
    if (!endpointId) return;
    // 发送前中文必填校验,避免把后端 jsonschema 英文错误甩给用户。
    const missing = missingRequired();
    if (missing.length) {
      setError(t("playground.missingRequired", { fields: missing.join("、") }));
      return;
    }
    if (isExternal && chatMessages.every((m) => m.content.trim() === "")) {
      setError(t("playground.chatEmpty"));
      return;
    }
    setError("");
    setSending(true);
    setAsyncTrace(null);
    try {
      const input = buildInput();
      if (concurrent) {
        // 并发压测:一次性打出 N 个「当前模式」的请求,观察端点限流/排队策略。
        setConcResults(null);
        setConcKind(mode);
        const n = Math.max(1, Math.min(Math.floor(Number(concurrency)) || 1, 50));
        let results: ConcResult[];
        if (mode === "sync") {
          // 同步并发:超过端点最大并发 → 429 被拒(限流即拒绝)。
          const one = (i: number): Promise<ConcResult> =>
            api.infer(endpointId, input).then(
              (res): ConcResult => ({
                i, ok: true, status: 200,
                latency_ms: res.latency_ms, version_id: res.version_id, detail: "",
              }),
              (e): ConcResult => ({
                i, ok: false,
                status: e instanceof ApiError ? e.status : 0,
                latency_ms: null, version_id: null,
                detail: e instanceof ApiError ? e.detail : e instanceof Error ? e.message : "",
              }),
            );
          results = await Promise.all(Array.from({ length: n }, (_, i) => one(i)));
        } else {
          // 异步并发:全部被接收并入队(无 429),各自返回任务 ID —— 排队而非拒绝。
          const one = (i: number): Promise<ConcResult> =>
            api.submitAsyncInference(endpointId, input).then(
              (res): ConcResult => ({
                i, ok: true, status: res.status, taskId: res.task_id,
                latency_ms: null, version_id: null, detail: "",
              }),
              (e): ConcResult => ({
                i, ok: false,
                status: e instanceof ApiError ? e.status : 0,
                latency_ms: null, version_id: null,
                detail: e instanceof ApiError ? e.detail : e instanceof Error ? e.message : "",
              }),
            );
          results = await Promise.all(Array.from({ length: n }, (_, i) => one(i)));
        }
        if (alive.current) {
          setConcResults(results);
          const ok = results.filter((r) => r.ok).length;
          const limited = results.filter((r) => r.status === 429).length;
          // 异步并发:把首个任务 ID 填入查询框,便于随即凭 ID 取各任务结果。
          if (mode === "async") {
            const first = results.find((r) => r.taskId)?.taskId;
            if (first) {
              setQueryId(first);
              setQueryResult(null);
              setQueryError("");
            }
          }
          const histItem: HistItem = {
            mode,
            input,
            result: null,
            latency_ms: null,
            version_id: null,
            status: null,
            conc: { kind: mode, n: results.length, ok, limited, failed: results.length - ok - limited },
          };
          setHistory((h) => [histItem, ...h].slice(0, 20));
        }
        return;
      }
      setResp(null);
      let item: HistItem;
      if (mode === "sync") {
        const res = await api.infer(endpointId, input);
        const r: Resp = { result: res.result, latency_ms: res.latency_ms, version_id: res.version_id, status: null, usage: res.usage };
        setResp(r);
        item = { mode: "sync", input, result: res.result, latency_ms: res.latency_ms, version_id: res.version_id, status: null };
      } else {
        // 异步:提交→拿任务ID→凭ID轮询,全程把 queued→running→succeeded 生命周期显式呈现。
        const startedAt = Date.now();
        const { task_id, status } = await api.submitAsyncInference(endpointId, input);
        if (!alive.current) return;
        const seen = [status]; // 提交即 queued
        setAsyncTrace({ taskId: task_id, seen: [...seen], status, polls: 0, elapsedMs: null });
        // 把返回的任务 ID 自动填入手动查询框,便于用户随即「凭 ID 查询」。
        setQueryId(task_id);
        setQueryResult(null);
        setQueryError("");
        const task = await pollTaskTraced(task_id, seen, startedAt);
        const r: Resp = { result: task.result, latency_ms: null, version_id: null, status: task.status };
        setResp(r);
        item = {
          mode: "async", input, result: task.result, latency_ms: null,
          version_id: null, status: task.status, taskId: task_id,
        };
      }
      if (alive.current) setHistory((h) => [item, ...h].slice(0, 20));
    } catch (e) {
      if (alive.current)
        setError(e instanceof ApiError ? e.detail : e instanceof Error ? e.message : t("error.requestFailed"));
    } finally {
      if (alive.current) setSending(false);
      void loadLogs(); // 发送后刷新逐条日志(并发异步任务后台执行,可再用「刷新」更新)
    }
  }

  function refill(item: HistItem) {
    if (isExternal) {
      const inp = (item.input ?? {}) as { system?: string; messages?: ChatMessage[] };
      setChatSystem(inp.system ?? "");
      setChatMessages(
        inp.messages?.length
          ? inp.messages.map((m) => ({ role: m.role, content: m.content }))
          : [{ role: "user", content: "" }],
      );
    } else if (fields) {
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
    // 并发项:回填并发数、切回对应模式并开启并发开关,便于复跑同一组压测。
    if (item.conc) {
      setConcurrency(String(item.conc.n));
      setMode(item.conc.kind);
      setConcurrent(true);
    } else {
      setMode(item.mode);
      setConcurrent(false);
    }
  }

  const card = "bg-panel border border-border rounded-[14px]";
  const selectedMaxConc = endpoints.find((e) => e.id === endpointId)?.max_concurrency;
  const modeBtn = (active: boolean) =>
    `px-3.5 py-1.5 rounded-lg text-[12.5px] font-bold ${active ? "text-white" : "text-text2"}`;
  const inputCls =
    "h-[36px] w-full rounded-[9px] border border-border bg-panel px-2.5 text-sm outline-none";
  function fmtLogTime(iso: string): string {
    const d = new Date(iso);
    const p = (n: number) => String(n).padStart(2, "0");
    return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
  }
  // 状态色:成功绿 / 限流·超时琥珀 / 错误红。
  const LOG_STATUS_COLOR: Record<string, string> = {
    success: "#16a34a",
    rate_limited: "#d97706",
    timeout: "#d97706",
    error: "var(--danger)",
  };
  const LOG_STATUSES = ["success", "timeout", "error", "rate_limited"] as const;

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

          <div className="flex items-center gap-2.5 mb-4 flex-wrap">
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
            {/* 并发是同步/异步之上的开关:勾上即「同步+并发」或「异步+并发」 */}
            <button
              type="button"
              data-testid="pg-concurrent-toggle"
              aria-pressed={concurrent}
              onClick={() => setConcurrent((v) => !v)}
              className={`px-3 py-1.5 rounded-[9px] text-[12.5px] font-bold border ${
                concurrent ? "text-white border-transparent" : "text-text2 border-border"
              }`}
              style={concurrent ? { background: "var(--accent)" } : undefined}
            >
              {t("playground.concurrentToggle")}
            </button>
          </div>

          {concurrent && (
            <div className="mb-4">
              <div className="text-[11px] text-faint font-bold mb-1.5">
                {t("playground.concurrency")}
              </div>
              <input
                type="number"
                min={1}
                max={50}
                data-testid="pg-concurrency"
                value={concurrency}
                onChange={(e) => setConcurrency(e.target.value)}
                className={inputCls}
              />
              <div className="text-[10.5px] text-faint mt-1">
                {mode === "sync"
                  ? t("playground.concurrencyHint", { max: selectedMaxConc ?? "-" })
                  : t("playground.concAsyncHint", { max: selectedMaxConc ?? "-" })}
              </div>
            </div>
          )}

          <div className="text-[11px] text-faint font-bold mb-1.5">{t("playground.inputLabel")}</div>
          {isExternal ? (
            <div className="space-y-3 mb-4" data-testid="pg-chat-composer">
              <div>
                <label className="text-[11px] text-faint font-bold mb-1 block">{t("playground.chatSystem")}</label>
                <textarea
                  data-testid="pg-chat-system"
                  value={chatSystem}
                  onChange={(e) => setChatSystem(e.target.value)}
                  className="w-full rounded-[9px] border border-border bg-panel px-2.5 py-2 text-sm outline-none"
                  style={{ height: 52, resize: "vertical" }}
                />
              </div>
              {chatMessages.map((m, i) => (
                <div key={i} className="flex gap-2 items-start">
                  <select
                    data-testid={`pg-chat-role-${i}`}
                    value={m.role}
                    onChange={(e) =>
                      setChatMessages((ms) => ms.map((x, j) => (j === i ? { ...x, role: e.target.value } : x)))
                    }
                    className="h-[36px] rounded-[9px] border border-border bg-panel px-2 text-sm outline-none"
                  >
                    <option value="user">user</option>
                    <option value="assistant">assistant</option>
                  </select>
                  <input
                    data-testid={`pg-chat-content-${i}`}
                    value={m.content}
                    onChange={(e) =>
                      setChatMessages((ms) => ms.map((x, j) => (j === i ? { ...x, content: e.target.value } : x)))
                    }
                    placeholder={t("playground.chatContentHint")}
                    className={`${inputCls} flex-1`}
                  />
                  {chatMessages.length > 1 && (
                    <button
                      type="button"
                      data-testid={`pg-chat-remove-${i}`}
                      onClick={() => setChatMessages((ms) => ms.filter((_, j) => j !== i))}
                      className="h-[36px] px-2.5 rounded-[9px] border border-border text-text2 text-sm"
                    >
                      ×
                    </button>
                  )}
                </div>
              ))}
              <button
                type="button"
                data-testid="pg-chat-add"
                onClick={() => setChatMessages((ms) => [...ms, { role: "user", content: "" }])}
                className="text-[12px] font-bold text-accent"
              >
                + {t("playground.chatAddMessage")}
              </button>
            </div>
          ) : fields ? (
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
            <div
              data-testid="pg-error"
              className="flex items-start gap-2 rounded-[10px] px-3 py-2.5 mb-3 text-[12.5px]"
              style={{
                background: "var(--danger-soft)",
                border: "1px solid color-mix(in srgb, var(--danger) 35%, transparent)",
                color: "var(--danger)",
              }}
            >
              <span aria-hidden className="font-extrabold leading-none mt-0.5">
                !
              </span>
              <span className="flex-1 font-bold leading-snug">{error}</span>
            </div>
          )}

          <button
            type="button"
            onClick={() => void send()}
            disabled={!endpointId || sending}
            className="w-full h-[40px] rounded-[10px] text-white font-bold text-sm disabled:opacity-40"
            style={{ background: "var(--accent)" }}
          >
            {sending
              ? t("playground.sending")
              : concurrent
                ? t("playground.concSend")
                : t("playground.send")}
          </button>
        </div>

        {/* 响应 + 历史 */}
        <div className="space-y-3.5">
          <div className={card} style={{ padding: "18px 20px", minHeight: 200 }}>
            <div className="font-extrabold text-[13px] mb-3">{t("playground.response")}</div>
            {concurrent ? (
              concResults ? (
                concKind === "sync" ? (
                  // 同步并发:超端点最大并发 → 429 限流(拒绝)。
                  <div className="space-y-3">
                    <div
                      data-testid="pg-conc-summary"
                      className="flex flex-wrap gap-x-4 gap-y-1 text-[12px] font-bold"
                    >
                      <span className="text-text2">
                        {t("playground.concTotal")}: {concResults.length}
                      </span>
                      <span style={{ color: "#16a34a" }}>
                        {t("playground.concOk")}: {concResults.filter((r) => r.ok).length}
                      </span>
                      <span style={{ color: "#d97706" }}>
                        {t("playground.concLimited")}:{" "}
                        {concResults.filter((r) => r.status === 429).length}
                      </span>
                      {concResults.some((r) => !r.ok && r.status !== 429) && (
                        <span className="text-danger">
                          {t("playground.concFailed")}:{" "}
                          {concResults.filter((r) => !r.ok && r.status !== 429).length}
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-faint">
                      {t("playground.concVsLimit", { max: selectedMaxConc ?? "-" })}
                    </div>
                    <div
                      className="grid gap-1.5"
                      style={{ gridTemplateColumns: "repeat(auto-fill, minmax(74px, 1fr))" }}
                    >
                      {concResults.map((r) => {
                        const color = r.ok
                          ? "#16a34a"
                          : r.status === 429
                            ? "#d97706"
                            : "var(--danger)";
                        return (
                          <div
                            key={r.i}
                            data-testid={`pg-conc-${r.i}`}
                            className="bg-surface2 border border-border-soft rounded-lg p-2 text-center"
                          >
                            <div className="flex items-center justify-center gap-1">
                              <span style={{ width: 6, height: 6, borderRadius: "50%", background: color }} />
                              <span className="mono text-[10px] text-faint">#{r.i + 1}</span>
                            </div>
                            <div className="mono text-[10.5px] font-bold mt-1" style={{ color }}>
                              {r.ok ? `${r.latency_ms}ms` : r.status === 429 ? "429" : r.status || "ERR"}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  // 异步并发:全部被接收并入队(无 429)—— 排队而非拒绝,各自返回任务 ID。
                  <div className="space-y-3">
                    <div
                      data-testid="pg-conc-summary"
                      className="flex flex-wrap gap-x-4 gap-y-1 text-[12px] font-bold"
                    >
                      <span className="text-text2">
                        {t("playground.concTotal")}: {concResults.length}
                      </span>
                      <span style={{ color: "#16a34a" }}>
                        {t("playground.concQueued")}: {concResults.filter((r) => r.ok).length}
                      </span>
                      {concResults.some((r) => !r.ok) && (
                        <span className="text-danger">
                          {t("playground.concRejected")}: {concResults.filter((r) => !r.ok).length}
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-faint">
                      {t("playground.concAsyncResultHint", { max: selectedMaxConc ?? "-" })}
                    </div>
                    <div
                      className="grid gap-1.5"
                      style={{ gridTemplateColumns: "repeat(auto-fill, minmax(98px, 1fr))" }}
                    >
                      {concResults.map((r) => {
                        const color = r.ok ? "#16a34a" : "var(--danger)";
                        return (
                          <div
                            key={r.i}
                            data-testid={`pg-conc-${r.i}`}
                            className="bg-surface2 border border-border-soft rounded-lg p-2 text-center"
                          >
                            <div className="flex items-center justify-center gap-1">
                              <span style={{ width: 6, height: 6, borderRadius: "50%", background: color }} />
                              <span className="mono text-[10px] text-faint">#{r.i + 1}</span>
                            </div>
                            <div className="mono text-[10px] font-bold mt-1" style={{ color }}>
                              {r.ok ? (r.taskId ? r.taskId.slice(0, 8) : "queued") : r.status || "ERR"}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )
              ) : (
                <div className="text-faint2 text-[13px] text-center" style={{ padding: "30px 0" }}>
                  {t("playground.concEmpty")}
                </div>
              )
            ) : mode === "async" ? (
              asyncTrace ? (
                <div className="space-y-3">
                  {/* 任务 ID + 复制(凭此 ID 查询) */}
                  <div className="flex items-center gap-2 text-[11.5px]">
                    <span className="text-faint font-bold">{t("playground.asyncTaskId")}</span>
                    <span data-testid="pg-async-taskid" className="mono text-text2">
                      {asyncTrace.taskId}
                    </span>
                    <button
                      type="button"
                      onClick={() => copyTaskId(asyncTrace.taskId)}
                      className="mono text-[10.5px] text-accent bg-accent-soft px-1.5 py-0.5 rounded"
                    >
                      {copiedTask ? t("playground.asyncCopied") : t("playground.asyncCopy")}
                    </button>
                  </div>
                  {/* 状态时间线:queued → running → succeeded/failed */}
                  <div className="flex items-start gap-2 text-[11.5px]">
                    <span className="text-faint font-bold mt-0.5">{t("playground.asyncTimeline")}</span>
                    <div data-testid="pg-async-timeline" className="flex items-center gap-1.5 flex-wrap">
                      {asyncTrace.seen.map((st, idx) => {
                        const terminal = st === "succeeded" || st === "failed";
                        const color =
                          st === "failed" ? "var(--danger)" : terminal ? "#16a34a" : "var(--accent)";
                        return (
                          <span key={`${st}-${idx}`} className="flex items-center gap-1.5">
                            {idx > 0 && <span className="text-faint2">→</span>}
                            <span
                              className="inline-flex items-center gap-1 mono text-[11px] font-bold"
                              style={{ color }}
                            >
                              <span style={{ width: 6, height: 6, borderRadius: "50%", background: color }} />
                              {st}
                            </span>
                          </span>
                        );
                      })}
                      {asyncTrace.elapsedMs != null && (
                        <span className="text-faint text-[10.5px] ml-1">
                          {t("playground.asyncElapsed", {
                            s: (asyncTrace.elapsedMs / 1000).toFixed(1),
                          })}
                        </span>
                      )}
                    </div>
                  </div>
                  {/* 轮询行:显式展示「凭 ID 查询」的动作与次数 */}
                  <div className="flex items-center gap-2 text-[11px] text-faint">
                    <span className="font-bold">{t("playground.asyncPolling")}</span>
                    <span className="mono">
                      GET /inference/tasks/{asyncTrace.taskId.slice(0, 8)}… #{asyncTrace.polls}
                    </span>
                  </div>
                  {resp?.result != null && (
                    <pre
                      data-testid="pg-result"
                      className="mono text-[12px] bg-surface2 rounded-lg p-3 overflow-auto"
                      style={{ maxHeight: 260 }}
                    >
                      {JSON.stringify(resp.result, null, 2)}
                    </pre>
                  )}
                </div>
              ) : (
                <div className="text-faint2 text-[13px] text-center" style={{ padding: "30px 0" }}>
                  {t("playground.asyncEmpty")}
                </div>
              )
            ) : resp ? (
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
                  {resp.usage && (
                    <span data-testid="pg-usage">
                      {t("playground.usage")}:{" "}
                      <span className="mono">
                        {`${resp.usage.prompt_tokens}/${resp.usage.completion_tokens}/${resp.usage.total_tokens}`}
                      </span>
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

          {mode === "async" && (
            <div className={card} style={{ padding: "16px 18px" }}>
              <div className="font-extrabold text-[13px] mb-1">{t("playground.queryByIdTitle")}</div>
              <div className="text-[11px] text-faint mb-2.5">{t("playground.queryByIdHint")}</div>
              <div className="flex items-center gap-2">
                <input
                  data-testid="pg-task-query-id"
                  value={queryId}
                  onChange={(e) => setQueryId(e.target.value)}
                  placeholder={t("playground.asyncTaskId")}
                  className={`${inputCls} mono flex-1`}
                />
                <button
                  type="button"
                  data-testid="pg-task-query-btn"
                  onClick={() => void queryByTaskId()}
                  disabled={!queryId.trim() || querying}
                  className="h-[36px] px-4 rounded-[9px] text-white font-bold text-[12.5px] disabled:opacity-40 shrink-0"
                  style={{ background: "var(--accent)" }}
                >
                  {querying ? t("playground.querying") : t("playground.queryBtn")}
                </button>
              </div>
              {queryError && (
                <div
                  data-testid="pg-task-query-error"
                  className="text-danger text-[11.5px] mt-2 font-bold"
                >
                  {queryError}
                </div>
              )}
              {queryResult && (
                <div data-testid="pg-task-query-result" className="mt-3 space-y-2">
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11.5px] text-text2">
                    <span>
                      {t("playground.asyncTimeline")}:{" "}
                      <span
                        className="mono font-bold"
                        style={{
                          color:
                            queryResult.status === "failed"
                              ? "var(--danger)"
                              : queryResult.status === "succeeded"
                                ? "#16a34a"
                                : "var(--accent)",
                        }}
                      >
                        {queryResult.status}
                      </span>
                    </span>
                    <span className="mono text-faint text-[10.5px]">#{queryResult.id.slice(0, 8)}</span>
                  </div>
                  {queryResult.result != null ? (
                    <pre
                      className="mono text-[12px] bg-surface2 rounded-lg p-3 overflow-auto"
                      style={{ maxHeight: 220 }}
                    >
                      {JSON.stringify(queryResult.result, null, 2)}
                    </pre>
                  ) : (
                    <div className="text-faint text-[11.5px]">{t("playground.queryPending")}</div>
                  )}
                </div>
              )}
            </div>
          )}

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
                    {item.conc && (
                      <span className="mono text-[10px] text-accent bg-accent-soft px-1.5 py-0.5 rounded mr-2">
                        {t("playground.concurrentToggle")}
                      </span>
                    )}
                    <span className="mono text-text2">{JSON.stringify(item.input)}</span>
                    {item.taskId && (
                      <span className="mono text-faint text-[10.5px] ml-2">
                        #{item.taskId.slice(0, 8)} · {item.status}
                      </span>
                    )}
                    {item.conc && (
                      <span className="text-faint text-[10.5px] ml-2">
                        {item.conc.kind === "sync"
                          ? t("playground.concHistSummary", {
                              n: item.conc.n,
                              ok: item.conc.ok,
                              limited: item.conc.limited,
                            })
                          : t("playground.concAsyncHistSummary", {
                              n: item.conc.n,
                              ok: item.conc.ok,
                              rejected: item.conc.failed + item.conc.limited,
                            })}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 推理日志:逐条调用记录(命中版本 / 输入·输出摘要 / 延迟 / 状态),A/B 命中用于分析 */}
      <div className={card} style={{ padding: "16px 18px" }}>
        <div className="flex items-center gap-3 mb-1 flex-wrap">
          <div className="font-extrabold text-[13px]">{t("playground.logs.title")}</div>
          <div className="flex-1" />
          <button
            type="button"
            data-testid="pg-log-refresh"
            onClick={() => void loadLogs()}
            className="h-8 px-3 rounded-[8px] border border-border bg-panel text-[12px] font-bold text-text2"
          >
            {t("playground.logs.refresh")}
          </button>
          <span className="text-[11px] text-faint font-bold">{t("playground.logs.statusFilter")}</span>
          <select
            data-testid="pg-log-status"
            value={logStatus}
            onChange={(e) => setLogStatus(e.target.value)}
            className="h-8 rounded-[8px] border border-border bg-panel px-2 text-[12px] font-bold outline-none"
          >
            <option value="">{t("playground.logs.allStatus")}</option>
            {LOG_STATUSES.map((st) => (
              <option key={st} value={st}>
                {t(`playground.logStatus.${st}`)}
              </option>
            ))}
          </select>
        </div>
        <div className="text-[11px] text-faint mb-3">{t("playground.logs.hint")}</div>
        {logs.length === 0 ? (
          <div className="text-faint2 text-[12.5px] text-center" style={{ padding: "24px 0" }}>
            {t("playground.logs.empty")}
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table className="w-full text-[11.5px]" style={{ borderCollapse: "collapse", minWidth: 720 }}>
              <thead>
                <tr className="bg-surface2 text-muted font-bold text-left">
                  <th className="px-3 py-2 whitespace-nowrap">{t("playground.logs.colTime")}</th>
                  <th className="px-3 py-2">{t("playground.logs.colMode")}</th>
                  <th className="px-3 py-2">{t("playground.logs.colVersion")}</th>
                  <th className="px-3 py-2">{t("playground.logs.colInput")}</th>
                  <th className="px-3 py-2">{t("playground.logs.colOutput")}</th>
                  <th className="px-3 py-2 text-right whitespace-nowrap">{t("playground.logs.colLatency")}</th>
                  <th className="px-3 py-2">{t("playground.logs.colStatus")}</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((lg) => (
                  <tr key={lg.id} data-testid={`pg-log-${lg.id}`} className="border-t border-border-soft">
                    <td className="px-3 py-2 mono text-faint whitespace-nowrap">{fmtLogTime(lg.created_at)}</td>
                    <td className="px-3 py-2 mono text-text2">{lg.mode}</td>
                    <td className="px-3 py-2 mono" style={{ color: "#7c3aed" }}>
                      {lg.version ?? (lg.version_id ? lg.version_id.slice(0, 8) : t("playground.logs.noVersion"))}
                    </td>
                    <td className="px-3 py-2 mono text-text2 max-w-[160px] truncate" title={lg.input_summary}>
                      {lg.input_summary}
                    </td>
                    <td className="px-3 py-2 mono text-text2 max-w-[160px] truncate" title={lg.output_summary}>
                      {lg.output_summary}
                    </td>
                    <td className="px-3 py-2 mono text-right whitespace-nowrap">{lg.latency_ms} ms</td>
                    <td className="px-3 py-2">
                      <span
                        className="inline-flex items-center gap-1.5 mono text-[11px] font-bold"
                        style={{ color: LOG_STATUS_COLOR[lg.status] ?? "var(--muted)" }}
                      >
                        <span
                          style={{
                            width: 6,
                            height: 6,
                            borderRadius: "50%",
                            background: LOG_STATUS_COLOR[lg.status] ?? "var(--muted)",
                          }}
                        />
                        {t(`playground.logStatus.${lg.status}`, { defaultValue: lg.status })}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
