import { useMemo, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { KpiCard } from "@/components/app/KpiCard";
import { RiskBadge } from "@/components/app/RiskBadge";
import { PatientPicker } from "@/components/app/PatientPicker";
import { CalendarCheck2, Users, Wallet, Activity, ShieldAlert, Clock3, Video, UsersRound, FilePen, X } from "lucide-react";
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  BarChart, Bar,
} from "recharts";
import { TODAY_AGENDA } from "@/lib/mock-data";
import { api, getStoredUser } from "@/lib/api";
import { useWorkspace } from "@/lib/workspace";

const fmtCOP = (n: number) =>
  new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(n);

type Period = "Hoy" | "Semana" | "Mes" | "Trimestre" | "Año";

function getGreeting(d: Date) {
  const h = d.getHours();
  if (h < 12) return "Buenos días";
  if (h < 19) return "Buenas tardes";
  return "Buenas noches";
}

function formatDate(d: Date) {
  return d.toLocaleDateString("es-CO", { weekday: "long", day: "numeric", month: "long" });
}

export function AdminDashboard() {
  const [period, setPeriod] = useState<Period>("Semana");
  const [newNoteOpen, setNewNoteOpen] = useState(false);
  const { data: workspace } = useWorkspace();
  const user = getStoredUser();
  const firstName = user?.name.split(" ")[0] ?? "";
  // isOrg con fallback al user de localStorage (evita "salto" antes de que
  // termine de cargar el workspace).
  const isOrg = (workspace?.mode ?? user?.workspaceMode) === "organization";

  const today = new Date().toISOString().slice(0, 10);
  const { data: patients = [] } = useQuery({ queryKey: ["patients"], queryFn: () => api.listPatients() });
  const { data: invoicesSummary } = useQuery({ queryKey: ["invoices-summary"], queryFn: () => api.invoicesSummary() });
  const { data: todayAppointments = [] } = useQuery({
    queryKey: ["appointments", today],
    queryFn: () => api.listAppointments({ date: today }),
  });
  const { data: dashStats } = useQuery({
    queryKey: ["dashboard-stats"],
    queryFn: () => api.getDashboardStats(),
  });
  const sessionsByModality = dashStats?.sessionsByModality ?? [];
  const reasons = dashStats?.reasons ?? [];
  const revenue7d = dashStats?.revenue7d ?? [];

  const activePatients = patients.filter((p) => p.status === "activo");
  const riskActive = patients.filter((p) => p.risk === "high" || p.risk === "critical");

  const now = useMemo(() => new Date(), []);

  const kpis = useMemo(() => ({
    sessionsToday: todayAppointments.length,
    sessionsAttended: todayAppointments.filter((a: any) => a.status === "atendida").length,
    patients: activePatients.length,
    patientsTotal: patients.length,
    revenue: invoicesSummary?.paid ?? 0,
    pending: invoicesSummary?.pending ?? 0,
    tele: patients.filter((p) => p.modality === "tele").length,
    risk: riskActive.length,
  }), [todayAppointments, patients, activePatients.length, invoicesSummary, riskActive.length]);

  const revenueData = revenue7d;
  const revenueHasData = revenueData.some((r) => r.value > 0);

  function openCrisis() {
    window.dispatchEvent(new Event("psm:open-crisis"));
  }

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm text-ink-500">
            {getGreeting(now)}{firstName ? `, ${firstName}` : ""}. Hoy es {formatDate(now)}.
          </p>
          <h1 className="font-serif text-2xl md:text-[32px] leading-tight text-ink-900 mt-1">
            {isOrg ? `Panorama · ${workspace?.name ?? user?.workspaceName ?? ""}` : "Mi consultorio"}
          </h1>
          {/* Subtítulo SIEMPRE visible — evita layout shift entre primer
              render y la carga del workspace usando datos del user/locales. */}
          <p className="text-xs text-ink-400 mt-1 min-h-4">
            {isOrg && workspace
              ? `${workspace.sedes.length} sedes · ${workspace.professionals.length} profesionales · ${activePatients.length} activos / ${patients.length} total`
              : !isOrg && patients.length > 0
                ? `Modo individual · ${activePatients.length} pacientes activos${patients.length > activePatients.length ? ` · ${patients.length - activePatients.length} en alta/pausa` : ""}`
                : !isOrg
                  ? `Modo individual · ${user?.workspaceName ?? "tu consultorio"}`
                  : workspace?.name ?? user?.workspaceName ?? "Cargando…"}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => setNewNoteOpen(true)}
            className="h-9 px-3.5 rounded-md text-sm font-medium bg-brand-700 text-primary-foreground hover:bg-brand-800 inline-flex items-center gap-2 shrink-0"
            title="Empezar nota de sesión clínica"
          >
            <FilePen className="h-3.5 w-3.5" /> Nueva nota
          </button>
          <div className="flex items-center gap-2 overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0 sm:overflow-visible no-scrollbar">
            {(["Hoy", "Semana", "Mes", "Trimestre", "Año"] as Period[]).map((r) => (
              <button
                key={r}
                onClick={() => setPeriod(r)}
                className={
                  "h-9 px-3.5 rounded-md text-sm font-medium shrink-0 transition-colors " +
                  (period === r
                    ? "bg-brand-700 text-primary-foreground"
                    : "border border-line-200 bg-surface text-ink-700 hover:border-brand-400")
                }
              >
                {r}
              </button>
            ))}
          </div>
        </div>
      </header>

      <section className="grid grid-cols-2 md:grid-cols-2 xl:grid-cols-4 gap-4">
        <KpiLink to="/agenda"><KpiCard label="Sesiones hoy" value={String(kpis.sessionsToday)} delta={{ neutral: true, value: "" }} hint={`${kpis.sessionsAttended} atendidas`} icon={<CalendarCheck2 className="h-4 w-4" />} /></KpiLink>
        <KpiLink to="/pacientes"><KpiCard label="Pacientes activos" value={String(kpis.patients)} delta={{ neutral: true, value: "" }} hint={`${kpis.patientsTotal} en total`} icon={<Users className="h-4 w-4" />} /></KpiLink>
        <KpiLink to="/facturacion"><KpiCard label="Recaudado" value={fmtCOP(kpis.revenue)} delta={{ neutral: true, value: "" }} hint={kpis.pending > 0 ? `${fmtCOP(kpis.pending)} por cobrar` : "al día"} icon={<Wallet className="h-4 w-4" />} /></KpiLink>
        {kpis.tele > 0 ? (
          <KpiLink to="/pacientes"><KpiCard label="Telepsicología" value={String(kpis.tele)} delta={{ neutral: true, value: "" }} hint="pacientes remotos" icon={<Video className="h-4 w-4" />} /></KpiLink>
        ) : (
          <KpiLink to="/pacientes"><KpiCard label="Riesgo activo" value={String(kpis.risk)} delta={{ neutral: true, value: "" }} emphasis={kpis.risk > 0 ? "risk" : "default"} hint={kpis.risk > 0 ? "alto/crítico" : "ninguno"} icon={<ShieldAlert className="h-4 w-4" />} /></KpiLink>
        )}
      </section>

      {/* PRIMERO: lo urgente del día — citas + riesgo */}
      <section className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <div className="xl:col-span-2 rounded-xl border border-line-200 bg-surface p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-serif text-lg text-ink-900">Próximas sesiones</h3>
              <p className="text-xs text-ink-500">Hoy · {todayAppointments.length} cita{todayAppointments.length === 1 ? "" : "s"}</p>
            </div>
            <Link to="/agenda" className="text-xs text-brand-700 font-medium hover:underline">Ver agenda</Link>
          </div>
          {todayAppointments.length === 0 ? (
            <div className="py-8 text-center text-xs text-ink-500">Sin citas para hoy.</div>
          ) : (
            <ul className="space-y-2.5 max-h-70 overflow-y-auto pr-1">
              {todayAppointments.map((s: any) => (
                <li key={s.id}>
                  <Link to="/agenda" className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-brand-50 transition-colors">
                    <div className="w-12 text-right">
                      <div className="font-serif text-sm text-ink-900 tabular">{s.time}</div>
                    </div>
                    <div className="h-8 w-px bg-line-200" />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-ink-900 font-medium truncate">{s.patient_name}</div>
                      <div className="text-xs text-ink-500 truncate">
                        {s.modality}{s.room ? ` · ${s.room}` : ""}
                      </div>
                    </div>
                    <span className={
                      s.status === "atendida" ? "text-[10px] uppercase tracking-wider px-2 py-1 rounded-full bg-success-soft text-success font-medium" :
                      s.status === "en_curso" ? "text-[10px] uppercase tracking-wider px-2 py-1 rounded-full bg-info-soft text-info font-medium" :
                      s.status === "confirmada" ? "text-[10px] uppercase tracking-wider px-2 py-1 rounded-full bg-brand-100 text-brand-800 font-medium" :
                      "text-[10px] uppercase tracking-wider px-2 py-1 rounded-full bg-bg-100 text-ink-500 font-medium"
                    }>
                      {String(s.status).replace("_", " ")}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-xl border border-risk-high/25 bg-surface p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-serif text-lg text-ink-900 flex items-center gap-2">
                <ShieldAlert className="h-4 w-4 text-risk-high" />
                Riesgo activo
              </h3>
              <p className="text-xs text-ink-500">{riskActive.length} paciente{riskActive.length === 1 ? "" : "s"} · seguimiento</p>
            </div>
          </div>
          {riskActive.length === 0 ? (
            <div className="py-8 text-center text-xs text-ink-500">Ningún paciente con riesgo alto/crítico.</div>
          ) : (
            <>
              <ul className="space-y-3">
                {riskActive.map((p) => (
                  <li key={p.id}>
                    <Link to="/pacientes/$id" params={{ id: p.id }} className="block rounded-lg border border-line-200 p-3 hover:border-risk-high/30 transition-colors">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="text-sm font-medium text-ink-900 truncate">{p.preferredName ?? p.name}</div>
                          <div className="text-xs text-ink-500 truncate">{p.reason}</div>
                        </div>
                        <RiskBadge risk={p.risk} types={p.riskTypes} compact />
                      </div>
                      <div className="mt-2 flex items-center justify-between text-xs text-ink-500">
                        <span>{p.professional}</span>
                        <span className="text-brand-700 font-medium">{p.nextSession ?? "Sin próxima cita"}</span>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
              <button onClick={openCrisis} className="mt-4 w-full text-xs text-risk-high font-medium hover:underline">
                Abrir protocolo de seguimiento →
              </button>
            </>
          )}
        </div>
      </section>

      {/* DESPUÉS: distribuciones / contexto clínico */}
      <section className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <div className="rounded-xl border border-line-200 bg-surface p-5">
          <h3 className="font-serif text-lg text-ink-900 mb-1">Sesiones por modalidad</h3>
          <p className="text-xs text-ink-500 mb-4">Últimos 30 días</p>
          {sessionsByModality.length === 0 ? (
            <p className="text-xs text-ink-400 italic py-8 text-center">Aún no hay citas en los últimos 30 días.</p>
          ) : (
          <div className="space-y-3">
            {sessionsByModality.map((m, i) => {
              const max = Math.max(...sessionsByModality.map((x) => x.value));
              const pct = (m.value / max) * 100;
              const dotColors = ["var(--brand-700)", "var(--sage-500)", "var(--lavender-400)", "var(--brand-400)", "var(--warning)"];
              const barColors = ["bg-brand-700", "bg-sage-500", "bg-lavender-400", "bg-brand-400", "bg-warning"];
              return (
                <div key={m.modality}>
                  <div className="flex items-center justify-between text-sm mb-1.5">
                    <span className="text-ink-900 inline-flex items-center gap-2.5 capitalize font-medium">
                      <span className="inline-block h-3.5 w-3.5 rounded-full shrink-0 ring-2 ring-bg-50" style={{ backgroundColor: dotColors[i] }} aria-hidden />
                      {m.modality}
                    </span>
                    <span className="text-ink-700 tabular text-xs font-semibold">{m.value}</span>
                  </div>
                  <div className="h-2 rounded-full bg-bg-100 overflow-hidden">
                    <div className={`h-full rounded-full ${barColors[i]}`} style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
          )}
        </div>

        <div className="rounded-xl border border-line-200 bg-surface p-5">
          <h3 className="font-serif text-lg text-ink-900 mb-1">Motivos de consulta</h3>
          <p className="text-xs text-ink-500 mb-4">Pacientes activos</p>
          {reasons.length === 0 ? (
            <p className="text-xs text-ink-400 italic py-8 text-center">Aún no hay pacientes con motivo registrado.</p>
          ) : (
          <div className="h-65">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={reasons} layout="vertical" margin={{ top: 0, right: 16, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.94 0.004 130)" horizontal={false} />
                <XAxis type="number" stroke="oklch(0.62 0.015 250)" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis dataKey="reason" type="category" stroke="oklch(0.4 0.018 250)" fontSize={12} tickLine={false} axisLine={false} width={92} />
                <Tooltip cursor={{ fill: "oklch(0.93 0.018 200 / 0.4)" }} contentStyle={{ borderRadius: 10, border: "1px solid oklch(0.91 0.005 130)", fontSize: 12 }} />
                <Bar dataKey="value" fill="oklch(0.53 0.045 200)" radius={[0, 4, 4, 0]} barSize={18} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          )}
        </div>
      </section>

      {/* AL FINAL: financiero (menos urgente que lo clínico) */}
      <section>
        <div className="rounded-xl border border-line-200 bg-surface p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-serif text-lg text-ink-900">Ingresos · {period.toLowerCase() === "hoy" ? "24 h" : "últimos 7 días"}</h3>
              <p className="text-xs text-ink-500 mt-0.5">Total {fmtCOP(revenueData.reduce((a, b) => a + b.value, 0))}</p>
            </div>
            <span className="text-xs text-ink-500">COP</span>
          </div>
          <div className="h-65 relative">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={revenueData} margin={{ top: 10, right: 8, left: -8, bottom: 0 }}>
                <defs>
                  <linearGradient id="g1" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="oklch(0.53 0.045 200)" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="oklch(0.53 0.045 200)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.91 0.005 130)" vertical={false} />
                <XAxis dataKey="day" stroke="oklch(0.62 0.015 250)" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis stroke="oklch(0.62 0.015 250)" fontSize={11} tickLine={false} axisLine={false} tickFormatter={(v) => `${(v / 1_000_000).toFixed(1)}M`} />
                <Tooltip
                  cursor={{ stroke: "oklch(0.76 0.035 200)", strokeWidth: 1 }}
                  contentStyle={{ borderRadius: 10, border: "1px solid oklch(0.91 0.005 130)", fontSize: 12, boxShadow: "0 6px 18px rgb(31 57 63 / 0.09)" }}
                  formatter={(v) => fmtCOP(Number(v))}
                />
                <Area type="monotone" dataKey="value" stroke="oklch(0.53 0.045 200)" strokeWidth={2} fill="url(#g1)" />
              </AreaChart>
            </ResponsiveContainer>
            {!revenueHasData && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <p className="text-xs text-ink-400 italic bg-surface/80 px-3 py-1 rounded">Sin recibos pagados esta semana</p>
              </div>
            )}
          </div>
        </div>
      </section>

      {newNoteOpen && <NewNoteShortcutModal onClose={() => setNewNoteOpen(false)} />}
    </div>
  );
}

// ─── Modal de acción rápida: empezar una nota de sesión ─────────────────
function NewNoteShortcutModal({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();
  const [patientId, setPatientId] = useState<string | null>(null);
  const [patientName, setPatientName] = useState<string | null>(null);

  function go() {
    if (!patientId) return;
    onClose();
    // Llevar a Historia clínica del paciente — desde ahí el psicólogo
    // crea la nueva nota de sesión.
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

function KpiLink({ to, children }: { to: string; children: React.ReactNode }) {
  return <Link to={to as any} className="block">{children}</Link>;
}
