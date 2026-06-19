import type {
  Endpoint,
  EndpointBinding,
  Model,
  QuotaInfo,
  Version,
  VersionMetrics,
} from "../types";

// 默认 /api：开发期 Vite 代理转发到后端、生产期由反代挂载，避免与 SPA 路由前缀冲突。
const BASE = (import.meta.env?.VITE_API_BASE as string | undefined) ?? "/api";

export class ApiError extends Error {
  constructor(
    public status: number,
    public detail: string,
  ) {
    super(`API ${status}: ${detail}`);
  }
}

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(BASE + path, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (!res.ok) {
    const text = await res.text();
    let detail = text;
    try {
      const body = JSON.parse(text);
      if (body && typeof body.detail === "string") detail = body.detail;
    } catch {
      /* 非 JSON，保留原文 */
    }
    throw new ApiError(res.status, detail);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

function qs(params?: Record<string, string | undefined>): string {
  if (!params) return "";
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v) sp.set(k, v);
  const s = sp.toString();
  return s ? `?${s}` : "";
}

export const api = {
  listModels: (p?: { task_type?: string; q?: string }) =>
    req<Model[]>(`/models${qs(p)}`),
  createModel: (body: Partial<Model>) =>
    req<Model>("/models", { method: "POST", body: JSON.stringify(body) }),
  getModel: (id: string) => req<Model>(`/models/${id}`),
  updateModel: (id: string, body: Partial<Model>) =>
    req<Model>(`/models/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  deleteModel: (id: string) => req<void>(`/models/${id}`, { method: "DELETE" }),
  listVersions: (modelId: string) =>
    req<Version[]>(`/models/${modelId}/versions`),
  createVersion: (modelId: string, body: Partial<Version>) =>
    req<Version>(`/models/${modelId}/versions`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  getVersion: (id: string) => req<Version>(`/versions/${id}`),
  transitionVersion: (id: string, target: string) =>
    req<Version>(`/versions/${id}/transition`, {
      method: "POST",
      body: JSON.stringify({ target }),
    }),
  setMetrics: (id: string, metrics: VersionMetrics) =>
    req<Version>(`/versions/${id}/metrics`, {
      method: "PUT",
      body: JSON.stringify(metrics),
    }),
  compareVersions: (modelId: string) =>
    req<{ version: string; version_id: string; metrics: VersionMetrics | null }[]>(
      `/models/${modelId}/versions/compare`,
    ),
  // a2 端点（无 delete —— 下线走停止）
  listEndpoints: () => req<Endpoint[]>("/endpoints"),
  createEndpoint: (body: {
    name: string;
    url_path: string;
    replicas: number;
    resource_quota: { cpu: number; memory: number; gpu: number };
    timeout_ms: number;
    max_concurrency: number;
    bindings: EndpointBinding[];
  }) => req<Endpoint>("/endpoints", { method: "POST", body: JSON.stringify(body) }),
  getEndpoint: (id: string) => req<Endpoint>(`/endpoints/${id}`),
  updateEndpoint: (id: string, body: Partial<Endpoint> & { bindings?: EndpointBinding[] }) =>
    req<Endpoint>(`/endpoints/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  startEndpoint: (id: string) =>
    req<Endpoint>(`/endpoints/${id}/start`, { method: "POST" }),
  stopEndpoint: (id: string) =>
    req<Endpoint>(`/endpoints/${id}/stop`, { method: "POST" }),
  restartEndpoint: (id: string) =>
    req<Endpoint>(`/endpoints/${id}/restart`, { method: "POST" }),
  getQuota: () => req<QuotaInfo>("/quota"),
};

export type Api = typeof api;
