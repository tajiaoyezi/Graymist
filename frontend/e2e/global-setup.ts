import { rmSync } from "node:fs";

// 审查 L4:每次 E2E 运行前清掉持久化的 e2e.db,避免端点/模型行跨运行累积。
// (后端 webServer 以 GRAYMIST_AUTO_CREATE_TABLES=1 启动时会重新建表。)
export default function globalSetup() {
  try {
    rmSync("H:\\devlopment\\code\\wps\\Graymist\\backend\\e2e.db", { force: true });
  } catch {
    /* 不存在则忽略 */
  }
}
