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
          className="border border-border rounded-lg px-3 py-1.5 text-sm font-semibold text-text2 bg-panel hover:bg-surface"
        >
          {t("action.transitionTo", { status: t(`status.${s}`) })}
        </button>
      ))}
    </div>
  );
}
