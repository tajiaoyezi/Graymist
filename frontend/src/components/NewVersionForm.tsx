import { useState } from "react";
import type { FormEvent } from "react";
import { useTranslation } from "react-i18next";

import { ApiError } from "../api/client";
import { parseSchemaInput } from "../lib/schema";
import type { Framework } from "../types";

export interface NewVersionInput {
  version: string;
  file_path: string;
  framework: Framework;
  resource_req: Record<string, unknown>;
  change_note: string;
}

const FRAMEWORKS: Framework[] = ["PyTorch", "ONNX", "TensorRT"];

const INPUT =
  "border border-border rounded-[9px] px-3 py-2 w-full bg-panel text-sm outline-none";

export function NewVersionForm({
  onSubmit,
}: {
  onSubmit: (v: NewVersionInput) => void;
}) {
  const { t } = useTranslation();
  const [version, setVersion] = useState("");
  const [filePath, setFilePath] = useState("");
  const [framework, setFramework] = useState<Framework>("ONNX");
  const [resourceReq, setResourceReq] = useState(
    '{"cpu":1,"memory":1024,"gpu_vram":0}',
  );
  const [changeNote, setChangeNote] = useState("");
  const [error, setError] = useState("");

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const rr = parseSchemaInput(resourceReq);
    if (!rr.ok) {
      setError(`${t("field.resourceReq")}: ${t(rr.error)}`);
      return;
    }
    setError("");
    try {
      await onSubmit({
        version,
        file_path: filePath,
        framework,
        resource_req: rr.value,
        change_note: changeNote,
      });
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : String(err));
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-2 border border-border-soft rounded-[12px] p-3 my-2 bg-surface2"
    >
      <input
        data-testid="nv-version"
        placeholder={t("field.name")}
        value={version}
        onChange={(e) => setVersion(e.target.value)}
        className={INPUT}
      />
      <input
        data-testid="nv-file-path"
        placeholder={t("field.filePath")}
        value={filePath}
        onChange={(e) => setFilePath(e.target.value)}
        className={INPUT}
      />
      <select
        data-testid="nv-framework"
        value={framework}
        onChange={(e) => setFramework(e.target.value as Framework)}
        className={INPUT}
      >
        {FRAMEWORKS.map((f) => (
          <option key={f} value={f}>
            {t(`framework.${f}`)}
          </option>
        ))}
      </select>
      <textarea
        data-testid="nv-resource-req"
        value={resourceReq}
        onChange={(e) => setResourceReq(e.target.value)}
        rows={2}
        className={`${INPUT} mono`}
      />
      <input
        data-testid="nv-change-note"
        placeholder={t("field.changeNote")}
        value={changeNote}
        onChange={(e) => setChangeNote(e.target.value)}
        className={INPUT}
      />
      {error && (
        <div data-testid="nv-error" className="text-red-600 text-sm">
          {error}
        </div>
      )}
      <button
        data-testid="nv-submit"
        type="submit"
        className="bg-accent text-white rounded-lg px-3 py-1.5 font-bold text-sm"
      >
        {t("action.create")}
      </button>
    </form>
  );
}
