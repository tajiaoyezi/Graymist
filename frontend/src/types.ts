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
