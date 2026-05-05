import { useState, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useWorkspace } from "@/lib/workspace";
import { RiskPicker } from "@/components/app/RiskPicker";
import { TagEditor } from "@/components/app/TagEditor";
import { type Patient, type Modality, type Risk, type RiskType } from "@/lib/mock-data";
import { X, Loader2, AlertCircle } from "lucide-react";

/**
 * Modal de alta de paciente en 3 pasos. Usado desde la lista de pacientes
 * y desde el FAB global. Idéntico funcionalmente al original que vivía en
 * pacientes.tsx — extraído para poder reutilizarlo.
 */
export function NewPatientModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const { data: workspace } = useWorkspace();
  const isOrg = workspace?.mode === "organization";
  const professionals = workspace?.professionals ?? [];
  const mainProfessional = professionals[0];

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [form, setForm] = useState<Partial<Patient> & { professionalId?: number }>({ pronouns: "ella", modality: "individual", status: "activo", risk: "none", riskTypes: [], tags: [] });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Sugerencias de etiquetas: tags ya usadas en otros pacientes del workspace.
  const { data: existingPatients = [] } = useQuery({ queryKey: ["patients"], queryFn: () => api.listPatients() });
  const tagSuggestions = useMemo(() => {
    const set = new Set<string>();
    for (const p of existingPatients) (p.tags ?? []).forEach((t) => set.add(t));
    return Array.from(set).sort();
  }, [existingPatients]);

  const createMutation = useMutation({
    mutationFn: (body: Partial<Patient> & { professionalId?: number }) => api.createPatient(body),
    onSuccess: (created) => {
      qc.setQueryData<Patient[]>(["patients"], (old = []) => {
        if (old.some((p) => p.id === created.id)) return old;
        return [...old, created].sort((a, b) => a.name.localeCompare(b.name));
      });
      qc.invalidateQueries({ queryKey: ["patients"] });
      qc.invalidateQueries({ queryKey: ["workspace"] });
      qc.invalidateQueries({ queryKey: ["appointments"] });
      onClose();
    },
    onError: (e: Error) => { setErr(e.message); setSaving(false); },
  });

  function updateField<K extends keyof Patient>(k: K, v: Patient[K]) {
    setForm((prev) => ({ ...prev, [k]: v }));
  }

  function submit() {
    setSaving(true);
    setErr(null);
    const professionalId = isOrg ? form.professionalId : mainProfessional?.id;
    const professionalName = isOrg
      ? professionals.find((p) => p.id === form.professionalId)?.name ?? ""
      : mainProfessional?.name ?? "";
    createMutation.mutate({
      name: `${(form as any).firstName ?? ""} ${(form as any).lastName ?? ""}`.trim() || "Sin nombre",
      pronouns: form.pronouns,
      doc: form.doc ?? "",
      age: form.age ?? 0,
      phone: form.phone ?? "",
      email: form.email ?? "",
      professional: professionalName,
      professionalId,
      modality: form.modality,
      status: form.status,
      reason: form.reason ?? "",
      lastContact: "Hoy",
      risk: form.risk,
      riskTypes: form.riskTypes,
      tags: form.tags ?? [],
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-ink-900/40 backdrop-blur-sm pt-16 p-4 overflow-y-auto" onClick={onClose}>
      <div className="w-full max-w-xl rounded-2xl bg-surface shadow-modal" onClick={(e) => e.stopPropagation()}>
        <header className="p-5 border-b border-line-100 flex items-start justify-between">
          <div>
            <p className="text-[11px] uppercase tracking-widest text-brand-800 font-medium">Pacientes</p>
            <h3 className="font-serif text-xl text-ink-900 mt-0.5">Nuevo paciente</h3>
            <p className="text-xs text-ink-500 mt-1">Paso {step} de 3 · datos básicos · clínicos · consentimiento</p>
          </div>
          <button onClick={onClose} className="h-9 w-9 rounded-md border border-line-200 text-ink-500 hover:border-brand-400 flex items-center justify-center">
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="h-1 bg-bg-100">
          <div className="h-full bg-brand-700 transition-all" style={{ width: `${(step / 3) * 100}%` }} />
        </div>

        <div className="p-5 space-y-3">
          {step === 1 && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <Labeled label="Nombres"><input onChange={(e) => setForm((p) => ({ ...p, ...(p as any), firstName: e.target.value } as any))} placeholder="Nombre(s)" className="mt-1 w-full h-10 px-3 rounded-md border border-line-200 bg-surface text-sm outline-none focus:border-brand-700" /></Labeled>
                <Labeled label="Apellidos"><input onChange={(e) => setForm((p) => ({ ...p, ...(p as any), lastName: e.target.value } as any))} placeholder="Apellido(s)" className="mt-1 w-full h-10 px-3 rounded-md border border-line-200 bg-surface text-sm outline-none focus:border-brand-700" /></Labeled>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Labeled label="Documento">
                  <input onChange={(e) => updateField("doc", e.target.value)} placeholder="CC 1.024.587.XXX" className="mt-1 w-full h-10 px-3 rounded-md border border-line-200 bg-surface text-sm outline-none focus:border-brand-700 tabular" />
                </Labeled>
                <Labeled label="Edad"><input type="number" onChange={(e) => updateField("age", Number(e.target.value))} placeholder="28" className="mt-1 w-full h-10 px-3 rounded-md border border-line-200 bg-surface text-sm outline-none focus:border-brand-700 tabular" /></Labeled>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Labeled label="Pronombres">
                  <select value={form.pronouns ?? "ella"} onChange={(e) => updateField("pronouns", e.target.value)} className="mt-1 w-full h-10 px-3 rounded-md border border-line-200 bg-surface text-sm outline-none hover:border-brand-400">
                    <option>ella</option><option>él</option><option>elle</option><option>prefiere no decir</option>
                  </select>
                </Labeled>
                <Labeled label="Teléfono"><input onChange={(e) => updateField("phone", e.target.value)} placeholder="+57 310 000 0000" className="mt-1 w-full h-10 px-3 rounded-md border border-line-200 bg-surface text-sm outline-none focus:border-brand-700" /></Labeled>
              </div>
              <Labeled label="Correo"><input type="email" onChange={(e) => updateField("email", e.target.value)} placeholder="paciente@correo.co" className="mt-1 w-full h-10 px-3 rounded-md border border-line-200 bg-surface text-sm outline-none focus:border-brand-700" /></Labeled>
            </>
          )}
          {step === 2 && (
            <>
              <Labeled label="Motivo de consulta">
                <textarea rows={3} onChange={(e) => updateField("reason", e.target.value)} placeholder="Describe brevemente el motivo principal…" className="mt-1 w-full px-3 py-2 rounded-md border border-line-200 bg-surface text-sm outline-none focus:border-brand-700" />
              </Labeled>
              <div className={"grid gap-3 " + (isOrg ? "grid-cols-2" : "grid-cols-1")}>
                {isOrg && (
                  <Labeled label="Profesional asignada/o">
                    <select
                      value={form.professionalId ?? ""}
                      onChange={(e) => setForm((p) => ({ ...p, professionalId: Number(e.target.value) }))}
                      className="mt-1 w-full h-10 px-3 rounded-md border border-line-200 bg-surface text-sm outline-none hover:border-brand-400"
                    >
                      <option value="">Selecciona…</option>
                      {professionals.map((prof) => (
                        <option key={prof.id} value={prof.id}>{prof.name}</option>
                      ))}
                    </select>
                  </Labeled>
                )}
                <Labeled label="Modalidad">
                  <select value={form.modality ?? "individual"} onChange={(e) => updateField("modality", e.target.value as Modality)} className="mt-1 w-full h-10 px-3 rounded-md border border-line-200 bg-surface text-sm outline-none hover:border-brand-400">
                    <option value="individual">Individual</option><option value="pareja">Pareja</option><option value="familiar">Familiar</option><option value="grupal">Grupal</option><option value="tele">Telepsicología</option>
                  </select>
                </Labeled>
              </div>
              {!isOrg && mainProfessional && (
                <div className="rounded-md bg-bg-100/60 border border-line-200 p-3 text-xs text-ink-500">
                  Profesional asignada: <span className="text-ink-900 font-medium">{mainProfessional.name}</span>
                </div>
              )}
              <div className="rounded-lg border border-line-200 bg-bg-100/30 p-3.5">
                <p className="text-[11px] uppercase tracking-widest text-brand-800 font-medium mb-2">Bandera de riesgo inicial</p>
                <RiskPicker
                  level={(form.risk ?? "none") as Risk}
                  types={(form.riskTypes ?? []) as RiskType[]}
                  onLevelChange={(r) => updateField("risk", r)}
                  onTypesChange={(t) => updateField("riskTypes", t as Patient["riskTypes"])}
                />
              </div>
              <Labeled label="Etiquetas">
                <div className="mt-1">
                  <TagEditor
                    value={form.tags ?? []}
                    onChange={(t) => updateField("tags", t as Patient["tags"])}
                    suggestions={tagSuggestions}
                  />
                </div>
              </Labeled>
            </>
          )}
          {step === 3 && (
            <>
              <div className="rounded-lg border border-brand-700/20 bg-brand-50/40 p-4 text-sm text-ink-700">
                Se enviará por correo el consentimiento informado y el enlace del portal del paciente. Podrás firmar digitalmente en la siguiente sesión.
              </div>
              <label className="flex items-start gap-2 mt-3 text-sm text-ink-700">
                <input type="checkbox" defaultChecked className="mt-1" />
                <span>Enviar consentimiento informado por correo</span>
              </label>
              <label className="flex items-start gap-2 text-sm text-ink-700">
                <input type="checkbox" defaultChecked className="mt-1" />
                <span>Crear acceso al portal del paciente</span>
              </label>
              <label className="flex items-start gap-2 text-sm text-ink-700">
                <input type="checkbox" className="mt-1" />
                <span>Agendar primera cita inmediatamente</span>
              </label>
            </>
          )}
        </div>

        {err && (
          <div className="mx-5 mb-3 rounded-md border border-risk-high/30 bg-error-soft p-3 text-xs text-ink-700 flex items-start gap-2">
            <AlertCircle className="h-4 w-4 text-risk-high shrink-0 mt-0.5" /> {err}
          </div>
        )}
        <footer className="p-4 border-t border-line-100 bg-bg-100/30 flex justify-between gap-2">
          <button
            onClick={() => (step > 1 ? setStep((step - 1) as 1 | 2) : onClose())}
            disabled={saving}
            className="h-9 px-3 rounded-md border border-line-200 text-sm text-ink-700 hover:border-brand-400 disabled:opacity-60"
          >
            {step === 1 ? "Cancelar" : "Atrás"}
          </button>
          <button
            onClick={() => (step < 3 ? setStep((step + 1) as 2 | 3) : submit())}
            disabled={saving}
            className="h-9 px-4 rounded-md bg-brand-700 text-primary-foreground text-sm font-medium hover:bg-brand-800 disabled:opacity-60 inline-flex items-center gap-2"
          >
            {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {step === 3 ? "Crear paciente" : "Continuar"}
          </button>
        </footer>
      </div>
    </div>
  );
}

function Labeled({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-[11px] uppercase tracking-wider text-ink-500 font-medium">{label}</span>
      {children}
    </label>
  );
}
