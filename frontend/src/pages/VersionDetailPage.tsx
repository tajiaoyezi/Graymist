import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useParams } from "react-router-dom";

import { ApiError, api } from "../api/client";
import { VersionActions } from "../components/VersionActions";
import type { Model, Version } from "../types";

export function VersionDetailPage() {
  const { t } = useTranslation();
  const { versionId = "" } = useParams();
  const [version, setVersion] = useState<Version | null>(null);
  const [model, setModel] = useState<Model | null>(null);
  const [error, setError] = useState("");

  async function load() {
    try {
      setError("");
      const v = await api.getVersion(versionId);
      setVersion(v);
      setModel(await api.getModel(v.model_id));
    } catch (e) {
      setError(e instanceof ApiError ? e.detail : "加载失败");
    }
  }

  useEffect(() => {
    void load();
  }, [versionId]);

  if (error && !version) {
    return (
      <div data-testid="page-error" className="text-red-600">
        {error}
      </div>
    );
  }
  if (!version || !model) return null;

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">
        {model.name} / {version.version}
      </h2>
      <div className="text-sm">
        {t("field.status")}: {t(`status.${version.status}`)} · {t("field.deployable")}:{" "}
        <span data-testid="deployable">
          {version.deployable ? t("field.yes") : t("field.no")}
        </span>
      </div>

      <section>
        <h3 className="font-semibold">{t("field.inputSchema")}</h3>
        <pre className="bg-gray-50 p-3 rounded text-sm overflow-auto">
          {JSON.stringify(model.input_schema, null, 2)}
        </pre>
        <h3 className="font-semibold mt-2">{t("field.outputSchema")}</h3>
        <pre className="bg-gray-50 p-3 rounded text-sm overflow-auto">
          {JSON.stringify(model.output_schema, null, 2)}
        </pre>
      </section>

      <section>
        <h3 className="font-semibold">{t("metrics.title")}</h3>
        <ul className="text-sm">
          <li>
            {t("metrics.accuracy")}: {version.metrics?.accuracy ?? "—"}
          </li>
          <li>
            {t("metrics.latency")}: {version.metrics?.latency ?? "—"}
          </li>
          <li>
            {t("metrics.throughput")}: {version.metrics?.throughput ?? "—"}
          </li>
        </ul>
      </section>

      <section>
        <h3 className="font-semibold">{t("field.changeNote")}</h3>
        <p className="text-sm">{version.change_note}</p>
      </section>

      {error && (
        <div data-testid="action-error" className="text-red-600 text-sm">
          {error}
        </div>
      )}
      <VersionActions
        status={version.status}
        onTransition={async (target) => {
          try {
            setError("");
            setVersion(await api.transitionVersion(version.id, target));
          } catch (e) {
            // 非法流转 409 / 其它错误回显，而非静默 rejection（M1 / L6）
            setError(e instanceof ApiError ? e.detail : "操作失败");
          }
        }}
      />
    </div>
  );
}
