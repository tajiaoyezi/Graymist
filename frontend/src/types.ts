import type { EndpointStatus } from "./domain/endpointStateMachine";
import type { VersionStatus } from "./domain/stateMachine";

export type TaskType = "classification" | "generation" | "embedding" | "custom";
export type Framework = "PyTorch" | "ONNX" | "TensorRT";

export interface Model {
  id: string;
  name: string;
  description: string;
  task_type: TaskType;
  input_schema: Record<string, unknown>;
  output_schema: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface VersionMetrics {
  accuracy?: number | null;
  latency?: number | null;
  throughput?: number | null;
}

export interface Version {
  id: string;
  model_id: string;
  version: string;
  file_path: string;
  framework: Framework;
  resource_req: Record<string, unknown>;
  change_note: string;
  status: VersionStatus;
  metrics: VersionMetrics | null;
  created_at: string;
  deployable: boolean;
}

export interface ResourceQuota {
  cpu: number;
  memory: number;
  gpu: number;
}

export interface EndpointBinding {
  model_version_id: string;
  weight: number;
}

export interface Endpoint {
  id: string;
  name: string;
  url_path: string;
  status: EndpointStatus;
  replicas: number;
  resource_quota: ResourceQuota;
  timeout_ms: number;
  max_concurrency: number;
  bindings: EndpointBinding[];
  created_at: string;
}

export interface QuotaInfo {
  total: ResourceQuota;
  used: ResourceQuota;
  remaining: ResourceQuota;
}

// a3 推理调用
export interface InferResult {
  result: unknown;
  version_id: string;
  latency_ms: number;
}

export interface AsyncSubmit {
  task_id: string;
  status: string;
}

export interface AsyncTask {
  id: string;
  endpoint_id: string;
  status: string;
  result: unknown | null;
  created_at: string;
  finished_at: string | null;
}

// a4 监控指标
export interface MetricBucket {
  t: string;
  qps: number;
  avg_latency_ms: number;
  p99_latency_ms: number;
  error_rate: number; // 百分比 0..100
}

export interface VersionSeries {
  version_id: string;
  buckets: MetricBucket[];
}

export interface MetricsSummary {
  qps: number;
  avg_latency_ms: number;
  p99_latency_ms: number;
  error_rate: number;
}

export interface Metrics {
  range: string;
  buckets: MetricBucket[];
  versions: VersionSeries[];
  current_concurrency: number;
  summary: MetricsSummary;
}
