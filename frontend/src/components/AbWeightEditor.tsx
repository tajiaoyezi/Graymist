import { useTranslation } from "react-i18next";

import { weightsValid } from "../domain/endpointStateMachine";

export interface WeightBinding {
  model_version_id: string;
  weight: number;
  label?: string;
}

// A/B 权重编辑器：实时显示权重之和，和≠100（或单条越界）时报错。
// 校验有效性由 weightsValid 提供，父表单据此禁用提交（5.7）。
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
    <div className="space-y-2">
      {bindings.map((b) => (
        <div key={b.model_version_id} className="flex items-center gap-2">
          <span className="text-sm">{b.label ?? b.model_version_id}</span>
          <input
            type="number"
            data-testid={`weight-input-${b.model_version_id}`}
            value={b.weight}
            onChange={(e) => setWeight(b.model_version_id, e.target.value)}
            className="border rounded px-2 py-1 w-24"
          />
          <span className="text-xs text-gray-500">{t("endpoint.weight")}</span>
        </div>
      ))}
      <div className="text-sm" data-testid="weight-sum">
        {t("endpoint.weightSum")}: {sum}
      </div>
      {!valid && (
        <div data-testid="weight-error" className="text-red-600 text-sm">
          {t("endpoint.weightError")}
        </div>
      )}
    </div>
  );
}
