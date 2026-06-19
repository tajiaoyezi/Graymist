import { useTranslation } from "react-i18next";

import type { QuotaInfo, ResourceQuota } from "../types";

const DIMS: (keyof ResourceQuota)[] = ["cpu", "memory", "gpu"];

// 实时显示平台剩余配额，并叠加当前表单待占用量预览部署后剩余；超额则高亮（2.6）。
export function QuotaUsage({ quota, pending }: { quota: QuotaInfo; pending: ResourceQuota }) {
  const { t } = useTranslation();
  const preview = {
    cpu: quota.remaining.cpu - pending.cpu,
    memory: quota.remaining.memory - pending.memory,
    gpu: quota.remaining.gpu - pending.gpu,
  };
  const over = DIMS.some((d) => preview[d] < 0);

  return (
    <div className="text-sm space-y-1">
      <div className="font-semibold">{t("quota.title")}</div>
      {DIMS.map((d) => (
        <div key={d} data-testid={`quota-${d}`}>
          {t(`quota.${d}`)}: {t("quota.remaining")} {quota.remaining[d]} · {t("quota.afterDeploy")}{" "}
          {preview[d]}
        </div>
      ))}
      {over && (
        <div data-testid="quota-over" className="text-red-600">
          {t("quota.over")}
        </div>
      )}
    </div>
  );
}
