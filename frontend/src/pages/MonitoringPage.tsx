import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { CartesianGrid, Line, LineChart, Tooltip, XAxis, YAxis } from "recharts";

import { ApiError, api } from "../api/client";
import type { Endpoint, Metrics, QuotaInfo } from "../types";

// 监控仪表盘(§2.8):接通真实 monitoring API —— 端点选择、时间范围、可配置间隔自动刷新,
// 五项指标卡 + QPS/延迟(均值+P99)/错误率/A-B 对比折线 + 资源总览(复用 /quota)。布局沿用
// ui-redesign 骨架,仅换数据源;不含成本/token/LLM/告警(超纲)。
const RANGES = [
  { key: "1h", labelKey: "monitoring.range1h" },
  { key: "24h", labelKey: "monitoring.range24h" },
  { key: "7d", labelKey: "monitoring.range7d" },
] as const;

const INTERVALS = [5000, 10000, 30000];
const COLORS = ["var(--accent)", "#16a34a", "#f59e0b", "#0891b2", "#dc2626", "#7c3aed"];

function pctOf(used: number, total: number): number {
  return total > 0 ? Math.round((used / total) * 100) : 0;
}

export function MonitoringPage() {
  const { t } = useTranslation();
  const [endpoints, setEndpoints] = useState<Endpoint[]>([]);
  const [endpointId, setEndpointId] = useState("");
  const [range, setRange] = useState<string>("24h");
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [intervalMs, setIntervalMs] = useState(5000);
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [quota, setQuota] = useState<QuotaInfo | null>(null);
  const [error, setError] = useState("");

  const alive = useRef(true);

  // 加载端点列表(全部端点,含历史 —— 复用既有 listEndpoints)。
  useEffect(() => {
    alive.current = true;
    void (async () => {
      try {
        const eps = await api.listEndpoints();
        if (!alive.current) return;
        setEndpoints(eps);
        if (eps.length && !endpointId) setEndpointId(eps[0].id);
      } catch (e) {
        if (alive.current) setError(e instanceof ApiError ? e.detail : "加载端点失败");
      }
    })();
    return () => {
      alive.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 拉取指标 + 资源(端点/范围/自动刷新/间隔变化时重建);autoRefresh 时按可配置间隔轮询。
  useEffect(() => {
    if (!endpointId) return;
    let cancelled = false;
    async function load() {
      try {
        const [m, q] = await Promise.all([api.getMetrics(endpointId, range), api.getQuota()]);
        if (cancelled || !alive.current) return;
        setMetrics(m);
        setQuota(q);
        setError("");
      } catch (e) {
        if (!cancelled && alive.current) setError(e instanceof ApiError ? e.detail : "加载监控失败");
      }
    }
    void load();
    if (!autoRefresh) return () => { cancelled = true; };
    const id = window.setInterval(() => void load(), intervalMs);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [endpointId, range, autoRefresh, intervalMs]);

  function fmtT(iso: string): string {
    const d = new Date(iso);
    if (range === "7d") return `${d.getMonth() + 1}-${d.getDate()}`;
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  }
  const fmtQps = (q: number) => (q >= 1 ? q.toFixed(1) : q.toFixed(3));

  const buckets = metrics?.buckets ?? [];
  const qpsData = buckets.map((b) => ({ t: fmtT(b.t), v: b.qps }));
  const latData = buckets.map((b) => ({ t: fmtT(b.t), avg: b.avg_latency_ms, p99: b.p99_latency_ms }));
  const errData = buckets.map((b) => ({ t: fmtT(b.t), v: b.error_rate }));
  const versions = metrics?.versions ?? [];
  const abData = buckets.map((b, i) => {
    const row: Record<string, unknown> = { t: fmtT(b.t) };
    versions.forEach((v, j) => {
      row[`v${j}`] = v.buckets[i]?.qps ?? 0;
    });
    return row;
  });

  const s = metrics?.summary;
  const card = "bg-panel border border-border rounded-[14px]";
  const cards = [
    { label: t("monitoring.qps"), value: s ? fmtQps(s.qps) : "—", unit: "/s", color: "var(--text)" },
    { label: t("monitoring.avgLatency"), value: s ? String(s.avg_latency_ms) : "—", unit: "ms", color: "var(--text)" },
    { label: t("monitoring.p99"), value: s ? String(s.p99_latency_ms) : "—", unit: "ms", color: "#f59e0b" },
    { label: t("monitoring.errorRate"), value: s ? s.error_rate.toFixed(2) : "—", unit: "%", color: "#16a34a" },
    { label: t("monitoring.concurrency"), value: metrics ? String(metrics.current_concurrency) : "—", unit: "", color: "var(--text)" },
  ];

  const RES = quota
    ? [
        { label: t("quota.cpu"), pct: pctOf(quota.used.cpu, quota.total.cpu), color: "#4f46e5" },
        { label: t("quota.memory"), pct: pctOf(quota.used.memory, quota.total.memory), color: "#0891b2" },
        { label: t("quota.gpu"), pct: pctOf(quota.used.gpu, quota.total.gpu), color: "#7c3aed" },
      ]
    : [];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <div>
          <div className="flex items-center gap-2.5">
            <h2 className="m-0 text-xl font-extrabold tracking-tight">{t("nav.monitoring")}</h2>
            <span className="mono text-[10px] font-extrabold text-accent bg-accent-soft px-2 py-0.5 rounded-md">
              v1.0
            </span>
          </div>
          <div className="text-muted text-[12.5px] mt-1">{t("monitoring.subtitle")}</div>
        </div>
        <div className="flex-1" />
        <select
          data-testid="mon-endpoint"
          value={endpointId}
          onChange={(e) => setEndpointId(e.target.value)}
          className="h-9 rounded-[9px] border border-border bg-panel px-3 text-[13px] font-bold outline-none"
        >
          <option value="">{endpoints.length ? t("monitoring.selectEndpoint") : t("monitoring.noEndpoints")}</option>
          {endpoints.map((e) => (
            <option key={e.id} value={e.id}>
              {e.name}
            </option>
          ))}
        </select>
        <div className="flex rounded-[9px] p-[3px]" style={{ background: "var(--surface)" }}>
          {RANGES.map((r) => (
            <button
              key={r.key}
              type="button"
              onClick={() => setRange(r.key)}
              className={`px-3 py-1.5 rounded-lg text-[12.5px] font-bold ${range === r.key ? "text-white" : "text-text2"}`}
              style={range === r.key ? { background: "var(--accent)" } : undefined}
            >
              {t(r.labelKey)}
            </button>
          ))}
        </div>
        <button
          type="button"
          aria-pressed={autoRefresh}
          onClick={() => setAutoRefresh((v) => !v)}
          className="h-9 px-3 rounded-[9px] border border-border bg-panel text-[12.5px] font-bold text-text2 flex items-center gap-1.5"
        >
          <span style={{ width: 7, height: 7, borderRadius: "50%", background: autoRefresh ? "#16a34a" : "var(--faint)" }} />
          {t("monitoring.autoRefresh")}
        </button>
        <select
          data-testid="mon-interval"
          aria-label={t("monitoring.refreshInterval")}
          value={intervalMs}
          disabled={!autoRefresh}
          onChange={(e) => setIntervalMs(Number(e.target.value))}
          className="h-9 rounded-[9px] border border-border bg-panel px-2 text-[12.5px] font-bold outline-none disabled:opacity-40"
        >
          {INTERVALS.map((ms) => (
            <option key={ms} value={ms}>
              {ms / 1000}s
            </option>
          ))}
        </select>
      </div>

      {error && <div data-testid="mon-error" className="text-red-600 text-sm">{error}</div>}

      {/* metric cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 12 }}>
        {cards.map((c) => (
          <div key={c.label} className={card} style={{ padding: "14px 16px" }}>
            <div className="text-[11px] text-faint font-bold">{c.label}</div>
            <div className="flex items-baseline gap-1 mt-1.5">
              <span className="mono text-[23px] font-extrabold" style={{ color: c.color }}>
                {c.value}
              </span>
              <span className="text-xs text-faint font-bold">{c.unit}</span>
            </div>
          </div>
        ))}
      </div>

      {/* charts */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        <div className={card} style={{ padding: "16px 18px" }}>
          <div className="font-extrabold text-[13.5px] mb-2.5">{t("monitoring.qps")}</div>
          <LineChart width={420} height={200} data={qpsData}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis dataKey="t" stroke="var(--muted)" fontSize={11} />
            <YAxis stroke="var(--muted)" fontSize={11} />
            <Tooltip />
            <Line type="monotone" dataKey="v" stroke="var(--accent)" strokeWidth={2} dot={false} />
          </LineChart>
        </div>
        <div className={card} style={{ padding: "16px 18px" }}>
          <div className="font-extrabold text-[13.5px] mb-2.5">{t("monitoring.latencyDist")}</div>
          <LineChart width={420} height={200} data={latData}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis dataKey="t" stroke="var(--muted)" fontSize={11} />
            <YAxis stroke="var(--muted)" fontSize={11} />
            <Tooltip />
            <Line type="monotone" dataKey="avg" name={t("monitoring.avg")} stroke="#0891b2" strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="p99" name="P99" stroke="#f59e0b" strokeWidth={2} dot={false} />
          </LineChart>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        <div className={card} style={{ padding: "16px 18px" }}>
          <div className="font-extrabold text-[13.5px] mb-2.5">{t("monitoring.errorRate")} (%)</div>
          <LineChart width={420} height={200} data={errData}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis dataKey="t" stroke="var(--muted)" fontSize={11} />
            <YAxis stroke="var(--muted)" fontSize={11} />
            <Tooltip />
            <Line type="monotone" dataKey="v" stroke="#dc2626" strokeWidth={2} dot={false} />
          </LineChart>
        </div>
        <div className={card} style={{ padding: "16px 18px" }}>
          <div className="font-extrabold text-[13.5px] mb-2.5">{t("monitoring.abCompare")}</div>
          <LineChart width={420} height={200} data={abData}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis dataKey="t" stroke="var(--muted)" fontSize={11} />
            <YAxis stroke="var(--muted)" fontSize={11} />
            <Tooltip />
            {versions.map((v, j) => (
              <Line
                key={v.version_id}
                type="monotone"
                dataKey={`v${j}`}
                name={v.version_id.slice(0, 8)}
                stroke={COLORS[j % COLORS.length]}
                strokeWidth={2}
                dot={false}
              />
            ))}
          </LineChart>
        </div>
      </div>

      <div className={card} style={{ padding: "16px 18px" }}>
        <div className="font-extrabold text-[13.5px] mb-3">{t("monitoring.resource")}</div>
        <div className="space-y-3">
          {RES.map((r) => (
            <div key={r.label}>
              <div className="flex justify-between text-[11.5px] mb-1">
                <span className="text-text2 font-bold">{r.label}</span>
                <span className="mono text-faint">{r.pct}%</span>
              </div>
              <div className="h-2 rounded" style={{ background: "var(--surface)" }}>
                <div style={{ width: `${r.pct}%`, height: "100%", background: r.color, borderRadius: 4 }} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
