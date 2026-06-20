import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";

import { api } from "../api/client";
import { CreateModelForm } from "../components/CreateModelForm";

export function CreateModelPage() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  return (
    <div className="space-y-4">
      <h2 className="m-0 text-xl font-extrabold tracking-tight">{t("pageTitle.newModel")}</h2>
      <CreateModelForm
        onSubmit={async (model) => {
          const created = await api.createModel(model);
          navigate(`/models/${created.id}`);
        }}
      />
    </div>
  );
}
