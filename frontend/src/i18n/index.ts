import i18n from "i18next";
import { initReactI18next } from "react-i18next";

import { zh } from "./locales/zh";

// v1.0：单语言。v1.5 增多语言时在此注册更多 resources + 语言切换（D14）。
i18n.use(initReactI18next).init({
  resources: { zh: { translation: zh } },
  lng: "zh",
  fallbackLng: "zh",
  interpolation: { escapeValue: false },
});

export default i18n;
