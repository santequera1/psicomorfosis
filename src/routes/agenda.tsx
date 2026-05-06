import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/app/AppShell";
import { type Modality } from "@/lib/mock-data";
import { RiskBadge } from "@/components/app/RiskBadge";
import { KpiCard } from "@/components/app/KpiCard";
import { api, type ApiPatient } from "@/lib/api";
import { useWorkspace } from "@/lib/workspace";
import { toast } from "sonner";
import { NewAppointmentModal } from "@/components/app/NewAppointmentModal";
import { ReceiptFormModal } from "./facturacion";
import {
  Calendar, ClipboardList, FileSignature, Brain, ChevronRight, Plus, X,
  ChevronLeft, MapPin, Users, Video, CalendarDays, Loader2, Receipt,
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

function toIso(d: Date) {
  return d.toISOString().slice(0, 10);
}

function formatDayLong(d: Date) {
  // "Viernes, 2 de mayo" — sin año (lo da el contexto del año actual).
  return d.toLocaleDateString("es-CO", { weekday: "long", day: "numeric", month: "long" });
}

function formatWeekRange(d: Date) {
  const monday = new Date(d);
  monday.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  const fmt = (x: Date) => x.toLocaleDateString("es-CO", { day: "numeric", month: "short" });
  return `${fmt(monday)} – ${fmt(sunday)}`;
}

function formatMonthLong(d: Date) {
  return d.toLocaleDateString("es-CO", { month: "long", year: "numeric" });
}

function AgendaPage() {
  const navigate = useNavigate();
  const [view, setView] = useState<View>("dia");
  const [currentDate, setCurrentDate] = useState<Date>(() => new Date());
  const [createOpen, setCreateOpen] = useState(false);

  function shiftDate(direction: -1 | 1) {
    setCurrentDate((d) => {
      const next = new Date(d);
      if (view === "dia") next.setDate(next.getDate() + direction);
      else if (view === "semana") next.setDate(next.getDate() + direction * 7);
      else if (view === "mes") next.setMonth(next.getMonth() + direction);
      return next;
    });
  }
  const goToday = () => setCurrentDate(new Date());
  const isToday = toIso(currentDate) === toIso(new Date());
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
                {view !== "lista" && (
                  <button onClick={() => shiftDate(-1)} className="h-9 w-9 rounded-md border border-line-200 text-ink-500 hover:border-brand-400 flex items-center justify-center" title={view === "dia" ? "Día anterior" : view === "semana" ? "Semana anterior" : "Mes anterior"}>
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                )}
                <div>
                  <h3 className="font-serif text-lg text-ink-900 capitalize">
                    {view === "dia"
                      ? (isToday ? "Agenda del día" : formatDayLong(currentDate))
                      : view === "semana"
                      ? formatWeekRange(currentDate)
                      : view === "mes"
                      ? formatMonthLong(currentDate)
                      : "Próximas citas"}
                  </h3>
                  <p className="text-xs text-ink-500 inline-flex items-center gap-1">
                    <MapPin className="h-3 w-3" /> {headerLocation}
                  </p>
                </div>
                {view !== "lista" && (
                  <button onClick={() => shiftDate(1)} className="h-9 w-9 rounded-md border border-line-200 text-ink-500 hover:border-brand-400 flex items-center justify-center" title={view === "dia" ? "Día siguiente" : view === "semana" ? "Semana siguiente" : "Mes siguiente"}>
                    <ChevronRight className="h-4 w-4" />
                  </button>
                )}
                {view !== "lista" && !isToday && (
                  <button onClick={goToday} className="h-9 px-3 rounded-md border border-line-200 text-xs text-ink-700 hover:border-brand-400">
                    Hoy
                  </button>
                )}
              </div>
              <div className="flex gap-1 p-1 rounded-md bg-bg-100">
                {(["dia", "semana", "mes", "lista"] as View[]).map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setView(v)}
                    className={
                      "px-3 py-1.5 text-xs rounded transition-colors capitalize cursor-pointer " +
                      (view === v ? "bg-surface text-ink-900 font-medium shadow-xs" : "text-ink-500 hover:text-ink-900")
                    }
                  >
                    {v === "dia" ? "Día" : v}
                  </button>
                ))}
              </div>
            </div>

            {view === "dia" && <DayView date={currentDate} onPick={setDetailSlot} />}
            {view === "semana" && <WeekView date={currentDate} onPick={(slot) => setDetailSlot(slot as any)} />}
            {view === "mes" && <MonthView date={currentDate} />}
            {view === "lista" && <ListView onPick={setDetailSlot} />}
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
                      <RiskBadge risk={nextPatient.risk} types={nextPatient.riskTypes} compact />
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
                    <RiskBadge risk={p.risk} types={p.riskTypes} compact />
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

function DayView({ date, onPick }: { date: Date; onPick: (s: any) => void }) {
  const dateIso = toIso(date);
  const { data: appointments = [] } = useQuery({
    queryKey: ["appointments", dateIso],
    queryFn: () => api.listAppointments({ date: dateIso }),
  });
  const isTodayLocal = dateIso === toIso(new Date());
  if (appointments.length === 0) {
    return (
      <div className="p-10 text-center text-sm text-ink-500">
        <CalendarDays className="h-6 w-6 text-ink-400 mx-auto mb-2" />
        {isTodayLocal ? "Sin citas programadas para hoy." : `Sin citas el ${formatDayLong(date)}.`}
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
          {/* Punto de estado de la cita. pointer-events-none asegura que el
              click pase a través hacia el botón debajo — antes interceptaba
              el ~16px (h-2 + ring-4) más cercano del borde izquierdo del
              card, haciendo que el primer tap no abriera el detalle. */}
          <div
            className={
              "pointer-events-none absolute left-19 top-4.5 h-2 w-2 rounded-full ring-4 ring-surface " +
              (s.status === "en_curso" ? "bg-brand-700" : s.status === "atendida" ? "bg-success" : s.status === "confirmada" ? "bg-brand-400" : "bg-ink-300")
            }
          />
          <button
            type="button"
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

function WeekView({ date, onPick }: { date: Date; onPick: (s: any) => void }) {
  // Semana de lunes a domingo que contiene `date`.
  const now = new Date();
  const dayOfWeek = date.getDay(); // 0=dom, 1=lun, …
  const daysFromMonday = (dayOfWeek + 6) % 7; // 0 si es lunes
  const monday = new Date(date);
  monday.setDate(date.getDate() - daysFromMonday);
  monday.setHours(0, 0, 0, 0);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  const fromIso = toIso(monday);
  const untilIso = toIso(sunday);

  const { data: weekAppointments = [] } = useQuery({
    queryKey: ["appointments", "week", fromIso],
    queryFn: () => api.listAppointments({ from: fromIso, to: untilIso }),
  });

  const WEEK_DAYS_LOCAL = useMemo(() => {
    const names = ["lun", "mar", "mié", "jue", "vie", "sáb", "dom"];
    return names.map((n, i) => {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      return { label: n, num: d.getDate(), iso: toIso(d), isToday: d.toDateString() === now.toDateString() };
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
      <div className="grid grid-cols-[50px_repeat(7,minmax(80px,1fr))] text-xs min-w-175">
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

function MonthView({ date }: { date: Date }) {
  const year = date.getFullYear();
  const month = date.getMonth();
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const daysInMonth = lastDay.getDate();
  const firstDayOffset = firstDay.getDay(); // 0=Dom (header empieza en Dom)

  const fromIso = toIso(firstDay);
  const untilIso = toIso(lastDay);
  const { data: monthAppointments = [] } = useQuery({
    queryKey: ["appointments", "month", fromIso],
    queryFn: () => api.listAppointments({ from: fromIso, to: untilIso }),
  });

  // Agrupar por día (1..31)
  const byDay: Record<number, number> = {};
  for (const a of monthAppointments as any[]) {
    const d = parseInt(String(a.date).slice(8, 10), 10);
    if (!Number.isNaN(d)) byDay[d] = (byDay[d] ?? 0) + 1;
  }

  const cells: Array<number | null> = [];
  for (let i = 0; i < firstDayOffset; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  const todayDate = new Date();
  const todayDay = todayDate.getFullYear() === year && todayDate.getMonth() === month ? todayDate.getDate() : -1;

  return (
    <div className="p-3 sm:p-5">
      <div className="grid grid-cols-7 text-center text-[10px] sm:text-[11px] uppercase tracking-wider text-ink-500 font-medium mb-1">
        {["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"].map((d) => (<div key={d} className="py-2">{d.slice(0, 1)}<span className="hidden sm:inline">{d.slice(1)}</span></div>))}
      </div>
      <div className="grid grid-cols-7 gap-0.5 sm:gap-1">
        {cells.map((d, i) => {
          const isToday = d === todayDay;
          const count = d ? byDay[d] ?? 0 : 0;
          return (
            <div
              key={i}
              className={
                "relative aspect-square rounded-md border p-1.5 text-xs transition-colors " +
                (!d ? "border-transparent" :
                 isToday ? "border-brand-700 bg-brand-50 text-ink-900 font-medium" :
                 "border-line-200 hover:border-brand-400 bg-surface text-ink-700")
              }
            >
              {d && (
                <>
                  <div className="tabular">{d}</div>
                  {count > 0 && (
                    <div className="absolute bottom-1 left-1 right-1 flex items-center justify-between">
                      <span className="text-[10px] tabular text-ink-500">{count}</span>
                      <div className="flex gap-0.5">
                        {Array.from({ length: Math.min(count, 3) }).map((_, k) => (
                          <span key={k} className="h-1 w-1 rounded-full bg-brand-700" />
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

function ListView({ onPick }: { onPick: (s: any) => void }) {
  const today = new Date();
  const future = new Date();
  future.setDate(today.getDate() + 60);
  const fromIso = toIso(today);
  const untilIso = toIso(future);

  const { data: appointments = [] } = useQuery({
    queryKey: ["appointments", "list", fromIso],
    queryFn: () => api.listAppointments({ from: fromIso, to: untilIso }),
  });

  if (appointments.length === 0) {
    return <div className="p-10 text-center text-sm text-ink-500">Sin citas programadas en los próximos 60 días.</div>;
  }

  // Agrupar por fecha; cada grupo lleva un encabezado.
  const groups: Record<string, any[]> = {};
  for (const a of appointments as any[]) {
    const k = String(a.date);
    (groups[k] ||= []).push(a);
  }
  const orderedKeys = Object.keys(groups).sort();
  const todayIso = toIso(new Date());

  function dayHeader(iso: string) {
    const d = new Date(iso + "T00:00:00");
    if (iso === todayIso) return "Hoy";
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    if (iso === toIso(tomorrow)) return "Mañana";
    return d.toLocaleDateString("es-CO", { weekday: "long", day: "numeric", month: "long" });
  }

  return (
    <div>
      {orderedKeys.map((iso) => (
        <div key={iso}>
          <div className="px-5 py-2 bg-bg-100/40 border-y border-line-100 text-[11px] uppercase tracking-wider text-ink-500 font-medium">
            {dayHeader(iso)}
          </div>
          <ul className="divide-y divide-line-100">
            {groups[iso].sort((a, b) => String(a.time).localeCompare(String(b.time))).map((s: any) => {
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
        </div>
      ))}
    </div>
  );
}

function AppointmentDetailModal({ slot, onClose }: { slot: any; onClose: () => void }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const patientName = slot.patient_name ?? slot.patient ?? "Paciente";
  const patientId = slot.patient_id ?? null;

  const [reschedOpen, setReschedOpen] = useState(false);
  const [newDate, setNewDate] = useState<string>(slot.date ?? new Date().toISOString().slice(0, 10));
  const [newTime, setNewTime] = useState<string>(slot.time ?? "09:00");
  const [busy, setBusy] = useState(false);
  const [cobroOpen, setCobroOpen] = useState(false);

  async function startSession() {
    setBusy(true);
    try {
      await api.updateAppointment(slot.id, { status: "atendida" });
      qc.invalidateQueries({ queryKey: ["appointments"] });
      onClose();
      if (patientId) navigate({ to: "/historia", search: { id: patientId } });
    } catch (e: any) {
      toast.error("No se pudo marcar como atendida: " + (e?.message ?? e));
    } finally {
      setBusy(false);
    }
  }

  async function reschedule() {
    if (!newDate || !newTime) return;
    setBusy(true);
    try {
      await api.updateAppointment(slot.id, { date: newDate, time: newTime });
      qc.invalidateQueries({ queryKey: ["appointments"] });
      toast.success("Cita reagendada");
      onClose();
    } catch (e: any) {
      toast.error("No se pudo reagendar: " + (e?.message ?? e));
    } finally {
      setBusy(false);
    }
  }

  async function cancelAppointment() {
    if (!confirm("¿Cancelar esta cita?")) return;
    setBusy(true);
    try {
      await api.deleteAppointment(slot.id);
      qc.invalidateQueries({ queryKey: ["appointments"] });
      onClose();
    } catch (e: any) {
      toast.error("No se pudo cancelar: " + (e?.message ?? e));
    } finally {
      setBusy(false);
    }
  }

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
          <button
            onClick={startSession}
            disabled={busy}
            title="Marca la cita como atendida y abre la historia clínica del paciente"
            className="w-full h-10 rounded-md bg-brand-700 text-primary-foreground text-sm font-medium hover:bg-brand-800 inline-flex items-center justify-center gap-2 disabled:opacity-60"
          >
            <CalendarDays className="h-4 w-4" /> Atender ahora
          </button>
          <button
            type="button"
            onClick={() => setCobroOpen(true)}
            className="w-full h-10 rounded-md border border-line-200 text-sm text-ink-700 hover:border-brand-400 inline-flex items-center justify-center gap-2"
            title="Generar el recibo de pago de esta sesión"
          >
            <Receipt className="h-4 w-4" /> Generar recibo
          </button>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => setReschedOpen((v) => !v)}
              className="h-10 rounded-md border border-line-200 text-sm text-ink-700 hover:border-brand-400"
            >
              Reagendar
            </button>
            <button
              onClick={cancelAppointment}
              disabled={busy}
              className="h-10 rounded-md border border-line-200 text-sm text-ink-700 hover:border-risk-high hover:text-risk-high disabled:opacity-60"
            >
              Cancelar cita
            </button>
          </div>

          {reschedOpen && (
            <div className="rounded-lg border border-line-200 bg-bg-100/30 p-3 space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <label className="block">
                  <span className="text-[11px] uppercase tracking-wider text-ink-500 font-medium">Fecha</span>
                  <input type="date" value={newDate} onChange={(e) => setNewDate(e.target.value)}
                    className="mt-1 w-full px-3 py-2 rounded-md border border-line-200 bg-surface text-sm outline-none focus:border-brand-700" />
                </label>
                <label className="block">
                  <span className="text-[11px] uppercase tracking-wider text-ink-500 font-medium">Hora</span>
                  <input type="time" value={newTime} onChange={(e) => setNewTime(e.target.value)}
                    className="mt-1 w-full px-3 py-2 rounded-md border border-line-200 bg-surface text-sm outline-none focus:border-brand-700" />
                </label>
              </div>
              <button
                onClick={reschedule}
                disabled={busy || !newDate || !newTime}
                className="w-full h-9 rounded-md bg-brand-700 text-primary-foreground text-sm font-medium hover:bg-brand-800 disabled:opacity-60 inline-flex items-center justify-center gap-2"
              >
                {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Confirmar nueva fecha
              </button>
            </div>
          )}

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

      {cobroOpen && (
        <ReceiptFormModal
          mode="create"
          presetPatientId={patientId ?? undefined}
          presetPatientName={patientName}
          presetConcept={`Sesión ${slot.modality === "virtual" ? "virtual" : "individual"}${slot.date ? ` · ${slot.date}` : ""}`}
          presetDate={slot.date ?? undefined}
          onClose={() => setCobroOpen(false)}
        />
      )}
    </div>
  );
}
