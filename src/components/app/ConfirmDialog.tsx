import { useEffect } from "react";
import { Trash2, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Diálogo de confirmación custom — reemplazo cross-app del window.confirm
 * nativo del navegador. La variante `danger` se usa para acciones
 * destructivas (eliminar, archivar permanente). ESC y click en el fondo
 * cancelan; el botón de confirmar tiene autoFocus para que el usuario
 * pueda confirmar con Enter inmediatamente.
 */
export function ConfirmDialog({
  title, message, confirmLabel = "Confirmar", cancelLabel = "Cancelar",
  danger = false, onConfirm, onCancel,
}: {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onCancel(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-ink-900/40 backdrop-blur-sm p-0 sm:p-4"
      onClick={onCancel}
    >
      <div
        className="w-full sm:max-w-md bg-surface rounded-t-2xl sm:rounded-2xl shadow-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="p-5">
          <div className="flex items-start gap-3">
            <div className={cn(
              "h-10 w-10 rounded-lg flex items-center justify-center shrink-0",
              danger ? "bg-error-soft text-risk-high" : "bg-brand-50 text-brand-700"
            )}>
              {danger ? <Trash2 className="h-5 w-5" /> : <AlertTriangle className="h-5 w-5" />}
            </div>
            <div className="min-w-0">
              <h3 className="font-serif text-lg text-ink-900">{title}</h3>
              <p className="text-sm text-ink-700 mt-1.5 leading-relaxed">{message}</p>
            </div>
          </div>
        </div>
        <div className="px-5 py-4 border-t border-line-100 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="h-10 px-4 rounded-lg border border-line-200 text-sm text-ink-700 hover:border-brand-400"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            autoFocus
            className={cn(
              "h-10 px-4 rounded-lg text-sm font-medium text-white",
              danger ? "bg-rose-600 hover:bg-rose-700" : "bg-brand-700 hover:bg-brand-800"
            )}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
