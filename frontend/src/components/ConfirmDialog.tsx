import { useTranslation } from "react-i18next";

// 危险操作二次确认（停止/重启，2.6）。
export function ConfirmDialog({
  open,
  message,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  if (!open) return null;
  return (
    <div
      role="dialog"
      data-testid="confirm-dialog"
      className="fixed inset-0 flex items-center justify-center"
      style={{ background: "rgba(15,23,42,.45)", zIndex: 95 }}
    >
      <div className="bg-panel rounded-2xl p-5 space-y-4 shadow-xl" style={{ minWidth: 320 }}>
        <p className="text-sm text-text m-0">{message}</p>
        <div className="flex justify-end gap-2.5">
          <button
            type="button"
            data-testid="confirm-no"
            onClick={onCancel}
            className="border border-border rounded-[10px] px-4 py-2 font-bold text-sm text-text2 bg-panel"
          >
            {t("action.cancel")}
          </button>
          <button
            type="button"
            data-testid="confirm-yes"
            onClick={onConfirm}
            className="rounded-[10px] px-4 py-2 font-bold text-sm text-white"
            style={{ background: "#dc2626" }}
          >
            {t("action.confirm")}
          </button>
        </div>
      </div>
    </div>
  );
}
