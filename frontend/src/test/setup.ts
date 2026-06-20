import "@testing-library/jest-dom/vitest";
import "../i18n"; // 初始化 i18n，使用 useTranslation 的组件在测试中可取到文案

// jsdom 默认 opaque origin 下无 localStorage;提供内存实现供主题等测试使用(缺失时才注入)。
if (typeof globalThis.localStorage === "undefined") {
  const store = new Map<string, string>();
  const mock: Storage = {
    get length() {
      return store.size;
    },
    clear: () => store.clear(),
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    key: (i: number) => Array.from(store.keys())[i] ?? null,
    removeItem: (k: string) => {
      store.delete(k);
    },
    setItem: (k: string, v: string) => {
      store.set(k, String(v));
    },
  };
  Object.defineProperty(globalThis, "localStorage", {
    value: mock,
    configurable: true,
  });
}
