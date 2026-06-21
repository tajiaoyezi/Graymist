/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      // 语义色 → CSS 变量(令牌见 index.css :root / [data-theme=dark])。
      // 注意:hex 型 var() 不可用 Tailwind 透明度修饰符 bg-x/NN,半透明用 accent-soft/color-mix/rgba。
      colors: {
        accent: "var(--accent)",
        "accent-soft": "var(--accent-soft)",
        danger: "var(--danger)",
        "danger-soft": "var(--danger-soft)",
        bg: "var(--bg)",
        panel: "var(--panel)",
        surface: "var(--surface)",
        surface2: "var(--surface2)",
        border: "var(--border)",
        "border-soft": "var(--border-soft)",
        text: "var(--text)",
        text2: "var(--text2)",
        muted: "var(--muted)",
        faint: "var(--faint)",
        faint2: "var(--faint2)",
        sidebar: "var(--sidebar)",
      },
      fontFamily: {
        sans: ["Manrope", "-apple-system", "PingFang SC", "Microsoft YaHei", "sans-serif"],
        mono: ["JetBrains Mono", "monospace"],
      },
    },
  },
  plugins: [],
};
