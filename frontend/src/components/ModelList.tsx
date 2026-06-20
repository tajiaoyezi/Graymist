import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import type { Api } from "../api/client";
import type { Model, TaskType } from "../types";

const TASK_TYPES: TaskType[] = [
  "classification",
  "generation",
  "embedding",
  "custom",
];

// 最新版本状态点配色（与原型 _statusMeta 一致）。
const STATUS_DOT: Record<string, string> = {
  draft: "var(--muted)",
  validating: "#d97706",
  ready: "#16a34a",
  archived: "var(--faint)",
};

export function ModelList({
  api,
  onOpen,
}: {
  api: Pick<Api, "listModels">;
  onOpen?: (id: string) => void;
}) {
  const { t } = useTranslation();
  const [items, setItems] = useState<Model[]>([]);
  const [taskType, setTaskType] = useState("");
  const [q, setQ] = useState("");

  useEffect(() => {
    let active = true;
    api
      .listModels({ task_type: taskType || undefined, q: q || undefined })
      .then((rows) => {
        if (active) setItems(rows);
      });
    return () => {
      active = false;
    };
  }, [api, taskType, q]);

  return (
    <div className="space-y-4">
      <div className="flex gap-2.5 items-center flex-wrap">
        <select
          data-testid="filter-task-type"
          aria-label={t("filter.taskType")}
          value={taskType}
          onChange={(e) => setTaskType(e.target.value)}
          className="h-[38px] rounded-[10px] border border-border bg-panel px-3 text-sm font-medium text-text2 outline-none"
        >
          <option value="">{t("filter.all")}</option>
          {TASK_TYPES.map((tt) => (
            <option key={tt} value={tt}>
              {t(`taskType.${tt}`)}
            </option>
          ))}
        </select>
        <input
          data-testid="search-input"
          aria-label={t("search.placeholder")}
          placeholder={t("search.placeholder")}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="h-[38px] flex-1 min-w-[200px] max-w-[320px] rounded-[10px] border border-border bg-panel px-3.5 text-sm outline-none"
        />
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill,minmax(330px,1fr))",
          gap: 14,
        }}
      >
        {items.map((m) => (
          <div
            key={m.id}
            data-testid="model-item"
            onClick={() => onOpen?.(m.id)}
            className="bg-panel border border-border rounded-[14px] cursor-pointer transition hover:shadow-md hover:border-accent"
            style={{ padding: "17px 18px" }}
          >
            <div className="flex justify-between items-start gap-2.5">
              <div className="font-extrabold text-[15px] tracking-tight">{m.name}</div>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-md whitespace-nowrap text-text2 bg-surface">
                {t(`taskType.${m.task_type}`)}
              </span>
            </div>
            <div
              className="text-faint text-xs mt-1.5 leading-relaxed"
              style={{ minHeight: 34 }}
            >
              {m.description}
            </div>
            <div className="flex items-center justify-between mt-3 pt-2.5 border-t border-border-soft">
              <span className="text-faint text-xs">
                {t("models.versionCount", { count: m.version_count })}
              </span>
              {m.latest_version_status && (
                <span
                  data-testid="model-status"
                  className="inline-flex items-center gap-1.5 text-[11px] font-bold"
                  style={{ color: STATUS_DOT[m.latest_version_status] ?? "var(--faint)" }}
                >
                  <span
                    style={{
                      width: 7,
                      height: 7,
                      borderRadius: "50%",
                      background: STATUS_DOT[m.latest_version_status] ?? "var(--faint)",
                    }}
                  />
                  {t(`status.${m.latest_version_status}`)}
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
