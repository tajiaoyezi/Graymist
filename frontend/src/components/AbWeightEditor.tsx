import { useTranslation } from "react-i18next";

import { weightsValid } from "../domain/endpointStateMachine";

export interface WeightBinding {
  model_version_id: string;
  weight: number;
  label?: string;
}

// 把 total 按 currentWeights 比例分配为「每项≥1、整数、和恰为 total」的数组(要求 total≥项数)。
function distribute(total: number, currentWeights: number[]): number[] {
  const n = currentWeights.length;
  if (n === 0) return [];
  const base = currentWeights.reduce((a, b) => a + (b > 0 ? b : 0), 0);
  const raw = currentWeights.map((w) => (base > 0 ? (total * w) / base : total / n));
  const ints = raw.map((r) => Math.max(1, Math.floor(r)));
  let diff = total - ints.reduce((a, b) => a + b, 0);
  const order = raw.map((r, i) => ({ i, frac: r - Math.floor(r) }));
  if (diff > 0) {
    order.sort((a, b) => b.frac - a.frac); // 余数补给小数部分最大者
    for (let k = 0; diff > 0; k++, diff--) ints[order[k % n].i] += 1;
  } else if (diff < 0) {
    order.sort((a, b) => a.frac - b.frac);
    let guard = 0;
    for (let k = 0; diff < 0 && guard < 10000; k++, guard++) {
      const idx = order[k % n].i;
      if (ints[idx] > 1) {
        ints[idx] -= 1;
        diff += 1;
      }
    }
  }
  return ints;
}

// A/B 权重编辑器:滑块 + 同步数值框(保留 weight-input testid 与无障碍可达)。
// 权重「联动」:调任一版本,其余自动按比例补足,权重之和恒为 100%、每条≥1(后端约束)。
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
    const n = bindings.length;
    if (n === 1) {
      // 单版本只能 100%
      onChange(bindings.map((b) => ({ ...b, weight: 100 })));
      return;
    }
    let w = parseInt(raw, 10);
    if (Number.isNaN(w)) w = 0;
    // 钳制:本条 1..(100-其余条数),保证其余每条仍能 ≥1
    w = Math.max(1, Math.min(w, 100 - (n - 1)));
    const others = bindings.filter((b) => b.model_version_id !== id);
    const dist = distribute(100 - w, others.map((o) => o.weight));
    let di = 0;
    onChange(
      bindings.map((b) =>
        b.model_version_id === id ? { ...b, weight: w } : { ...b, weight: dist[di++] },
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
        style={{ color: valid ? "var(--text)" : "var(--danger)" }}
      >
        {t("endpoint.weightSum")}: {sum}%
      </div>
      {bindings.length > 1 && (
        <div className="text-[11px] text-faint">{t("endpoint.weightLinkedHint")}</div>
      )}
      {!valid && (
        <div data-testid="weight-error" className="text-danger text-sm">
          {t("endpoint.weightError")}
        </div>
      )}
    </div>
  );
}
