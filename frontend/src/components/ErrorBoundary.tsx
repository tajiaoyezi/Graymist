import { Component, type ErrorInfo, type ReactNode } from "react";

import i18n from "../i18n";

interface Props {
  children: ReactNode;
}
interface State {
  error: Error | null;
}

// 顶层错误边界:任何渲染期异常都被兜住,显示可恢复的错误态而非整页白屏。
// 类组件(错误边界必须),文案经 i18n 实例(非 hook)取,带主题色兜底值以防主题未应用。
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("UI 渲染异常:", error, info.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <div
        role="alert"
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 12,
          alignItems: "flex-start",
          padding: 40,
          color: "var(--text, #0f172a)",
        }}
      >
        <div style={{ fontSize: 18, fontWeight: 800 }}>{i18n.t("error.boundaryTitle")}</div>
        <div className="mono" style={{ fontSize: 13, color: "var(--muted, #64748b)" }}>
          {error.message}
        </div>
        <button
          type="button"
          onClick={() => window.location.reload()}
          style={{
            height: 38,
            padding: "0 16px",
            borderRadius: 10,
            color: "#fff",
            fontWeight: 700,
            border: "none",
            cursor: "pointer",
            background: "var(--accent, #6366f1)",
          }}
        >
          {i18n.t("error.reload")}
        </button>
      </div>
    );
  }
}
