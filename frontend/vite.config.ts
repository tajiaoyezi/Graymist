/// <reference types="vitest" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// 后端 API 与前端 SPA 共享 /models、/versions 等路径前缀，故前端 API 走 /api，
// 开发期由 Vite 代理转发到后端（剥离 /api 前缀），避免与 SPA 路由冲突、且免 CORS。
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/api": {
        target: "http://127.0.0.1:8021",
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api/, ""),
      },
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: "./src/test/setup.ts",
    css: false,
    include: ["src/**/*.test.{ts,tsx}"],
  },
});
