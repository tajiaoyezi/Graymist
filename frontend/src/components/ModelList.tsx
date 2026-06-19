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
      <div className="flex gap-3">
        <select
          data-testid="filter-task-type"
          aria-label={t("filter.taskType")}
          value={taskType}
          onChange={(e) => setTaskType(e.target.value)}
          className="border rounded px-2 py-1"
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
          className="border rounded px-2 py-1 flex-1"
        />
      </div>
      <ul className="grid gap-2">
        {items.map((m) => (
          <li
            key={m.id}
            data-testid="model-item"
            className="border rounded p-3 cursor-pointer hover:bg-gray-50"
            onClick={() => onOpen?.(m.id)}
          >
            <div className="font-medium">{m.name}</div>
            <div className="text-sm text-gray-500">
              {t(`taskType.${m.task_type}`)} · {m.description}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
