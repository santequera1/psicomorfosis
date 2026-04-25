import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { KpiCard } from "@/components/app/KpiCard";
import { RiskBadge } from "@/components/app/RiskBadge";
import { CalendarCheck2, Users, Wallet, Activity, ShieldAlert, Clock3, Video, UsersRound, ArrowUpRight } from "lucide-react";
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  BarChart, Bar,
} from "recharts";
import { REVENUE_7D, SESSIONS_BY_MODALITY, REASONS, TODAY_AGENDA } from "@/lib/mock-data";
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
  const { data: workspace } = useWorkspace();
  const user = getStoredUser();
  const firstName = user?.name.split(" ")[0] ?? "";
  const isOrg = workspace?.mode === "organization";

  const today = new Date().toISOString().slice(0, 10);
  const { data: patients = [] } = useQuery({ queryKey: ["patients"], queryFn: () => api.listPatients() });
  const { data: invoicesSummary } = useQuery({ queryKey: ["invoices-summary"], queryFn: () => api.invoicesSummary() });
  const { data: todayAppointments = [] } = useQuery({
    queryKey: ["appointments", today],
    queryFn: () => api.listAppointments({ date: today }),
  });

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

  // Escala los datos del chart al total real de facturación (evita mostrar valores inflados del mock)
  const revenueData = useMemo(() => {
    const realTotal = invoicesSummary?.paid ?? 0;
    const mockTotal = REVENUE_7D.reduce((a, b) => a + b.value, 0) || 1;
    const ratio = realTotal / mockTotal;
    return REVENUE_7D.map((r) => ({ ...r, value: Math.round(r.value * ratio) }));
  }, [invoicesSummary?.paid]);

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
            {isOrg ? `Panorama · ${workspace?.name ?? "Mi Clínica"}` : "Mi consultorio"}
          </h1>
          {workspace && (
            <p className="text-xs text-ink-400 mt-1">
              {isOrg
                ? `${workspace.sedes.length} sedes · ${workspace.professionals.length} profesionales · ${patients.length} pacientes`
                : `Modo individual · ${patients.length} pacientes activos`}
            </p>
          )}
        </div>
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
      </header>

      <div className="rounded-xl border border-risk-high/30 bg-error-soft/50 px-5 py-3 flex items-start gap-3">
        <div className="h-8 w-8 rounded-md bg-risk-high/15 text-risk-high flex items-center justify-center shrink-0">
          <ShieldAlert className="h-4 w-4" />
        </div>
        <div className="flex-1">
          <div className="text-sm text-ink-900 font-medium">
            {riskActive.length} pacientes con bandera de riesgo activo requieren seguimiento esta semana.
          </div>
          <div className="text-xs text-ink-500 mt-0.5">
            Protocolo de crisis disponible en el menú superior · línea 24/7 #106 visible para el paciente.
          </div>
        </div>
        <button onClick={openCrisis} className="text-sm text-risk-high font-medium hover:underline shrink-0 inline-flex items-center gap-1">
          Ver protocolo <ArrowUpRight className="h-3.5 w-3.5" />
        </button>
      </div>

      <section className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
        <KpiLink to="/agenda"><KpiCard label="Sesiones hoy" value={String(kpis.sessionsToday)} delta={{ neutral: true, value: "" }} hint={`${kpis.sessionsAttended} atendidas`} icon={<CalendarCheck2 className="h-4 w-4" />} /></KpiLink>
        <KpiLink to="/pacientes"><KpiCard label="Pacientes activos" value={String(kpis.patients)} delta={{ neutral: true, value: "" }} hint={`${kpis.patientsTotal} en total`} icon={<Users className="h-4 w-4" />} /></KpiLink>
        <KpiLink to="/facturacion"><KpiCard label="Recaudado" value={fmtCOP(kpis.revenue)} delta={{ neutral: true, value: "" }} hint={kpis.pending > 0 ? `${fmtCOP(kpis.pending)} por cobrar` : "al día"} icon={<Wallet className="h-4 w-4" />} /></KpiLink>
        <KpiLink to="/agenda"><KpiCard label="Telepsicología" value={String(kpis.tele)} delta={{ neutral: true, value: "" }} hint="pacientes remotos" icon={<Video className="h-4 w-4" />} /></KpiLink>
        <button onClick={openCrisis} className="text-left"><KpiCard label="Riesgo activo" value={String(kpis.risk)} emphasis={kpis.risk > 0 ? "risk" : "default"} delta={{ neutral: true, value: "" }} hint={kpis.risk > 0 ? "alto + crítico · abrir protocolo" : "sin alertas"} icon={<ShieldAlert className="h-4 w-4" />} /></button>
      </section>

      <section className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <div className="xl:col-span-2 rounded-xl border border-line-200 bg-surface p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-serif text-lg text-ink-900">Ingresos · {period.toLowerCase() === "hoy" ? "24 h" : "últimos 7 días"}</h3>
              <p className="text-xs text-ink-500 mt-0.5">Total {fmtCOP(revenueData.reduce((a, b) => a + b.value, 0))}</p>
            </div>
            <span className="text-xs text-ink-500">COP</span>
          </div>
          <div className="h-[260px]">
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
          </div>
        </div>

        <div className="rounded-xl border border-line-200 bg-surface p-5">
          <h3 className="font-serif text-lg text-ink-900 mb-1">Sesiones por modalidad</h3>
          <p className="text-xs text-ink-500 mb-4">{period}</p>
          <div className="space-y-3">
            {SESSIONS_BY_MODALITY.map((m, i) => {
              const max = Math.max(...SESSIONS_BY_MODALITY.map((x) => x.value));
              const pct = (m.value / max) * 100;
              const colors = ["bg-brand-700", "bg-sage-500", "bg-lavender-400", "bg-brand-400", "bg-warning"];
              return (
                <div key={m.modality}>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="text-ink-700">{m.modality}</span>
                    <span className="text-ink-500 tabular">{m.value}</span>
                  </div>
                  <div className="h-2 rounded-full bg-bg-100 overflow-hidden">
                    <div className={`h-full rounded-full ${colors[i]}`} style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <div className="rounded-xl border border-line-200 bg-surface p-5">
          <h3 className="font-serif text-lg text-ink-900 mb-1">Motivos de consulta</h3>
          <p className="text-xs text-ink-500 mb-4">Distribución del trimestre</p>
          <div className="h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={REASONS} layout="vertical" margin={{ top: 0, right: 16, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.94 0.004 130)" horizontal={false} />
                <XAxis type="number" stroke="oklch(0.62 0.015 250)" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis dataKey="reason" type="category" stroke="oklch(0.4 0.018 250)" fontSize={12} tickLine={false} axisLine={false} width={92} />
                <Tooltip cursor={{ fill: "oklch(0.93 0.018 200 / 0.4)" }} contentStyle={{ borderRadius: 10, border: "1px solid oklch(0.91 0.005 130)", fontSize: 12 }} />
                <Bar dataKey="value" fill="oklch(0.53 0.045 200)" radius={[0, 4, 4, 0]} barSize={18} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-xl border border-line-200 bg-surface p-5 xl:col-span-1">
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
            <ul className="space-y-2.5 max-h-[280px] overflow-y-auto pr-1">
              {todayAppointments.map((s: any) => (
                <li key={s.id}>
                  <Link to="/agenda" className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-brand-50 transition-colors">
                    <div className="w-12 text-right">
                      <div className="font-serif text-sm text-ink-900 tabular">{s.time}</div>
                    </div>
                    <div className="h-8 w-px bg-line-200" />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-ink-900 font-medium truncate">
                        {s.patient_name}
                      </div>
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
                Pacientes con riesgo activo
              </h3>
              <p className="text-xs text-ink-500">Atención prioritaria · seguimiento clínico</p>
            </div>
          </div>
          <ul className="space-y-3">
            {riskActive.map((p) => (
              <li key={p.id}>
                <Link to="/pacientes/$id" params={{ id: p.id }} className="block rounded-lg border border-line-200 p-3 hover:border-risk-high/30 transition-colors">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-ink-900 truncate">{p.preferredName ?? p.name}</div>
                      <div className="text-xs text-ink-500 truncate">{p.reason}</div>
                    </div>
                    <RiskBadge risk={p.risk} compact />
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
        </div>
      </section>
    </div>
  );
}

function KpiLink({ to, children }: { to: string; children: React.ReactNode }) {
  return <Link to={to as any} className="block">{children}</Link>;
}
