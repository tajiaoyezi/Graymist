import { useState } from "react";
import { useTranslation } from "react-i18next";

// 推理 Playground 静态骨架(§2.7):仅外观与本地占位 state,不联后端、不发请求;行为留待 a3。
export function PlaygroundPage() {
  const { t } = useTranslation();
  const [mode, setMode] = useState<"sync" | "async">("sync");
  const [endpoint, setEndpoint] = useState("");
  const [input, setInput] = useState("");

  const card = "bg-panel border border-border rounded-[14px]";
  const modeBtn = (active: boolean) =>
    `px-3.5 py-1.5 rounded-lg text-[12.5px] font-bold ${active ? "text-white" : "text-text2"}`;

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
          <div className="text-[11px] text-faint font-bold mb-1.5">
            {t("playground.selectEndpoint")}
          </div>
          <select
            value={endpoint}
            onChange={(e) => setEndpoint(e.target.value)}
            className="h-[38px] w-full rounded-[9px] border border-border bg-panel px-2.5 text-sm outline-none mb-4"
          >
            <option value="">{t("playground.selectEndpoint")} --</option>
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

          <div className="text-[11px] text-faint font-bold mb-1.5">
            {t("playground.inputLabel")}
          </div>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={t("playground.inputPlaceholder")}
            className="w-full rounded-[9px] border border-border bg-panel px-3 py-2.5 text-sm outline-none mb-4"
            style={{ height: 120, resize: "vertical" }}
          />

          <button
            type="button"
            className="w-full h-[40px] rounded-[10px] text-white font-bold text-sm"
            style={{ background: "var(--accent)" }}
          >
            {t("playground.send")}
          </button>
        </div>

        {/* 响应 + 历史 */}
        <div className="space-y-3.5">
          <div className={card} style={{ padding: "18px 20px", minHeight: 200 }}>
            <div className="font-extrabold text-[13px] mb-3">{t("playground.response")}</div>
            <div className="text-faint2 text-[13px] text-center" style={{ padding: "30px 0" }}>
              {t("playground.responseEmpty")}
            </div>
          </div>

          <div className={card} style={{ overflow: "hidden" }}>
            <div className="px-[18px] py-3 border-b border-border-soft font-extrabold text-[13px]">
              {t("playground.history")}
            </div>
            <div className="text-faint2 text-[12.5px] text-center" style={{ padding: 18 }}>
              {t("playground.histEmpty")}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
