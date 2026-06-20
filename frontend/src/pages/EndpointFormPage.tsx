import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";

import { EndpointForm } from "../components/EndpointForm";

// 独立页包装(保留既有单测入口);线上创建端点走部署管控台内弹窗。
export function EndpointFormPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  return (
    <div className="space-y-4">
      <h2 className="m-0 text-xl font-extrabold tracking-tight">{t("endpoint.create")}</h2>
      <EndpointForm onSuccess={() => navigate("/endpoints")} />
    </div>
  );
}
