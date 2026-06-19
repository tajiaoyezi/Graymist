import { defineConfig, devices } from "@playwright/test";

const BACKEND = "H:\\devlopment\\code\\wps\\Graymist\\backend";

// 两个 webServer：后端(uvicorn, SQLite + 自动建表) + 前端(vite dev, /api 代理到后端)。
export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: { baseURL: "http://127.0.0.1:5174", trace: "on-first-retry" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      command: `${BACKEND}\\.venv\\Scripts\\uvicorn.exe app.main:app --host 127.0.0.1 --port 8010`,
      cwd: BACKEND,
      url: "http://127.0.0.1:8010/health",
      timeout: 60_000,
      reuseExistingServer: false,
      env: {
        GRAYMIST_DATABASE_URL: "sqlite+aiosqlite:///./e2e.db",
        GRAYMIST_AUTO_CREATE_TABLES: "1",
      },
    },
    {
      command: "npm run dev -- --port 5174 --strictPort",
      url: "http://127.0.0.1:5174",
      timeout: 60_000,
      reuseExistingServer: false,
    },
  ],
});
