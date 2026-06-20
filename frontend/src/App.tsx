import { Navigate, Route, Routes } from "react-router-dom";

import { AppLayout } from "./components/AppLayout";
import { CreateModelPage } from "./pages/CreateModelPage";
import { DeploymentConsolePage } from "./pages/DeploymentConsolePage";
import { ModelDetailPage } from "./pages/ModelDetailPage";
import { ModelsPage } from "./pages/ModelsPage";
import { MonitoringPage } from "./pages/MonitoringPage";
import { PlaygroundPage } from "./pages/PlaygroundPage";
import { VersionDetailPage } from "./pages/VersionDetailPage";

export default function App() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route path="/" element={<Navigate to="/models" replace />} />
        <Route path="/models" element={<ModelsPage />} />
        <Route path="/models/new" element={<CreateModelPage />} />
        <Route path="/models/:modelId" element={<ModelDetailPage />} />
        <Route path="/versions/:versionId" element={<VersionDetailPage />} />
        <Route path="/endpoints" element={<DeploymentConsolePage />} />
        <Route path="/playground" element={<PlaygroundPage />} />
        <Route path="/monitoring" element={<MonitoringPage />} />
      </Route>
    </Routes>
  );
}
