import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

import type { Api } from "../api/client";
import type { Model, TaskType } from "../types";

const TASK_TYPES: TaskType[] = [
  "classification",
  "generation",
  "embedding",
  "custom",
];

// 版本状态筛选项(客户端按 latest_version_status 过滤;"none"=无版本)。
const STATUS_FILTERS = ["ready", "validating", "draft", "archived"] as const;
const SORTS = ["updated", "name", "versions"] as const;
type SortBy = (typeof SORTS)[number];

// 最新版本状态点配色（与原型 _statusMeta 一致）。
const STATUS_DOT: Record<string, string> = {
  draft: "var(--muted)",
  validating: "#d97706",
  ready: "#16a34a",
  archived: "var(--faint)",
};

const SELECT =
  "h-[38px] rounded-[10px] border border-border bg-panel px-3 text-sm font-medium text-text2 outline-none";

export function ModelList({
  api,
}: {
  api: Pick<Api, "listModels">;
}) {
  const { t } = useTranslation();
  const [items, setItems] = useState<Model[]>([]);
  const [taskType, setTaskType] = useState("");
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [sortBy, setSortBy] = useState<SortBy>("updated");
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);
    api
      .listModels({ task_type: taskType || undefined, q: q || undefined })
      .then((rows) => {
        if (!active) return;
        setItems(Array.isArray(rows) ? rows : []); // 兜底:响应非数组时不崩溃白屏
        setError(false);
        setLoading(false);
      })
      .catch(() => {
        if (active) {
          setItems([]);
          setError(true);
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [api, taskType, q]);

  // 版本状态筛选 + 排序均为客户端处理(数据已含 latest_version_status/updated_at/version_count)。
  const shown = items
    .filter((m) => {
      if (!statusFilter) return true;
      if (statusFilter === "none") return !m.latest_version_status;
      return m.latest_version_status === statusFilter;
    })
    .sort((a, b) => {
      if (sortBy === "name") return a.name.localeCompare(b.name);
      if (sortBy === "versions") return b.version_count - a.version_count;
      return (b.updated_at ?? "").localeCompare(a.updated_at ?? ""); // 最近更新
    });

  const hasFilters = !!(q || taskType || statusFilter);
  const clearFilters = () => {
    setQ("");
    setTaskType("");
    setStatusFilter("");
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-2.5 items-center flex-wrap">
        <select
          data-testid="filter-task-type"
          aria-label={t("filter.taskType")}
          value={taskType}
          onChange={(e) => setTaskType(e.target.value)}
          className={SELECT}
        >
          <option value="">{t("filter.all")}</option>
          {TASK_TYPES.map((tt) => (
            <option key={tt} value={tt}>
              {t(`taskType.${tt}`)}
            </option>
          ))}
        </select>
        <select
          data-testid="filter-status"
          aria-label={t("filter.status")}
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className={SELECT}
        >
          <option value="">{t("filter.allStatus")}</option>
          {STATUS_FILTERS.map((s) => (
            <option key={s} value={s}>
              {t(`status.${s}`)}
            </option>
          ))}
          <option value="none">{t("filter.noVersion")}</option>
        </select>
        <select
          data-testid="sort-by"
          aria-label={t("sort.label")}
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as SortBy)}
          className={SELECT}
        >
          {SORTS.map((s) => (
            <option key={s} value={s}>
              {t(`sort.${s}`)}
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

      {error ? (
        <div data-testid="list-error" className="text-danger text-sm">
          {t("error.load")}
        </div>
      ) : loading ? (
        <div data-testid="list-loading" className="text-faint text-sm text-center py-12">
          {t("list.loading")}
        </div>
      ) : shown.length === 0 ? (
        <div data-testid="list-empty" className="text-center py-14">
          {hasFilters ? (
            <>
              <div className="text-faint text-sm mb-3">{t("list.emptyFiltered")}</div>
              <button
                type="button"
                data-testid="clear-filters"
                onClick={clearFilters}
                className="border border-border rounded-lg px-3 py-1.5 text-xs font-bold text-text2 bg-panel hover:bg-surface"
              >
                {t("action.clearFilters")}
              </button>
            </>
          ) : (
            <div className="text-faint text-sm">{t("list.emptyNone")}</div>
          )}
        </div>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill,minmax(330px,1fr))",
            gap: 14,
          }}
        >
          {shown.map((m) => (
            <Link
              key={m.id}
              to={`/models/${m.id}`}
              data-testid="model-item"
              className="block no-underline text-text bg-panel border border-border rounded-[14px] cursor-pointer transition hover:shadow-md hover:border-accent"
              style={{ padding: "17px 18px" }}
            >
              <div className="flex justify-between items-start gap-2.5">
                <div className="font-extrabold text-[15px] tracking-tight">{m.name}</div>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-md whitespace-nowrap text-text2 bg-surface">
                  {m.task_type === "custom" && m.custom_task_type
                    ? m.custom_task_type
                    : t(`taskType.${m.task_type}`)}
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
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
