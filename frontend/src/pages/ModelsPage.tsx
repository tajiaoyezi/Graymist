import { useNavigate } from "react-router-dom";

import { api } from "../api/client";
import { ModelList } from "../components/ModelList";

export function ModelsPage() {
  const navigate = useNavigate();
  return <ModelList api={api} onOpen={(id) => navigate(`/models/${id}`)} />;
}
