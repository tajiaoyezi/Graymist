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
  input_schema: Record<string, unknown>;
  output_schema: Record<string, unknown>;
}

const TASK_TYPES: TaskType[] = [
  "classification",
  "generation",
  "embedding",
  "custom",
];

export function CreateModelForm({
  onSubmit,
}: {
  onSubmit: (model: CreateModelInput) => void;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [taskType, setTaskType] = useState<TaskType>("classification");
  const [inputSchema, setInputSchema] = useState("{}");
  const [outputSchema, setOutputSchema] = useState("{}");
  const [error, setError] = useState("");

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const inp = parseSchemaInput(inputSchema);
    if (!inp.ok) {
      setError(`${t("field.inputSchema")}: ${inp.error}`);
      return;
    }
    const out = parseSchemaInput(outputSchema);
    if (!out.ok) {
      setError(`${t("field.outputSchema")}: ${out.error}`);
      return;
    }
    setError("");
    try {
      await onSubmit({
        name,
        description,
        task_type: taskType,
        input_schema: inp.value,
        output_schema: out.value,
      });
    } catch (err) {
      // 后端 4xx（如 422/重名）也回显到表单错误区（M1）
      setError(err instanceof ApiError ? err.detail : String(err));
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3 max-w-xl">
      <label className="block">
        <span className="text-sm">{t("field.name")}</span>
        <input
          data-testid="input-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="border rounded px-2 py-1 w-full"
        />
      </label>
      <label className="block">
        <span className="text-sm">{t("field.description")}</span>
        <input
          data-testid="input-description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="border rounded px-2 py-1 w-full"
        />
      </label>
      <label className="block">
        <span className="text-sm">{t("filter.taskType")}</span>
        <select
          data-testid="input-task-type"
          value={taskType}
          onChange={(e) => setTaskType(e.target.value as TaskType)}
          className="border rounded px-2 py-1 w-full"
        >
          {TASK_TYPES.map((tt) => (
            <option key={tt} value={tt}>
              {t(`taskType.${tt}`)}
            </option>
          ))}
        </select>
      </label>
      <label className="block">
        <span className="text-sm">{t("field.inputSchema")}</span>
        <textarea
          data-testid="input-schema"
          value={inputSchema}
          onChange={(e) => setInputSchema(e.target.value)}
          rows={4}
          className="border rounded px-2 py-1 w-full font-mono text-sm"
        />
      </label>
      <label className="block">
        <span className="text-sm">{t("field.outputSchema")}</span>
        <textarea
          data-testid="output-schema"
          value={outputSchema}
          onChange={(e) => setOutputSchema(e.target.value)}
          rows={4}
          className="border rounded px-2 py-1 w-full font-mono text-sm"
        />
      </label>
      {error && (
        <div data-testid="schema-error" className="text-red-600 text-sm">
          {error}
        </div>
      )}
      <button
        data-testid="submit"
        type="submit"
        className="bg-blue-600 text-white rounded px-4 py-2"
      >
        {t("action.create")}
      </button>
    </form>
  );
}
