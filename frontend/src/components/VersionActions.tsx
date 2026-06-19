import { useTranslation } from "react-i18next";

import { nextStatuses, type VersionStatus } from "../domain/stateMachine";

export function VersionActions({
  status,
  onTransition,
}: {
  status: VersionStatus;
  onTransition: (target: VersionStatus) => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex gap-2">
      {nextStatuses(status).map((s) => (
        <button
          key={s}
          type="button"
          data-testid={`transition-${s}`}
          onClick={() => onTransition(s)}
          className="border rounded px-3 py-1 hover:bg-gray-50"
        >
          {t("action.transitionTo", { status: t(`status.${s}`) })}
        </button>
      ))}
    </div>
  );
}
