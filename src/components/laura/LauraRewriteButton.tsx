import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Sparkles, Loader2, X, Check, RotateCw, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

/**
 * Botón "Mejorar con Laura" para cualquier textarea de nota clínica
 * (Fase 1.2). Se monta junto al textarea y, al hacer click, despliega
 * un dropdown con los modos de reescritura. Al elegir uno:
 *
 *  1. Llama POST /api/laura/rewrite con texto + modo.
 *  2. Abre un modal mostrando ORIGINAL vs PROPUESTA lado a lado.
 *  3. El psicólogo aprueba (reemplaza) o descarta.
 *
 * Reglas de uso:
 *  - No aparece si el textarea está vacío (no hay nada que mejorar).
 *  - El reemplazo ocurre vía `onReplace(nuevoTexto)` que el padre
 *    implementa con su setState.
 */

type Mode = "clinical" | "concise" | "soap" | "humanize" | "expand";

type Props = {
  /** Texto actual del textarea (lo que va a mejorar Laura). */
  text: string;
  /** Callback que aplica el reemplazo cuando el psicólogo aprueba. */
  onReplace: (newText: string) => void;
  /** Estilo del botón: compact (icon-only) o full (con label). */
  variant?: "compact" | "full";
  /** className extra para el botón. */
  className?: string;
  /** Deshabilitar (cuando el textarea no tiene foco o está leyendo). */
  disabled?: boolean;
};

const MODES: { id: Mode; label: string; hint: string }[] = [
  { id: "clinical", label: "Más clínico",  hint: "Registro profesional, sustantivos clínicos" },
  { id: "concise",  label: "Más breve",    hint: "Misma info, menos palabras" },
  { id: "soap",     label: "Formato SOAP", hint: "Estructurar en S / O / A / P" },
  { id: "humanize", label: "Más cálido",   hint: "Lenguaje accesible al paciente" },
  { id: "expand",   label: "Ampliar",      hint: "Estructurar y desarrollar apuntes cortos" },
];

export function LauraRewriteButton({ text, onReplace, variant = "compact", className, disabled }: Props) {
  const [open, setOpen] = useState(false);
  // Estado de transición del dropdown — montamos mientras está en
  // "open" o "closing"; al finalizar el close hacemos unmount real.
  const [dropdownPhase, setDropdownPhase] = useState<"opening" | "open" | "closing">("opening");
  const [loading, setLoading] = useState(false);
  const [proposal, setProposal] = useState<{ original: string; rewritten: string; mode: Mode } | null>(null);

  useEffect(() => {
    if (!open) return;
    setDropdownPhase("opening");
    const t = window.setTimeout(() => setDropdownPhase("open"), 10);
    return () => window.clearTimeout(t);
  }, [open]);

  function closeDropdown() {
    setDropdownPhase("closing");
    window.setTimeout(() => setOpen(false), 150);
  }

  const hasText = text.trim().length > 0;
  const isDisabled = disabled || !hasText || loading;

  async function runRewrite(mode: Mode) {
    closeDropdown();
    setLoading(true);
    try {
      const { rewritten } = await api.lauraRewrite({ text, mode });
      if (rewritten === "(Sin contenido para reescribir)") {
        toast.info("No había contenido suficiente para mejorar.");
      } else {
        setProposal({ original: text, rewritten, mode });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "No pude generar la propuesta";
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }

  function handleApprove() {
    if (proposal) onReplace(proposal.rewritten);
    setProposal(null);
  }

  return (
    <>
      <div className="relative inline-block">
        <button
          type="button"
          onClick={() => open ? closeDropdown() : setOpen(true)}
          disabled={isDisabled}
          title={hasText ? "Mejorar este texto con Laura" : "Escribí algo primero"}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-md border border-brand-200/70 bg-brand-50/40 text-[11px] font-medium text-brand-800 hover:bg-brand-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed",
            variant === "compact" ? "h-7 px-2" : "h-8 px-3",
            className,
          )}
        >
          {loading ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <Sparkles className="h-3 w-3" />
          )}
          {variant === "full" && <span>Mejorar con Laura</span>}
          {!loading && <ChevronDown className="h-3 w-3 opacity-60" />}
        </button>

        {open && (
          <>
            {/* Backdrop transparente para cerrar al click fuera */}
            <div className="fixed inset-0 z-30" onClick={closeDropdown} />
            <div
              data-origin="top-right"
              className={cn(
                "t-dropdown absolute right-0 top-full mt-1 z-40 w-56 rounded-lg border border-line-200 bg-surface shadow-lg overflow-hidden",
                dropdownPhase === "open" && "is-open",
                dropdownPhase === "closing" && "is-closing",
              )}
            >
              <p className="px-3 py-1.5 text-[10px] uppercase tracking-widest text-ink-500 border-b border-line-100">
                Cómo lo reescribo
              </p>
              <ul className="py-1">
                {MODES.map((m) => (
                  <li key={m.id}>
                    <button
                      type="button"
                      onClick={() => runRewrite(m.id)}
                      className="w-full text-left px-3 py-2 hover:bg-bg-50"
                    >
                      <p className="text-xs font-medium text-ink-900">{m.label}</p>
                      <p className="text-[10px] text-ink-500">{m.hint}</p>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </>
        )}
      </div>

      {proposal && (
        <ProposalModal
          original={proposal.original}
          rewritten={proposal.rewritten}
          mode={proposal.mode}
          onApprove={handleApprove}
          onClose={() => setProposal(null)}
          onRetry={() => { const m = proposal.mode; setProposal(null); void runRewrite(m); }}
        />
      )}
    </>
  );
}

function ProposalModal({
  original, rewritten, mode, onApprove, onClose, onRetry,
}: {
  original: string;
  rewritten: string;
  mode: Mode;
  onApprove: () => void;
  onClose: () => void;
  onRetry: () => void;
}) {
  const modeLabel = MODES.find((m) => m.id === mode)?.label ?? mode;
  // Patrón t-modal: opening → open → closing → unmount.
  const [phase, setPhase] = useState<"opening" | "open" | "closing">("opening");
  useEffect(() => {
    const t = window.setTimeout(() => setPhase("open"), 10);
    return () => window.clearTimeout(t);
  }, []);
  function requestClose() {
    setPhase("closing");
    window.setTimeout(onClose, 150);
  }
  function approveAndClose() {
    setPhase("closing");
    window.setTimeout(onApprove, 150);
  }
  const stateClass = phase === "open" ? "is-open" : phase === "closing" ? "is-closing" : "";
  return (
    <div
      className={cn(
        "fixed inset-0 z-50 bg-ink-900/40 backdrop-blur-sm flex items-center justify-center p-4 t-modal-backdrop",
        stateClass,
      )}
      onClick={requestClose}
    >
      <div
        className={cn(
          "bg-surface rounded-2xl shadow-2xl w-full max-w-3xl max-h-[85vh] flex flex-col border border-line-200 t-modal",
          stateClass,
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center gap-3 p-4 border-b border-line-100 shrink-0">
          <img src="/laura/laura-profile-2.svg" alt="" className="h-8 w-8 rounded-full object-cover bg-brand-50" />
          <div className="flex-1 min-w-0">
            <p className="text-[10px] uppercase tracking-widest text-brand-700 font-semibold inline-flex items-center gap-1.5">
              <Sparkles className="h-3 w-3" /> Propuesta de Laura
            </p>
            <h3 className="text-sm font-medium text-ink-900">{modeLabel}</h3>
          </div>
          <button
            type="button"
            onClick={requestClose}
            className="h-8 w-8 rounded-md text-ink-500 hover:bg-bg-50 inline-flex items-center justify-center"
            aria-label="Cerrar"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto p-4 grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <p className="text-[10px] uppercase tracking-wider text-ink-500 font-medium mb-1.5">Original</p>
            <div className="text-xs text-ink-700 leading-relaxed whitespace-pre-wrap rounded-md border border-line-200 bg-bg-50/50 p-3 max-h-[55vh] overflow-y-auto">
              {original}
            </div>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wider text-brand-700 font-medium mb-1.5">Propuesta</p>
            <div className="text-xs text-ink-900 leading-relaxed whitespace-pre-wrap rounded-md border border-brand-200/70 bg-brand-50/40 p-3 max-h-[55vh] overflow-y-auto">
              {rewritten}
            </div>
          </div>
        </div>

        <footer className="border-t border-line-100 p-3 shrink-0 flex flex-wrap items-center gap-2 justify-between">
          <p className="text-[10px] text-ink-500">
            Al aplicar, reemplaza el contenido del textarea. Vos seguís pudiendo editar después.
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onRetry}
              className="h-9 px-3 rounded-lg border border-line-200 text-xs text-ink-700 hover:bg-bg-50 inline-flex items-center gap-1.5"
              title="Volver a pedirle a Laura otra versión del mismo modo"
            >
              <RotateCw className="h-3.5 w-3.5" />
              Reintentar
            </button>
            <button
              type="button"
              onClick={requestClose}
              className="h-9 px-3 rounded-lg border border-line-200 text-xs text-ink-700 hover:bg-bg-50"
            >
              Descartar
            </button>
            <button
              type="button"
              onClick={approveAndClose}
              className="h-9 px-3 rounded-lg bg-brand-700 text-white text-xs font-medium hover:bg-brand-800 inline-flex items-center gap-1.5"
            >
              <Check className="h-3.5 w-3.5" />
              Aplicar reemplazo
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
