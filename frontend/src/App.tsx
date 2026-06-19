import { Link, Navigate, Route, Routes } from "react-router-dom";
import { useTranslation } from "react-i18next";

import { CreateModelPage } from "./pages/CreateModelPage";
import { ModelDetailPage } from "./pages/ModelDetailPage";
import { ModelsPage } from "./pages/ModelsPage";
import { VersionDetailPage } from "./pages/VersionDetailPage";

export default function App() {
  const { t } = useTranslation();
  return (
    <div className="max-w-5xl mx-auto p-6">
      <header className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold">{t("app.title")}</h1>
        <nav className="flex gap-4 text-blue-600">
          <Link to="/models">{t("nav.models")}</Link>
          <Link to="/models/new">{t("nav.create")}</Link>
        </nav>
      </header>
      <Routes>
        <Route path="/" element={<Navigate to="/models" replace />} />
        <Route path="/models" element={<ModelsPage />} />
        <Route path="/models/new" element={<CreateModelPage />} />
        <Route path="/models/:modelId" element={<ModelDetailPage />} />
        <Route path="/versions/:versionId" element={<VersionDetailPage />} />
      </Routes>
    </div>
  );
}
