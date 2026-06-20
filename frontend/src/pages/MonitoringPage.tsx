import { useState } from "react";
import { useTranslation } from "react-i18next";
import { CartesianGrid, Line, LineChart, Tooltip, XAxis, YAxis } from "recharts";

// 监控仪表盘静态骨架(§2.8):mock 数据 + 不联后端。图表以"数据 props 注入"形式封装,
// a4 接真实采集时只换数据源、不改布局。覆盖 §2.4 五项指标(含当前并发数);不含成本/LLM(超纲)。
const X = ["t-5", "t-4", "t-3", "t-2", "t-1", "now"];
const QPS = X.map((t, i) => ({ t, v: [120, 138, 131, 156, 149, 162][i] }));
const LAT = X.map((t, i) => ({ t, avg: [42, 45, 41, 48, 44, 46][i], p99: [180, 210, 195, 240, 220, 232][i] }));
const ERR = X.map((t, i) => ({ t, v: [0.4, 0.6, 0.5, 1.1, 0.7, 0.5][i] }));
const AB = X.map((t, i) => ({ t, a: [70, 78, 74, 88, 84, 90][i], b: [50, 60, 57, 68, 65, 72][i] }));
const RES = [
  { label: "CPU", pct: 42, color: "#4f46e5" },
  { label: "内存", pct: 58, color: "#0891b2" },
  { label: "GPU", pct: 31, color: "#7c3aed" },
];

const RANGES = [
  { key: "1h", labelKey: "monitoring.range1h" },
  { key: "24h", labelKey: "monitoring.range24h" },
  { key: "7d", labelKey: "monitoring.range7d" },
] as const;

export function MonitoringPage() {
  const { t } = useTranslation();
  const [endpoint, setEndpoint] = useState("");
  const [range, setRange] = useState<string>("24h");
  const [autoRefresh, setAutoRefresh] = useState(true);

  const card = "bg-panel border border-border rounded-[14px]";
  const cards = [
    { label: t("monitoring.qps"), value: "162", unit: "/s", color: "var(--text)" },
    { label: t("monitoring.avgLatency"), value: "46", unit: "ms", color: "var(--text)" },
    { label: t("monitoring.p99"), value: "232", unit: "ms", color: "#f59e0b" },
    { label: t("monitoring.errorRate"), value: "0.5", unit: "%", color: "#16a34a" },
    { label: t("monitoring.concurrency"), value: "7", unit: "", color: "var(--text)" },
  ];

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
          value={endpoint}
          onChange={(e) => setEndpoint(e.target.value)}
          className="h-9 rounded-[9px] border border-border bg-panel px-3 text-[13px] font-bold outline-none"
        >
          <option value="">{t("monitoring.selectEndpoint")}</option>
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
      </div>

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
          <LineChart width={420} height={200} data={QPS}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis dataKey="t" stroke="var(--muted)" fontSize={11} />
            <YAxis stroke="var(--muted)" fontSize={11} />
            <Tooltip />
            <Line type="monotone" dataKey="v" stroke="var(--accent)" strokeWidth={2} dot={false} />
          </LineChart>
        </div>
        <div className={card} style={{ padding: "16px 18px" }}>
          <div className="font-extrabold text-[13.5px] mb-2.5">{t("monitoring.latencyDist")}</div>
          <LineChart width={420} height={200} data={LAT}>
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
          <LineChart width={420} height={200} data={ERR}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis dataKey="t" stroke="var(--muted)" fontSize={11} />
            <YAxis stroke="var(--muted)" fontSize={11} />
            <Tooltip />
            <Line type="monotone" dataKey="v" stroke="#dc2626" strokeWidth={2} dot={false} />
          </LineChart>
        </div>
        <div className={card} style={{ padding: "16px 18px" }}>
          <div className="font-extrabold text-[13.5px] mb-2.5">{t("monitoring.abCompare")}</div>
          <LineChart width={420} height={200} data={AB}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis dataKey="t" stroke="var(--muted)" fontSize={11} />
            <YAxis stroke="var(--muted)" fontSize={11} />
            <Tooltip />
            <Line type="monotone" dataKey="a" name="A" stroke="var(--accent)" strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="b" name="B" stroke="#16a34a" strokeWidth={2} dot={false} />
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
