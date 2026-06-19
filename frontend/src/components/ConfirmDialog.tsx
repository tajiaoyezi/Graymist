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
      className="fixed inset-0 flex items-center justify-center bg-black/30"
    >
      <div className="bg-white rounded p-4 space-y-3 shadow">
        <p className="text-sm">{message}</p>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            data-testid="confirm-no"
            onClick={onCancel}
            className="border rounded px-3 py-1"
          >
            {t("action.cancel")}
          </button>
          <button
            type="button"
            data-testid="confirm-yes"
            onClick={onConfirm}
            className="border rounded px-3 py-1 bg-red-600 text-white"
          >
            {t("action.confirm")}
          </button>
        </div>
      </div>
    </div>
  );
}
