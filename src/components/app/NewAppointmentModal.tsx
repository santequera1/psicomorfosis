import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useWorkspace } from "@/lib/workspace";
import { api, type ApiPatient } from "@/lib/api";
import { displayPatientName } from "@/lib/utils";
import { type Modality } from "@/lib/mock-data";
import { RiskBadge } from "@/components/app/RiskBadge";
import { Search, X, Loader2 } from "lucide-react";
import { toast } from "sonner";

type Props = {
  patients: ApiPatient[];
  /** Si está, se preselecciona y se oculta el buscador (modal contextual). */
  prefilledPatient?: ApiPatient | null;
  onClose: () => void;
  /** Llamado tras crear; útil para invalidar queries específicas de la página. */
  onCreated?: () => void;
};

export function NewAppointmentModal({ patients, prefilledPatient = null, onClose, onCreated }: Props) {
  const qc = useQueryClient();
  const { data: workspace } = useWorkspace();
  const isOrg = workspace?.mode === "organization";

  const [query, setQuery] = useState(prefilledPatient ? displayPatientName(prefilledPatient) : "");
  const [selected, setSelected] = useState<ApiPatient | null>(prefilledPatient ?? null);
  const [showResults, setShowResults] = useState(false);
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [time, setTime] = useState("10:30");
  const [modality, setModality] = useState<Modality>(prefilledPatient?.modality ?? "individual");
  const [duration, setDuration] = useState(50);
  const [notes, setNotes] = useState("");
  const [sedeId, setSedeId] = useState<number | "">(isOrg && workspace?.sedes[0] ? workspace.sedes[0].id : "");

  const filtered = query.trim()
    ? patients.filter((p) => {
        const q = query.toLowerCase();
        return p.name.toLowerCase().includes(q) || (p.preferredName ?? "").toLowerCase().includes(q) || p.doc.toLowerCase().includes(q) || p.id.toLowerCase().includes(q);
      }).slice(0, 6)
    : [];

  const mu = useMutation({
    mutationFn: () => api.createAppointment({
      patient_id: selected?.id ?? null,
      patient_name: selected?.name ?? "",
      professional: selected?.professional ?? "",
      professional_id: selected?.professionalId ?? null,
      sede_id: sedeId === "" ? null : sedeId,
      date,
      time,
      duration_min: duration,
      modality,
      room: modality === "tele" ? "Telepsicología" : "",
      status: "confirmada",
      notes,
    } as any),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["appointments"] });
      qc.invalidateQueries({ queryKey: ["all-appointments"] });
      qc.invalidateQueries({ queryKey: ["patients"] });
      toast.success("Cita agendada");
      onCreated?.();
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function pick(p: ApiPatient) {
    setSelected(p);
    setQuery(displayPatientName(p));
    setShowResults(false);
    if (p.modality) setModality(p.modality);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-900/40 backdrop-blur-sm p-4" onClick={onClose}>
      <form
        onSubmit={(e) => { e.preventDefault(); if (selected) mu.mutate(); }}
        className="w-full max-w-lg rounded-2xl bg-surface shadow-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="p-5 border-b border-line-100 flex items-start justify-between">
          <div>
            <p className="text-[11px] uppercase tracking-widest text-brand-800 font-medium">Nueva cita</p>
            <h3 className="font-serif text-xl text-ink-900 mt-0.5">
              {prefilledPatient ? `Agendar con ${displayPatientName(prefilledPatient)}` : "Crear cita"}
            </h3>
          </div>
          <button type="button" onClick={onClose} className="h-9 w-9 rounded-md border border-line-200 text-ink-500 hover:border-brand-400 flex items-center justify-center">
            <X className="h-4 w-4" />
          </button>
        </header>
        <div className="p-5 space-y-3">
          {!prefilledPatient && (
            <label className="block relative">
              <span className="text-[11px] uppercase tracking-wider text-ink-500 font-medium">Paciente</span>
              <div className="mt-1 flex items-center gap-2 h-10 px-3 rounded-md border border-line-200 bg-surface focus-within:border-brand-700">
                <Search className="h-4 w-4 text-ink-400" />
                <input
                  value={query}
                  onChange={(e) => { setQuery(e.target.value); setSelected(null); setShowResults(true); }}
                  onFocus={() => setShowResults(true)}
                  placeholder="Escribe el nombre, documento o ID…"
                  className="flex-1 bg-transparent text-sm outline-none text-ink-900"
                  required
                />
                {selected && (
                  <button type="button" onClick={() => { setSelected(null); setQuery(""); }} className="text-ink-400 hover:text-ink-700">
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
              {showResults && filtered.length > 0 && !selected && (
                <ul className="absolute z-20 mt-1 left-0 right-0 rounded-md border border-line-200 bg-surface shadow-modal max-h-64 overflow-y-auto">
                  {filtered.map((p) => (
                    <li key={p.id}>
                      <button
                        type="button"
                        onClick={() => pick(p)}
                        className="w-full flex items-center justify-between gap-3 px-3 py-2.5 hover:bg-brand-50/70 text-left"
                      >
                        <div className="min-w-0">
                          <div className="text-sm text-ink-900 truncate">{p.name}{p.preferredName ? ` · ${p.preferredName}` : ""}</div>
                          <div className="text-[11px] text-ink-500 truncate tabular">{p.doc} · {p.id}</div>
                        </div>
                        <RiskBadge risk={p.risk} types={p.riskTypes} compact />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {showResults && query.trim() && filtered.length === 0 && !selected && (
                <div className="absolute z-20 mt-1 left-0 right-0 rounded-md border border-line-200 bg-surface shadow-modal p-3 text-xs text-ink-500">
                  Sin coincidencias. Revisa el nombre o crea el paciente primero.
                </div>
              )}
            </label>
          )}

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-[11px] uppercase tracking-wider text-ink-500 font-medium">Fecha</span>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="mt-1 w-full h-10 px-3 rounded-md border border-line-200 bg-surface text-sm outline-none hover:border-brand-400" />
            </label>
            <label className="block">
              <span className="text-[11px] uppercase tracking-wider text-ink-500 font-medium">Hora</span>
              <input type="time" value={time} onChange={(e) => setTime(e.target.value)} className="mt-1 w-full h-10 px-3 rounded-md border border-line-200 bg-surface text-sm outline-none hover:border-brand-400" />
            </label>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-[11px] uppercase tracking-wider text-ink-500 font-medium">Modalidad</span>
              <select value={modality} onChange={(e) => setModality(e.target.value as Modality)} className="mt-1 w-full h-10 px-3 rounded-md border border-line-200 bg-surface text-sm outline-none hover:border-brand-400">
                <option value="individual">Individual</option>
                <option value="pareja">Pareja</option>
                <option value="familiar">Familiar</option>
                <option value="grupal">Grupal</option>
                <option value="tele">Telepsicología</option>
              </select>
            </label>
            <label className="block">
              <span className="text-[11px] uppercase tracking-wider text-ink-500 font-medium">Duración</span>
              <select value={duration} onChange={(e) => setDuration(Number(e.target.value))} className="mt-1 w-full h-10 px-3 rounded-md border border-line-200 bg-surface text-sm outline-none hover:border-brand-400">
                <option value={50}>50 min</option>
                <option value={30}>30 min</option>
                <option value={60}>60 min</option>
                <option value={90}>90 min</option>
              </select>
            </label>
          </div>

          {isOrg && workspace && workspace.sedes.length > 0 && (
            <label className="block">
              <span className="text-[11px] uppercase tracking-wider text-ink-500 font-medium">Sede</span>
              <select value={sedeId} onChange={(e) => setSedeId(e.target.value === "" ? "" : Number(e.target.value))} className="mt-1 w-full h-10 px-3 rounded-md border border-line-200 bg-surface text-sm outline-none hover:border-brand-400">
                <option value="">Sin sede asignada</option>
                {workspace.sedes.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </label>
          )}

          <label className="block">
            <span className="text-[11px] uppercase tracking-wider text-ink-500 font-medium">Notas</span>
            <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Observaciones internas…" className="mt-1 w-full px-3 py-2 rounded-md border border-line-200 bg-surface text-sm outline-none focus:border-brand-700" />
          </label>
        </div>
        <footer className="p-4 border-t border-line-100 bg-bg-100/30 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="h-9 px-3 rounded-md border border-line-200 text-sm text-ink-700 hover:border-brand-400">Cancelar</button>
          <button type="submit" disabled={!selected || mu.isPending} className="h-9 px-4 rounded-md bg-brand-700 text-primary-foreground text-sm font-medium hover:bg-brand-800 disabled:opacity-60 inline-flex items-center gap-2">
            {mu.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Crear cita
          </button>
        </footer>
      </form>
    </div>
  );
}
