import type { EndpointStatus } from "./domain/endpointStateMachine";
import type { VersionStatus } from "./domain/stateMachine";

export type TaskType = "classification" | "generation" | "embedding" | "custom";
export type Framework = "PyTorch" | "ONNX" | "TensorRT";

export interface Model {
  id: string;
  name: string;
  description: string;
  task_type: TaskType;
  custom_task_type: string | null; // task_type=custom 时的自定义类型名,否则 null
  input_schema: Record<string, unknown>;
  output_schema: Record<string, unknown>;
  version_count: number;
  latest_version_status: VersionStatus | null;
  created_at: string;
  updated_at: string;
}

export interface VersionMetrics {
  accuracy?: number | null;
  latency?: number | null;
  throughput?: number | null;
}

export type VersionSource = "mock" | "external-api";

export interface Version {
  id: string;
  model_id: string;
  version: string;
  source: VersionSource; // a5:mock=模拟;external-api=真转发上游
  file_path: string | null; // external-api 为 null
  framework: Framework | null;
  resource_req: Record<string, unknown>;
  // external-api 上游连接(仅 source=external-api)。auth_ref 为凭证引用,非明文密钥。
  provider?: string | null;
  base_url?: string | null;
  upstream_model?: string | null;
  protocol?: string | null;
  auth_ref?: string | null;
  has_api_key?: boolean; // a7:是否已在平台内加密配置上游 key(只读布尔,不含明文/密文)
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
  version?: string; // 后端补的可读版本号(仅响应有;创建/更新入参省略)
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
  model_name?: string | null; // 所属模型名(后端补;仅响应有)
  bindings: EndpointBinding[];
  created_at: string;
}

export interface QuotaInfo {
  total: ResourceQuota;
  used: ResourceQuota;
  remaining: ResourceQuota;
}

// a3 推理调用(a5 增 usage)
export interface TokenUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

export interface InferResult {
  result: unknown;
  version_id: string;
  latency_ms: number;
  usage?: TokenUsage | null; // a5:external-api 真实 token 用量;mock 为 null
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

// a4 推理日志(逐条调用记录)
export interface InferenceLog {
  id: string;
  endpoint_id: string;
  version_id: string | null; // 实际命中版本(429/422 未命中为 null)
  version: string | null; // 命中版本的可读版本号
  mode: string; // sync / async
  input_summary: string;
  output_summary: string;
  latency_ms: number;
  status: string; // success / timeout / error / rate_limited
  created_at: string;
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
