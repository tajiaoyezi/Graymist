import { useTranslation } from "react-i18next";

import { weightsValid } from "../domain/endpointStateMachine";

export interface WeightBinding {
  model_version_id: string;
  weight: number;
  label?: string;
}

// A/B 权重编辑器:滑块 + 同步数值框(保留 weight-input testid 与无障碍可达)。
// 实时显示权重之和,和≠100(或单条越界)时报错;校验由 weightsValid 提供,父表单据此禁用提交。
export function AbWeightEditor({
  bindings,
  onChange,
}: {
  bindings: WeightBinding[];
  onChange: (b: WeightBinding[]) => void;
}) {
  const { t } = useTranslation();
  const sum = bindings.reduce((a, b) => a + (Number.isFinite(b.weight) ? b.weight : 0), 0);
  const valid = weightsValid(bindings.map((b) => b.weight));

  function setWeight(id: string, raw: string) {
    const w = parseInt(raw, 10);
    onChange(
      bindings.map((b) =>
        b.model_version_id === id ? { ...b, weight: Number.isNaN(w) ? 0 : w } : b,
      ),
    );
  }

  return (
    <div className="space-y-3">
      {bindings.map((b) => (
        <div
          key={b.model_version_id}
          className="bg-surface2 border border-border-soft rounded-[10px] p-2.5"
        >
          <div className="flex items-center gap-2.5">
            <span className="mono text-[13px] font-bold w-10">
              {b.label ?? b.model_version_id}
            </span>
            <span className="flex-1" />
            <input
              type="number"
              data-testid={`weight-input-${b.model_version_id}`}
              value={b.weight}
              onChange={(e) => setWeight(b.model_version_id, e.target.value)}
              className="mono w-[64px] border border-border rounded-md px-2 py-1 text-right text-sm bg-panel outline-none"
            />
            <span className="text-xs text-muted">%</span>
          </div>
          <input
            type="range"
            min={0}
            max={100}
            value={Number.isFinite(b.weight) ? b.weight : 0}
            onChange={(e) => setWeight(b.model_version_id, e.target.value)}
            aria-label={`${b.label ?? b.model_version_id} ${t("endpoint.weight")}`}
            className="w-full mt-2 cursor-pointer"
            style={{ accentColor: "var(--accent)" }}
          />
        </div>
      ))}
      <div
        data-testid="weight-sum"
        className="text-sm font-extrabold"
        style={{ color: valid ? "var(--text)" : "#dc2626" }}
      >
        {t("endpoint.weightSum")}: {sum}%
      </div>
      {!valid && (
        <div data-testid="weight-error" className="text-red-600 text-sm">
          {t("endpoint.weightError")}
        </div>
      )}
    </div>
  );
}
