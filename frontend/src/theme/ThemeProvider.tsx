import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

// 主题色 6 选(同原型 data-props)。第一个为默认。
export const ACCENTS = [
  "#4f46e5",
  "#2563eb",
  "#0d9488",
  "#7c3aed",
  "#e11d48",
  "#ea580c",
];

export type Theme = "light" | "dark";

const THEME_KEY = "graymist-theme";
const ACCENT_KEY = "graymist-accent";

interface ThemeCtx {
  theme: Theme;
  accent: string;
  setTheme: (t: Theme) => void;
  setAccent: (a: string) => void;
}

const Ctx = createContext<ThemeCtx | null>(null);

function readTheme(): Theme {
  try {
    return localStorage.getItem(THEME_KEY) === "dark" ? "dark" : "light";
  } catch {
    return "light";
  }
}
function readAccent(): string {
  try {
    return localStorage.getItem(ACCENT_KEY) || ACCENTS[0];
  } catch {
    return ACCENTS[0];
  }
}

// 纯前端主题:写 documentElement.dataset.theme + --accent,持久化 localStorage。
// 首屏初值由 index.html 内联脚本先行设置以避免 FOUC,本 Provider 接管后续切换。
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(readTheme);
  const [accent, setAccentState] = useState<string>(readAccent);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch {
      /* 隐私模式忽略 */
    }
  }, [theme]);

  useEffect(() => {
    document.documentElement.style.setProperty("--accent", accent);
    try {
      localStorage.setItem(ACCENT_KEY, accent);
    } catch {
      /* 隐私模式忽略 */
    }
  }, [accent]);

  return (
    <Ctx.Provider
      value={{ theme, accent, setTheme: setThemeState, setAccent: setAccentState }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useTheme(): ThemeCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error("useTheme 必须在 ThemeProvider 内使用");
  return c;
}
