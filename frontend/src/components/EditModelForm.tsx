import { useState } from "react";
import type { FormEvent } from "react";
import { useTranslation } from "react-i18next";

import { ApiError } from "../api/client";
import type { Model } from "../types";

// 模型编辑表单:仅暴露 name / description。
// task_type 与输入/输出 Schema 是模型结构身份,改了会破坏既有版本/端点/Playground 契约,
// 故不在此处编辑(需换 Schema 应新建模型),见 model-edit-delete 提案。
const INPUT =
  "border border-border rounded-[9px] px-3 py-2 w-full bg-panel text-sm outline-none mt-1";

export function EditModelForm({
  model,
  onSubmit,
  onCancel,
}: {
  model: Model;
  onSubmit: (fields: { name: string; description: string }) => Promise<void>;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState(model.name);
  const [description, setDescription] = useState(model.description);
  const [error, setError] = useState("");

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setError(t("error.required"));
      return;
    }
    setError("");
    try {
      await onSubmit({ name: name.trim(), description });
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : String(err));
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div
        data-testid="edit-lock-hint"
        className="text-[11px] text-faint bg-surface2 rounded-md px-2.5 py-2 leading-relaxed"
      >
        {t("models.editLockHint")}
      </div>
      <label className="block">
        <span className="text-xs font-bold text-muted">{t("field.name")}</span>
        <input
          data-testid="edit-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className={INPUT}
        />
      </label>
      <label className="block">
        <span className="text-xs font-bold text-muted">{t("field.description")}</span>
        <input
          data-testid="edit-description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className={INPUT}
        />
      </label>
      {error && (
        <div data-testid="edit-error" className="text-danger text-sm">
          {error}
        </div>
      )}
      <div className="flex justify-end gap-2.5">
        <button
          type="button"
          data-testid="edit-cancel"
          onClick={onCancel}
          className="border border-border rounded-[10px] px-4 py-2 font-bold text-sm text-text2 bg-panel"
        >
          {t("action.cancel")}
        </button>
        <button
          type="submit"
          data-testid="edit-save"
          className="bg-accent text-white rounded-[10px] px-4 py-2 font-bold text-sm"
        >
          {t("action.save")}
        </button>
      </div>
    </form>
  );
}
