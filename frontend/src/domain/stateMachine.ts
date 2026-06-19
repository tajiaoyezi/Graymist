// 版本状态机（镜像后端 app/domain/state_machine.py）。
// 用于前端：版本详情只渲染合法的下一个状态按钮（6.3）。

export type VersionStatus = "draft" | "validating" | "ready" | "archived";

const ALLOWED: Record<VersionStatus, VersionStatus[]> = {
  draft: ["validating"],
  validating: ["ready"],
  ready: ["archived"],
  archived: [],
};

export function nextStatuses(status: VersionStatus): VersionStatus[] {
  return ALLOWED[status];
}

export function isDeployable(status: VersionStatus): boolean {
  return status === "ready";
}
