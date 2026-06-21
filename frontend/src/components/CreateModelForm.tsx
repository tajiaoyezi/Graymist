import { useState } from "react";
import type { FormEvent } from "react";
import { useTranslation } from "react-i18next";

import { ApiError } from "../api/client";
import { parseSchemaInput } from "../lib/schema";
import type { TaskType } from "../types";

export interface CreateModelInput {
  name: string;
  description: string;
  task_type: TaskType;
  custom_task_type: string | null;
  input_schema: Record<string, unknown>;
  output_schema: Record<string, unknown>;
}

const TASK_TYPES: TaskType[] = [
  "classification",
  "generation",
  "embedding",
  "custom",
];

const INPUT =
  "border border-border rounded-[9px] px-3 py-2 w-full bg-panel text-sm outline-none mt-1";

// 「插入示例」用的最小可用对象型 Schema(含 type/properties/required),
// 让新手照着改、并保证 Playground 能据 input_schema 生成动态表单。
const INPUT_EXAMPLE = {
  type: "object",
  properties: { text: { type: "string" } },
  required: ["text"],
};
const OUTPUT_EXAMPLE = {
  type: "object",
  properties: { label: { type: "string" }, score: { type: "number" } },
};

// 缺 properties 的对象 Schema(如空 {})→ Playground 无法据此生成输入表单,给非阻断提示。
function lacksProperties(text: string): boolean {
  try {
    const s = JSON.parse(text);
    return !s || typeof s !== "object" || s.type !== "object" || !s.properties;
  } catch {
    return false; // 非法 JSON 由提交校验报错,这里不重复提示
  }
}

export function CreateModelForm({
  onSubmit,
}: {
  onSubmit: (model: CreateModelInput) => void;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [taskType, setTaskType] = useState<TaskType>("classification");
  const [customTaskType, setCustomTaskType] = useState("");
  const [inputSchema, setInputSchema] = useState("{}");
  const [outputSchema, setOutputSchema] = useState("{}");
  const [error, setError] = useState("");

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setError(`${t("field.name")}: ${t("error.required")}`);
      return;
    }
    if (taskType === "custom" && !customTaskType.trim()) {
      setError(`${t("field.customTaskType")}: ${t("error.required")}`);
      return;
    }
    const inp = parseSchemaInput(inputSchema);
    if (!inp.ok) {
      setError(`${t("field.inputSchema")}: ${t(inp.error)}`);
      return;
    }
    const out = parseSchemaInput(outputSchema);
    if (!out.ok) {
      setError(`${t("field.outputSchema")}: ${t(out.error)}`);
      return;
    }
    setError("");
    try {
      await onSubmit({
        name,
        description,
        task_type: taskType,
        custom_task_type: taskType === "custom" ? customTaskType.trim() : null,
        input_schema: inp.value,
        output_schema: out.value,
      });
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : String(err));
    }
  }

  // 一键格式化:把 textarea 里的 JSON 美化为 2 空格缩进;非法 JSON 则提示且不改内容。
  function formatSchema(raw: string, setValue: (v: string) => void, label: string) {
    try {
      setValue(JSON.stringify(JSON.parse(raw), null, 2));
      setError("");
    } catch {
      setError(`${label}: ${t("error.invalidJson")}`);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-3 max-w-xl bg-panel border border-border rounded-[14px] p-5"
    >
      <label className="block">
        <span className="text-xs font-bold text-muted">
          {t("field.name")} <span className="text-danger">*</span>
        </span>
        <input
          data-testid="input-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className={INPUT}
        />
      </label>
      <label className="block">
        <span className="text-xs font-bold text-muted">{t("field.description")}</span>
        <input
          data-testid="input-description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className={INPUT}
        />
      </label>
      <label className="block">
        <span className="text-xs font-bold text-muted">{t("filter.taskType")}</span>
        <select
          data-testid="input-task-type"
          value={taskType}
          onChange={(e) => setTaskType(e.target.value as TaskType)}
          className={INPUT}
        >
          {TASK_TYPES.map((tt) => (
            <option key={tt} value={tt}>
              {t(`taskType.${tt}`)}
            </option>
          ))}
        </select>
      </label>
      {taskType === "custom" && (
        <label className="block">
          <span className="text-xs font-bold text-muted">{t("field.customTaskType")}</span>
          <input
            data-testid="input-custom-task-type"
            value={customTaskType}
            onChange={(e) => setCustomTaskType(e.target.value)}
            placeholder={t("field.customTaskTypeHint")}
            className={INPUT}
          />
        </label>
      )}
      <label className="block">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold text-muted">{t("field.inputSchema")}</span>
          <div className="flex gap-2">
            <button
              type="button"
              data-testid="example-input-schema"
              onClick={() => {
                setInputSchema(JSON.stringify(INPUT_EXAMPLE, null, 2));
                setError("");
              }}
              className="border border-border rounded-md px-2.5 py-1 text-[11px] font-bold text-text2 bg-panel hover:bg-surface transition"
            >
              {t("action.insertExample")}
            </button>
            <button
              type="button"
              data-testid="format-input-schema"
              onClick={() => formatSchema(inputSchema, setInputSchema, t("field.inputSchema"))}
              className="border border-border rounded-md px-2.5 py-1 text-[11px] font-bold text-accent bg-accent-soft hover:opacity-80 transition"
            >
              {t("action.formatJson")}
            </button>
          </div>
        </div>
        <textarea
          data-testid="input-schema"
          value={inputSchema}
          onChange={(e) => setInputSchema(e.target.value)}
          rows={4}
          className={`${INPUT} mono`}
        />
        <div className="text-[11px] text-faint mt-1">{t("field.schemaHint")}</div>
        {lacksProperties(inputSchema) && (
          <div
            data-testid="schema-noprops-warn"
            className="text-[11px] mt-1"
            style={{ color: "#d97706" }}
          >
            {t("field.schemaNoPropsWarn")}
          </div>
        )}
      </label>
      <label className="block">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold text-muted">{t("field.outputSchema")}</span>
          <div className="flex gap-2">
            <button
              type="button"
              data-testid="example-output-schema"
              onClick={() => {
                setOutputSchema(JSON.stringify(OUTPUT_EXAMPLE, null, 2));
                setError("");
              }}
              className="border border-border rounded-md px-2.5 py-1 text-[11px] font-bold text-text2 bg-panel hover:bg-surface transition"
            >
              {t("action.insertExample")}
            </button>
            <button
              type="button"
              data-testid="format-output-schema"
              onClick={() => formatSchema(outputSchema, setOutputSchema, t("field.outputSchema"))}
              className="border border-border rounded-md px-2.5 py-1 text-[11px] font-bold text-accent bg-accent-soft hover:opacity-80 transition"
            >
              {t("action.formatJson")}
            </button>
          </div>
        </div>
        <textarea
          data-testid="output-schema"
          value={outputSchema}
          onChange={(e) => setOutputSchema(e.target.value)}
          rows={4}
          className={`${INPUT} mono`}
        />
        <div className="text-[11px] text-faint mt-1">{t("field.schemaHint")}</div>
      </label>
      {error && (
        <div data-testid="schema-error" className="text-danger text-sm">
          {error}
        </div>
      )}
      <button
        data-testid="submit"
        type="submit"
        className="bg-accent text-white rounded-[10px] px-4 py-2 font-bold text-sm"
      >
        {t("action.create")}
      </button>
    </form>
  );
}
