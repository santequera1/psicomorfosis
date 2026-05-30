import { useState, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api, type ApiPatient } from "@/lib/api";
import { useWorkspace } from "@/lib/workspace";
import { RiskPicker } from "@/components/app/RiskPicker";
import { TagEditor } from "@/components/app/TagEditor";
import { NewAppointmentModal } from "@/components/app/NewAppointmentModal";
import { type Patient, type Modality, type Risk, type RiskType } from "@/lib/mock-data";
import { X, Loader2, AlertCircle } from "lucide-react";
import { AppSelect } from "@/components/app/AppSelect";
import { VoiceRecorderButton } from "@/components/app/VoiceRecorderButton";

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

  // Checkboxes del paso 3. Antes eran puramente decorativos (defaultChecked
  // sin onChange y sin lectura en submit) → la psicóloga marcaba "agendar
  // primera cita" y nada pasaba. Ahora están en state y se procesan al
  // crear el paciente.
  const [optInvite, setOptInvite] = useState(true);    // crear acceso al portal (incluye consentimiento por email)
  const [optConsent, setOptConsent] = useState(true);  // enviar consentimiento por correo (mismo email del invite)
  const [optScheduleFirst, setOptScheduleFirst] = useState(false);
  // Si optScheduleFirst está activo, después de crear el paciente
  // abrimos el modal de nueva cita preseleccionándolo.
  const [pendingApptPatient, setPendingApptPatient] = useState<ApiPatient | null>(null);

  // Sugerencias de etiquetas: tags ya usadas en otros pacientes del workspace.
  const { data: existingPatients = [] } = useQuery({ queryKey: ["patients"], queryFn: () => api.listPatients() });
  const tagSuggestions = useMemo(() => {
    const set = new Set<string>();
    for (const p of existingPatients) (p.tags ?? []).forEach((t) => set.add(t));
    return Array.from(set).sort();
  }, [existingPatients]);

  const createMutation = useMutation({
    mutationFn: (body: Partial<Patient> & { professionalId?: number }) => api.createPatient(body),
    onSuccess: async (created) => {
      qc.setQueryData<Patient[]>(["patients"], (old = []) => {
        if (old.some((p) => p.id === created.id)) return old;
        return [...old, created].sort((a, b) => a.name.localeCompare(b.name));
      });
      qc.invalidateQueries({ queryKey: ["patients"] });
      qc.invalidateQueries({ queryKey: ["workspace"] });
      qc.invalidateQueries({ queryKey: ["appointments"] });
      // Procesa las opciones del paso 3.
      //   - optInvite || optConsent → generar invitación al portal
      //     (el email del invite ya incluye el consentimiento informado,
      //     son la misma acción en backend; ambos checks llevan a invitar
      //     una sola vez).
      //   - optScheduleFirst → abrir modal de nueva cita preseleccionando
      //     al paciente recién creado. NO cerramos este modal hasta que
      //     el de cita se cierre — el cliente se queda con un contexto
      //     claro y el modal de cita puede pre-seleccionar.
      if ((optInvite || optConsent) && created.email) {
        try {
          const res = await api.invitePatient(created.id);
          if (res.email_status === "queued") {
            toast.success("Invitación al portal enviada por email");
          } else {
            toast.success("Invitación generada. Compártela manualmente desde la ficha del paciente.");
          }
        } catch (e: any) {
          // No reventamos el flow si el invite falla (puede que no tenga
          // email, etc.). Avisamos para que la psicóloga lo pueda reintentar.
          toast.error(`Invitación al portal: ${e?.message ?? "error desconocido"}`);
        }
      } else if ((optInvite || optConsent) && !created.email) {
        toast.message("Sin email — no se envió invitación al portal. Edita el paciente para añadirlo.");
      }
      if (optScheduleFirst) {
        // Mantenemos el modal de paciente "abierto" en background hasta
        // que se cierre el de cita; en realidad lo cerramos visualmente
        // mostrando solo el modal de appointment encima.
        setPendingApptPatient(created as ApiPatient);
        setSaving(false);
      } else {
        onClose();
      }
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
      address: (form as any).address ?? "",
      sex: (form as any).sex ?? null,
    } as any);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-ink-900/40 backdrop-blur-sm pt-16 p-4 overflow-y-auto" onClick={onClose}>
      <div className="w-full max-w-xl rounded-2xl bg-surface shadow-modal overflow-hidden" onClick={(e) => e.stopPropagation()}>
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
                  <AppSelect
                    value={form.pronouns ?? "ella"}
                    onChange={(v) => updateField("pronouns", v)}
                    className="mt-1"
                    options={[
                      { value: "ella", label: "ella" },
                      { value: "él", label: "él" },
                      { value: "elle", label: "elle" },
                      { value: "prefiere no decir", label: "prefiere no decir" },
                    ]}
                  />
                </Labeled>
                <Labeled label="Teléfono"><input onChange={(e) => updateField("phone", e.target.value)} placeholder="+57 310 000 0000" className="mt-1 w-full h-10 px-3 rounded-md border border-line-200 bg-surface text-sm outline-none focus:border-brand-700" /></Labeled>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Labeled label="Sexo asignado al nacer">
                  <AppSelect
                    value={(form as any).sex ?? ""}
                    onChange={(v) => setForm((p) => ({ ...p, sex: v || undefined } as any))}
                    className="mt-1"
                    aria-label="Sexo asignado al nacer — dato clínico para baremos diferenciados (ej. MCMI-II)"
                    options={[
                      { value: "", label: "— sin especificar —" },
                      { value: "F", label: "Femenino" },
                      { value: "M", label: "Masculino" },
                    ]}
                  />
                </Labeled>
              </div>
              <Labeled label="Correo"><input type="email" onChange={(e) => updateField("email", e.target.value)} placeholder="paciente@correo.co" className="mt-1 w-full h-10 px-3 rounded-md border border-line-200 bg-surface text-sm outline-none focus:border-brand-700" /></Labeled>
              <Labeled label="Dirección (opcional)">
                <input
                  value={(form as any).address ?? ""}
                  onChange={(e) => setForm((p) => ({ ...p, address: e.target.value } as any))}
                  placeholder="Cra 11 # 82-32, Chapinero, Bogotá"
                  className="mt-1 w-full h-10 px-3 rounded-md border border-line-200 bg-surface text-sm outline-none focus:border-brand-700"
                />
              </Labeled>
            </>
          )}
          {step === 2 && (
            <>
              <Labeled
                label="Motivo de consulta"
                rightSlot={
                  <VoiceRecorderButton
                    variant="compact"
                    label="Dictar"
                    onTranscript={(text) => {
                      const current = (form.reason ?? "").trim();
                      const joined = current ? `${current} ${text}` : text;
                      updateField("reason", joined);
                    }}
                  />
                }
              >
                <textarea
                  rows={3}
                  value={form.reason ?? ""}
                  onChange={(e) => updateField("reason", e.target.value)}
                  placeholder="Describe brevemente el motivo principal…"
                  className="mt-1 w-full px-3 py-2 rounded-md border border-line-200 bg-surface text-sm outline-none focus:border-brand-700"
                />
              </Labeled>
              <div className={"grid gap-3 " + (isOrg ? "grid-cols-2" : "grid-cols-1")}>
                {isOrg && (
                  <Labeled label="Profesional asignada/o">
                    <AppSelect
                      value={form.professionalId ? String(form.professionalId) : ""}
                      onChange={(v) => setForm((p) => ({ ...p, professionalId: v ? Number(v) : undefined }))}
                      className="mt-1"
                      placeholder="Selecciona…"
                      options={[
                        { value: "", label: "Selecciona…" },
                        ...professionals.map((prof) => ({ value: String(prof.id), label: prof.name })),
                      ]}
                    />
                  </Labeled>
                )}
                <Labeled label="Modalidad">
                  <AppSelect
                    value={form.modality ?? "individual"}
                    onChange={(v) => updateField("modality", v as Modality)}
                    className="mt-1"
                    options={[
                      { value: "individual", label: "Individual" },
                      { value: "pareja", label: "Pareja" },
                      { value: "familiar", label: "Familiar" },
                      { value: "grupal", label: "Grupal" },
                      { value: "tele", label: "Telepsicología" },
                    ]}
                  />
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
              <Labeled label="Etiquetas (opcional)">
                <p className="text-[11px] text-ink-500 mt-1 mb-2 leading-snug">
                  Sirven para agrupar pacientes y filtrar la lista (ej. <em>Ansiedad</em>, <em>Adolescente</em>, <em>Alto riesgo</em>). Haz clic en una sugerida o escribe la tuya y presiona <kbd className="px-1 rounded bg-bg-100 text-ink-700 text-[10px] font-mono">Enter</kbd>.
                </p>
                <TagEditor
                  value={form.tags ?? []}
                  onChange={(t) => updateField("tags", t as Patient["tags"])}
                  suggestions={tagSuggestions}
                />
              </Labeled>
            </>
          )}
          {step === 3 && (
            <>
              <div className="rounded-lg border border-brand-700/20 bg-brand-50/40 p-4 text-sm text-ink-700">
                Se enviará por correo el consentimiento informado y el enlace del portal del paciente. Podrás firmar digitalmente en la siguiente sesión.
              </div>
              <label className="flex items-start gap-2 mt-3 text-sm text-ink-700">
                <input
                  type="checkbox"
                  checked={optConsent}
                  onChange={(e) => setOptConsent(e.target.checked)}
                  className="mt-1"
                />
                <span>Enviar consentimiento informado por correo</span>
              </label>
              <label className="flex items-start gap-2 text-sm text-ink-700">
                <input
                  type="checkbox"
                  checked={optInvite}
                  onChange={(e) => setOptInvite(e.target.checked)}
                  className="mt-1"
                />
                <span>Crear acceso al portal del paciente</span>
              </label>
              <label className="flex items-start gap-2 text-sm text-ink-700">
                <input
                  type="checkbox"
                  checked={optScheduleFirst}
                  onChange={(e) => setOptScheduleFirst(e.target.checked)}
                  className="mt-1"
                />
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

      {/* Modal de nueva cita encadenado: aparece si el usuario marcó
          "Agendar primera cita inmediatamente". Lo renderizamos al
          mismo nivel del modal de paciente (no anidado dentro del
          contenido) para que el backdrop no se duplique. Al cerrarlo
          cerramos también el modal de paciente — el flow completo
          termina. */}
      {pendingApptPatient && (
        <NewAppointmentModal
          patients={[pendingApptPatient]}
          prefilledPatient={pendingApptPatient}
          onClose={() => {
            setPendingApptPatient(null);
            onClose();
          }}
        />
      )}
    </div>
  );
}

function Labeled({ label, children, rightSlot }: { label: string; children: React.ReactNode; rightSlot?: React.ReactNode }) {
  return (
    <label className="block">
      <span className="flex items-center justify-between gap-2 text-[11px] uppercase tracking-wider text-ink-500 font-medium">
        <span>{label}</span>
        {rightSlot}
      </span>
      {children}
    </label>
  );
}
