import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useParams } from "react-router-dom";
import { Bar, BarChart, CartesianGrid, Tooltip, XAxis, YAxis } from "recharts";

import { ApiError, api } from "../api/client";
import { NewVersionForm } from "../components/NewVersionForm";
import { formatDateTime } from "../lib/format";
import type { Model, Version, VersionMetrics } from "../types";

interface CompareRow {
  version: string;
  version_id: string;
  metrics: VersionMetrics | null;
}

export function ModelDetailPage() {
  const { t, i18n } = useTranslation();
  const { modelId = "" } = useParams();
  const [model, setModel] = useState<Model | null>(null);
  const [versions, setVersions] = useState<Version[]>([]);
  const [compare, setCompare] = useState<CompareRow[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState("");

  async function reload() {
    try {
      setError("");
      setModel(await api.getModel(modelId));
      setVersions(await api.listVersions(modelId));
      setCompare(await api.compareVersions(modelId));
    } catch (e) {
      setError(e instanceof ApiError ? e.detail : "加载失败");
    }
  }

  useEffect(() => {
    void reload();
  }, [modelId]);

  if (error) {
    return (
      <div data-testid="page-error" className="text-red-600">
        {error}
      </div>
    );
  }
  if (!model) return null;

  const chartData = compare.map((c) => ({
    version: c.version,
    accuracy: c.metrics?.accuracy ?? 0,
  }));

  return (
    <div className="space-y-6">
      <section>
        <h2 className="text-lg font-semibold">{model.name}</h2>
        <p className="text-gray-500">
          {t(`taskType.${model.task_type}`)} · {model.description}
        </p>
        <p className="text-sm text-gray-400">
          {t("field.createdAt")}: {formatDateTime(model.created_at, i18n.language)}
        </p>
      </section>

      <section>
        <div className="flex justify-between items-center">
          <h3 className="font-semibold">{t("version.list")}</h3>
          <button
            type="button"
            className="text-blue-600"
            onClick={() => setShowForm((v) => !v)}
          >
            {t("action.newVersion")}
          </button>
        </div>
        {showForm && (
          <NewVersionForm
            onSubmit={async (body) => {
              await api.createVersion(modelId, body);
              setShowForm(false);
              await reload();
            }}
          />
        )}
        <table className="w-full text-sm mt-2">
          <thead>
            <tr className="text-left text-gray-500">
              <th>{t("field.name")}</th>
              <th>{t("field.status")}</th>
              <th>{t("field.createdAt")}</th>
              <th>{t("field.resourceReq")}</th>
            </tr>
          </thead>
          <tbody>
            {versions.map((v) => (
              <tr key={v.id} className="border-t">
                <td>
                  <Link className="text-blue-600" to={`/versions/${v.id}`}>
                    {v.version}
                  </Link>
                </td>
                <td>{t(`status.${v.status}`)}</td>
                <td>{formatDateTime(v.created_at, i18n.language)}</td>
                <td>{JSON.stringify(v.resource_req)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section>
        <h3 className="font-semibold">
          {t("version.compare")}（{t("metrics.accuracy")}）
        </h3>
        <BarChart width={480} height={240} data={chartData}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="version" />
          <YAxis />
          <Tooltip />
          <Bar dataKey="accuracy" fill="#2563eb" />
        </BarChart>
      </section>
    </div>
  );
}
