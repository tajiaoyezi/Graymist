import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";

import { ApiError, api } from "../api/client";
import { AbWeightEditor, type WeightBinding } from "../components/AbWeightEditor";
import { QuotaUsage } from "../components/QuotaUsage";
import { weightsValid } from "../domain/endpointStateMachine";
import type { Model, QuotaInfo, Version } from "../types";

const EMPTY_QUOTA: QuotaInfo = {
  total: { cpu: 0, memory: 0, gpu: 0 },
  used: { cpu: 0, memory: 0, gpu: 0 },
  remaining: { cpu: 0, memory: 0, gpu: 0 },
};

export function EndpointFormPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
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
        setError(e instanceof ApiError ? e.detail : "加载失败");
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
    // 审查 M5:与后端 ge=1/ge=0 对齐,避免前端"有效"但后端 422。
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
        bindings: bindings.map((b) => ({ model_version_id: b.model_version_id, weight: b.weight })),
      });
      navigate("/endpoints");
    } catch (e) {
      setError(e instanceof ApiError ? e.detail : "创建失败");
    }
  }

  const numField = (
    id: string,
    value: number,
    set: (n: number) => void,
    label: string,
  ) => (
    <label className="text-sm flex flex-col">
      {label}
      <input
        type="number"
        data-testid={id}
        value={value}
        onChange={(e) => set(parseInt(e.target.value, 10) || 0)}
        className="border rounded px-2 py-1"
      />
    </label>
  );

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <h2 className="text-lg font-semibold">{t("endpoint.create")}</h2>
      {error && (
        <div data-testid="form-error" className="text-red-600 text-sm">
          {error}
        </div>
      )}
      <label className="text-sm flex flex-col">
        {t("field.name")}
        <input
          data-testid="ep-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="border rounded px-2 py-1"
        />
      </label>
      <label className="text-sm flex flex-col">
        {t("endpoint.urlPath")}
        <input
          data-testid="ep-url"
          value={urlPath}
          onChange={(e) => setUrlPath(e.target.value)}
          className="border rounded px-2 py-1"
        />
      </label>

      <label className="text-sm flex flex-col">
        {t("endpoint.selectModel")}
        <select
          data-testid="ep-model"
          value={modelId}
          onChange={(e) => void selectModel(e.target.value)}
          className="border rounded px-2 py-1"
        >
          <option value="">--</option>
          {models.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
      </label>

      {versions.length > 0 && (
        <fieldset className="text-sm">
          <legend>{t("endpoint.selectVersions")}</legend>
          {versions.map((v) => (
            <label key={v.id} className="flex items-center gap-2">
              <input
                type="checkbox"
                data-testid={`version-${v.id}`}
                checked={bindings.some((b) => b.model_version_id === v.id)}
                onChange={(e) => toggleVersion(v, e.target.checked)}
              />
              {v.version}
            </label>
          ))}
        </fieldset>
      )}

      {bindings.length > 0 && (
        <div>
          <div className="text-sm font-semibold">{t("endpoint.bindings")}</div>
          <AbWeightEditor bindings={bindings} onChange={setBindings} />
        </div>
      )}

      <div className="grid grid-cols-3 gap-2">
        {numField("ep-replicas", replicas, setReplicas, t("endpoint.replicas"))}
        {numField("ep-cpu", cpu, setCpu, t("quota.cpu"))}
        {numField("ep-memory", memory, setMemory, t("quota.memory"))}
        {numField("ep-gpu", gpu, setGpu, t("quota.gpu"))}
        {numField("ep-timeout", timeoutMs, setTimeoutMs, "timeout_ms")}
        {numField("ep-maxconc", maxConc, setMaxConc, "max_concurrency")}
      </div>

      <QuotaUsage quota={quota} pending={pending} />

      <button
        type="submit"
        data-testid="submit-endpoint"
        disabled={!valid}
        className="border rounded px-4 py-2 disabled:opacity-40"
      >
        {t("action.create")}
      </button>
    </form>
  );
}
