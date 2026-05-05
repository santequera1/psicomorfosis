import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { PatientPicker } from "@/components/app/PatientPicker";
import { X, FilePen } from "lucide-react";

/**
 * Atajo "Nueva nota": elige un paciente y navega a su historia clínica para
 * que el psicólogo cree la nota desde ahí. Usado en el dashboard de inicio
 * y en el FAB global.
 */
export function NewNoteShortcutModal({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();
  const [patientId, setPatientId] = useState<string | null>(null);
  const [patientName, setPatientName] = useState<string | null>(null);

  function go() {
    if (!patientId) return;
    onClose();
    navigate({ to: "/historia", search: { id: patientId } as any });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-ink-900/40 backdrop-blur-sm pt-16 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl bg-surface shadow-modal" onClick={(e) => e.stopPropagation()}>
        <header className="px-5 py-4 border-b border-line-100 flex items-start justify-between">
          <div>
            <p className="text-[11px] uppercase tracking-widest text-brand-700 font-medium">Acción rápida</p>
            <h3 className="font-serif text-xl text-ink-900 mt-0.5">Nueva nota de sesión</h3>
            <p className="text-xs text-ink-500 mt-1">Elige el paciente y te llevamos a su historia clínica.</p>
          </div>
          <button onClick={onClose} className="h-9 w-9 rounded-md border border-line-200 text-ink-500 hover:border-brand-400 flex items-center justify-center">
            <X className="h-4 w-4" />
          </button>
        </header>
        <div className="p-5 space-y-3">
          <PatientPicker
            value={patientId}
            onChange={(id, name) => { setPatientId(id); setPatientName(name ?? null); }}
            allowEmpty={false}
            autoFocus
          />
          {patientName && (
            <p className="text-xs text-ink-500">Vas a abrir la historia clínica de <strong className="text-ink-900">{patientName}</strong>.</p>
          )}
        </div>
        <footer className="p-4 border-t border-line-100 bg-bg-100/30 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="h-9 px-3 rounded-md border border-line-200 text-sm text-ink-700 hover:border-brand-400">Cancelar</button>
          <button type="button" onClick={go} disabled={!patientId} className="h-9 px-4 rounded-md bg-brand-700 text-primary-foreground text-sm font-medium hover:bg-brand-800 disabled:opacity-50 inline-flex items-center gap-2">
            <FilePen className="h-3.5 w-3.5" /> Abrir historia
          </button>
        </footer>
      </div>
    </div>
  );
}
