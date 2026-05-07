import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { X, Bug, Loader2, AlertTriangle, Image as ImageIcon, Paperclip } from "lucide-react";
import {
  getCapturedErrors,
  clearCapturedErrors,
  submitErrorReport,
  type CapturedError,
} from "@/lib/error-reporter";
import { cn } from "@/lib/utils";

/**
 * Modal de "Reportar problema" — visible para cualquier usuario logueado
 * (también disponible sin login en pantallas públicas eventualmente).
 *
 * UX:
 *  - Textarea grande para que el usuario describa qué pasó.
 *  - Adjuntar imágenes (capturas) por 3 vías:
 *      1) Pegar desde portapapeles con Ctrl+V (típico flujo "screenshot")
 *      2) Botón "Adjuntar imagen" (input file)
 *      3) Drag & drop sobre el área del modal
 *    Hasta 5 imágenes, 5 MB cada una, solo formatos de imagen.
 *  - Si hay errores capturados automáticamente, se muestran como
 *    detalles colapsables y se mandan junto al reporte.
 *  - URL actual + user agent se mandan automáticamente.
 */

const MAX_FILES = 5;
const MAX_FILE_SIZE = 5 * 1024 * 1024;
const ACCEPTED_MIME = /^image\/(png|jpe?g|webp|gif)$/i;

type Pending = {
  id: string;
  file: File;
  previewUrl: string;
};

export function ReportProblemModal({ onClose }: { onClose: () => void }) {
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [includeAuto, setIncludeAuto] = useState(true);
  const [attachments, setAttachments] = useState<Pending[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const errors = useMemo(() => getCapturedErrors(), []);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Esc cierra
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !submitting) onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, submitting]);

  // Limpieza de URLs object cuando el modal se desmonta o cuando cambian
  // los adjuntos — si no se hace, se filtran los blobs en memoria.
  useEffect(() => {
    return () => {
      attachments.forEach((a) => URL.revokeObjectURL(a.previewUrl));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function addFiles(files: File[]) {
    const accepted: Pending[] = [];
    const rejected: string[] = [];
    for (const f of files) {
      if (attachments.length + accepted.length >= MAX_FILES) {
        rejected.push(`${f.name} (máx ${MAX_FILES} imágenes)`);
        continue;
      }
      if (!ACCEPTED_MIME.test(f.type)) {
        rejected.push(`${f.name} (tipo no permitido)`);
        continue;
      }
      if (f.size > MAX_FILE_SIZE) {
        rejected.push(`${f.name} (máx 5 MB)`);
        continue;
      }
      accepted.push({
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        file: f,
        previewUrl: URL.createObjectURL(f),
      });
    }
    if (accepted.length > 0) setAttachments((curr) => [...curr, ...accepted]);
    if (rejected.length > 0) toast.error(`No agregadas: ${rejected.join(", ")}`);
  }

  function removeAttachment(id: string) {
    setAttachments((curr) => {
      const target = curr.find((a) => a.id === id);
      if (target) URL.revokeObjectURL(target.previewUrl);
      return curr.filter((a) => a.id !== id);
    });
  }

  // Pegar desde portapapeles. Listener dentro del form: tras un Ctrl+V el
  // browser dispara el evento donde esté el foco — el textarea cuenta, y
  // capturar a nivel del form también funciona si el usuario pega antes
  // de hacer click.
  function onPaste(e: React.ClipboardEvent) {
    const items = e.clipboardData.items;
    if (!items) return;
    const files: File[] = [];
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.kind === "file") {
        const f = item.getAsFile();
        if (f && ACCEPTED_MIME.test(f.type)) files.push(f);
      }
    }
    if (files.length > 0) {
      e.preventDefault();
      addFiles(files);
    }
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const files = Array.from(e.dataTransfer.files ?? []);
    if (files.length > 0) addFiles(files);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (description.trim().length < 5) {
      toast.error("Cuéntanos un poco más sobre el problema (mínimo 5 caracteres).");
      return;
    }
    setSubmitting(true);
    try {
      const latest = includeAuto ? errors[0] : null;
      await submitErrorReport({
        kind: "manual",
        message: latest?.message,
        stack: latest?.stack ?? undefined,
        user_description: description,
        attachments: attachments.length > 0 ? attachments.map((a) => a.file) : undefined,
      });
      toast.success("¡Gracias! Tu reporte fue enviado.");
      if (latest) clearCapturedErrors();
      attachments.forEach((a) => URL.revokeObjectURL(a.previewUrl));
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
        onPaste={onPaste}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        className={cn(
          "w-full max-w-lg rounded-2xl bg-surface shadow-modal max-h-[90vh] flex flex-col relative",
          dragOver && "ring-2 ring-brand-400",
        )}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Overlay visible cuando hay drag activo. */}
        {dragOver && (
          <div className="absolute inset-0 z-10 rounded-2xl bg-brand-50/90 border-2 border-dashed border-brand-400 flex items-center justify-center pointer-events-none">
            <div className="text-center">
              <ImageIcon className="h-8 w-8 mx-auto text-brand-700 mb-2" />
              <p className="text-sm font-medium text-brand-800">Suelta para adjuntar</p>
            </div>
          </div>
        )}

        <header className="p-5 border-b border-line-100 flex items-start justify-between">
          <div className="flex items-start gap-3">
            <div className="h-9 w-9 rounded-full bg-warning-soft text-risk-moderate flex items-center justify-center shrink-0">
              <Bug className="h-4 w-4" />
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-widest text-ink-500 font-medium">Reportar problema</p>
              <h3 className="font-serif text-xl text-ink-900 mt-0.5">¿Qué pasó?</h3>
              <p className="text-xs text-ink-500 mt-1">
                Cuéntanos qué intentabas hacer y qué viste. Puedes adjuntar capturas (Ctrl+V también funciona).
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

          {/* Adjuntos: previews + botón para añadir más */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-ink-700">
                Capturas <span className="text-ink-400">({attachments.length}/{MAX_FILES})</span>
              </span>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={attachments.length >= MAX_FILES}
                className="text-xs text-brand-700 hover:underline disabled:opacity-40 disabled:no-underline inline-flex items-center gap-1"
              >
                <Paperclip className="h-3 w-3" /> Adjuntar imagen
              </button>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept="image/png,image/jpeg,image/webp,image/gif"
                className="hidden"
                onChange={(e) => {
                  const files = Array.from(e.target.files ?? []);
                  if (files.length) addFiles(files);
                  e.target.value = "";  // permite re-seleccionar el mismo archivo
                }}
              />
            </div>
            {attachments.length > 0 ? (
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                {attachments.map((a) => (
                  <div key={a.id} className="relative group">
                    <img
                      src={a.previewUrl}
                      alt={a.file.name}
                      className="w-full h-20 object-cover rounded-lg border border-line-200"
                    />
                    <button
                      type="button"
                      onClick={() => removeAttachment(a.id)}
                      className="absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full bg-ink-900 text-white text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow"
                      aria-label={`Quitar ${a.file.name}`}
                    >
                      <X className="h-3 w-3" />
                    </button>
                    <div className="text-[10px] text-ink-500 mt-0.5 truncate">{a.file.name}</div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-[11px] text-ink-400 italic">
                Pega con Ctrl+V, arrastra archivos aquí, o usa "Adjuntar imagen".
              </p>
            )}
          </div>

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
              Junto con tu mensaje enviamos la URL en la que estás y tu navegador, para poder reproducir el problema. No incluimos contenido de tus pacientes ni notas clínicas. Las imágenes que adjuntes solo las vemos los administradores de la plataforma.
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
