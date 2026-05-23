import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, Check, FileText, Pencil } from "lucide-react";
import { api } from "@/lib/api";

/**
 * Editor de notas clínicas sobre el resultado de un test. Pedido por
 * Nathaly: el score automático no captura las observaciones cualitativas
 * que el psicólogo quiere anotar (contexto, dudas, hipótesis, factores
 * que matizan la interpretación).
 *
 * Comportamiento:
 *  - Si no hay nota, muestra un botón "Agregar nota".
 *  - Si hay nota, la muestra como texto con botón "Editar".
 *  - En modo edición, un textarea + botones Guardar / Cancelar.
 *  - Guarda via PATCH /tests/applications/:id/notes y refresca cache.
 */
export function NotesEditor({
  applicationId,
  initialNotes,
}: {
  applicationId: string;
  initialNotes: string | null | undefined;
}) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(initialNotes == null && false); // arranca cerrado
  const [draft, setDraft] = useState(initialNotes ?? "");

  const saveMu = useMutation({
    mutationFn: (notes: string | null) => api.setTestApplicationNotes(applicationId, notes),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["test-applications"] });
      qc.invalidateQueries({ queryKey: ["test-application", applicationId] });
      toast.success("Notas guardadas");
      setEditing(false);
    },
    onError: (e: Error) => toast.error(e.message ?? "No se pudo guardar"),
  });

  const hasNotes = !!(initialNotes && initialNotes.trim());

  if (editing) {
    return (
      <div className="mt-5 rounded-lg border border-brand-700/30 bg-brand-50/30 p-4">
        <label className="block text-[11px] uppercase tracking-widest text-brand-800 font-medium mb-2">
          Notas clínicas
        </label>
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={5}
          placeholder="Observaciones cualitativas que complementan el score. Ej: contexto en que se aplicó, factores que pudieron influir, hipótesis a explorar en próximas sesiones…"
          className="w-full px-3 py-2 rounded-md border border-line-200 bg-surface text-sm text-ink-900 focus:outline-none focus:border-brand-400 resize-y leading-relaxed"
          autoFocus
        />
        <div className="mt-2 flex gap-2 justify-end">
          <button
            type="button"
            onClick={() => {
              setDraft(initialNotes ?? "");
              setEditing(false);
            }}
            disabled={saveMu.isPending}
            className="h-9 px-3 rounded-md border border-line-200 text-sm text-ink-700 hover:border-brand-400 disabled:opacity-60"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => saveMu.mutate(draft.trim() ? draft : null)}
            disabled={saveMu.isPending}
            className="h-9 px-4 rounded-md bg-brand-700 text-white text-sm font-medium hover:bg-brand-800 inline-flex items-center gap-2 disabled:opacity-60"
          >
            {saveMu.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
            Guardar nota
          </button>
        </div>
      </div>
    );
  }

  if (!hasNotes) {
    return (
      <button
        type="button"
        onClick={() => { setDraft(""); setEditing(true); }}
        className="mt-5 w-full rounded-lg border border-dashed border-line-200 bg-bg-50/40 hover:border-brand-400 hover:bg-brand-50/30 p-4 text-left transition-colors group"
      >
        <div className="flex items-center gap-2 text-sm text-ink-700 group-hover:text-brand-800">
          <FileText className="h-4 w-4" />
          <span className="font-medium">Agregar nota clínica</span>
        </div>
        <p className="text-xs text-ink-500 mt-1 leading-relaxed">
          Observaciones cualitativas sobre este resultado: contexto, dudas, factores que matizan la interpretación.
        </p>
      </button>
    );
  }

  return (
    <div className="mt-5 rounded-lg border border-line-200 bg-bg-50/40 p-4">
      <div className="flex items-start justify-between gap-3 mb-2">
        <p className="text-[11px] uppercase tracking-widest text-ink-500 font-medium inline-flex items-center gap-1.5">
          <FileText className="h-3 w-3" /> Notas clínicas
        </p>
        <button
          type="button"
          onClick={() => { setDraft(initialNotes ?? ""); setEditing(true); }}
          className="text-xs text-brand-700 hover:underline inline-flex items-center gap-1"
        >
          <Pencil className="h-3 w-3" /> Editar
        </button>
      </div>
      <p className="text-sm text-ink-700 whitespace-pre-wrap leading-relaxed">
        {initialNotes}
      </p>
    </div>
  );
}
