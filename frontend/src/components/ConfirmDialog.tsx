import { useTranslation } from "react-i18next";

// 危险操作二次确认（停止/重启、删除等，2.6）。
// 通用:可传 title/confirmLabel,默认走 i18n;message 为正文说明。
export function ConfirmDialog({
  open,
  message,
  title,
  confirmLabel,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  message: string;
  title?: string;
  confirmLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  if (!open) return null;
  return (
    <>
      <div
        onClick={onCancel}
        style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,.5)", zIndex: 95 }}
      />
      <div
        role="dialog"
        aria-modal="true"
        data-testid="confirm-dialog"
        className="bg-panel rounded-2xl overflow-hidden"
        style={{
          position: "fixed",
          top: "50%",
          left: "50%",
          transform: "translate(-50%,-50%)",
          width: 420,
          maxWidth: "92vw",
          zIndex: 96,
          boxShadow: "0 24px 70px rgba(15,23,42,.35)",
        }}
      >
        <div className="flex items-start gap-3.5 px-7 pt-6 pb-5">
          <div
            aria-hidden
            className="shrink-0 flex items-center justify-center font-extrabold"
            style={{
              width: 38,
              height: 38,
              borderRadius: "50%",
              background: "var(--danger-soft)",
              color: "var(--danger)",
              fontSize: 20,
            }}
          >
            !
          </div>
          <div className="min-w-0">
            <div className="font-extrabold text-[15px] text-text mb-1.5">
              {title ?? t("confirm.title")}
            </div>
            <div className="text-[13.5px] text-text2 leading-relaxed break-words">
              {message}
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-2.5 px-7 py-4 bg-surface2 border-t border-border-soft">
          <button
            type="button"
            data-testid="confirm-no"
            onClick={onCancel}
            className="border border-border rounded-[10px] px-4 py-2 font-bold text-sm text-text2 bg-panel hover:bg-surface"
          >
            {t("action.cancel")}
          </button>
          <button
            type="button"
            data-testid="confirm-yes"
            onClick={onConfirm}
            className="rounded-[10px] px-4 py-2 font-bold text-sm text-white hover:opacity-90 transition"
            style={{ background: "var(--danger)" }}
          >
            {confirmLabel ?? t("action.confirm")}
          </button>
        </div>
      </div>
    </>
  );
}
