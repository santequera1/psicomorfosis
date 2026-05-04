import { createFileRoute, useSearch } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/app/AppShell";
import { KpiCard } from "@/components/app/KpiCard";
import { TCC_TEMPLATES, type TaskType } from "@/lib/mock-data";
import { api } from "@/lib/api";
import {
  Pill, Plus, Search, CheckCircle2, AlertCircle, ListChecks,
  PenSquare, TrendingUp, Sparkles, Brain, Leaf, BookOpen, ClipboardList, X, Send, ChevronRight, Loader2,
} from "lucide-react";

interface TaskRow {
  id: string;
  patient_id: string;
  patient_name: string;
  title: string;
  type: TaskType;
  description: string;
  assigned_at: string;
  due_at: string;
  status: "asignada" | "en_progreso" | "completada" | "vencida";
  adherence: number;
  professional: string;
  sessions_remaining: number;
}

type PrescripcionSearch = { patientId?: string; openAssign?: boolean };

export const Route = createFileRoute("/prescripcion")({
  head: () => ({
    meta: [
      { title: "Prescripción · Psicomorfosis" },
      { name: "description", content: "Planes terapéuticos, tareas TCC y seguimiento de adherencia." },
    ],
  }),
  validateSearch: (search: Record<string, unknown>): PrescripcionSearch => ({
    patientId: typeof search.patientId === "string" ? search.patientId : undefined,
    openAssign: search.openAssign === true || search.openAssign === "1" || search.openAssign === "true" || undefined,
  }),
  component: PrescripcionPage,
});

const TEMPLATE_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  PenSquare, TrendingUp, Sparkles, Brain, Leaf, BookOpen, ClipboardList,
};

const STATUS_STYLE: Record<string, { bg: string; text: string; label: string }> = {
  asignada:    { bg: "bg-brand-50",     text: "text-brand-800",       label: "Asignada" },
  en_progreso: { bg: "bg-warning-soft", text: "text-risk-moderate",   label: "En progreso" },
  completada:  { bg: "bg-success-soft", text: "text-success",         label: "Completada" },
  vencida:     { bg: "bg-error-soft",   text: "text-risk-high",       label: "Vencida" },
};

const TYPE_LABEL: Record<TaskType, string> = {
  registro_pensamientos: "Registro de pensamientos",
  exposicion: "Exposición gradual",
  activacion: "Activación conductual",
  reestructuracion: "Reestructuración cognitiva",
  mindfulness: "Mindfulness",
  psicoeducacion: "Psicoeducación",
  autoregistro: "Autoregistro",
};

function PrescripcionPage() {
  const search = useSearch({ from: "/prescripcion" });
  const [filter, setFilter] = useState<"todas" | "activas" | "vencidas">("activas");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<TaskRow | null>(null);
  const [assignOpen, setAssignOpen] = useState(!!search.openAssign || !!search.patientId);

  const { data: tasks = [], isLoading } = useQuery({
    queryKey: ["tasks"],
    queryFn: () => api.listTasks() as Promise<any>,
  });
  const allTasks = tasks as TaskRow[];

  useEffect(() => {
    if (!selected && allTasks.length > 0) setSelected(allTasks[0]);
  }, [allTasks, selected]);

  const kpis = useMemo(() => {
    if (allTasks.length === 0) return { active: 0, completed: 0, overdue: 0, adherence: 0 };
    const active = allTasks.filter((t) => t.status === "en_progreso" || t.status === "asignada").length;
    const completed = allTasks.filter((t) => t.status === "completada").length;
    const overdue = allTasks.filter((t) => t.status === "vencida").length;
    const adherence = Math.round(allTasks.reduce((a, t) => a + t.adherence, 0) / allTasks.length);
    return { active, completed, overdue, adherence };
  }, [allTasks]);

  const filtered = allTasks.filter((t) => {
    if (filter === "activas" && t.status !== "en_progreso" && t.status !== "asignada") return false;
    if (filter === "vencidas" && t.status !== "vencida") return false;
    if (query.trim()) {
      const q = query.toLowerCase();
      if (!t.patient_name.toLowerCase().includes(q) && !t.title.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  return (
    <AppShell>
      <div className="space-y-8">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm text-ink-500">Planes terapéuticos · seguimiento entre sesiones</p>
            <h1 className="font-serif text-2xl md:text-[32px] leading-tight text-ink-900 mt-1">Prescripción</h1>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setAssignOpen(true)}
              className="h-10 px-4 rounded-lg bg-brand-700 text-primary-foreground text-sm font-medium hover:bg-brand-800 inline-flex items-center gap-2"
            >
              <Plus className="h-4 w-4" /> Asignar tarea
            </button>
            <button className="h-10 px-4 rounded-lg border border-line-200 bg-surface text-ink-700 text-sm hover:border-brand-400">
              Plantillas TCC
            </button>
          </div>
        </header>

        <section className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <KpiCard label="Tareas activas" value={String(kpis.active)} hint="asignadas y en curso" icon={<ListChecks className="h-4 w-4" />} delta={{ neutral: true, value: "" }} />
          <KpiCard label="Completadas" value={String(kpis.completed)} hint="últimos 30 días" icon={<CheckCircle2 className="h-4 w-4" />} delta={{ value: "+5", positive: true }} />
          <KpiCard label="Vencidas" value={String(kpis.overdue)} emphasis="risk" hint="requieren contacto" icon={<AlertCircle className="h-4 w-4" />} delta={{ neutral: true, value: "" }} />
          <KpiCard label="Adherencia promedio" value={`${kpis.adherence}%`} hint="global" icon={<Pill className="h-4 w-4" />} delta={{ value: "+4%", positive: true }} />
        </section>

        <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
          {TCC_TEMPLATES.map((t) => {
            const Icon = TEMPLATE_ICONS[t.icon] ?? ClipboardList;
            return (
              <button
                key={t.id}
                onClick={() => setAssignOpen(true)}
                className="rounded-xl border border-line-200 bg-surface p-4 text-left hover:border-brand-400 hover:shadow-soft transition-all group"
              >
                <div className="flex items-start gap-3">
                  <div className="h-10 w-10 rounded-lg bg-lavender-100 text-lavender-500 flex items-center justify-center shrink-0">
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-ink-900">{t.name}</div>
                    <p className="text-xs text-ink-500 mt-1 line-clamp-2">{t.description}</p>
                  </div>
                </div>
                <div className="mt-3 text-[11px] text-brand-700 opacity-0 group-hover:opacity-100 transition-opacity inline-flex items-center gap-1">
                  Usar plantilla <ChevronRight className="h-3 w-3" />
                </div>
              </button>
            );
          })}
        </section>

        <section className="grid grid-cols-1 xl:grid-cols-5 gap-5">
          <div className="xl:col-span-3 rounded-xl border border-line-200 bg-surface">
            <div className="p-4 border-b border-line-100 flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1 p-1 rounded-lg bg-bg-100">
                {([
                  { id: "activas", label: "Activas" },
                  { id: "vencidas", label: "Vencidas" },
                  { id: "todas", label: "Todas" },
                ] as const).map((f) => (
                  <button
                    key={f.id}
                    onClick={() => setFilter(f.id)}
                    className={
                      "px-3 py-1.5 text-xs rounded transition-colors " +
                      (filter === f.id ? "bg-surface text-ink-900 font-medium shadow-xs" : "text-ink-500 hover:text-ink-900")
                    }
                  >
                    {f.label}
                  </button>
                ))}
              </div>
              <div className="flex-1 min-w-[220px] flex items-center gap-2 h-9 px-3 rounded-md border border-line-200 bg-bg-100/40">
                <Search className="h-3.5 w-3.5 text-ink-400" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Buscar por paciente o título…"
                  className="flex-1 bg-transparent text-sm text-ink-900 placeholder:text-ink-400 outline-none"
                />
              </div>
            </div>

            <ul className="divide-y divide-line-100">
              {filtered.map((t) => {
                const s = STATUS_STYLE[t.status];
                const isSelected = selected?.id === t.id;
                return (
                  <li key={t.id}>
                    <button
                      onClick={() => setSelected(t)}
                      className={
                        "w-full px-5 py-4 text-left transition-colors " +
                        (isSelected ? "bg-brand-50/70" : "hover:bg-bg-100/40")
                      }
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <span className={"text-[10px] uppercase tracking-[0.08em] px-2 py-0.5 rounded-full font-medium " + s.bg + " " + s.text}>{s.label}</span>
                            <span className="text-[11px] text-ink-400 uppercase tracking-wider">{TYPE_LABEL[t.type]}</span>
                          </div>
                          <div className="text-sm font-medium text-ink-900 truncate">{t.title}</div>
                          <div className="text-xs text-ink-500 mt-0.5">
                            {t.patient_name} · {t.professional} · vence {t.due_at}
                          </div>
                        </div>
                        <div className="shrink-0 text-right">
                          <div className="text-[10px] text-ink-500 uppercase tracking-wider">Adherencia</div>
                          <div className="font-serif text-lg text-ink-900 tabular">{t.adherence}%</div>
                        </div>
                      </div>
                      <div className="mt-2 h-1 rounded-full bg-bg-100 overflow-hidden">
                        <div
                          className={
                            "h-full transition-all " +
                            (t.adherence >= 80 ? "bg-success" : t.adherence >= 50 ? "bg-warning" : "bg-risk-high")
                          }
                          style={{ width: `${t.adherence}%` }}
                        />
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>

            {filtered.length === 0 && (
              <div className="p-10 text-center text-sm text-ink-500">Sin tareas que coincidan con los filtros.</div>
            )}
          </div>

          <aside className="xl:col-span-2">
            {selected ? (
              <div className="rounded-xl border border-line-200 bg-surface p-6 sticky top-20">
                <div className="flex items-start justify-between gap-2 mb-3">
                  <div>
                    <p className="text-[11px] uppercase tracking-[0.1em] text-brand-800 font-medium">{TYPE_LABEL[selected.type]}</p>
                    <h3 className="font-serif text-xl text-ink-900 mt-1">{selected.title}</h3>
                  </div>
                  <span className={"text-[10px] uppercase tracking-[0.08em] px-2 py-0.5 rounded-full font-medium shrink-0 " + STATUS_STYLE[selected.status].bg + " " + STATUS_STYLE[selected.status].text}>
                    {STATUS_STYLE[selected.status].label}
                  </span>
                </div>
                <p className="text-sm text-ink-700">{selected.description}</p>

                <dl className="grid grid-cols-2 gap-3 mt-5">
                  <div className="rounded-lg border border-line-200 p-3">
                    <dt className="text-[11px] text-ink-500 uppercase tracking-wider">Paciente</dt>
                    <dd className="text-sm text-ink-900 mt-1 font-medium">{selected.patient_name}</dd>
                  </div>
                  <div className="rounded-lg border border-line-200 p-3">
                    <dt className="text-[11px] text-ink-500 uppercase tracking-wider">Profesional</dt>
                    <dd className="text-sm text-ink-900 mt-1">{selected.professional}</dd>
                  </div>
                  <div className="rounded-lg border border-line-200 p-3">
                    <dt className="text-[11px] text-ink-500 uppercase tracking-wider">Asignada</dt>
                    <dd className="text-sm text-ink-900 mt-1 tabular">{selected.assigned_at}</dd>
                  </div>
                  <div className="rounded-lg border border-line-200 p-3">
                    <dt className="text-[11px] text-ink-500 uppercase tracking-wider">Vence</dt>
                    <dd className="text-sm text-ink-900 mt-1 tabular">{selected.due_at}</dd>
                  </div>
                </dl>

                <div className="mt-5 rounded-lg border border-line-200 p-3">
                  <div className="flex items-center justify-between text-xs text-ink-500 mb-1.5">
                    <span>Adherencia</span>
                    <span className="tabular text-ink-900 font-medium">{selected.adherence}%</span>
                  </div>
                  <div className="h-2 rounded-full bg-bg-100 overflow-hidden">
                    <div
                      className={
                        "h-full " +
                        (selected.adherence >= 80 ? "bg-success" : selected.adherence >= 50 ? "bg-warning" : "bg-risk-high")
                      }
                      style={{ width: `${selected.adherence}%` }}
                    />
                  </div>
                </div>

                <div className="mt-5 space-y-2">
                  <button className="w-full h-10 rounded-md bg-brand-700 text-primary-foreground text-sm font-medium hover:bg-brand-800 inline-flex items-center justify-center gap-1.5">
                    <Send className="h-4 w-4" /> Enviar recordatorio al paciente
                  </button>
                  <div className="grid grid-cols-2 gap-2">
                    <button className="h-10 rounded-md border border-line-200 bg-surface text-sm text-ink-700 hover:border-brand-400">Marcar completada</button>
                    <button className="h-10 rounded-md border border-line-200 bg-surface text-sm text-ink-700 hover:border-brand-400">Editar</button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-line-200 p-10 text-center">
                <Pill className="h-6 w-6 text-ink-400 mx-auto mb-2" />
                <p className="text-sm text-ink-500">Selecciona una tarea para ver el detalle.</p>
              </div>
            )}
          </aside>
        </section>
      </div>

      {assignOpen && <AssignTaskModal initialPatientId={search.patientId ?? null} onClose={() => setAssignOpen(false)} />}
    </AppShell>
  );
}

function AssignTaskModal({ onClose, initialPatientId }: { onClose: () => void; initialPatientId?: string | null }) {
  // Si viene patientId por search (ej. desde el perfil del paciente),
  // arrancamos en el paso 2 con el paciente preseleccionado.
  const [step, setStep] = useState<1 | 2 | 3>(initialPatientId ? 2 : 1);
  const [template, setTemplate] = useState<TaskType>("registro_pensamientos");
  const { data: patients = [] } = useQuery({ queryKey: ["patients"], queryFn: () => api.listPatients() });
  const [patient, setPatient] = useState<string>(initialPatientId ?? "");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-900/40 backdrop-blur-sm p-4">
      <div className="w-full max-w-xl rounded-2xl bg-surface shadow-modal max-h-[90vh] overflow-hidden flex flex-col">
        <header className="flex items-start justify-between p-5 border-b border-line-100">
          <div>
            <p className="text-[11px] uppercase tracking-[0.1em] text-brand-800 font-medium">Nuevo plan</p>
            <h3 className="font-serif text-xl text-ink-900 mt-0.5">Asignar tarea terapéutica</h3>
            <p className="text-xs text-ink-500 mt-1">Paso {step} de 3</p>
          </div>
          <button onClick={onClose} className="h-9 w-9 rounded-md border border-line-200 text-ink-500 hover:border-brand-400 flex items-center justify-center">
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto p-5">
          {step === 1 && (
            <div className="space-y-3">
              <p className="text-sm text-ink-700">Escoge una plantilla TCC como base:</p>
              {TCC_TEMPLATES.map((t) => {
                const Icon = TEMPLATE_ICONS[t.icon] ?? ClipboardList;
                return (
                  <button
                    key={t.id}
                    onClick={() => setTemplate(t.id)}
                    className={
                      "w-full flex items-start gap-3 p-3 rounded-lg border text-left transition-colors " +
                      (template === t.id ? "border-brand-700 bg-brand-50" : "border-line-200 hover:border-brand-400")
                    }
                  >
                    <div className="h-9 w-9 rounded-md bg-lavender-100 text-lavender-500 flex items-center justify-center shrink-0">
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-ink-900">{t.name}</div>
                      <div className="text-xs text-ink-500 mt-0.5">{t.description}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <label className="block">
                <span className="text-[11px] uppercase tracking-wider text-ink-500 font-medium">Paciente</span>
                <select
                  value={patient}
                  onChange={(e) => setPatient(e.target.value)}
                  className="mt-1 w-full h-10 px-3 rounded-md border border-line-200 bg-surface text-sm text-ink-900 outline-none hover:border-brand-400"
                >
                  <option value="">Selecciona…</option>
                  {patients.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </label>
              <label className="block">
                <span className="text-[11px] uppercase tracking-wider text-ink-500 font-medium">Título de la tarea</span>
                <input
                  defaultValue={TCC_TEMPLATES.find((t) => t.id === template)?.name}
                  className="mt-1 w-full h-10 px-3 rounded-md border border-line-200 bg-surface text-sm text-ink-900 outline-none hover:border-brand-400 focus:border-brand-700"
                />
              </label>
              <label className="block">
                <span className="text-[11px] uppercase tracking-wider text-ink-500 font-medium">Instrucciones</span>
                <textarea
                  rows={4}
                  defaultValue={TCC_TEMPLATES.find((t) => t.id === template)?.description}
                  className="mt-1 w-full px-3 py-2 rounded-md border border-line-200 bg-surface text-sm text-ink-900 outline-none hover:border-brand-400 focus:border-brand-700"
                />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="text-[11px] uppercase tracking-wider text-ink-500 font-medium">Vence</span>
                  <input type="date" defaultValue="2026-04-25" className="mt-1 w-full h-10 px-3 rounded-md border border-line-200 bg-surface text-sm text-ink-900 outline-none hover:border-brand-400" />
                </label>
                <label className="block">
                  <span className="text-[11px] uppercase tracking-wider text-ink-500 font-medium">Recordatorio</span>
                  <select className="mt-1 w-full h-10 px-3 rounded-md border border-line-200 bg-surface text-sm text-ink-900 outline-none hover:border-brand-400">
                    <option>24 h antes</option>
                    <option>48 h antes</option>
                    <option>Día de vencimiento</option>
                    <option>Sin recordatorio</option>
                  </select>
                </label>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              <div className="rounded-lg border border-success/30 bg-success-soft p-4 flex items-start gap-3">
                <CheckCircle2 className="h-5 w-5 text-success shrink-0" />
                <div>
                  <p className="text-sm text-ink-900 font-medium">Lista para enviar</p>
                  <p className="text-xs text-ink-500 mt-1">La tarea se notificará al paciente por correo y aparecerá en su portal.</p>
                </div>
              </div>
              <div className="rounded-lg border border-line-200 p-4">
                <dl className="grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <dt className="text-ink-500 uppercase tracking-wider">Plantilla</dt>
                    <dd className="text-sm text-ink-900 mt-0.5">{TCC_TEMPLATES.find((t) => t.id === template)?.name}</dd>
                  </div>
                  <div>
                    <dt className="text-ink-500 uppercase tracking-wider">Paciente</dt>
                    <dd className="text-sm text-ink-900 mt-0.5">{patients.find((p) => p.id === patient)?.name ?? "—"}</dd>
                  </div>
                </dl>
              </div>
            </div>
          )}
        </div>

        <footer className="flex items-center justify-between p-4 border-t border-line-100 bg-bg-100/30">
          <button
            onClick={() => (step > 1 ? setStep((step - 1) as 1 | 2) : onClose())}
            className="h-9 px-3 rounded-md border border-line-200 bg-surface text-sm text-ink-700 hover:border-brand-400"
          >
            {step === 1 ? "Cancelar" : "Atrás"}
          </button>
          <button
            onClick={() => (step < 3 ? setStep((step + 1) as 2 | 3) : onClose())}
            className="h-9 px-4 rounded-md bg-brand-700 text-primary-foreground text-sm font-medium hover:bg-brand-800"
          >
            {step === 3 ? "Asignar y notificar" : "Continuar"}
          </button>
        </footer>
      </div>
    </div>
  );
}
