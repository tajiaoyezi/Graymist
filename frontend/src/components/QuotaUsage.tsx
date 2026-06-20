import { useTranslation } from "react-i18next";

import type { QuotaInfo, ResourceQuota } from "../types";

const DIMS: (keyof ResourceQuota)[] = ["cpu", "memory", "gpu"];

// 平台剩余配额双段条:已用段(实色) + 本次待占段(半透明叠加),超额高亮(2.6)。
export function QuotaUsage({ quota, pending }: { quota: QuotaInfo; pending: ResourceQuota }) {
  const { t } = useTranslation();
  const preview = {
    cpu: quota.remaining.cpu - pending.cpu,
    memory: quota.remaining.memory - pending.memory,
    gpu: quota.remaining.gpu - pending.gpu,
  };
  const over = DIMS.some((d) => preview[d] < 0);

  return (
    <div className="space-y-2.5">
      <div className="font-bold text-sm">{t("quota.title")}</div>
      {DIMS.map((d) => {
        const total = quota.total[d] || 1;
        const usedPct = Math.max(0, Math.min(100, (quota.used[d] / total) * 100));
        const projPct = Math.max(
          0,
          Math.min(100 - usedPct, (pending[d] / total) * 100),
        );
        const dimOver = preview[d] < 0;
        return (
          <div key={d} data-testid={`quota-${d}`}>
            <div className="flex justify-between text-[11px] mb-1">
              <span className="text-text2 font-bold">{t(`quota.${d}`)}</span>
              <span className="mono" style={{ color: dimOver ? "#dc2626" : "var(--muted)" }}>
                {t("quota.remaining")} {quota.remaining[d]} · {t("quota.afterDeploy")}{" "}
                {preview[d]}
              </span>
            </div>
            <div
              className="flex h-[7px] rounded overflow-hidden"
              style={{ background: "var(--surface)" }}
            >
              <div style={{ width: `${usedPct}%`, background: "var(--muted)" }} />
              <div
                style={{
                  width: `${projPct}%`,
                  background: dimOver ? "#dc2626" : "var(--accent)",
                  opacity: 0.55,
                }}
              />
            </div>
          </div>
        );
      })}
      {over && (
        <div data-testid="quota-over" className="text-red-600 text-xs">
          {t("quota.over")}
        </div>
      )}
    </div>
  );
}
