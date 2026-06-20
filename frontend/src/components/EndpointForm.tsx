import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { ApiError, api } from "../api/client";
import { AbWeightEditor, type WeightBinding } from "./AbWeightEditor";
import { QuotaUsage } from "./QuotaUsage";
import { weightsValid } from "../domain/endpointStateMachine";
import type { Endpoint, Model, QuotaInfo, ResourceQuota, Version } from "../types";

const EMPTY_QUOTA: QuotaInfo = {
  total: { cpu: 0, memory: 0, gpu: 0 },
  used: { cpu: 0, memory: 0, gpu: 0 },
  remaining: { cpu: 0, memory: 0, gpu: 0 },
};

// 创建/编辑端点表单(供控制台弹窗与独立页包装复用)。保留全部 testid 与校验行为。
// 传入 endpoint → 编辑模式:预填配置、name/url_path 只读(后端不可改),提交走 updateEndpoint。
export function EndpointForm({
  endpoint,
  onSuccess,
  onCancel,
}: {
  endpoint?: Endpoint;
  onSuccess: () => void;
  onCancel?: () => void;
}) {
  const { t } = useTranslation();
  const isEdit = !!endpoint;
  const [models, setModels] = useState<Model[]>([]);
  const [modelId, setModelId] = useState("");
  const [versions, setVersions] = useState<Version[]>([]);
  const [bindings, setBindings] = useState<WeightBinding[]>([]);
  const [name, setName] = useState(endpoint?.name ?? "");
  const [urlPath, setUrlPath] = useState(endpoint?.url_path ?? "");
  const [replicas, setReplicas] = useState(endpoint?.replicas ?? 1);
  const [cpu, setCpu] = useState(endpoint?.resource_quota.cpu ?? 1);
  const [memory, setMemory] = useState(endpoint?.resource_quota.memory ?? 100);
  const [gpu, setGpu] = useState(endpoint?.resource_quota.gpu ?? 0);
  const [timeoutMs, setTimeoutMs] = useState(endpoint?.timeout_ms ?? 30000);
  const [maxConc, setMaxConc] = useState(endpoint?.max_concurrency ?? 4);
  const [quota, setQuota] = useState<QuotaInfo>(EMPTY_QUOTA);
  const [error, setError] = useState("");

  useEffect(() => {
    void (async () => {
      try {
        setModels(await api.listModels());
        setQuota(await api.getQuota());
        if (endpoint && endpoint.bindings.length) {
          // 编辑模式:从首个绑定回溯所属 Model,载入其 ready 版本并预填权重。
          const v0 = await api.getVersion(endpoint.bindings[0].model_version_id);
          const vs = (await api.listVersions(v0.model_id)).filter((x) => x.status === "ready");
          setModelId(v0.model_id);
          setVersions(vs);
          setBindings(
            endpoint.bindings.map((b) => ({
              model_version_id: b.model_version_id,
              weight: b.weight,
              label: vs.find((x) => x.id === b.model_version_id)?.version ?? b.model_version_id,
            })),
          );
        }
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
  // 编辑在线端点时,后端配额校验排除该端点自身占用(_active_usages exclude_id);
  // 故前端把它当前占用加回剩余,避免误判超额而禁用提交。
  const displayQuota = useMemo<QuotaInfo>(() => {
    if (!endpoint || endpoint.status !== "running") return quota;
    const self: ResourceQuota = {
      cpu: endpoint.replicas * endpoint.resource_quota.cpu,
      memory: endpoint.replicas * endpoint.resource_quota.memory,
      gpu: endpoint.replicas * endpoint.resource_quota.gpu,
    };
    return {
      total: quota.total,
      used: {
        cpu: Math.max(0, quota.used.cpu - self.cpu),
        memory: Math.max(0, quota.used.memory - self.memory),
        gpu: Math.max(0, quota.used.gpu - self.gpu),
      },
      remaining: {
        cpu: quota.remaining.cpu + self.cpu,
        memory: quota.remaining.memory + self.memory,
        gpu: quota.remaining.gpu + self.gpu,
      },
    };
  }, [endpoint, quota]);
  const over =
    pending.cpu > displayQuota.remaining.cpu ||
    pending.memory > displayQuota.remaining.memory ||
    pending.gpu > displayQuota.remaining.gpu;
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
    const mappedBindings = bindings.map((b) => ({
      model_version_id: b.model_version_id,
      weight: b.weight,
    }));
    try {
      setError("");
      if (endpoint) {
        // 编辑:仅提交后端可改字段(name/url_path 不可变);权重整体替换由后端原子完成。
        await api.updateEndpoint(endpoint.id, {
          replicas,
          resource_quota: { cpu, memory, gpu },
          timeout_ms: timeoutMs,
          max_concurrency: maxConc,
          bindings: mappedBindings,
        });
      } else {
        await api.createEndpoint({
          name,
          url_path: urlPath,
          replicas,
          resource_quota: { cpu, memory, gpu },
          timeout_ms: timeoutMs,
          max_concurrency: maxConc,
          bindings: mappedBindings,
        });
      }
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
            readOnly={isEdit}
            className={`${field}${isEdit ? " opacity-60" : ""}`}
          />
        </div>
        <div>
          <label className={labelCls}>{t("endpoint.urlPath")}</label>
          <input
            data-testid="ep-url"
            value={urlPath}
            onChange={(e) => setUrlPath(e.target.value)}
            readOnly={isEdit}
            className={`${field}${isEdit ? " opacity-60" : ""}`}
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
        <QuotaUsage quota={displayQuota} pending={pending} />
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
          {isEdit ? t("action.save") : t("endpoint.deploy")}
        </button>
      </div>
    </form>
  );
}
