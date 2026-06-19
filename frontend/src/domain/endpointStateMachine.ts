// 端点状态机（镜像后端 app/domain/endpoint_state_machine.py）。
// 用于前端：按当前状态渲染可用的操作按钮，并标记异步进行中的加载态。

export type EndpointStatus = "creating" | "running" | "stopped" | "failed";

// 启动：仅 stopped（经 creating 重新部署）。
export function canStart(status: EndpointStatus): boolean {
  return status === "stopped";
}

// 停止：running（异步转 stopped）或 creating（取消进行中/卡住的部署）。
export function canStop(status: EndpointStatus): boolean {
  return status === "running" || status === "creating";
}

// 重启（= 重新部署）：running / stopped / failed（failed 可恢复）。
export function canRestart(status: EndpointStatus): boolean {
  return status === "running" || status === "stopped" || status === "failed";
}

// 异步进行中：creating 显示加载态。
export function isTransitioning(status: EndpointStatus): boolean {
  return status === "creating";
}

// A/B 权重校验：每条 1..100 整数，且和为 100。
export function weightsValid(weights: number[]): boolean {
  if (weights.length === 0) return false;
  if (!weights.every((w) => Number.isInteger(w) && w >= 1 && w <= 100)) return false;
  return weights.reduce((a, b) => a + b, 0) === 100;
}
