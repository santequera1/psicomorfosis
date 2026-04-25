import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/app/AppShell";
import { type Modality } from "@/lib/mock-data";
import { RiskBadge } from "@/components/app/RiskBadge";
import { KpiCard } from "@/components/app/KpiCard";
import { api, type ApiPatient } from "@/lib/api";
import { useWorkspace } from "@/lib/workspace";
import {
  Calendar, ClipboardList, FileSignature, Brain, ChevronRight, Plus, X,
  ChevronLeft, MapPin, Users, Video, CalendarDays, Search, Loader2,
} from "lucide-react";

export const Route = createFileRoute("/agenda")({
  head: () => ({
    meta: [
      { title: "Agenda · Psicomorfosis" },
      { name: "description", content: "Agenda del día, semana y mes con panel de seguimiento clínico." },
    ],
  }),
  component: AgendaPage,
});

type View = "dia" | "semana" | "mes" | "lista";

const MODALITY_ICON: Record<Modality, React.ComponentType<{ className?: string }>> = {
  individual: Users, pareja: Users, familiar: Users, grupal: Users, tele: Video,
};

const MODALITY_LABEL: Record<Modality, string> = {
  individual: "Individual", pareja: "Pareja", familiar: "Familiar", grupal: "Grupal", tele: "Telepsicología",
};


function formatToday() {
  return new Date().toLocaleDateString("es-CO", { weekday: "long", day: "numeric", month: "long" });
}

function AgendaPage() {
  const navigate = useNavigate();
  const [view, setView] = useState<View>("dia");
  const [weekOffset, setWeekOffset] = useState(0);
  const [createOpen, setCreateOpen] = useState(false);
  const [detailSlot, setDetailSlot] = useState<any | null>(null);

  const { data: workspace } = useWorkspace();
  const isOrg = workspace?.mode === "organization";
  const today = new Date().toISOString().slice(0, 10);

  const { data: patients = [] } = useQuery({ queryKey: ["patients"], queryFn: () => api.listPatients() });
  const { data: todayAppointments = [] } = useQuery({
    queryKey: ["appointments", today],
    queryFn: () => api.listAppointments({ date: today }),
  });
  const { data: allTasks = [] } = useQuery({ queryKey: ["tasks"], queryFn: () => api.listTasks() });
  const { data: testApps = [] } = useQuery({ queryKey: ["test-applications"], queryFn: () => api.listTestApplications() });
  const { data: docs = [] } = useQuery({ queryKey: ["documents"], queryFn: () => api.listDocuments() });
  const { data: settings } = useQuery({ queryKey: ["settings"], queryFn: () => api.getSettings() });

  const pendingTasks = allTasks.filter((t: any) => t.status === "asignada" || t.status === "en_progreso").length;
  const overdueTasks = allTasks.filter((t: any) => t.status === "vencida").length;
  const pendingTests = testApps.filter((t: any) => t.status !== "completado").length;
  const pendingDocs = docs.filter((d: any) => d.status === "pendiente_firma").length;

  const myPatientsRisk = patients.filter((p) => p.risk === "high" || p.risk === "critical");

  // Encuentra próxima cita (no atendida todavía)
  const nextAppt = todayAppointments.find((a: any) => a.status === "en_curso" || a.status === "confirmada" || a.status === "pendiente");
  const nextPatient = nextAppt?.patient_id ? patients.find((p) => p.id === nextAppt.patient_id) : null;

  // Header del panel: sede en org, consultorio en individual
  const consultorio = settings?.consultorio_name || settings?.address || "Consultorio";
  const headerLocation = isOrg
    ? (workspace?.sedes[0]?.name ?? "Selecciona sede")
    : consultorio;

  return (
    <AppShell>
      <div className="space-y-8">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm text-ink-500">{isOrg ? "Agenda clínica" : "Mi consulta"} · {formatToday()}</p>
            <h1 className="font-serif text-2xl md:text-[32px] leading-tight text-ink-900 mt-1">
              {isOrg ? "Agenda" : "Mi agenda"}
            </h1>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setCreateOpen(true)}
              className="h-10 px-4 rounded-lg bg-brand-700 text-primary-foreground text-sm font-medium hover:bg-brand-800 inline-flex items-center gap-2"
            >
              <Plus className="h-4 w-4" /> Nueva cita
            </button>
          </div>
        </header>

        <section className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <KpiCard
            label={isOrg ? "Pacientes activos" : "Mis pacientes"}
            value={String(patients.filter((p) => p.status === "activo").length)}
            delta={{ neutral: true, value: "" }}
            hint={`${patients.length} en total`}
            icon={<ClipboardList className="h-4 w-4" />}
          />
          <KpiCard
            label="Sesiones hoy"
            value={String(todayAppointments.length)}
            delta={{ neutral: true, value: "" }}
            hint={`${todayAppointments.filter((a: any) => a.status === "atendida").length} atendidas`}
            icon={<Calendar className="h-4 w-4" />}
          />
          <KpiCard
            label="Tareas activas"
            value={String(pendingTasks)}
            delta={{ neutral: true, value: "" }}
            hint={overdueTasks > 0 ? `${overdueTasks} vencidas` : "sin vencer"}
            icon={<Brain className="h-4 w-4" />}
            emphasis={overdueTasks > 0 ? "risk" : "default"}
          />
          <KpiCard
            label="Docs por firmar"
            value={String(pendingDocs)}
            delta={{ neutral: true, value: "" }}
            hint="pendiente firma"
            icon={<FileSignature className="h-4 w-4" />}
          />
        </section>

        <section className="grid grid-cols-1 xl:grid-cols-3 gap-5">
          <div className="xl:col-span-2 rounded-xl border border-line-200 bg-surface">
            <div className="p-5 flex items-center justify-between gap-4 border-b border-line-100 flex-wrap">
              <div className="flex items-center gap-3">
                <button onClick={() => setWeekOffset((w) => w - 1)} className="h-9 w-9 rounded-md border border-line-200 text-ink-500 hover:border-brand-400 flex items-center justify-center">
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <div>
                  <h3 className="font-serif text-lg text-ink-900">
                    {view === "dia" ? "Agenda del día" : view === "semana" ? "Semana" : view === "mes" ? "Mes en curso" : "Lista general"}
                  </h3>
                  <p className="text-xs text-ink-500 inline-flex items-center gap-1">
                    <MapPin className="h-3 w-3" /> {headerLocation}
                  </p>
                </div>
                <button onClick={() => setWeekOffset((w) => w + 1)} className="h-9 w-9 rounded-md border border-line-200 text-ink-500 hover:border-brand-400 flex items-center justify-center">
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
              <div className="flex gap-1 p-1 rounded-md bg-bg-100">
                {(["dia", "semana", "mes", "lista"] as View[]).map((v) => (
                  <button
                    key={v}
                    onClick={() => setView(v)}
                    className={
                      "px-3 py-1.5 text-xs rounded transition-colors capitalize " +
                      (view === v ? "bg-surface text-ink-900 font-medium shadow-xs" : "text-ink-500 hover:text-ink-900")
                    }
                  >
                    {v}
                  </button>
                ))}
              </div>
            </div>

            {view === "dia" && <DayView appointments={todayAppointments} onPick={setDetailSlot} />}
            {view === "semana" && <WeekView onPick={(slot) => setDetailSlot(slot as any)} />}
            {view === "mes" && <MonthView />}
            {view === "lista" && <ListView appointments={todayAppointments} onPick={setDetailSlot} />}
          </div>

          <div className="space-y-5">
            {nextAppt && (
              <div className="rounded-xl border border-brand-700/20 bg-brand-50/60 p-5">
                <div className="text-[11px] uppercase tracking-widest text-brand-800 font-medium mb-2">Próximo paciente</div>
                <h4 className="font-serif text-xl text-ink-900">{nextPatient?.name ?? nextAppt.patient_name}</h4>
                <p className="text-xs text-ink-500 mt-1">
                  {nextAppt.time} · {MODALITY_LABEL[nextAppt.modality as Modality] ?? nextAppt.modality}
                  {nextAppt.room && ` · ${nextAppt.room}`}
                </p>
                {nextPatient && (
                  <>
                    <div className="mt-3 text-sm text-ink-700">
                      <span className="text-ink-500">Motivo:</span> {nextPatient.reason}
                    </div>
                    <div className="mt-3 flex items-center gap-2">
                      <RiskBadge risk={nextPatient.risk} compact />
                      <span className="text-[11px] text-ink-500">Último contacto: {nextPatient.lastContact}</span>
                    </div>
                    <div className="mt-4 flex gap-2">
                      <button
                        onClick={() => navigate({ to: "/historia", search: { id: nextPatient.id } })}
                        className="flex-1 h-9 rounded-md bg-brand-700 text-primary-foreground text-xs font-medium hover:bg-brand-800"
                      >
                        Abrir historia
                      </button>
                      <button
                        onClick={() => navigate({ to: "/pacientes/$id", params: { id: nextPatient.id } })}
                        className="h-9 px-3 rounded-md border border-line-200 bg-surface text-xs text-ink-700 hover:border-brand-400"
                      >
                        Ficha
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}

            <div className="rounded-xl border border-risk-high/25 bg-surface p-5">
              <h3 className="font-serif text-base text-ink-900 mb-1">Lista de riesgo</h3>
              <p className="text-xs text-ink-500 mb-3">Pacientes con bandera alta o crítica</p>
              <ul className="space-y-2.5">
                {myPatientsRisk.map((p) => (
                  <li key={p.id} className="flex items-center justify-between gap-2 text-sm">
                    <button
                      onClick={() => navigate({ to: "/pacientes/$id", params: { id: p.id } })}
                      className="text-ink-900 truncate hover:text-brand-700 text-left"
                    >
                      {p.preferredName ?? p.name}
                    </button>
                    <RiskBadge risk={p.risk} compact />
                  </li>
                ))}
                {myPatientsRisk.length === 0 && <li className="text-xs text-ink-500">Sin pacientes en riesgo activo.</li>}
              </ul>
            </div>

            <div className="rounded-xl border border-line-200 bg-surface p-5">
              <h3 className="font-serif text-base text-ink-900 mb-3">Pendientes</h3>
              <ul className="space-y-2 text-sm">
                <li className="flex items-center justify-between text-ink-700"><span>Tareas por revisar</span><span className="tabular text-ink-500">{pendingTasks}</span></li>
                <li className="flex items-center justify-between text-ink-700"><span>Tests sin calificar</span><span className="tabular text-ink-500">{pendingTests}</span></li>
                <li className="flex items-center justify-between text-ink-700"><span>Tareas vencidas</span><span className={"tabular " + (overdueTasks > 0 ? "text-risk-high font-medium" : "text-ink-500")}>{overdueTasks}</span></li>
                <li className="flex items-center justify-between text-ink-700"><span>Docs por firmar</span><span className="tabular text-ink-500">{pendingDocs}</span></li>
              </ul>
            </div>
          </div>
        </section>
      </div>

      {createOpen && <NewAppointmentModal patients={patients} onClose={() => setCreateOpen(false)} />}
      {detailSlot && <AppointmentDetailModal slot={detailSlot} onClose={() => setDetailSlot(null)} />}
    </AppShell>
  );
}

function DayView({ appointments, onPick }: { appointments: any[]; onPick: (s: any) => void }) {
  if (appointments.length === 0) {
    return (
      <div className="p-10 text-center text-sm text-ink-500">
        <CalendarDays className="h-6 w-6 text-ink-400 mx-auto mb-2" />
        Sin citas programadas para hoy.
      </div>
    );
  }
  return (
    <ol className="relative p-5">
      <div className="absolute left-20 top-7 bottom-7 w-px bg-line-200" />
      {appointments.map((s) => (
        <li key={s.id} className="relative flex gap-5 py-3 group">
          <div className="w-[60px] text-right shrink-0">
            <div className="font-serif text-sm text-ink-900 tabular">{s.time}</div>
            <div className="text-[10px] text-ink-400 uppercase tracking-wider">{s.duration_min ?? 50} min</div>
          </div>
          <div
            className={
              "absolute left-[76px] top-[18px] h-2 w-2 rounded-full ring-4 ring-surface " +
              (s.status === "en_curso" ? "bg-brand-700" : s.status === "atendida" ? "bg-success" : s.status === "confirmada" ? "bg-brand-400" : "bg-ink-300")
            }
          />
          <button
            onClick={() => onPick(s)}
            className={
              "flex-1 text-left rounded-lg border p-3.5 hover:border-brand-400 transition-colors cursor-pointer " +
              (s.status === "en_curso" ? "border-brand-700/40 bg-brand-50" : "border-line-200 bg-surface")
            }
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-sm font-medium text-ink-900 flex items-center gap-2">
                  {s.patient_name}
                </div>
                <div className="text-xs text-ink-500 mt-0.5">
                  {MODALITY_LABEL[s.modality as Modality] ?? s.modality}{s.room ? ` · ${s.room}` : ""}{s.professional ? ` · ${s.professional}` : ""}
                </div>
              </div>
              <ChevronRight className="h-4 w-4 text-ink-300 group-hover:text-brand-700 shrink-0" />
            </div>
          </button>
        </li>
      ))}
    </ol>
  );
}

function WeekView({ onPick }: { onPick: (s: any) => void }) {
  // Semana de lunes a domingo que contiene hoy
  const now = new Date();
  const dayOfWeek = now.getDay(); // 0=dom, 1=lun, …
  const daysFromMonday = (dayOfWeek + 6) % 7; // 0 si hoy es lunes
  const monday = new Date(now);
  monday.setDate(now.getDate() - daysFromMonday);
  monday.setHours(0, 0, 0, 0);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  const fromIso = monday.toISOString().slice(0, 10);
  const toIso = sunday.toISOString().slice(0, 10);

  const { data: weekAppointments = [] } = useQuery({
    queryKey: ["appointments", "week", fromIso],
    queryFn: () => api.listAppointments({ from: fromIso, to: toIso }),
  });

  const WEEK_DAYS_LOCAL = useMemo(() => {
    const names = ["lun", "mar", "mié", "jue", "vie", "sáb", "dom"];
    return names.map((n, i) => {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      return { label: n, num: d.getDate(), iso: d.toISOString().slice(0, 10), isToday: d.toDateString() === now.toDateString() };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fromIso]);

  const hours = Array.from({ length: 11 }, (_, i) => 8 + i); // 8:00 - 18:00

  function slotsForDay(dayIso: string) {
    return (weekAppointments as any[]).filter((a) => a.date === dayIso);
  }

  function topPercent(time: string) {
    const [h, m] = time.split(":").map(Number);
    const minutesFromStart = (h - 8) * 60 + m;
    return (minutesFromStart / (11 * 60)) * 100;
  }

  return (
    <div className="p-3 sm:p-5 overflow-x-auto">
      {/*
        En mobile el grid de 7 días no cabe (50px hora + 7 columnas).
        Forzamos un ancho mínimo de 700px y permitimos scroll horizontal:
        el usuario desliza para ver toda la semana sin que la columna se aplaste.
      */}
      <div className="grid grid-cols-[50px_repeat(7,minmax(80px,1fr))] text-xs min-w-[700px]">
        <div />
        {WEEK_DAYS_LOCAL.map((d) => (
          <div key={d.iso} className={"px-2 pb-2 text-center border-b " + (d.isToday ? "border-brand-700" : "border-line-100")}>
            <div className="text-ink-500 uppercase tracking-wider text-[10px]">{d.label}</div>
            <div className={"font-serif text-lg mt-0.5 tabular " + (d.isToday ? "text-brand-700 font-semibold" : "text-ink-900")}>
              {d.num}
            </div>
          </div>
        ))}

        <div className="relative">
          {hours.map((h) => (
            <div key={h} className="h-14 text-right pr-2 text-[10px] text-ink-400 tabular -mt-1.5">
              {h.toString().padStart(2, "0")}:00
            </div>
          ))}
        </div>

        {WEEK_DAYS_LOCAL.map((d) => (
          <div key={d.iso} className={"relative border-l " + (d.isToday ? "border-brand-400/50 bg-brand-50/30" : "border-line-100")} style={{ height: `${hours.length * 56}px` }}>
            {hours.map((_, i) => (
              <div key={i} className="h-14 border-b border-line-100/60" />
            ))}
            {slotsForDay(d.iso).map((s: any) => (
              <button
                key={s.id}
                onClick={() => onPick(s)}
                className={
                  "absolute left-1 right-1 rounded-md text-[11px] px-1.5 py-1 text-left hover:ring-2 hover:ring-brand-400/60 transition-all overflow-hidden " +
                  (s.status === "confirmada" ? "bg-brand-50 border-l-2 border-brand-700 text-ink-900" :
                   s.status === "pendiente" ? "bg-warning-soft border-l-2 border-warning text-risk-moderate" :
                   s.status === "en_curso" ? "bg-brand-100 border-l-2 border-brand-700 text-brand-800" :
                   "bg-success-soft border-l-2 border-success text-success")
                }
                style={{ top: `${topPercent(s.time)}%`, height: "52px" }}
              >
                <div className="font-medium truncate">{s.time} · {s.patient_name}</div>
                <div className="text-[10px] text-ink-500 truncate">{MODALITY_LABEL[s.modality as Modality] ?? s.modality}</div>
              </button>
            ))}
          </div>
        ))}
      </div>

      <div className="mt-5 flex items-center gap-4 text-[11px] text-ink-500">
        <span className="inline-flex items-center gap-1.5"><span className="h-3 w-3 rounded bg-brand-50 border-l-2 border-brand-700" /> Confirmada</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-3 w-3 rounded bg-warning-soft border-l-2 border-warning" /> Pendiente</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-3 w-3 rounded bg-success-soft border-l-2 border-success" /> Atendida</span>
      </div>
    </div>
  );
}

function MonthView() {
  const daysInMonth = 30;
  const firstDayOffset = 3; // Abril 2026 empieza miércoles
  const cells: Array<number | null> = [];
  for (let i = 0; i < firstDayOffset; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  const withEvents: Record<number, { count: number; risk: boolean }> = {
    14: { count: 6, risk: false }, 15: { count: 8, risk: true }, 16: { count: 5, risk: false },
    17: { count: 7, risk: false }, 18: { count: 4, risk: false }, 20: { count: 9, risk: true },
    21: { count: 6, risk: false }, 22: { count: 5, risk: false }, 23: { count: 8, risk: false },
    24: { count: 3, risk: false }, 27: { count: 7, risk: false }, 28: { count: 6, risk: true },
    29: { count: 5, risk: false }, 30: { count: 4, risk: false },
  };

  return (
    <div className="p-3 sm:p-5">
      <div className="grid grid-cols-7 text-center text-[10px] sm:text-[11px] uppercase tracking-wider text-ink-500 font-medium mb-1">
        {["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"].map((d) => (<div key={d} className="py-2">{d.slice(0, 1)}<span className="hidden sm:inline">{d.slice(1)}</span></div>))}
      </div>
      <div className="grid grid-cols-7 gap-0.5 sm:gap-1">
        {cells.map((d, i) => {
          const isToday = d === 18;
          const ev = d ? withEvents[d] : undefined;
          return (
            <div
              key={i}
              className={
                "relative aspect-square rounded-md border p-1.5 text-xs cursor-pointer transition-colors " +
                (!d ? "border-transparent" :
                 isToday ? "border-brand-700 bg-brand-50 text-ink-900 font-medium" :
                 "border-line-200 hover:border-brand-400 bg-surface text-ink-700")
              }
            >
              {d && (
                <>
                  <div className="tabular">{d}</div>
                  {ev && (
                    <div className="absolute bottom-1 left-1 right-1 flex items-center justify-between">
                      <span className={"text-[10px] tabular " + (ev.risk ? "text-risk-high font-medium" : "text-ink-500")}>{ev.count}</span>
                      <div className="flex gap-0.5">
                        {Array.from({ length: Math.min(ev.count, 3) }).map((_, k) => (
                          <span key={k} className={"h-1 w-1 rounded-full " + (ev.risk ? "bg-risk-high" : "bg-brand-700")} />
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ListView({ appointments, onPick }: { appointments: any[]; onPick: (s: any) => void }) {
  if (appointments.length === 0) {
    return <div className="p-10 text-center text-sm text-ink-500">Sin citas programadas.</div>;
  }
  return (
    <ul className="divide-y divide-line-100">
      {appointments.map((s) => {
        const Icon = MODALITY_ICON[s.modality as Modality] ?? Users;
        return (
          <li key={s.id}>
            <button onClick={() => onPick(s)} className="w-full flex items-center gap-4 px-5 py-3.5 hover:bg-brand-50/40 text-left transition-colors">
              <div className="shrink-0 text-center">
                <div className="font-serif text-base text-ink-900 tabular">{s.time}</div>
                <div className="text-[10px] text-ink-400 uppercase">{s.duration_min ?? 50} min</div>
              </div>
              <div className="h-9 w-9 rounded-lg bg-brand-50 text-brand-800 flex items-center justify-center shrink-0">
                <Icon className="h-4 w-4" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-ink-900 truncate flex items-center gap-2">
                  {s.patient_name}
                </div>
                <div className="text-xs text-ink-500">
                  {MODALITY_LABEL[s.modality as Modality] ?? s.modality}{s.room ? ` · ${s.room}` : ""}{s.professional ? ` · ${s.professional}` : ""}
                </div>
              </div>
              <span className={
                "text-[10px] uppercase tracking-[0.06em] px-2 py-0.5 rounded-full font-medium shrink-0 " +
                (s.status === "atendida" ? "bg-success-soft text-success" :
                 s.status === "en_curso" ? "bg-brand-50 text-brand-800" :
                 s.status === "confirmada" ? "bg-brand-50 text-brand-800" :
                 "bg-bg-100 text-ink-500")
              }>{String(s.status).replace("_", " ")}</span>
              <ChevronRight className="h-4 w-4 text-ink-300 shrink-0" />
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function NewAppointmentModal({ patients, onClose }: { patients: ApiPatient[]; onClose: () => void }) {
  const qc = useQueryClient();
  const { data: workspace } = useWorkspace();
  const isOrg = workspace?.mode === "organization";

  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<ApiPatient | null>(null);
  const [showResults, setShowResults] = useState(false);
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [time, setTime] = useState("10:30");
  const [modality, setModality] = useState<Modality>("individual");
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
      modality: modality,
      room: modality === "tele" ? "Telepsicología" : "",
      status: "confirmada",
      notes,
    } as any),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["appointments"] });
      onClose();
    },
  });

  function pick(p: ApiPatient) {
    setSelected(p);
    setQuery(p.preferredName ?? p.name);
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
            <h3 className="font-serif text-xl text-ink-900 mt-0.5">Crear cita</h3>
          </div>
          <button type="button" onClick={onClose} className="h-9 w-9 rounded-md border border-line-200 text-ink-500 hover:border-brand-400 flex items-center justify-center">
            <X className="h-4 w-4" />
          </button>
        </header>
        <div className="p-5 space-y-3">
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
                        <div className="text-sm text-ink-900 truncate">{p.preferredName ? `${p.preferredName} · ` : ""}{p.name}</div>
                        <div className="text-[11px] text-ink-500 truncate tabular">{p.doc} · {p.id}</div>
                      </div>
                      <RiskBadge risk={p.risk} compact />
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

function AppointmentDetailModal({ slot, onClose }: { slot: any; onClose: () => void }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const patientName = slot.patient_name ?? slot.patient ?? "Paciente";
  const patientId = slot.patient_id ?? null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-900/40 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl bg-surface shadow-modal" onClick={(e) => e.stopPropagation()}>
        <header className="p-5 border-b border-line-100">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-[11px] uppercase tracking-widest text-brand-800 font-medium">{slot.time} · {slot.duration_min ?? 50} min</p>
              <h3 className="font-serif text-xl text-ink-900 mt-0.5">{patientName}</h3>
              <p className="text-xs text-ink-500 mt-1">
                {MODALITY_LABEL[slot.modality as Modality] ?? slot.modality}
                {slot.room ? ` · ${slot.room}` : ""}
                {slot.professional ? ` · ${slot.professional}` : ""}
              </p>
            </div>
            <button onClick={onClose} className="h-9 w-9 rounded-md border border-line-200 text-ink-500 hover:border-brand-400 flex items-center justify-center">
              <X className="h-4 w-4" />
            </button>
          </div>
        </header>
        <div className="p-5 space-y-2">
          <button className="w-full h-10 rounded-md bg-brand-700 text-primary-foreground text-sm font-medium hover:bg-brand-800 inline-flex items-center justify-center gap-2">
            <CalendarDays className="h-4 w-4" /> Iniciar sesión
          </button>
          <div className="grid grid-cols-2 gap-2">
            <button className="h-10 rounded-md border border-line-200 text-sm text-ink-700 hover:border-brand-400">Reagendar</button>
            <button
              onClick={async () => {
                if (!confirm("¿Cancelar esta cita?")) return;
                await api.listAppointments; // noop to silence lint
                try {
                  await fetch(`${api.base}/api/appointments/${slot.id}`, { method: "DELETE", headers: { Authorization: `Bearer ${localStorage.getItem("psm.token")}` } });
                  qc.invalidateQueries({ queryKey: ["appointments"] });
                  onClose();
                } catch (e) { console.error(e); }
              }}
              className="h-10 rounded-md border border-line-200 text-sm text-ink-700 hover:border-risk-high hover:text-risk-high"
            >
              Cancelar cita
            </button>
          </div>
          {patientId && (
            <>
              <button
                onClick={() => navigate({ to: "/historia", search: { id: patientId } })}
                className="w-full h-10 rounded-md border border-line-200 text-sm text-ink-700 hover:border-brand-400"
              >
                Abrir historia clínica
              </button>
              <button
                onClick={() => navigate({ to: "/pacientes/$id", params: { id: patientId } })}
                className="w-full h-10 rounded-md border border-line-200 text-sm text-ink-700 hover:border-brand-400"
              >
                Ver ficha del paciente
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
