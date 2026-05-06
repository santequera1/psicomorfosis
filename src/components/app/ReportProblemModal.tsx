import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { X, Bug, Loader2, AlertTriangle } from "lucide-react";
import {
  getCapturedErrors,
  clearCapturedErrors,
  submitErrorReport,
  type CapturedError,
} from "@/lib/error-reporter";

/**
 * Modal de "Reportar problema" — visible para cualquier usuario logueado
 * (también disponible sin login en pantallas públicas eventualmente).
 *
 * UX:
 *  - Textarea grande para que el usuario describa qué pasó.
 *  - Si hay errores capturados automáticamente, se muestran como
 *    chips colapsables y se mandan al backend junto con la descripción
 *    (el usuario puede leer y entender qué se está mandando).
 *  - URL actual + user agent se mandan automáticamente — son útiles
 *    para reproducir y no contienen datos sensibles.
 */
export function ReportProblemModal({ onClose }: { onClose: () => void }) {
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [includeAuto, setIncludeAuto] = useState(true);
  const errors = useMemo(() => getCapturedErrors(), []);

  // Esc cierra
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !submitting) onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, submitting]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (description.trim().length < 5) {
      toast.error("Cuéntanos un poco más sobre el problema (mínimo 5 caracteres).");
      return;
    }
    setSubmitting(true);
    try {
      // Si el usuario incluye errores capturados, mandamos uno por
      // separado (el más reciente) más la descripción. Es lo más
      // limpio: el reporte queda con el stack trace completo.
      const latest = includeAuto ? errors[0] : null;
      await submitErrorReport({
        kind: "manual",
        message: latest?.message,
        stack: latest?.stack ?? undefined,
        user_description: description,
      });
      toast.success("¡Gracias! Tu reporte fue enviado.");
      if (latest) clearCapturedErrors();
      onClose();
    } catch (err: any) {
      toast.error(err?.message ?? "No se pudo enviar el reporte. Intenta de nuevo.");
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-900/40 backdrop-blur-sm p-4" onClick={onClose}>
      <form
        onSubmit={submit}
        className="w-full max-w-lg rounded-2xl bg-surface shadow-modal max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="p-5 border-b border-line-100 flex items-start justify-between">
          <div className="flex items-start gap-3">
            <div className="h-9 w-9 rounded-full bg-warning-soft text-risk-moderate flex items-center justify-center shrink-0">
              <Bug className="h-4 w-4" />
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-widest text-ink-500 font-medium">Reportar problema</p>
              <h3 className="font-serif text-xl text-ink-900 mt-0.5">¿Qué pasó?</h3>
              <p className="text-xs text-ink-500 mt-1">
                Cuéntanos qué intentabas hacer y qué viste en pantalla. Lo revisamos y te avisamos cuando esté arreglado.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="h-9 w-9 rounded-md border border-line-200 text-ink-500 hover:border-brand-400 flex items-center justify-center shrink-0"
            disabled={submitting}
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          <label className="block">
            <span className="block text-xs font-medium text-ink-700 mb-1.5">Descripción</span>
            <textarea
              autoFocus
              rows={5}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Ej: Intenté abrir el detalle de un paciente y la página se quedó cargando."
              className="w-full px-3 py-2 rounded-lg border border-line-200 bg-bg text-sm text-ink-900 focus:outline-none focus:border-brand-400 resize-none"
            />
          </label>

          {errors.length > 0 && (
            <div className="rounded-lg border border-line-200 bg-bg-50 p-3">
              <label className="flex items-start gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={includeAuto}
                  onChange={(e) => setIncludeAuto(e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-line-300 text-brand-700 focus:ring-brand-400 shrink-0"
                />
                <span className="text-xs text-ink-700">
                  Incluir información técnica detectada automáticamente
                  <span className="text-ink-500"> ({errors.length} {errors.length === 1 ? "error" : "errores"})</span>
                </span>
              </label>
              {includeAuto && (
                <details className="mt-2 text-[11px] text-ink-500">
                  <summary className="cursor-pointer hover:text-brand-700">Ver detalles</summary>
                  <ul className="mt-2 space-y-2 max-h-40 overflow-y-auto">
                    {errors.map((err, i) => <ErrorPreview key={i} err={err} />)}
                  </ul>
                </details>
              )}
            </div>
          )}

          <div className="flex items-start gap-2 text-[11px] text-ink-500 pt-1">
            <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0 text-ink-400" />
            <span>
              Junto con tu mensaje enviamos la URL en la que estás y tu navegador, para poder reproducir el problema. No incluimos contenido de tus pacientes ni notas clínicas.
            </span>
          </div>
        </div>

        <footer className="p-5 border-t border-line-100 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="h-10 px-4 rounded-lg border border-line-200 text-ink-700 text-sm hover:border-brand-400"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={submitting || description.trim().length < 5}
            className="h-10 px-4 rounded-lg bg-brand-700 text-white text-sm font-medium hover:bg-brand-800 disabled:opacity-50 inline-flex items-center gap-2"
          >
            {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
            Enviar reporte
          </button>
        </footer>
      </form>
    </div>
  );
}

function ErrorPreview({ err }: { err: CapturedError }) {
  return (
    <li className="font-mono leading-snug">
      <div className="text-ink-700 break-all">{err.message}</div>
      <div className="text-ink-400 truncate">{err.url}</div>
    </li>
  );
}
