import { createFileRoute, Link, useParams, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { toast } from "sonner";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/app/AppShell";
import { RiskBadge } from "@/components/app/RiskBadge";
import { RiskPicker } from "@/components/app/RiskPicker";
import type { Risk, RiskType } from "@/lib/mock-data";
import { TEST_EVOLUTION } from "@/lib/mock-data";
import { api } from "@/lib/api";
import { Trash2 } from "lucide-react";
import {
  ArrowLeft, Phone, Mail, MapPin, Calendar, ClipboardList, FileText, Pill,
  MessagesSquare, Receipt, Brain, Plus, User, IdCard, ChevronRight, Edit3,
  TrendingDown, CheckCircle2, Clock, AlertCircle, MessageCircle, UserPlus,
  X, Loader2,
} from "lucide-react";
import { whatsappUrl } from "@/lib/display";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Tooltip } from "recharts";
import { NewAppointmentModal } from "@/components/app/NewAppointmentModal";
import { ApplicationDetailModal } from "@/components/tests/ApplicationDetailModal";

export const Route = createFileRoute("/pacientes_/$id")({
  head: ({ params }: { params: { id: string } }) => ({
    meta: [
      { title: `Paciente ${params.id} · Psicomorfosis` },
    ],
  }),
  component: PatientDetailPage,
});

type Tab = "datos" | "tests" | "prescripcion" | "documentos" | "facturacion";

const TABS: { id: Tab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: "datos", label: "Datos", icon: User },
  { id: "tests", label: "Tests", icon: Brain },
  { id: "prescripcion", label: "Prescripción", icon: Pill },
  { id: "documentos", label: "Documentos", icon: FileText },
  { id: "facturacion", label: "Facturación", icon: Receipt },
];

function PatientDetailPage() {
  const { id } = useParams({ from: "/pacientes_/$id" });
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>("datos");
  const [editing, setEditing] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [apptOpen, setApptOpen] = useState(false);

  const { data: patient, isLoading, error } = useQuery({
    queryKey: ["patient", id],
    queryFn: () => api.getPatient(id),
    retry: false,
  });

  const archiveMu = useMutation({
    mutationFn: () => api.archivePatient(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["patients"] });
      qc.invalidateQueries({ queryKey: ["patient", id] });
      navigate({ to: "/pacientes" });
    },
  });

  // Todos los hooks de datos se llaman SIEMPRE, antes de cualquier early return.
  // React exige que el número y orden de hooks sea idéntico entre renders.
  const { data: allTests = [] } = useQuery({ queryKey: ["test-applications"], queryFn: () => api.listTestApplications() as Promise<any> });
  const { data: allTasks = [] } = useQuery({ queryKey: ["tasks"], queryFn: () => api.listTasks() as Promise<any> });
  // Filtrar documentos por paciente directo en el backend para que el listado
  // sea consistente sin importar el cache global. La queryKey incluye el id
  // para que se invalide cuando navegues entre pacientes.
  const { data: docs = [] } = useQuery({
    queryKey: ["documents", { patient_id: id }],
    queryFn: () => api.listDocuments({ patient_id: id }),
    enabled: !!id,
  });
  const { data: patientTests = [] } = useQuery({
    queryKey: ["test-applications", { patient_id: id }],
    queryFn: () => api.listTestApplications({ patient_id: id }),
    enabled: !!id,
  });

  const tests = (allTests as any[]).filter((t) => t.patient_id === id);
  const tasks = (allTasks as any[]).filter((t) => t.patient_id === id);

  if (isLoading) {
    return (
      <AppShell>
        <div className="flex items-center justify-center py-20 text-sm text-ink-500">
          Cargando paciente…
        </div>
      </AppShell>
    );
  }

  if (error || !patient) {
    return (
      <AppShell>
        <div className="max-w-xl mx-auto mt-20 text-center">
          <h2 className="font-serif text-2xl text-ink-900">Paciente no encontrado</h2>
          <p className="text-sm text-ink-500 mt-2">El identificador <span className="tabular">{id}</span> no existe en el backend.</p>
          <Link to="/pacientes" className="mt-4 inline-flex items-center gap-1.5 text-sm text-brand-700 hover:underline">
            <ArrowLeft className="h-4 w-4" /> Volver a pacientes
          </Link>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="space-y-6">
        <Link to="/pacientes" className="inline-flex items-center gap-1.5 text-sm text-ink-500 hover:text-brand-700 transition-colors">
          <ArrowLeft className="h-4 w-4" /> Volver a pacientes
        </Link>

        <header className="rounded-xl border border-line-200 bg-surface p-4 sm:p-6">
          <div className="flex items-start gap-3 sm:gap-5">
            <div className="h-14 w-14 sm:h-20 sm:w-20 rounded-full bg-brand-100 text-brand-800 flex items-center justify-center font-serif text-base sm:text-2xl shrink-0">
              {(patient.preferredName ?? patient.name).split(" ").slice(0, 2).map((n) => n[0]).join("").toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="font-serif text-lg sm:text-[28px] leading-tight text-ink-900">{patient.name}</h1>
                <RiskBadge risk={patient.risk} types={patient.riskTypes} compact />
              </div>
              {patient.preferredName && <p className="text-xs sm:text-sm text-ink-500 mt-0.5">({patient.preferredName} · {patient.pronouns})</p>}
              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs sm:text-sm text-ink-700">
                <span className="inline-flex items-center gap-1.5"><IdCard className="h-3.5 w-3.5 text-ink-400 shrink-0" /> {patient.doc}</span>
                <span className="inline-flex items-center gap-1.5"><User className="h-3.5 w-3.5 text-ink-400 shrink-0" /> {patient.age ? `${patient.age} años` : "—"}</span>
                <span className="hidden sm:inline-flex items-center gap-1.5">
                  <Phone className="h-3.5 w-3.5 text-ink-400 shrink-0" /> {patient.phone}
                  {patient.phone && (() => {
                    const wa = whatsappUrl(patient.phone);
                    return wa ? (
                      <a href={wa} target="_blank" rel="noopener noreferrer" title="Abrir WhatsApp"
                        className="ml-1 h-5 w-5 rounded text-sage-500 hover:text-sage-700 hover:bg-sage-200/30 inline-flex items-center justify-center">
                        <MessageCircle className="h-3 w-3" />
                      </a>
                    ) : null;
                  })()}
                </span>
                <span className="hidden sm:inline-flex items-center gap-1.5"><Mail className="h-3.5 w-3.5 text-ink-400 shrink-0" /> {patient.email}</span>
              </div>
              <div className="mt-2 sm:mt-3 flex flex-wrap items-center gap-1.5">
                {(patient.tags ?? []).map((t) => (
                  <span key={t} className="text-[10px] uppercase tracking-[0.08em] px-2 py-0.5 rounded-full bg-lavender-100 text-lavender-500 font-medium">{t}</span>
                ))}
                <span className="text-[10px] uppercase tracking-[0.08em] px-2 py-0.5 rounded-full bg-brand-50 text-brand-800 font-medium capitalize">{patient.status}</span>
              </div>
            </div>
          </div>

          {/* Acciones: full-width grid en mobile, fila normal en desktop */}
          <div className="mt-4 grid grid-cols-2 sm:flex sm:justify-end gap-2 flex-wrap">
            <Link to="/historia" search={{ id: patient.id }} className="h-10 px-2 sm:px-4 rounded-lg bg-brand-700 text-primary-foreground text-xs sm:text-sm font-medium hover:bg-brand-800 inline-flex items-center justify-center gap-1.5">
              <Plus className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
              <span className="hidden sm:inline">Nueva nota</span>
              <span className="sm:hidden">Nota</span>
            </Link>
            <button
              onClick={() => setApptOpen(true)}
              className="h-10 px-2 sm:px-3 rounded-lg border border-line-200 bg-surface text-ink-700 text-xs sm:text-sm hover:border-brand-400 inline-flex items-center justify-center gap-1.5"
              title="Agendar nueva cita con este paciente"
            >
              <Calendar className="h-3.5 w-3.5 sm:h-4 sm:w-4" /> <span className="hidden sm:inline">Agendar</span><span className="sm:hidden">Agendar</span>
            </button>
            <button
              onClick={() => setInviteOpen(true)}
              className="h-10 px-2 sm:px-3 rounded-lg border border-line-200 bg-surface text-ink-700 text-xs sm:text-sm hover:border-brand-400 inline-flex items-center justify-center gap-1.5"
              title="Invitar al portal del paciente"
            >
              <UserPlus className="h-3.5 w-3.5 sm:h-4 sm:w-4" /> <span className="hidden sm:inline">Invitar al portal</span><span className="sm:hidden">Portal</span>
            </button>
            <button
              onClick={() => setEditing(true)}
              className="h-10 px-2 sm:px-3 rounded-lg border border-line-200 bg-surface text-ink-700 text-xs sm:text-sm hover:border-brand-400 inline-flex items-center justify-center gap-1.5"
            >
              <Edit3 className="h-3.5 w-3.5 sm:h-4 sm:w-4" /> Editar
            </button>
            <button
              onClick={() => {
                if (confirm(`¿Archivar a ${patient.preferredName ?? patient.name}? Deja de aparecer en listados activos pero su historia clínica se conserva.`)) {
                  archiveMu.mutate();
                }
              }}
              className="h-10 px-2 sm:px-3 rounded-lg border border-line-200 bg-surface text-ink-700 hover:border-risk-moderate hover:text-risk-moderate inline-flex items-center justify-center gap-1.5 text-xs sm:text-sm"
              title="Archivar paciente"
            >
              <Trash2 className="h-3.5 w-3.5 sm:h-4 sm:w-4" /> Archivar
            </button>
          </div>

          <div className="mt-5 grid grid-cols-2 md:grid-cols-4 gap-3 pt-5 border-t border-line-100">
            <InfoChip label="Profesional" value={patient.professional} />
            <InfoChip label="Modalidad" value={patient.modality} />
            <InfoChip label="Última sesión" value={patient.lastContact} />
            <InfoChip label="Próxima sesión" value={patient.nextSession ?? "—"} />
          </div>
        </header>

        <div className="border-b border-line-200 overflow-x-auto no-scrollbar">
          <nav className="flex items-center gap-1 min-w-max">
            {TABS.map((t) => {
              const Icon = t.icon;
              const active = tab === t.id;
              const badge =
                t.id === "tests" ? tests.length :
                t.id === "prescripcion" ? tasks.filter((x) => x.status !== "completada").length :
                t.id === "documentos" ? docs.length : 0;
              return (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className={
                    "inline-flex items-center gap-2 px-4 h-11 text-sm border-b-2 transition-colors " +
                    (active ? "border-brand-700 text-ink-900 font-medium" : "border-transparent text-ink-500 hover:text-ink-900")
                  }
                >
                  <Icon className="h-4 w-4" />
                  {t.label}
                  {badge > 0 && (
                    <span className={
                      "h-5 min-w-[20px] px-1.5 rounded-full text-[10px] font-medium inline-flex items-center justify-center tabular " +
                      (active ? "bg-brand-100 text-brand-800" : "bg-bg-100 text-ink-500")
                    }>{badge}</span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        {tab === "datos" && <TabDatos patient={patient} tasks={tasks} />}
        {tab === "tests" && <TabTests rows={patientTests as any[]} />}
        {tab === "prescripcion" && <TabPrescripcion rows={tasks} patientId={id} />}
        {tab === "documentos" && <TabDocumentos rows={docs} patientId={patient.id} />}
        {tab === "facturacion" && <TabFacturacion patientId={id} />}
      </div>

      {editing && patient && <EditPatientInlineModal patient={patient} onClose={() => setEditing(false)} />}
      {inviteOpen && patient && <InvitePortalModal patient={patient} onClose={() => setInviteOpen(false)} />}
      {apptOpen && patient && <NewAppointmentModal patients={[patient]} prefilledPatient={patient} onClose={() => setApptOpen(false)} />}
    </AppShell>
  );
}

function EditPatientInlineModal({ patient, onClose }: { patient: import("@/lib/api").ApiPatient; onClose: () => void }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    name: patient.name,
    preferredName: patient.preferredName ?? "",
    pronouns: patient.pronouns,
    phone: patient.phone,
    email: patient.email,
    address: patient.address ?? "",
    sex: (patient.sex ?? "") as "" | "M" | "F",
    reason: patient.reason,
    modality: patient.modality,
    status: patient.status,
    risk: patient.risk,
    riskTypes: (patient.riskTypes ?? []) as RiskType[],
  });
  const mu = useMutation({
    mutationFn: () => api.updatePatient(patient.id, {
      ...form,
      // "" en sex significa "sin especificar" — el backend lo guarda como NULL.
      sex: form.sex || (null as any),
    } as any),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["patient", patient.id] });
      qc.invalidateQueries({ queryKey: ["patients"] });
      onClose();
    },
  });
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-ink-900/40 backdrop-blur-sm pt-16 p-4 overflow-y-auto" onClick={onClose}>
      <form onSubmit={(e) => { e.preventDefault(); mu.mutate(); }} className="w-full max-w-xl rounded-2xl bg-surface shadow-modal" onClick={(e) => e.stopPropagation()}>
        <header className="p-5 border-b border-line-100">
          <p className="text-[11px] uppercase tracking-widest text-brand-800 font-medium">Pacientes · {patient.id}</p>
          <h3 className="font-serif text-xl text-ink-900 mt-0.5">Editar paciente</h3>
        </header>
        <div className="p-5 space-y-3">
          <label className="block">
            <span className="text-[11px] uppercase tracking-wider text-ink-500 font-medium">Nombre</span>
            <input value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} className="mt-1 w-full h-10 px-3 rounded-md border border-line-200 bg-surface text-sm outline-none focus:border-brand-700" />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-[11px] uppercase tracking-wider text-ink-500 font-medium">Nombre preferido</span>
              <input value={form.preferredName} onChange={(e) => setForm((p) => ({ ...p, preferredName: e.target.value }))} className="mt-1 w-full h-10 px-3 rounded-md border border-line-200 bg-surface text-sm outline-none focus:border-brand-700" />
            </label>
            <label className="block">
              <span className="text-[11px] uppercase tracking-wider text-ink-500 font-medium">Teléfono</span>
              <input value={form.phone} onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))} className="mt-1 w-full h-10 px-3 rounded-md border border-line-200 bg-surface text-sm outline-none focus:border-brand-700" />
            </label>
          </div>
          <label className="block">
            <span className="text-[11px] uppercase tracking-wider text-ink-500 font-medium">Correo</span>
            <input type="email" value={form.email} onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))} className="mt-1 w-full h-10 px-3 rounded-md border border-line-200 bg-surface text-sm outline-none focus:border-brand-700" />
          </label>
          <div className="grid grid-cols-[1fr_auto] gap-3">
            <label className="block">
              <span className="text-[11px] uppercase tracking-wider text-ink-500 font-medium">Dirección</span>
              <input value={form.address} onChange={(e) => setForm((p) => ({ ...p, address: e.target.value }))} placeholder="Cra 11 # 82-32, Chapinero, Bogotá" className="mt-1 w-full h-10 px-3 rounded-md border border-line-200 bg-surface text-sm outline-none focus:border-brand-700" />
            </label>
            <label className="block">
              <span className="text-[11px] uppercase tracking-wider text-ink-500 font-medium" title="Dato clínico — algunos tests usan baremos por sexo biológico.">Sexo al nacer</span>
              <select
                value={form.sex}
                onChange={(e) => setForm((p) => ({ ...p, sex: e.target.value as "" | "M" | "F" }))}
                className="mt-1 h-10 px-3 rounded-md border border-line-200 bg-surface text-sm outline-none hover:border-brand-400"
              >
                <option value="">—</option>
                <option value="F">Femenino</option>
                <option value="M">Masculino</option>
              </select>
            </label>
          </div>
          <label className="block">
            <span className="text-[11px] uppercase tracking-wider text-ink-500 font-medium">Motivo de consulta</span>
            <textarea rows={2} value={form.reason} onChange={(e) => setForm((p) => ({ ...p, reason: e.target.value }))} className="mt-1 w-full px-3 py-2 rounded-md border border-line-200 bg-surface text-sm outline-none focus:border-brand-700" />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-[11px] uppercase tracking-wider text-ink-500 font-medium">Modalidad</span>
              <select value={form.modality} onChange={(e) => setForm((p) => ({ ...p, modality: e.target.value as any }))} className="mt-1 w-full h-10 px-3 rounded-md border border-line-200 bg-surface text-sm outline-none hover:border-brand-400">
                <option value="individual">Individual</option><option value="pareja">Pareja</option><option value="familiar">Familiar</option><option value="grupal">Grupal</option><option value="tele">Telepsicología</option>
              </select>
            </label>
            <label className="block">
              <span className="text-[11px] uppercase tracking-wider text-ink-500 font-medium">Estado</span>
              <select value={form.status} onChange={(e) => setForm((p) => ({ ...p, status: e.target.value as any }))} className="mt-1 w-full h-10 px-3 rounded-md border border-line-200 bg-surface text-sm outline-none hover:border-brand-400">
                <option value="activo">Activo</option><option value="pausa">Pausa</option><option value="alta">Alta</option><option value="derivado">Derivado</option>
              </select>
            </label>
          </div>
          <div className="rounded-lg border border-line-200 bg-bg-100/30 p-3.5">
            <RiskPicker
              level={form.risk as Risk}
              types={form.riskTypes}
              onLevelChange={(r) => setForm((p) => ({ ...p, risk: r }))}
              onTypesChange={(t) => setForm((p) => ({ ...p, riskTypes: t }))}
            />
          </div>
        </div>
        <footer className="p-4 border-t border-line-100 bg-bg-100/30 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="h-9 px-3 rounded-md border border-line-200 text-sm text-ink-700 hover:border-brand-400">Cancelar</button>
          <button type="submit" disabled={mu.isPending} className="h-9 px-4 rounded-md bg-brand-700 text-primary-foreground text-sm font-medium hover:bg-brand-800 disabled:opacity-60">
            {mu.isPending ? "Guardando…" : "Guardar cambios"}
          </button>
        </footer>
      </form>
    </div>
  );
}

function InfoChip({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-bg-100/40 border border-line-200 px-3 py-2">
      <div className="text-[10px] text-ink-500 uppercase tracking-wider">{label}</div>
      <div className="text-sm text-ink-900 mt-0.5 truncate">{value}</div>
    </div>
  );
}

function Section({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-line-200 bg-surface p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-serif text-base text-ink-900">{title}</h3>
        {action}
      </div>
      {children}
    </div>
  );
}

function TabDatos({ patient, tasks }: { patient: import("@/lib/api").ApiPatient; tasks: any[] }) {
  // Citas del paciente para derivar #sesiones atendidas + fecha de primera sesión.
  const { data: appointments = [] } = useQuery({
    queryKey: ["appointments", { patient_id: patient.id }],
    queryFn: () => api.listAppointments({ patient_id: patient.id }),
  });

  const summary = useMemo(() => {
    const attended = (appointments as any[]).filter((a) => a.status === "atendida");
    const sessionsCount = attended.length;
    const startDate = (appointments as any[])
      .map((a) => a.date)
      .filter(Boolean)
      .sort()[0] ?? null;
    const patientTasks = (tasks ?? []).filter((t: any) => t.patient_id === patient.id);
    const adherence = patientTasks.length > 0
      ? Math.round(patientTasks.reduce((a: number, t: any) => a + (t.adherence ?? 0), 0) / patientTasks.length)
      : null;
    return { sessionsCount, startDate, adherence };
  }, [appointments, tasks, patient.id]);

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
      <div className="md:col-span-2 space-y-5">
        <Section title="Contacto y datos básicos">
          <dl className="grid grid-cols-2 gap-4 text-sm">
            <div><dt className="text-xs text-ink-500">Documento</dt><dd className="text-ink-900 mt-0.5 tabular">{patient.doc || "—"}</dd></div>
            <div><dt className="text-xs text-ink-500">Edad</dt><dd className="text-ink-900 mt-0.5">{patient.age || "—"}</dd></div>
            <div><dt className="text-xs text-ink-500">Pronombres</dt><dd className="text-ink-900 mt-0.5">{patient.pronouns || "—"}</dd></div>
            <div><dt className="text-xs text-ink-500" title="Dato clínico — separado de pronombres.">Sexo al nacer</dt><dd className="text-ink-900 mt-0.5">{patient.sex === "F" ? "Femenino" : patient.sex === "M" ? "Masculino" : "—"}</dd></div>
            <div>
              <dt className="text-xs text-ink-500">Teléfono</dt>
              <dd className="text-ink-900 mt-0.5 tabular flex items-center gap-2">
                {patient.phone || "—"}
                {patient.phone && (() => {
                  const wa = whatsappUrl(patient.phone);
                  return wa ? (
                    <a href={wa} target="_blank" rel="noopener noreferrer" title="Abrir WhatsApp"
                      className="h-6 w-6 rounded text-sage-500 hover:text-sage-700 hover:bg-sage-200/30 inline-flex items-center justify-center">
                      <MessageCircle className="h-3.5 w-3.5" />
                    </a>
                  ) : null;
                })()}
              </dd>
            </div>
            <div className="col-span-2"><dt className="text-xs text-ink-500">Correo</dt><dd className="text-ink-900 mt-0.5">{patient.email || "—"}</dd></div>
          </dl>
        </Section>
        <Section title="Motivo de consulta">
          {patient.reason ? (
            <p className="text-sm text-ink-700 whitespace-pre-wrap">{patient.reason}</p>
          ) : (
            <p className="text-sm text-ink-400 italic">Sin motivo registrado. Edita los datos del paciente para agregarlo.</p>
          )}
        </Section>
        <EmergencyContactsCard patientId={patient.id} />
      </div>
      <div className="space-y-5">
        <Section title="Resumen clínico">
          <ul className="space-y-2 text-sm">
            <li className="flex items-center justify-between text-ink-700">
              <span>Sesiones atendidas</span>
              <span className="tabular">{summary.sessionsCount}</span>
            </li>
            <li className="flex items-center justify-between text-ink-700">
              <span>Inicio</span>
              <span className="tabular">{summary.startDate ?? "—"}</span>
            </li>
            <li className="flex items-center justify-between text-ink-700">
              <span>Profesional</span>
              <span className="text-right">{patient.professional || "—"}</span>
            </li>
            {summary.adherence !== null && (
              <li className="flex items-center justify-between text-ink-700">
                <span>Adherencia</span>
                <span className="tabular text-success font-medium">{summary.adherence}%</span>
              </li>
            )}
          </ul>
        </Section>
        <Section title="Historia clínica">
          <p className="text-xs text-ink-500 mb-3">
            Las notas, antecedentes, examen mental, diagnóstico y plan de tratamiento viven en la historia clínica completa.
          </p>
          <Link
            to="/historia"
            search={{ id: patient.id }}
            className="h-9 px-3 rounded-md bg-brand-700 text-primary-foreground text-xs font-medium hover:bg-brand-800 inline-flex items-center justify-center gap-1.5 w-full"
          >
            <ClipboardList className="h-3.5 w-3.5" /> Abrir historia clínica
          </Link>
        </Section>
        <InsuranceCard patient={patient} />
      </div>
    </div>
  );
}

/** Tarjeta con CRUD inline de contactos de emergencia del paciente. */
function EmergencyContactsCard({ patientId }: { patientId: string }) {
  const qc = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);

  const { data: contacts = [], isLoading } = useQuery({
    queryKey: ["emergency-contacts", patientId],
    queryFn: () => api.listEmergencyContacts(patientId),
  });

  const deleteMu = useMutation({
    mutationFn: (id: number) => api.deleteEmergencyContact(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["emergency-contacts", patientId] }),
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Section
      title="Contactos de emergencia"
      action={
        !adding && editingId === null ? (
          <button
            onClick={() => setAdding(true)}
            className="h-7 px-2.5 rounded-md border border-line-200 text-[11px] text-ink-700 hover:border-brand-400 inline-flex items-center gap-1.5"
          >
            <Plus className="h-3 w-3" /> Agregar
          </button>
        ) : null
      }
    >
      {isLoading ? (
        <p className="text-xs text-ink-500">Cargando…</p>
      ) : (
        <ul className="space-y-2 text-sm">
          {contacts.map((c) =>
            editingId === c.id ? (
              <li key={c.id}>
                <EmergencyContactForm
                  initial={c}
                  onCancel={() => setEditingId(null)}
                  onSaved={() => {
                    setEditingId(null);
                    qc.invalidateQueries({ queryKey: ["emergency-contacts", patientId] });
                  }}
                  onSubmit={(values) => api.updateEmergencyContact(c.id, values)}
                />
              </li>
            ) : (
              <li key={c.id} className="flex items-center justify-between p-3 rounded-lg border border-line-200">
                <div className="min-w-0">
                  <div className="text-ink-900 font-medium truncate">
                    {c.relation ? `${c.relation} · ` : ""}{c.name}
                  </div>
                  {c.phone && (
                    <div className="text-xs text-ink-500 tabular">{c.phone}</div>
                  )}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {c.phone && (() => {
                    const wa = whatsappUrl(c.phone);
                    return wa ? (
                      <a href={wa} target="_blank" rel="noopener noreferrer" title="Abrir WhatsApp"
                        className="h-7 w-7 rounded text-sage-500 hover:text-sage-700 hover:bg-sage-200/30 inline-flex items-center justify-center">
                        <MessageCircle className="h-3.5 w-3.5" />
                      </a>
                    ) : null;
                  })()}
                  <button
                    onClick={() => setEditingId(c.id)}
                    title="Editar"
                    className="h-7 w-7 rounded text-ink-500 hover:bg-bg-100 inline-flex items-center justify-center"
                  >
                    <Edit3 className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => {
                      if (confirm(`¿Eliminar el contacto "${c.name}"?`)) deleteMu.mutate(c.id);
                    }}
                    title="Eliminar"
                    className="h-7 w-7 rounded text-rose-700 hover:bg-rose-500/10 inline-flex items-center justify-center"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </li>
            )
          )}

          {adding && (
            <li>
              <EmergencyContactForm
                initial={null}
                onCancel={() => setAdding(false)}
                onSaved={() => {
                  setAdding(false);
                  qc.invalidateQueries({ queryKey: ["emergency-contacts", patientId] });
                }}
                onSubmit={(values) => api.createEmergencyContact(patientId, values)}
              />
            </li>
          )}

          {contacts.length === 0 && !adding && (
            <li className="text-sm text-ink-400 italic">Aún no hay contactos. Agregá al menos uno para emergencias.</li>
          )}
        </ul>
      )}
    </Section>
  );
}

/** Form pequeño y reutilizable para crear o editar un contacto. */
function EmergencyContactForm({
  initial, onSubmit, onSaved, onCancel,
}: {
  initial: import("@/lib/api").EmergencyContact | null;
  onSubmit: (values: { name: string; relation: string; phone: string; priority: number }) => Promise<unknown>;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [relation, setRelation] = useState(initial?.relation ?? "");
  const [phone, setPhone] = useState(initial?.phone ?? "");
  const [priority, setPriority] = useState<number>(initial?.priority ?? 0);
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      toast.error("El nombre es obligatorio");
      return;
    }
    setSaving(true);
    try {
      await onSubmit({ name: name.trim(), relation: relation.trim(), phone: phone.trim(), priority });
      toast.success(initial ? "Contacto actualizado" : "Contacto agregado");
      onSaved();
    } catch (e: any) {
      toast.error(e?.message ?? "No se pudo guardar");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="rounded-lg border border-brand-700/30 bg-brand-50/30 p-3 space-y-2">
      <div className="grid grid-cols-2 gap-2">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nombre completo *" autoFocus
          className="h-9 px-2.5 rounded-md border border-line-200 bg-surface text-sm outline-none focus:border-brand-700" />
        <input value={relation} onChange={(e) => setRelation(e.target.value)} placeholder="Relación (Madre, Pareja…)"
          className="h-9 px-2.5 rounded-md border border-line-200 bg-surface text-sm outline-none focus:border-brand-700" />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+57 …"
          className="h-9 px-2.5 rounded-md border border-line-200 bg-surface text-sm outline-none focus:border-brand-700 tabular" />
        <select value={priority} onChange={(e) => setPriority(Number(e.target.value))}
          className="h-9 px-2.5 rounded-md border border-line-200 bg-surface text-sm outline-none focus:border-brand-700">
          <option value={0}>Primer contacto</option>
          <option value={1}>Segundo contacto</option>
          <option value={2}>Tercer contacto</option>
        </select>
      </div>
      <div className="flex justify-end gap-2 pt-1">
        <button type="button" onClick={onCancel} disabled={saving}
          className="h-8 px-3 rounded-md border border-line-200 text-xs text-ink-700 hover:border-brand-400 disabled:opacity-50">
          Cancelar
        </button>
        <button type="submit" disabled={saving}
          className="h-8 px-3 rounded-md bg-brand-700 text-primary-foreground text-xs font-medium hover:bg-brand-800 disabled:opacity-60 inline-flex items-center gap-1.5">
          {saving && <Loader2 className="h-3 w-3 animate-spin" />}
          {initial ? "Guardar" : "Agregar"}
        </button>
      </div>
    </form>
  );
}

/** Sección con datos de seguro/EPS — editable inline. */
function InsuranceCard({ patient }: { patient: import("@/lib/api").ApiPatient }) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [provider, setProvider] = useState(patient.insuranceProvider ?? "");
  const [plan, setPlan] = useState(patient.insurancePlan ?? "");
  const [policy, setPolicy] = useState(patient.insurancePolicy ?? "");
  const [validUntil, setValidUntil] = useState(patient.insuranceValidUntil ?? "");

  const mu = useMutation({
    mutationFn: () => api.updatePatient(patient.id, {
      insuranceProvider: provider.trim() || null,
      insurancePlan: plan.trim() || null,
      insurancePolicy: policy.trim() || null,
      insuranceValidUntil: validUntil || null,
    } as any),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["patient", patient.id] });
      qc.invalidateQueries({ queryKey: ["patients"] });
      toast.success("Seguro actualizado");
      setEditing(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const hasAny = !!(patient.insuranceProvider || patient.insurancePlan || patient.insurancePolicy || patient.insuranceValidUntil);

  // Reset si cancelo edición sin guardar.
  function cancel() {
    setProvider(patient.insuranceProvider ?? "");
    setPlan(patient.insurancePlan ?? "");
    setPolicy(patient.insurancePolicy ?? "");
    setValidUntil(patient.insuranceValidUntil ?? "");
    setEditing(false);
  }

  return (
    <Section
      title="Seguro / EPS"
      action={
        !editing ? (
          <button
            onClick={() => setEditing(true)}
            className="h-7 px-2.5 rounded-md border border-line-200 text-[11px] text-ink-700 hover:border-brand-400 inline-flex items-center gap-1.5"
          >
            <Edit3 className="h-3 w-3" /> {hasAny ? "Editar" : "Agregar"}
          </button>
        ) : null
      }
    >
      {editing ? (
        <form
          onSubmit={(e) => { e.preventDefault(); mu.mutate(); }}
          className="space-y-2"
        >
          <input value={provider} onChange={(e) => setProvider(e.target.value)} placeholder="Proveedor (Sura, EPS Sanitas, …)"
            className="w-full h-9 px-2.5 rounded-md border border-line-200 bg-surface text-sm outline-none focus:border-brand-700" />
          <input value={plan} onChange={(e) => setPlan(e.target.value)} placeholder="Plan / Categoría"
            className="w-full h-9 px-2.5 rounded-md border border-line-200 bg-surface text-sm outline-none focus:border-brand-700" />
          <input value={policy} onChange={(e) => setPolicy(e.target.value)} placeholder="N° de póliza / afiliación"
            className="w-full h-9 px-2.5 rounded-md border border-line-200 bg-surface text-sm outline-none focus:border-brand-700 tabular" />
          <label className="block">
            <span className="text-[11px] uppercase tracking-wider text-ink-500">Vigente hasta</span>
            <input type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)}
              className="mt-1 w-full h-9 px-2.5 rounded-md border border-line-200 bg-surface text-sm outline-none focus:border-brand-700" />
          </label>
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={cancel} disabled={mu.isPending}
              className="h-8 px-3 rounded-md border border-line-200 text-xs text-ink-700 hover:border-brand-400 disabled:opacity-50">
              Cancelar
            </button>
            <button type="submit" disabled={mu.isPending}
              className="h-8 px-3 rounded-md bg-brand-700 text-primary-foreground text-xs font-medium hover:bg-brand-800 disabled:opacity-60 inline-flex items-center gap-1.5">
              {mu.isPending && <Loader2 className="h-3 w-3 animate-spin" />}
              Guardar
            </button>
          </div>
        </form>
      ) : !hasAny ? (
        <p className="text-sm text-ink-400 italic">Sin información de seguro.</p>
      ) : (
        <div className="text-sm space-y-1">
          {patient.insuranceProvider && (
            <div className="text-ink-900 font-medium">
              {patient.insuranceProvider}{patient.insurancePlan ? ` · ${patient.insurancePlan}` : ""}
            </div>
          )}
          {patient.insurancePolicy && (
            <div className="text-xs text-ink-500 tabular">Póliza {patient.insurancePolicy}</div>
          )}
          {patient.insuranceValidUntil && (
            <div className="text-xs text-ink-500">Vigente hasta {patient.insuranceValidUntil}</div>
          )}
        </div>
      )}
    </Section>
  );
}

function TabTests({ rows }: { rows: any[] }) {
  const LEVEL_STYLE: Record<string, string> = {
    none: "bg-bg-100 text-ink-500",
    low: "bg-success-soft text-success",
    moderate: "bg-warning-soft text-risk-moderate",
    high: "bg-error-soft text-risk-high",
    critical: "bg-error-soft text-risk-critical",
  };

  const [detailApp, setDetailApp] = useState<any | null>(null);

  // Agrupar aplicaciones COMPLETADAS por test_code para gráficas evolutivas.
  // Solo mostramos gráfica si hay 2 o más aplicaciones del mismo test.
  const completed = rows.filter((r) => r.status === "completado" && r.score != null);
  const groupedByTest: Record<string, any[]> = {};
  for (const r of completed) {
    if (!groupedByTest[r.test_code]) groupedByTest[r.test_code] = [];
    groupedByTest[r.test_code].push(r);
  }
  const evolutionGroups = Object.entries(groupedByTest)
    .filter(([, apps]) => apps.length >= 2)
    .map(([code, apps]) => {
      const sorted = [...apps].sort((a, b) => (a.date || "").localeCompare(b.date || ""));
      const data = sorted.map((a) => ({
        date: new Date(a.date).toLocaleDateString("es-CO", { day: "numeric", month: "short" }),
        score: a.score,
        level: a.level,
      }));
      const first = sorted[0]?.score ?? 0;
      const last = sorted[sorted.length - 1]?.score ?? 0;
      const delta = last - first;
      return { code, data, first, last, delta, n: sorted.length };
    });

  return (
    <div className="space-y-5">
      {/* Gráficas evolutivas (cuando hay 2+ aplicaciones del mismo test) */}
      {evolutionGroups.length > 0 && (
        <section className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {evolutionGroups.map((g) => (
            <div key={g.code} className="rounded-xl border border-line-200 bg-surface p-5">
              <div className="flex items-start justify-between gap-2 mb-2">
                <div>
                  <h3 className="font-serif text-base text-ink-900">Evolución · {g.code}</h3>
                  <p className="text-xs text-ink-500 mt-0.5">{g.n} aplicaciones</p>
                </div>
                <span className={
                  "inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium " +
                  (g.delta < 0 ? "bg-success-soft text-success" : g.delta > 0 ? "bg-error-soft text-risk-high" : "bg-bg-100 text-ink-500")
                }>
                  {g.delta < 0 && <TrendingDown className="h-3 w-3" />}
                  {g.delta > 0 ? "+" : ""}{g.delta} pts
                </span>
              </div>
              <div className="h-44">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={g.data} margin={{ top: 8, right: 8, left: -10, bottom: 0 }}>
                    <CartesianGrid stroke="var(--line-100)" strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="date" tick={{ fontSize: 10 }} stroke="var(--ink-400)" tickLine={false} axisLine={false} />
                    <YAxis tick={{ fontSize: 10 }} stroke="var(--ink-400)" tickLine={false} axisLine={false} />
                    <Tooltip contentStyle={{ border: "1px solid var(--line-200)", borderRadius: 8, fontSize: 12 }} />
                    <Line type="monotone" dataKey="score" stroke="var(--brand-700)" strokeWidth={2.5} dot={{ r: 4, fill: "var(--brand-700)" }} activeDot={{ r: 6 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          ))}
        </section>
      )}

      {/* Lista de aplicaciones */}
      <div className="rounded-xl border border-line-200 bg-surface">
        <div className="px-5 py-4 border-b border-line-100">
          <h3 className="font-serif text-base text-ink-900">Aplicaciones del paciente</h3>
          <p className="text-xs text-ink-500 mt-0.5">
            {rows.length === 0 ? "Sin aplicaciones aún." : `${rows.length} ${rows.length === 1 ? "aplicación" : "aplicaciones"} en total`}
          </p>
        </div>
        {rows.length === 0 ? (
          <div className="p-10 text-center text-sm text-ink-500">
            Asigna un test desde la vista de Tests psicométricos.
          </div>
        ) : (
          <ul className="divide-y divide-line-100">
            {rows.map((r) => {
              const isMillon = r.alerts_json?.meta?.type === "millon";
              const isCompleted = r.status === "completado";
              const clickable = isCompleted;
              const RowTag: any = clickable ? "button" : "div";
              return (
                <li key={r.id}>
                  <RowTag
                    {...(clickable ? { onClick: () => setDetailApp(r), type: "button" } : {})}
                    className={
                      "w-full text-left px-5 py-4 flex items-center gap-4 " +
                      (clickable ? "hover:bg-bg-100/40 transition-colors cursor-pointer" : "")
                    }
                  >
                    <div className="h-10 w-10 rounded-lg bg-lavender-100 text-lavender-500 flex items-center justify-center shrink-0">
                      <Brain className="h-4 w-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium text-ink-900">{r.test_code}</span>
                        <span className="text-xs text-ink-500">{r.test_name}</span>
                        {r.applied_by === "paciente" && isCompleted && (
                          <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-brand-50 text-brand-700">Auto-aplicado</span>
                        )}
                        {r.alerts_json?.critical_response && (
                          <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-error-soft text-risk-critical">⚠ Respuesta crítica</span>
                        )}
                      </div>
                      <div className="text-xs text-ink-500 mt-0.5 tabular">
                        {r.completed_at
                          ? new Date(r.completed_at).toLocaleString("es-CO", { dateStyle: "medium", timeStyle: "short" })
                          : r.assigned_at
                            ? `Asignado ${new Date(r.assigned_at).toLocaleDateString("es-CO", { day: "numeric", month: "short" })}`
                            : r.date}
                        {" · "}{r.professional}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      {isCompleted ? (
                        isMillon ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium bg-brand-50 text-brand-800 hover:bg-brand-100 transition-colors">
                            Ver detalle por escala
                            <ChevronRight className="h-3 w-3" />
                          </span>
                        ) : r.score != null ? (
                          <>
                            <div className="font-serif text-2xl text-ink-900 tabular">{r.score}</div>
                            <span className={"inline-block mt-0.5 px-2 py-0.5 rounded-full text-[10px] font-medium " + (LEVEL_STYLE[r.level ?? "none"] ?? LEVEL_STYLE.none)}>{r.interpretation}</span>
                          </>
                        ) : (
                          <span className="text-xs text-ink-500">Ver detalle</span>
                        )
                      ) : (
                        <span className="text-xs text-ink-500 inline-flex items-center gap-1">
                          <Clock className="h-3 w-3" /> {r.status === "pendiente" ? "Pendiente" : "Sin completar"}
                        </span>
                      )}
                    </div>
                  </RowTag>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {detailApp && (
        <ApplicationDetailModal app={detailApp} onClose={() => setDetailApp(null)} />
      )}
    </div>
  );
}

function TabPrescripcion({ rows, patientId }: { rows: any[]; patientId: string }) {
  const STATUS: Record<string, { bg: string; text: string; label: string; Icon: React.ComponentType<{ className?: string }> }> = {
    asignada: { bg: "bg-brand-50", text: "text-brand-800", label: "Asignada", Icon: Clock },
    en_progreso: { bg: "bg-warning-soft", text: "text-risk-moderate", label: "En progreso", Icon: Clock },
    completada: { bg: "bg-success-soft", text: "text-success", label: "Completada", Icon: CheckCircle2 },
    vencida: { bg: "bg-error-soft", text: "text-risk-high", label: "Vencida", Icon: AlertCircle },
  };

  return (
    <div className="rounded-xl border border-line-200 bg-surface">
      <div className="px-5 py-4 border-b border-line-100 flex items-center justify-between">
        <h3 className="font-serif text-base text-ink-900">Plan terapéutico · tareas</h3>
        <Link
          to="/prescripcion"
          search={{ patientId, openAssign: true } as any}
          className="h-9 px-3 rounded-md bg-brand-700 text-primary-foreground text-xs font-medium hover:bg-brand-800 inline-flex items-center gap-1.5"
        >
          <Plus className="h-3.5 w-3.5" /> Asignar tarea
        </Link>
      </div>
      {rows.length === 0 ? (
        <div className="p-10 text-center text-sm text-ink-500">Sin tareas asignadas.</div>
      ) : (
        <ul className="divide-y divide-line-100">
          {rows.map((t) => {
            const s = STATUS[t.status];
            return (
              <li key={t.id} className="px-5 py-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={"inline-flex items-center gap-1 text-[10px] uppercase tracking-[0.08em] px-2 py-0.5 rounded-full font-medium " + s.bg + " " + s.text}>
                        <s.Icon className="h-3 w-3" /> {s.label}
                      </span>
                      <span className="text-[10px] text-ink-400 uppercase tracking-wider">vence {t.due_at}</span>
                    </div>
                    <div className="text-sm font-medium text-ink-900 mt-1">{t.title}</div>
                    <p className="text-xs text-ink-500 mt-1">{t.description}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-[10px] text-ink-500 uppercase tracking-wider">Adherencia</div>
                    <div className="font-serif text-lg text-ink-900 tabular">{t.adherence}%</div>
                  </div>
                </div>
                <div className="mt-2 h-1 rounded-full bg-bg-100 overflow-hidden">
                  <div className={"h-full " + (t.adherence >= 80 ? "bg-success" : t.adherence >= 50 ? "bg-warning" : "bg-risk-high")} style={{ width: `${t.adherence}%` }} />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function TabDocumentos({ rows, patientId }: { rows: any[]; patientId: string }) {
  return (
    <div className="rounded-xl border border-line-200 bg-surface">
      <div className="px-5 py-4 border-b border-line-100 flex items-center justify-between flex-wrap gap-2">
        <h3 className="font-serif text-base text-ink-900">Documentos del paciente</h3>
        <div className="flex items-center gap-2">
          <Link
            to="/documentos"
            search={{ paciente: patientId }}
            className="h-9 px-3 rounded-md bg-brand-700 text-white text-xs font-medium hover:bg-brand-800 inline-flex items-center gap-1.5"
          >
            Nuevo documento <ChevronRight className="h-3.5 w-3.5" />
          </Link>
          <Link
            to="/documentos"
            search={{ paciente: patientId }}
            className="h-9 px-3 rounded-md border border-line-200 text-xs text-ink-700 hover:border-brand-400 inline-flex items-center gap-1.5"
          >
            Ver biblioteca filtrada
          </Link>
        </div>
      </div>
      {rows.length === 0 ? (
        <div className="p-10 text-center text-sm text-ink-500">
          Este paciente aún no tiene documentos.
          <Link to="/documentos" search={{ paciente: patientId }} className="block mt-2 text-brand-700 text-xs hover:underline">
            Crea el primero (consentimiento, evolución, informe…)
          </Link>
        </div>
      ) : (
        <ul className="divide-y divide-line-100">
          {rows.map((d) => (
            <Link key={d.id} to="/documentos/$id" params={{ id: d.id }} className="contents">
              <li className="px-5 py-3 flex items-center gap-3 hover:bg-bg-100/40 cursor-pointer">
                <div className="h-9 w-9 rounded-md bg-brand-50 text-brand-800 flex items-center justify-center shrink-0">
                  <FileText className="h-4 w-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-ink-900 truncate">{d.name}</div>
                  <div className="text-xs text-ink-500 tabular">
                    {new Date(d.updated_at).toLocaleDateString("es-CO", { day: "numeric", month: "short", year: "numeric" })}
                    {d.size_kb ? ` · ${d.size_kb} KB` : ""}
                    {d.kind === "file" ? " · 📎 Archivo" : " · ✍ Editor"}
                  </div>
                </div>
                <span className={
                  "text-[11px] uppercase tracking-[0.06em] px-2 py-0.5 rounded-full font-medium capitalize " +
                  (d.status === "firmado" ? "bg-success-soft text-success"
                    : d.status === "pendiente_firma" ? "bg-warning-soft text-risk-moderate"
                      : "bg-bg-100 text-ink-500")
                }>
                  {(d.status ?? "borrador").replace("_", " ")}
                </span>
              </li>
            </Link>
          ))}
        </ul>
      )}
    </div>
  );
}

function TabFacturacion({ patientId }: { patientId: string }) {
  const [certOpen, setCertOpen] = useState(false);
  const { data: invoices = [], isLoading } = useQuery({
    queryKey: ["invoices", { patient_id: patientId }],
    queryFn: () => api.listInvoices({ patient_id: patientId }),
  });
  const paidCount = invoices.filter((i) => i.status === "pagada").length;

  const fmt = (n: number) =>
    new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(n);

  const summary = useMemo(() => {
    const totalBilled = invoices.reduce((s, i) => s + i.amount, 0);
    const paid = invoices.filter((i) => i.status === "pagada").reduce((s, i) => s + i.amount, 0);
    const pending = invoices.filter((i) => i.status === "pendiente").reduce((s, i) => s + i.amount, 0);
    const overdue = invoices.filter((i) => i.status === "vencida").reduce((s, i) => s + i.amount, 0);
    // Método preferido: el más usado entre pagados (si hay)
    const methodCounts = new Map<string, number>();
    for (const i of invoices) if (i.method) methodCounts.set(i.method, (methodCounts.get(i.method) ?? 0) + 1);
    const preferred = [...methodCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "—";
    return { totalBilled, paid, pending, overdue, preferred };
  }, [invoices]);

  const statusLabel: Record<string, string> = { pagada: "Pagado", pendiente: "Pendiente", vencida: "Vencido", borrador: "Borrador" };
  const statusStyle: Record<string, string> = {
    pagada: "bg-success-soft text-success",
    pendiente: "bg-warning-soft text-risk-moderate",
    vencida: "bg-error-soft text-risk-high",
    borrador: "bg-bg-100 text-ink-500",
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
      <div className="md:col-span-2 rounded-xl border border-line-200 bg-surface">
        <div className="px-5 py-4 border-b border-line-100 flex items-center justify-between gap-3 flex-wrap">
          <h3 className="font-serif text-base text-ink-900">Recibos del paciente</h3>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setCertOpen(true)}
              disabled={paidCount === 0}
              title={paidCount === 0 ? "Necesitas al menos un recibo pagado" : "Generar certificado de atención agregando recibos pagados"}
              className="h-8 px-3 rounded-md border border-line-200 text-xs text-ink-700 hover:border-brand-400 inline-flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <FileText className="h-3 w-3 text-brand-700" /> Certificado
            </button>
            <Link
              to="/facturacion"
              className="text-xs text-brand-700 hover:underline"
            >
              Ver todos →
            </Link>
          </div>
        </div>
        {isLoading ? (
          <div className="px-5 py-10 text-center text-sm text-ink-500">Cargando…</div>
        ) : invoices.length === 0 ? (
          <div className="px-5 py-10 text-center text-sm text-ink-500">
            Aún no hay recibos para este paciente.
          </div>
        ) : (
          <ul className="divide-y divide-line-100">
            {invoices.map((f) => (
              <li key={f.id} className="px-5 py-3 flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium text-ink-900 font-mono">{f.id}</div>
                  <div className="text-xs text-ink-500">{f.concept} · {f.date}</div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="tabular text-sm text-ink-900 font-medium">{fmt(f.amount)}</span>
                  <span className={"text-[10px] uppercase tracking-[0.06em] px-2 py-0.5 rounded-full font-medium " + (statusStyle[f.status] ?? "bg-bg-100 text-ink-500")}>
                    {statusLabel[f.status] ?? f.status}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="rounded-xl border border-line-200 bg-surface p-5">
        <h3 className="font-serif text-base text-ink-900">Resumen</h3>
        <ul className="mt-3 space-y-2 text-sm">
          <li className="flex items-center justify-between text-ink-700"><span>Total facturado</span><span className="tabular">{fmt(summary.totalBilled)}</span></li>
          <li className="flex items-center justify-between text-ink-700"><span>Pagado</span><span className="tabular text-success">{fmt(summary.paid)}</span></li>
          <li className="flex items-center justify-between text-ink-700"><span>Pendiente</span><span className="tabular text-risk-moderate">{fmt(summary.pending)}</span></li>
          {summary.overdue > 0 && (
            <li className="flex items-center justify-between text-ink-700"><span>Vencido</span><span className="tabular text-risk-high">{fmt(summary.overdue)}</span></li>
          )}
          <li className="flex items-center justify-between text-ink-700"><span>Método más usado</span><span>{summary.preferred}</span></li>
        </ul>
      </div>

      {certOpen && (
        <CertificateModal patientId={patientId} onClose={() => setCertOpen(false)} />
      )}
    </div>
  );
}

/** Modal para generar el certificado de atención del paciente en un rango. */
function CertificateModal({ patientId, onClose }: { patientId: string; onClose: () => void }) {
  const yyyy = new Date().getFullYear();
  const [from, setFrom] = useState(`${yyyy}-01-01`);
  const [to, setTo] = useState(new Date().toISOString().slice(0, 10));
  const [busy, setBusy] = useState(false);

  // Cerrar con Esc.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function generate() {
    if (!from || !to) return;
    setBusy(true);
    try {
      const blob = await api.downloadCertificatePdf({ patient_id: patientId, from, to });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `certificado_${patientId}_${from}_${to}.pdf`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
      toast.success("Certificado descargado");
      onClose();
    } catch (e: any) {
      toast.error(e?.message ?? "No se pudo generar el certificado");
    } finally {
      setBusy(false);
    }
  }

  function setPreset(preset: "year" | "lastyear" | "ytd" | "all") {
    const now = new Date();
    if (preset === "ytd" || preset === "year") {
      setFrom(`${now.getFullYear()}-01-01`);
      setTo(now.toISOString().slice(0, 10));
    } else if (preset === "lastyear") {
      setFrom(`${now.getFullYear() - 1}-01-01`);
      setTo(`${now.getFullYear() - 1}-12-31`);
    } else if (preset === "all") {
      setFrom("2020-01-01");
      setTo(now.toISOString().slice(0, 10));
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-ink-900/40 backdrop-blur-sm pt-16 p-4 overflow-y-auto" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl bg-surface shadow-modal" onClick={(e) => e.stopPropagation()}>
        <header className="px-5 py-4 border-b border-line-100 flex items-start justify-between">
          <div>
            <p className="text-[11px] uppercase tracking-widest text-brand-700 font-medium">Recibos</p>
            <h3 className="font-serif text-xl text-ink-900 mt-0.5">Certificado de atención</h3>
            <p className="text-xs text-ink-500 mt-1">
              Agrega los recibos pagados del paciente en el rango seleccionado. Útil para EPS o declaración de renta.
            </p>
          </div>
          <button onClick={onClose} className="h-9 w-9 rounded-md border border-line-200 text-ink-500 hover:border-brand-400 flex items-center justify-center">
            <X className="h-4 w-4" />
          </button>
        </header>
        <div className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-[11px] uppercase tracking-wider text-ink-500 font-medium">Desde</span>
              <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="mt-1 w-full h-10 px-3 rounded-md border border-line-200 bg-surface text-sm outline-none hover:border-brand-400 focus:border-brand-700" />
            </label>
            <label className="block">
              <span className="text-[11px] uppercase tracking-wider text-ink-500 font-medium">Hasta</span>
              <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="mt-1 w-full h-10 px-3 rounded-md border border-line-200 bg-surface text-sm outline-none hover:border-brand-400 focus:border-brand-700" />
            </label>
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[10px] uppercase tracking-wider text-ink-400">Atajos:</span>
            <button type="button" onClick={() => setPreset("ytd")} className="text-[11px] px-2 py-0.5 rounded-full border border-line-200 text-ink-700 hover:border-brand-400">Año en curso</button>
            <button type="button" onClick={() => setPreset("lastyear")} className="text-[11px] px-2 py-0.5 rounded-full border border-line-200 text-ink-700 hover:border-brand-400">Año anterior</button>
            <button type="button" onClick={() => setPreset("all")} className="text-[11px] px-2 py-0.5 rounded-full border border-line-200 text-ink-700 hover:border-brand-400">Histórico</button>
          </div>
        </div>
        <footer className="p-4 border-t border-line-100 bg-bg-100/30 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="h-9 px-3 rounded-md border border-line-200 text-sm text-ink-700 hover:border-brand-400">Cancelar</button>
          <button
            type="button"
            onClick={generate}
            disabled={busy || !from || !to}
            className="h-9 px-4 rounded-md bg-brand-700 text-primary-foreground text-sm font-medium hover:bg-brand-800 disabled:opacity-60 inline-flex items-center gap-2"
          >
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileText className="h-3.5 w-3.5" />}
            Generar PDF
          </button>
        </footer>
      </div>
    </div>
  );
}

// ─── Modal: Invitar al portal del paciente ─────────────────────────────────
function InvitePortalModal({ patient, onClose }: { patient: import("@/lib/api").ApiPatient; onClose: () => void }) {
  const [invite, setInvite] = useState<{ url: string; expires_at: string; days_valid: number; whatsapp_text: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [alreadyActive, setAlreadyActive] = useState(false);
  const [generating, setGenerating] = useState(true);

  useEffect(() => {
    let mounted = true;
    api.invitePatient(patient.id)
      .then((res) => { if (mounted) setInvite(res); })
      .catch((e: any) => {
        if (!mounted) return;
        if (e?.status === 409) setAlreadyActive(true);
        setError(e?.message ?? "Error al generar invitación");
      })
      .finally(() => { if (mounted) setGenerating(false); });
    return () => { mounted = false; };
  }, [patient.id]);

  function copy(text: string, label: string) {
    navigator.clipboard?.writeText(text).then(
      () => toast.success(`${label} copiado`),
      () => toast.error("No se pudo copiar")
    );
  }

  const wa = whatsappUrl(patient.phone, invite?.whatsapp_text);

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-ink-900/50 backdrop-blur-sm p-0 sm:p-4" onClick={onClose}>
      <div className="w-full sm:max-w-lg bg-surface rounded-t-2xl sm:rounded-2xl shadow-modal max-h-[92vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <header className="px-5 py-4 border-b border-line-100 flex items-start justify-between">
          <div>
            <p className="text-[11px] uppercase tracking-widest text-brand-700 font-medium">Portal del paciente</p>
            <h3 className="font-serif text-xl text-ink-900 mt-0.5">Invitar a {patient.preferredName ?? patient.name}</h3>
            <p className="text-xs text-ink-500 mt-1">{patient.email ? `Se generará un link único para que cree su contraseña.` : "Este paciente no tiene email registrado. Edítalo primero."}</p>
          </div>
          <button onClick={onClose} className="h-9 w-9 rounded-md border border-line-200 flex items-center justify-center text-ink-500 hover:border-brand-400">×</button>
        </header>

        <div className="p-5">
          {generating && (
            <div className="text-center py-8 text-ink-500">
              <Clock className="h-5 w-5 mx-auto mb-2 animate-spin" />
              Generando invitación…
            </div>
          )}

          {alreadyActive && (
            <div className="rounded-lg border border-brand-400/30 bg-brand-50 p-4">
              <p className="text-sm text-ink-900 font-medium">Este paciente ya tiene cuenta activa.</p>
              <p className="text-xs text-ink-500 mt-1">Si olvidó la contraseña, dile que use "¿Olvidaste tu contraseña?" en la pantalla de login del portal.</p>
            </div>
          )}

          {error && !alreadyActive && (
            <div className="rounded-lg border border-rose-300/50 bg-rose-500/5 p-3 text-xs text-rose-700">{error}</div>
          )}

          {invite && (
            <div className="space-y-4">
              <div className="rounded-xl border border-line-200 bg-bg-100 p-4 flex flex-col items-center gap-3">
                <QRCodeSVG value={invite.url} size={180} marginSize={2} />
                <p className="text-[11px] text-ink-500">Escanea con la cámara del celular</p>
              </div>
              <div>
                <label className="block text-[11px] uppercase tracking-wider text-ink-500 mb-1">Enlace de activación</label>
                <div className="flex gap-2">
                  <input
                    readOnly
                    value={invite.url}
                    onClick={(e) => (e.target as HTMLInputElement).select()}
                    className="flex-1 h-10 px-3 rounded-md border border-line-200 bg-bg text-xs text-ink-900 font-mono"
                  />
                  <button onClick={() => copy(invite.url, "Enlace")} className="h-10 px-3 rounded-md bg-brand-700 text-white text-xs font-medium hover:bg-brand-800">
                    Copiar
                  </button>
                </div>
                <p className="text-[11px] text-ink-500 mt-1">Válido por {invite.days_valid} días — expira el {new Date(invite.expires_at).toLocaleString("es-CO", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}.</p>
              </div>
              <div>
                <label className="block text-[11px] uppercase tracking-wider text-ink-500 mb-1">Mensaje sugerido para WhatsApp</label>
                <textarea
                  readOnly
                  value={invite.whatsapp_text}
                  className="w-full h-32 px-3 py-2 rounded-md border border-line-200 bg-bg text-xs text-ink-700 font-mono resize-none"
                />
                <div className="mt-2 flex gap-2">
                  <button onClick={() => copy(invite.whatsapp_text, "Mensaje")} className="flex-1 h-10 px-3 rounded-md border border-line-200 text-xs text-ink-700 hover:border-brand-400">
                    Copiar mensaje
                  </button>
                  {wa && (
                    <a
                      href={wa}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex-1 h-10 px-3 rounded-md bg-sage-500 text-white text-xs font-medium hover:bg-sage-700 inline-flex items-center justify-center gap-1.5"
                    >
                      <MessageCircle className="h-3.5 w-3.5" /> Abrir WhatsApp
                    </a>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        <footer className="px-5 py-4 border-t border-line-100 flex justify-end">
          <button onClick={onClose} className="h-10 px-4 rounded-lg bg-bg text-sm text-ink-700 border border-line-200 hover:border-brand-400">Cerrar</button>
        </footer>
      </div>
    </div>
  );
}
