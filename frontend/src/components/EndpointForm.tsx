import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { ApiError, api } from "../api/client";
import { AbWeightEditor, type WeightBinding } from "./AbWeightEditor";
import { QuotaUsage } from "./QuotaUsage";
import { weightsValid } from "../domain/endpointStateMachine";
import type { Model, QuotaInfo, Version } from "../types";

const EMPTY_QUOTA: QuotaInfo = {
  total: { cpu: 0, memory: 0, gpu: 0 },
  used: { cpu: 0, memory: 0, gpu: 0 },
  remaining: { cpu: 0, memory: 0, gpu: 0 },
};

// 创建端点表单(供控制台弹窗与独立页包装复用)。保留全部 testid 与校验行为。
export function EndpointForm({
  onSuccess,
  onCancel,
}: {
  onSuccess: () => void;
  onCancel?: () => void;
}) {
  const { t } = useTranslation();
  const [models, setModels] = useState<Model[]>([]);
  const [modelId, setModelId] = useState("");
  const [versions, setVersions] = useState<Version[]>([]);
  const [bindings, setBindings] = useState<WeightBinding[]>([]);
  const [name, setName] = useState("");
  const [urlPath, setUrlPath] = useState("");
  const [replicas, setReplicas] = useState(1);
  const [cpu, setCpu] = useState(1);
  const [memory, setMemory] = useState(100);
  const [gpu, setGpu] = useState(0);
  const [timeoutMs, setTimeoutMs] = useState(30000);
  const [maxConc, setMaxConc] = useState(4);
  const [quota, setQuota] = useState<QuotaInfo>(EMPTY_QUOTA);
  const [error, setError] = useState("");

  useEffect(() => {
    void (async () => {
      try {
        setModels(await api.listModels());
        setQuota(await api.getQuota());
      } catch (e) {
        setError(e instanceof ApiError ? e.detail : t("error.load"));
      }
    })();
  }, []);

  async function selectModel(id: string) {
    setModelId(id);
    setBindings([]);
    if (!id) {
      setVersions([]);
      return;
    }
    const vs = (await api.listVersions(id)).filter((v) => v.status === "ready");
    setVersions(vs);
  }

  function toggleVersion(v: Version, checked: boolean) {
    setBindings((prev) =>
      checked
        ? [...prev, { model_version_id: v.id, weight: 0, label: v.version }]
        : prev.filter((b) => b.model_version_id !== v.id),
    );
  }

  const pending = useMemo(
    () => ({ cpu: replicas * cpu, memory: replicas * memory, gpu: replicas * gpu }),
    [replicas, cpu, memory, gpu],
  );
  const over =
    pending.cpu > quota.remaining.cpu ||
    pending.memory > quota.remaining.memory ||
    pending.gpu > quota.remaining.gpu;
  const valid =
    name.length > 0 &&
    urlPath.length > 0 &&
    bindings.length > 0 &&
    weightsValid(bindings.map((b) => b.weight)) &&
    replicas >= 1 &&
    maxConc >= 1 &&
    cpu >= 0 &&
    memory >= 0 &&
    gpu >= 0 &&
    !over;

  async function submit() {
    try {
      setError("");
      await api.createEndpoint({
        name,
        url_path: urlPath,
        replicas,
        resource_quota: { cpu, memory, gpu },
        timeout_ms: timeoutMs,
        max_concurrency: maxConc,
        bindings: bindings.map((b) => ({
          model_version_id: b.model_version_id,
          weight: b.weight,
        })),
      });
      onSuccess();
    } catch (e) {
      setError(e instanceof ApiError ? e.detail : t("error.create"));
    }
  }

  const field =
    "border border-border rounded-[9px] px-3 h-[38px] w-full bg-panel text-sm outline-none mono";
  const labelCls = "text-xs font-bold text-muted mb-1.5 block";

  const numField = (id: string, value: number, set: (n: number) => void, label: string) => (
    <div>
      <div className="text-[11px] text-faint mb-1">{label}</div>
      <input
        type="number"
        data-testid={id}
        value={value}
        onChange={(e) => set(parseInt(e.target.value, 10) || 0)}
        className="border border-border rounded-lg px-3 h-9 w-full bg-panel text-sm outline-none mono"
      />
    </div>
  );

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      {error && (
        <div data-testid="form-error" className="text-red-600 text-sm">
          {error}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3.5">
        <div>
          <label className={labelCls}>{t("field.name")}</label>
          <input
            data-testid="ep-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={field}
          />
        </div>
        <div>
          <label className={labelCls}>{t("endpoint.urlPath")}</label>
          <input
            data-testid="ep-url"
            value={urlPath}
            onChange={(e) => setUrlPath(e.target.value)}
            className={field}
          />
        </div>
      </div>

      <div>
        <label className={labelCls}>{t("endpoint.selectModelReady")}</label>
        <select
          data-testid="ep-model"
          value={modelId}
          onChange={(e) => void selectModel(e.target.value)}
          className={field}
        >
          <option value="">--</option>
          {models.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
      </div>

      {versions.length > 0 && (
        <fieldset className="border-0 p-0 m-0">
          <legend className={labelCls}>{t("endpoint.selectVersions")}</legend>
          <div className="flex flex-wrap gap-3">
            {versions.map((v) => (
              <label key={v.id} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  data-testid={`version-${v.id}`}
                  checked={bindings.some((b) => b.model_version_id === v.id)}
                  onChange={(e) => toggleVersion(v, e.target.checked)}
                />
                <span className="mono">{v.version}</span>
              </label>
            ))}
          </div>
        </fieldset>
      )}

      {bindings.length > 0 && (
        <div>
          <div className="text-xs font-bold text-muted mb-2">{t("endpoint.bindings")}</div>
          <AbWeightEditor bindings={bindings} onChange={setBindings} />
        </div>
      )}

      <div>
        <div className={labelCls}>{t("endpoint.resourceQuota")}</div>
        <div className="grid grid-cols-4 gap-2.5 mb-3.5">
          {numField("ep-replicas", replicas, setReplicas, t("endpoint.replicas"))}
          {numField("ep-cpu", cpu, setCpu, t("quota.cpu"))}
          {numField("ep-memory", memory, setMemory, t("quota.memory"))}
          {numField("ep-gpu", gpu, setGpu, t("quota.gpu"))}
        </div>
        <QuotaUsage quota={quota} pending={pending} />
      </div>

      <div className="grid grid-cols-2 gap-3.5">
        {numField("ep-timeout", timeoutMs, setTimeoutMs, t("endpoint.timeout"))}
        {numField("ep-maxconc", maxConc, setMaxConc, t("endpoint.maxConcurrency"))}
      </div>

      <div className="flex justify-end gap-2.5 pt-2 border-t border-border-soft">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="h-10 px-4 rounded-[10px] border border-border bg-panel font-bold text-sm text-text2"
          >
            {t("action.cancel")}
          </button>
        )}
        <button
          type="submit"
          data-testid="submit-endpoint"
          disabled={!valid}
          className="h-10 px-4 rounded-[10px] text-white font-bold text-sm disabled:opacity-40"
          style={{ background: "var(--accent)" }}
        >
          {t("endpoint.deploy")}
        </button>
      </div>
    </form>
  );
}
