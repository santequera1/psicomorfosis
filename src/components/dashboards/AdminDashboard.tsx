import { KpiCard } from "@/components/app/KpiCard";
import { RiskBadge } from "@/components/app/RiskBadge";
import { CalendarCheck2, Users, Wallet, Activity, ShieldAlert, Clock3, Video, UsersRound } from "lucide-react";
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  BarChart, Bar,
} from "recharts";
import { REVENUE_7D, SESSIONS_BY_MODALITY, REASONS, TODAY_AGENDA, PATIENTS } from "@/lib/mock-data";

const fmtCOP = (n: number) =>
  new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(n);

export function AdminDashboard() {
  const riskActive = PATIENTS.filter((p) => p.risk === "high" || p.risk === "critical");

  return (
    <div className="space-y-8">
      {/* Header */}
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm text-ink-500">Buenos días, Lucía. Hoy es martes 14 de noviembre.</p>
          <h1 className="font-serif text-[32px] leading-tight text-ink-900 mt-1">
            Panorama de la clínica
          </h1>
        </div>
        <div className="flex items-center gap-2">
          {["Hoy", "Semana", "Mes", "Trimestre", "Año"].map((r, i) => (
            <button
              key={r}
              className={
                i === 1
                  ? "h-9 px-3.5 rounded-md bg-brand-700 text-primary-foreground text-sm font-medium"
                  : "h-9 px-3.5 rounded-md border border-line-200 bg-surface text-ink-700 text-sm hover:border-brand-400"
              }
            >
              {r}
            </button>
          ))}
        </div>
      </header>

      {/* Crisis banner */}
      <div className="rounded-xl border border-risk-high/30 bg-error-soft/50 px-5 py-3 flex items-start gap-3">
        <div className="h-8 w-8 rounded-md bg-risk-high/15 text-risk-high flex items-center justify-center shrink-0">
          <ShieldAlert className="h-4 w-4" />
        </div>
        <div className="flex-1">
          <div className="text-sm text-ink-900 font-medium">
            2 pacientes con bandera de riesgo activo requieren seguimiento esta semana.
          </div>
          <div className="text-xs text-ink-500 mt-0.5">
            Protocolo de crisis disponible en el menú superior · línea 24/7 #106 visible para el paciente.
          </div>
        </div>
        <button className="text-sm text-risk-high font-medium hover:underline shrink-0">Ver protocolo</button>
      </div>

      {/* KPIs */}
      <section className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
        <KpiCard label="Sesiones esta semana" value="142" delta={{ value: "+8.2%", positive: true }} hint="vs. semana anterior" icon={<CalendarCheck2 className="h-4 w-4" />} />
        <KpiCard label="Pacientes activos" value="318" delta={{ value: "+12", positive: true }} hint="últimos 30 días" icon={<Users className="h-4 w-4" />} />
        <KpiCard label="Ingresos del periodo" value={fmtCOP(18700000)} delta={{ value: "+5.4%", positive: true }} hint="ticket prom. $158K" icon={<Wallet className="h-4 w-4" />} />
        <KpiCard label="Ocupación de agenda" value="78%" delta={{ value: "-2.1%", positive: false }} hint="meta 85%" icon={<Activity className="h-4 w-4" />} />
        <KpiCard label="Tasa de no-show" value="6.4%" delta={{ value: "-1.2%", positive: true }} hint="objetivo <8%" icon={<Clock3 className="h-4 w-4" />} />
        <KpiCard label="Sesiones por telepsicología" value="56" delta={{ value: "+14", positive: true }} hint="esta semana" icon={<Video className="h-4 w-4" />} />
        <KpiCard label="Pacientes nuevos" value="22" delta={{ value: "+3", positive: true }} hint="últimos 30 días" icon={<UsersRound className="h-4 w-4" />} />
        <KpiCard label="Riesgo activo" value={String(riskActive.length)} emphasis="risk" delta={{ neutral: true, value: "" }} hint="alto + crítico" icon={<ShieldAlert className="h-4 w-4" />} />
      </section>

      {/* Charts */}
      <section className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        {/* Revenue */}
        <div className="xl:col-span-2 rounded-xl border border-line-200 bg-surface p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-serif text-lg text-ink-900">Ingresos · últimos 7 días</h3>
              <p className="text-xs text-ink-500 mt-0.5">Total {fmtCOP(REVENUE_7D.reduce((a, b) => a + b.value, 0))}</p>
            </div>
            <span className="text-xs text-ink-500">COP</span>
          </div>
          <div className="h-[260px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={REVENUE_7D} margin={{ top: 10, right: 8, left: -8, bottom: 0 }}>
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
                  formatter={(v: number) => fmtCOP(v)}
                />
                <Area type="monotone" dataKey="value" stroke="oklch(0.53 0.045 200)" strokeWidth={2} fill="url(#g1)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Modality */}
        <div className="rounded-xl border border-line-200 bg-surface p-5">
          <h3 className="font-serif text-lg text-ink-900 mb-1">Sesiones por modalidad</h3>
          <p className="text-xs text-ink-500 mb-4">Mes en curso</p>
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

      {/* Reasons + Today + Risk list */}
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
                <Tooltip
                  cursor={{ fill: "oklch(0.93 0.018 200 / 0.4)" }}
                  contentStyle={{ borderRadius: 10, border: "1px solid oklch(0.91 0.005 130)", fontSize: 12 }}
                />
                <Bar dataKey="value" fill="oklch(0.53 0.045 200)" radius={[0, 4, 4, 0]} barSize={18} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Today's agenda */}
        <div className="rounded-xl border border-line-200 bg-surface p-5 xl:col-span-1">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-serif text-lg text-ink-900">Próximas sesiones</h3>
              <p className="text-xs text-ink-500">Hoy · {TODAY_AGENDA.length} citas</p>
            </div>
            <button className="text-xs text-brand-700 font-medium hover:underline">Ver agenda</button>
          </div>
          <ul className="space-y-2.5 max-h-[280px] overflow-y-auto pr-1">
            {TODAY_AGENDA.map((s) => (
              <li key={s.time} className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-brand-50 transition-colors">
                <div className="w-12 text-right">
                  <div className="font-serif text-sm text-ink-900 tabular">{s.time}</div>
                </div>
                <div className="h-8 w-px bg-line-200" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-ink-900 font-medium truncate flex items-center gap-2">
                    {s.patient}
                    {s.risk === "high" && <RiskBadge risk="high" compact />}
                  </div>
                  <div className="text-xs text-ink-500 truncate">{s.professional} · {s.room}</div>
                </div>
                <span className={
                  s.status === "atendida" ? "text-[10px] uppercase tracking-wider px-2 py-1 rounded-full bg-success-soft text-success font-medium" :
                  s.status === "en_curso" ? "text-[10px] uppercase tracking-wider px-2 py-1 rounded-full bg-info-soft text-info font-medium" :
                  s.status === "confirmada" ? "text-[10px] uppercase tracking-wider px-2 py-1 rounded-full bg-brand-100 text-brand-800 font-medium" :
                  "text-[10px] uppercase tracking-wider px-2 py-1 rounded-full bg-bg-100 text-ink-500 font-medium"
                }>
                  {s.status.replace("_", " ")}
                </span>
              </li>
            ))}
          </ul>
        </div>

        {/* Risk list */}
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
              <li key={p.id} className="rounded-lg border border-line-200 p-3 hover:border-risk-high/30 transition-colors">
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
              </li>
            ))}
          </ul>
          <button className="mt-4 w-full text-xs text-risk-high font-medium hover:underline">
            Abrir protocolo de seguimiento →
          </button>
        </div>
      </section>
    </div>
  );
}
