import { useNavigate } from "react-router-dom";

import { api } from "../api/client";
import { CreateModelForm } from "../components/CreateModelForm";

export function CreateModelPage() {
  const navigate = useNavigate();
  return (
    <CreateModelForm
      onSubmit={async (model) => {
        const created = await api.createModel(model);
        navigate(`/models/${created.id}`);
      }}
    />
  );
}
