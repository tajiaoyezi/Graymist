import { useState } from "react";
import type { FormEvent } from "react";
import { useTranslation } from "react-i18next";

import { ApiError } from "../api/client";
import type { Framework, VersionMetrics } from "../types";

export interface NewVersionInput {
  version: string;
  file_path: string;
  framework: Framework;
  resource_req: Record<string, unknown>;
  change_note: string;
  metrics?: VersionMetrics; // 选填;三项全空则不带,版本 metrics 保持 null
}

const FRAMEWORKS: Framework[] = ["PyTorch", "ONNX", "TensorRT"];

const INPUT =
  "border border-border rounded-[9px] px-3 py-2 w-full bg-panel text-sm outline-none";

export function NewVersionForm({
  onSubmit,
  onCancel,
}: {
  onSubmit: (v: NewVersionInput) => void;
  onCancel?: () => void;
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
  // 性能指标(选填):三项全空则创建时不带,版本 metrics 保持 null。
  const [acc, setAcc] = useState("");
  const [lat, setLat] = useState("");
  const [thr, setThr] = useState("");
  const [error, setError] = useState("");

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    try {
      const num = (s: string) => {
        const n = Number(s);
        return s.trim() === "" || !Number.isFinite(n) ? null : n;
      };
      const anyMetric =
        acc.trim() !== "" || lat.trim() !== "" || thr.trim() !== "";
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
        ...(anyMetric
          ? {
              metrics: {
                accuracy: num(acc),
                latency: num(lat),
                throughput: num(thr),
              },
            }
          : {}),
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
    step?: string, // 指标允许小数(step="any");资源框不传 → 默认整数步进
  ) => (
    <label className="block">
      <span className="text-[11px] text-faint">{label}</span>
      <input
        type="number"
        min={0}
        step={step}
        data-testid={testid}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className={`${INPUT} mono`}
      />
    </label>
  );

  return (
    <form onSubmit={handleSubmit} className="space-y-2.5">
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
      <div>
        <div className="text-[11px] font-bold text-muted mb-1">
          {t("field.metricsOptional")}
        </div>
        <div className="grid grid-cols-3 gap-2">
          {numField("nv-accuracy", t("metrics.accuracy"), acc, setAcc, "any")}
          {numField("nv-latency", t("metrics.latency"), lat, setLat, "any")}
          {numField("nv-throughput", t("metrics.throughput"), thr, setThr, "any")}
        </div>
      </div>
      {error && (
        <div data-testid="nv-error" className="text-danger text-sm">
          {error}
        </div>
      )}
      <div className="flex justify-end gap-2.5 pt-1">
        {onCancel && (
          <button
            type="button"
            data-testid="nv-cancel"
            onClick={onCancel}
            className="border border-border rounded-lg px-3 py-1.5 font-bold text-sm text-text2 bg-panel"
          >
            {t("action.cancel")}
          </button>
        )}
        <button
          data-testid="nv-submit"
          type="submit"
          className="bg-accent text-white rounded-lg px-3 py-1.5 font-bold text-sm"
        >
          {t("action.create")}
        </button>
      </div>
    </form>
  );
}
