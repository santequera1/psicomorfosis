import { createFileRoute, Link, useParams, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { toast } from "sonner";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/app/AppShell";
import { RiskBadge } from "@/components/app/RiskBadge";
import { TEST_EVOLUTION } from "@/lib/mock-data";
import { api } from "@/lib/api";
import { Trash2 } from "lucide-react";
import {
  ArrowLeft, Phone, Mail, MapPin, Calendar, ClipboardList, FileText, Pill,
  MessagesSquare, Receipt, Brain, Plus, User, IdCard, ChevronRight, Edit3,
  TrendingDown, CheckCircle2, Clock, AlertCircle, MessageCircle, UserPlus,
} from "lucide-react";
import { whatsappUrl } from "@/lib/display";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Tooltip } from "recharts";

export const Route = createFileRoute("/pacientes_/$id")({
  head: ({ params }: { params: { id: string } }) => ({
    meta: [
      { title: `Paciente ${params.id} · Psicomorfosis` },
    ],
  }),
  component: PatientDetailPage,
});

type Tab = "datos" | "historia" | "tests" | "prescripcion" | "documentos" | "facturacion";

const TABS: { id: Tab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: "datos", label: "Datos", icon: User },
  { id: "historia", label: "Historia", icon: ClipboardList },
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
                <RiskBadge risk={patient.risk} compact />
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

        <div className="border-b border-line-200 overflow-x-auto">
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

        {tab === "datos" && <TabDatos patient={patient} />}
        {tab === "historia" && <TabHistoria patient={patient} />}
        {tab === "tests" && <TabTests rows={tests} />}
        {tab === "prescripcion" && <TabPrescripcion rows={tasks} />}
        {tab === "documentos" && <TabDocumentos rows={docs} patientId={patient.id} />}
        {tab === "facturacion" && <TabFacturacion />}
      </div>

      {editing && patient && <EditPatientInlineModal patient={patient} onClose={() => setEditing(false)} />}
      {inviteOpen && patient && <InvitePortalModal patient={patient} onClose={() => setInviteOpen(false)} />}
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
    reason: patient.reason,
    modality: patient.modality,
    status: patient.status,
    risk: patient.risk,
  });
  const mu = useMutation({
    mutationFn: () => api.updatePatient(patient.id, form),
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
          <label className="block">
            <span className="text-[11px] uppercase tracking-wider text-ink-500 font-medium">Motivo de consulta</span>
            <textarea rows={2} value={form.reason} onChange={(e) => setForm((p) => ({ ...p, reason: e.target.value }))} className="mt-1 w-full px-3 py-2 rounded-md border border-line-200 bg-surface text-sm outline-none focus:border-brand-700" />
          </label>
          <div className="grid grid-cols-3 gap-3">
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
            <label className="block">
              <span className="text-[11px] uppercase tracking-wider text-ink-500 font-medium">Riesgo</span>
              <select value={form.risk} onChange={(e) => setForm((p) => ({ ...p, risk: e.target.value as any }))} className="mt-1 w-full h-10 px-3 rounded-md border border-line-200 bg-surface text-sm outline-none hover:border-brand-400">
                <option value="none">Sin bandera</option><option value="low">Bajo</option><option value="moderate">Moderado</option><option value="high">Alto</option><option value="critical">Crítico</option>
              </select>
            </label>
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

function TabDatos({ patient }: { patient: import("@/lib/api").ApiPatient }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
      <div className="md:col-span-2 space-y-5">
        <Section title="Contacto y datos básicos">
          <dl className="grid grid-cols-2 gap-4 text-sm">
            <div><dt className="text-xs text-ink-500">Documento</dt><dd className="text-ink-900 mt-0.5 tabular">{patient.doc}</dd></div>
            <div><dt className="text-xs text-ink-500">Edad</dt><dd className="text-ink-900 mt-0.5">{patient.age || "—"}</dd></div>
            <div><dt className="text-xs text-ink-500">Pronombres</dt><dd className="text-ink-900 mt-0.5">{patient.pronouns}</dd></div>
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
            <div className="col-span-2"><dt className="text-xs text-ink-500">Correo</dt><dd className="text-ink-900 mt-0.5">{patient.email}</dd></div>
          </dl>
        </Section>
        <Section title="Contactos de emergencia">
          <ul className="space-y-2 text-sm">
            <li className="flex items-center justify-between p-3 rounded-lg border border-line-200">
              <div>
                <div className="text-ink-900 font-medium">Madre · Luz Helena Rondón</div>
                <div className="text-xs text-ink-500">Primer contacto · +57 310 555 4412</div>
              </div>
              <button className="text-xs text-brand-700 hover:underline">Llamar</button>
            </li>
            <li className="flex items-center justify-between p-3 rounded-lg border border-line-200">
              <div>
                <div className="text-ink-900 font-medium">Pareja · Julián Ortega</div>
                <div className="text-xs text-ink-500">Segundo contacto · +57 311 889 2211</div>
              </div>
              <button className="text-xs text-brand-700 hover:underline">Llamar</button>
            </li>
          </ul>
        </Section>
      </div>
      <div className="space-y-5">
        <Section title="Seguro / EPS">
          <div className="text-sm">
            <div className="text-ink-900 font-medium">Sura · Plan Clásico</div>
            <div className="text-xs text-ink-500 mt-0.5">Póliza 008-4412 · vigente hasta 2026-12-31</div>
          </div>
          <div className="mt-3 pt-3 border-t border-line-100 text-xs text-ink-500">
            Cobertura: psicología, psiquiatría, terapia individual.
          </div>
        </Section>
        <Section title="Resumen clínico">
          <ul className="space-y-2 text-sm">
            <li className="flex items-center justify-between text-ink-700"><span>Sesiones</span><span className="tabular">12</span></li>
            <li className="flex items-center justify-between text-ink-700"><span>Inicio</span><span className="tabular">2025-11-04</span></li>
            <li className="flex items-center justify-between text-ink-700"><span>Enfoque</span><span>TCC</span></li>
            <li className="flex items-center justify-between text-ink-700"><span>Adherencia</span><span className="tabular text-success font-medium">92%</span></li>
          </ul>
        </Section>
      </div>
    </div>
  );
}

function TabHistoria({ patient }: { patient: import("@/lib/api").ApiPatient }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
      <Section title="Motivo de consulta">
        <p className="text-sm text-ink-700">
          Paciente consulta por episodios de ansiedad creciente en contextos laborales y sociales. Reporta palpitaciones,
          rumiación cognitiva y evitación progresiva de reuniones de equipo desde hace 6 meses.
        </p>
      </Section>
      <Section title="Antecedentes personales">
        <p className="text-sm text-ink-700">
          Sin antecedentes psiquiátricos previos. Diagnóstico de hipotiroidismo compensado. Historia familiar:
          madre con depresión en tratamiento farmacológico. No consumo de sustancias.
        </p>
      </Section>
      <Section title="Examen mental">
        <ul className="text-sm text-ink-700 space-y-1.5">
          <li><strong className="text-ink-900">Apariencia:</strong> cuidada, acorde al contexto.</li>
          <li><strong className="text-ink-900">Afecto:</strong> restringido, congruente con el contenido.</li>
          <li><strong className="text-ink-900">Pensamiento:</strong> rumiativo, sin desorganización.</li>
          <li><strong className="text-ink-900">Ideación:</strong> niega ideas auto/heterolesivas.</li>
          <li><strong className="text-ink-900">Insight:</strong> preservado.</li>
        </ul>
      </Section>
      <Section title="Diagnóstico CIE-11">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-brand-50 text-brand-800 text-xs font-medium mb-2">
          6B00 · Trastorno de ansiedad generalizada
        </div>
        <p className="text-xs text-ink-500">Especificador: intensidad moderada. Sin comorbilidades activas.</p>
      </Section>
      <Section title="Plan de tratamiento · TCC">
        <ol className="text-sm text-ink-700 space-y-2 list-decimal pl-5">
          <li>Psicoeducación sobre ansiedad y ciclo del miedo.</li>
          <li>Entrenamiento en respiración 4-7-8 y relajación muscular progresiva.</li>
          <li>Registro de pensamientos automáticos y reestructuración cognitiva.</li>
          <li>Exposición gradual a situaciones sociales evitadas.</li>
          <li>Prevención de recaídas y consolidación.</li>
        </ol>
      </Section>
      <Section title="Notas de proceso · privadas">
        <div className="text-xs text-ink-500 uppercase tracking-wider mb-2">Solo visibles para Dra. Lucía Méndez</div>
        <p className="text-sm text-ink-700 italic">
          Hipótesis de conceptualización: esquema de "necesidad de aprobación" activado en contexto laboral.
          Revisar en sesión 14 el trabajo sobre creencias intermedias.
        </p>
      </Section>
      <div className="md:col-span-2 rounded-xl border border-line-200 bg-surface p-5">
        <h3 className="font-serif text-base text-ink-900 mb-4">Línea de tiempo · últimas sesiones</h3>
        <ol className="space-y-3">
          {[
            { date: "2026-04-09", title: "Sesión 12 · exposición in vivo", note: "Presentó pitch en reunión. SUDS de 80 a 45." },
            { date: "2026-04-02", title: "Sesión 11 · jerarquía laboral", note: "Construimos jerarquía de 8 situaciones." },
            { date: "2026-03-26", title: "GAD-7 · 11 (moderada)", note: "Reducción sostenida respecto a febrero." },
            { date: "2026-03-19", title: "Sesión 10 · reestructuración", note: "Trabajo sobre pensamiento 'voy a fallar'." },
          ].map((e, i) => (
            <li key={i} className="flex gap-4">
              <div className="shrink-0 text-xs text-ink-500 tabular w-24 pt-1">{e.date}</div>
              <div className="h-2 w-2 rounded-full bg-brand-700 mt-2 shrink-0" />
              <div>
                <div className="text-sm font-medium text-ink-900">{e.title}</div>
                <div className="text-xs text-ink-500 mt-0.5">{e.note}</div>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </div>
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

  return (
    <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
      <div className="xl:col-span-2 rounded-xl border border-line-200 bg-surface">
        <div className="px-5 py-4 border-b border-line-100 flex items-center justify-between">
          <h3 className="font-serif text-base text-ink-900">Aplicaciones del paciente</h3>
          <button className="h-9 px-3 rounded-md bg-brand-700 text-primary-foreground text-xs font-medium hover:bg-brand-800 inline-flex items-center gap-1.5">
            <Plus className="h-3.5 w-3.5" /> Aplicar test
          </button>
        </div>
        {rows.length === 0 ? (
          <div className="p-10 text-center text-sm text-ink-500">Este paciente aún no tiene aplicaciones.</div>
        ) : (
          <ul className="divide-y divide-line-100">
            {rows.map((r) => (
              <li key={r.id} className="px-5 py-4 flex items-center gap-4">
                <div className="h-10 w-10 rounded-lg bg-lavender-100 text-lavender-500 flex items-center justify-center shrink-0">
                  <Brain className="h-4 w-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-ink-900">{r.test_code} · {r.test_name}</div>
                  <div className="text-xs text-ink-500 mt-0.5 tabular">{r.date} · {r.professional}</div>
                </div>
                <div className="text-right shrink-0">
                  <div className="font-serif text-2xl text-ink-900 tabular">{r.status === "completado" ? r.score : "—"}</div>
                  <span className={"inline-block mt-0.5 px-2 py-0.5 rounded-full text-[10px] font-medium " + LEVEL_STYLE[r.level]}>{r.interpretation}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="rounded-xl border border-line-200 bg-surface p-5">
        <h3 className="font-serif text-base text-ink-900">Evolución · GAD-7</h3>
        <div className="flex items-center gap-2 my-3">
          <span className="font-serif text-3xl text-ink-900 tabular">8</span>
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium bg-success-soft text-success">
            <TrendingDown className="h-3 w-3" /> −7 pts
          </span>
        </div>
        <div className="h-40">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={TEST_EVOLUTION}>
              <CartesianGrid stroke="oklch(0.92 0.01 240)" strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="date" tick={{ fontSize: 10 }} stroke="oklch(0.55 0.02 240)" tickLine={false} axisLine={false} />
              <YAxis tick={{ fontSize: 10 }} stroke="oklch(0.55 0.02 240)" tickLine={false} axisLine={false} />
              <Tooltip contentStyle={{ border: "1px solid oklch(0.92 0.01 240)", borderRadius: 8, fontSize: 12 }} />
              <Line type="monotone" dataKey="score" stroke="oklch(0.53 0.045 200)" strokeWidth={2.5} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

function TabPrescripcion({ rows }: { rows: any[] }) {
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
        <Link to="/prescripcion" className="h-9 px-3 rounded-md bg-brand-700 text-primary-foreground text-xs font-medium hover:bg-brand-800 inline-flex items-center gap-1.5">
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

function TabFacturacion() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
      <div className="md:col-span-2 rounded-xl border border-line-200 bg-surface">
        <div className="px-5 py-4 border-b border-line-100">
          <h3 className="font-serif text-base text-ink-900">Facturas del paciente</h3>
        </div>
        <ul className="divide-y divide-line-100">
          {[
            { id: "F-2025-0184", concept: "Sesión · individual", date: "2026-04-09", amount: 180000, status: "pagada" },
            { id: "F-2025-0172", concept: "Sesión · individual", date: "2026-04-02", amount: 180000, status: "pagada" },
            { id: "F-2025-0165", concept: "Sesión · individual", date: "2026-03-26", amount: 180000, status: "pendiente" },
          ].map((f) => (
            <li key={f.id} className="px-5 py-3 flex items-center justify-between">
              <div>
                <div className="text-sm font-medium text-ink-900">{f.id}</div>
                <div className="text-xs text-ink-500">{f.concept} · {f.date}</div>
              </div>
              <div className="flex items-center gap-3">
                <span className="tabular text-sm text-ink-900">${f.amount.toLocaleString("es-CO")}</span>
                <span className={"text-[10px] uppercase tracking-[0.06em] px-2 py-0.5 rounded-full font-medium " + (f.status === "pagada" ? "bg-success-soft text-success" : "bg-warning-soft text-risk-moderate")}>{f.status}</span>
              </div>
            </li>
          ))}
        </ul>
      </div>
      <div className="rounded-xl border border-line-200 bg-surface p-5">
        <h3 className="font-serif text-base text-ink-900">Resumen</h3>
        <ul className="mt-3 space-y-2 text-sm">
          <li className="flex items-center justify-between text-ink-700"><span>Total facturado</span><span className="tabular">$2.160.000</span></li>
          <li className="flex items-center justify-between text-ink-700"><span>Pagado</span><span className="tabular text-success">$1.980.000</span></li>
          <li className="flex items-center justify-between text-ink-700"><span>Pendiente</span><span className="tabular text-risk-moderate">$180.000</span></li>
          <li className="flex items-center justify-between text-ink-700"><span>Método preferido</span><span>PSE</span></li>
        </ul>
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
