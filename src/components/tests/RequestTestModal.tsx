import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { X, Loader2, Send } from "lucide-react";
import { api } from "@/lib/api";

/**
 * Modal para que el psicólogo solicite al equipo Psicomorfosis un test
 * clínico complejo que no quiere/no puede crear como formulario simple.
 * Sirve como canal de demanda real para priorizar implementaciones
 * oficiales (Goldberg, GADS, etc.).
 */
export function RequestTestModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const [testName, setTestName] = useState("");
  const [reason, setReason] = useState("");

  const mu = useMutation({
    mutationFn: () => api.createTestRequest({ test_name: testName.trim(), reason: reason.trim() || undefined }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["test-requests"] });
      toast.success("Solicitud enviada al equipo Psicomorfosis");
      onClose();
    },
    onError: (e: Error) => toast.error(e.message ?? "No se pudo enviar la solicitud"),
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!testName.trim()) {
      toast.error("Indica el nombre del test que necesitas");
      return;
    }
    mu.mutate();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-ink-900/40 backdrop-blur-sm p-0 sm:p-4"
      onClick={onClose}
    >
      <form
        onSubmit={handleSubmit}
        onClick={(e) => e.stopPropagation()}
        className="w-full sm:max-w-md bg-surface rounded-t-2xl sm:rounded-2xl shadow-modal max-h-[92vh] flex flex-col"
      >
        <header className="px-5 py-4 border-b border-line-100 flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] uppercase tracking-widest text-brand-700 font-medium">Equipo Psicomorfosis</p>
            <h3 className="font-serif text-lg text-ink-900 mt-0.5">Solicitar un test</h3>
            <p className="text-xs text-ink-500 mt-1">
              Para instrumentos clínicos validados (escalas estructuradas con scoring complejo). Los implementamos nosotros para mantener calidad clínica.
            </p>
          </div>
          <button type="button" onClick={onClose} className="h-9 w-9 rounded-md border border-line-200 flex items-center justify-center text-ink-500 hover:border-brand-400 shrink-0">
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="p-5 space-y-4">
          <label className="block">
            <span className="block text-xs font-medium text-ink-700 mb-1.5">Nombre del test <span className="text-rose-700">*</span></span>
            <input
              autoFocus
              type="text"
              value={testName}
              onChange={(e) => setTestName(e.target.value)}
              maxLength={120}
              placeholder="Ej. GADS, Escala de Goldberg, MMSE…"
              className="w-full h-10 px-3 rounded-lg border border-line-200 bg-bg text-sm text-ink-900 focus:outline-none focus:border-brand-400"
            />
          </label>
          <label className="block">
            <span className="block text-xs font-medium text-ink-700 mb-1.5">¿Para qué lo necesitas?</span>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={4}
              maxLength={500}
              placeholder="Cuéntanos brevemente el caso clínico y la población. Eso nos ayuda a priorizar."
              className="w-full px-3 py-2 rounded-lg border border-line-200 bg-bg text-sm text-ink-900 focus:outline-none focus:border-brand-400 resize-none"
            />
          </label>
        </div>

        <footer className="px-5 py-4 border-t border-line-100 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="h-10 px-4 rounded-lg border border-line-200 text-sm text-ink-700 hover:border-brand-400"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={mu.isPending}
            className="h-10 px-4 rounded-lg bg-brand-700 text-white text-sm font-medium hover:bg-brand-800 disabled:opacity-60 inline-flex items-center gap-2"
          >
            {mu.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Enviar solicitud
          </button>
        </footer>
      </form>
    </div>
  );
}
