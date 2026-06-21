import { useState } from "react";
import type { FormEvent } from "react";
import { useTranslation } from "react-i18next";

import { ApiError } from "../api/client";
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
  // 资源需求改为结构化数字字段(原先要求手填 JSON,体验差)。
  const [cpu, setCpu] = useState("1");
  const [memory, setMemory] = useState("1024");
  const [gpuVram, setGpuVram] = useState("0");
  const [changeNote, setChangeNote] = useState("");
  const [error, setError] = useState("");

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    try {
      await onSubmit({
        version,
        file_path: filePath,
        framework,
        resource_req: {
          cpu: Number(cpu) || 0,
          memory: Number(memory) || 0,
          gpu_vram: Number(gpuVram) || 0,
        },
        change_note: changeNote,
      });
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : String(err));
    }
  }

  const numField = (
    testid: string,
    label: string,
    value: string,
    setValue: (v: string) => void,
  ) => (
    <label className="block">
      <span className="text-[11px] text-faint">{label}</span>
      <input
        type="number"
        min={0}
        data-testid={testid}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className={`${INPUT} mono`}
      />
    </label>
  );

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-2 border border-border-soft rounded-[12px] p-3 my-2 bg-surface2"
    >
      <label className="block">
        <span className="block text-[11px] font-bold text-muted mb-1">
          {t("field.version")}
        </span>
        <input
          data-testid="nv-version"
          placeholder={t("field.versionHint")}
          value={version}
          onChange={(e) => setVersion(e.target.value)}
          className={`${INPUT} mono`}
        />
      </label>
      <label className="block">
        <span className="block text-[11px] font-bold text-muted mb-1">
          {t("field.filePath")}
        </span>
        <input
          data-testid="nv-file-path"
          placeholder={t(`field.filePathHint.${framework}`)}
          value={filePath}
          onChange={(e) => setFilePath(e.target.value)}
          className={`${INPUT} mono`}
        />
      </label>
      <label className="block">
        <span className="block text-[11px] font-bold text-muted mb-1">
          {t("field.framework")}
        </span>
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
      </label>
      <div>
        <div className="text-[11px] font-bold text-muted mb-1">
          {t("field.resourceReq")}
        </div>
        <div className="grid grid-cols-3 gap-2">
          {numField("nv-cpu", t("field.cpu"), cpu, setCpu)}
          {numField("nv-memory", t("field.memory"), memory, setMemory)}
          {numField("nv-gpu-vram", t("field.gpuVram"), gpuVram, setGpuVram)}
        </div>
      </div>
      <label className="block">
        <span className="block text-[11px] font-bold text-muted mb-1">
          {t("field.changeNote")}
        </span>
        <input
          data-testid="nv-change-note"
          placeholder={t("field.changeNoteHint")}
          value={changeNote}
          onChange={(e) => setChangeNote(e.target.value)}
          className={INPUT}
        />
      </label>
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
