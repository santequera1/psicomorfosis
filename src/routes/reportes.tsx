import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app/AppShell";
import { KpiCard } from "@/components/app/KpiCard";
import {
  Users, CalendarCheck, TrendingUp, HeartHandshake, Download, Clock,
  ShieldAlert, XCircle, AlertTriangle, Brain, Activity,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip,
  BarChart, Bar, PieChart, Pie, Cell, Legend, CartesianGrid,
  LineChart, Line,
} from "recharts";

export const Route = createFileRoute("/reportes")({
  head: () => ({ meta: [{ title: "Reportes — Psicomorfosis" }] }),
  component: ReportesPage,
});

const PIE_COLORS = ["var(--brand-700)", "var(--sage-500)", "var(--lavender-400)", "var(--brand-400)", "var(--warning)", "var(--ink-300)"];
const RISK_COLORS: Record<string, string> = {
  none: "var(--ink-300)",
  low: "var(--success)",
  moderate: "var(--warning)",
  high: "var(--risk-high)",
  critical: "var(--risk-critical)",
};

const COP = new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });

function ReportesPage() {
  const { data: patients = [] } = useQuery({ queryKey: ["patients"], queryFn: () => api.listPatients() });
  const { data: tasks = [] } = useQuery({ queryKey: ["tasks"], queryFn: () => api.listTasks() as Promise<any> });
  const { data: appointments = [] } = useQuery({ queryKey: ["all-appointments"], queryFn: () => api.listAppointments() });
  const { data: summary } = useQuery({ queryKey: ["invoices-summary"], queryFn: () => api.invoicesSummary() });
  const { data: reportsStats } = useQuery({ queryKey: ["reports-stats"], queryFn: () => api.getReportsStats() });

  const revenue7d = reportsStats?.revenue7d ?? [];
  const sessionsByModality = reportsStats?.sessionsByModality ?? [];
  const reasons = reportsStats?.reasons ?? [];
  const retention = reportsStats?.retention ?? [];
  const sessionsByDow = reportsStats?.sessionsByDow ?? [];
  const patientsByRisk = reportsStats?.patientsByRisk ?? [];
  const patientsByAge = reportsStats?.patientsByAge ?? [];
  const patientsBySex = reportsStats?.patientsBySex ?? [];
  const testsByMonth = reportsStats?.testsByMonth ?? [];
  const topPatients = reportsStats?.topPatients ?? [];
  const revenueByMethod = reportsStats?.revenueByMethod ?? [];
  const ops = reportsStats?.operational;
  const revenueHasData = revenue7d.some((r) => r.value > 0);

  const activePatients = patients.filter((p) => p.status === "activo").length;
  const sessionsRealized = (appointments as any[]).filter((a) => a.status === "atendida").length;
  const allTasks = (tasks as any[]);
  const avgAdherence = allTasks.length > 0
    ? Math.round(allTasks.reduce((acc: number, t: any) => acc + (t.adherence ?? 0), 0) / allTasks.length)
    : 0;

  // Las metas de riesgo importan rápido: cuántos en alto/crítico ahora.
  const criticalPatients = patientsByRisk
    .filter((r) => r.key === "high" || r.key === "critical")
    .reduce((acc, r) => acc + r.value, 0);

  return (
    <AppShell>
      <div className="max-w-7xl mx-auto">
        <header className="flex items-end justify-between mb-5 sm:mb-6 flex-wrap gap-3">
          <div>
            <div className="text-xs uppercase tracking-[0.14em] text-brand-700 font-semibold">Inteligencia clínica</div>
            <h1 className="font-serif text-2xl md:text-3xl text-ink-900 mt-1">Reportes</h1>
            <p className="text-sm text-ink-500 mt-1">Vista panorámica del consultorio · últimos 90 días salvo indicación contraria</p>
          </div>
          <button
            onClick={() => window.print()}
            title="Imprimir o guardar como PDF desde el diálogo del navegador"
            className="h-10 px-3 sm:px-4 rounded-lg border border-line-200 bg-surface text-xs sm:text-sm text-ink-700 hover:border-brand-400 flex items-center gap-2"
          >
            <Download className="h-4 w-4" /> <span>Exportar PDF</span>
          </button>
        </header>

        {/* KPIs principales */}
        <section className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-5">
          <KpiCard icon={<Users className="h-4 w-4" />} label="Pacientes activos" value={String(activePatients)} delta={{ neutral: true, value: "" }} hint={`${patients.length} en total`} />
          <KpiCard icon={<CalendarCheck className="h-4 w-4" />} label="Sesiones atendidas" value={String(sessionsRealized)} delta={{ neutral: true, value: "" }} hint={`${ops?.attendance_rate ?? 0}% asistencia (90d)`} />
          <KpiCard icon={<HeartHandshake className="h-4 w-4" />} label="Adherencia tareas" value={`${avgAdherence}%`} delta={{ neutral: true, value: "" }} hint="promedio del workspace" />
          <KpiCard icon={<TrendingUp className="h-4 w-4" />} label="Recaudado" value={COP.format(summary?.paid ?? 0)} delta={{ neutral: true, value: "" }} hint="total pagadas" />
        </section>

        {/* KPIs operativos secundarios */}
        <section className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <KpiCard
            icon={<ShieldAlert className="h-4 w-4" />}
            label="Riesgo activo"
            value={String(criticalPatients)}
            emphasis={criticalPatients > 0 ? "risk" : "default"}
            delta={{ neutral: true, value: "" }}
            hint="alto + crítico"
          />
          <KpiCard
            icon={<XCircle className="h-4 w-4" />}
            label="Cancelaciones"
            value={`${ops?.cancel_rate ?? 0}%`}
            delta={{ neutral: true, value: "" }}
            hint={`${ops?.total_last_90d ?? 0} citas en 90d`}
          />
          <KpiCard
            icon={<AlertTriangle className="h-4 w-4" />}
            label="No-show"
            value={`${ops?.no_show_rate ?? 0}%`}
            delta={{ neutral: true, value: "" }}
            hint="pacientes que no llegaron"
          />
          <KpiCard
            icon={<Clock className="h-4 w-4" />}
            label="Duración promedio"
            value={`${ops?.avg_duration_min ?? 50} min`}
            delta={{ neutral: true, value: "" }}
            hint="por sesión"
          />
        </section>

        {/* Fila 1: Ingresos + Modalidades */}
        <div className="grid lg:grid-cols-3 gap-5 mb-5">
          <Card title="Ingresos · semana" subtitle="Tendencia diaria de pagos recibidos" className="lg:col-span-2">
            <div className="relative">
              <ResponsiveContainer width="100%" height={260}>
                <AreaChart data={revenue7d} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                  <defs>
                    <linearGradient id="rev" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--brand-700)" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="var(--brand-700)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="var(--line-100)" vertical={false} />
                  <XAxis dataKey="day" stroke="var(--ink-400)" fontSize={11} />
                  <YAxis stroke="var(--ink-400)" fontSize={11} tickFormatter={(v) => v >= 1_000_000 ? `${v / 1_000_000}M` : `${v / 1000}k`} />
                  <Tooltip
                    contentStyle={{ background: "var(--surface)", border: "1px solid var(--line-200)", borderRadius: 10, fontSize: 12 }}
                    formatter={(v: any) => COP.format(Number(v))}
                  />
                  <Area type="monotone" dataKey="value" stroke="var(--brand-700)" strokeWidth={2} fill="url(#rev)" />
                </AreaChart>
              </ResponsiveContainer>
              {!revenueHasData && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <p className="text-xs text-ink-400 italic bg-surface/80 px-3 py-1 rounded">Sin recibos pagados esta semana</p>
                </div>
              )}
            </div>
          </Card>

          <Card title="Modalidad de atención" subtitle="Últimos 30 días">
            {sessionsByModality.length === 0 ? (
              <div className="h-65 flex items-center justify-center">
                <p className="text-xs text-ink-400 italic">Aún no hay citas en los últimos 30 días.</p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <PieChart>
                  <Pie data={sessionsByModality} dataKey="value" nameKey="modality" innerRadius={50} outerRadius={85} paddingAngle={2}>
                    {sessionsByModality.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                  </Pie>
                  <Tooltip contentStyle={{ background: "var(--surface)", border: "1px solid var(--line-200)", borderRadius: 10, fontSize: 12 }} />
                  <Legend wrapperStyle={{ fontSize: 11 }} iconSize={8} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </Card>
        </div>

        {/* Fila 2: Carga semanal + Distribución de riesgo */}
        <div className="grid lg:grid-cols-3 gap-5 mb-5">
          <Card title="Carga semanal" subtitle="Sesiones atendidas por día (90d)" className="lg:col-span-2">
            {sessionsByDow.every((d) => d.value === 0) ? (
              <div className="h-65 flex items-center justify-center">
                <p className="text-xs text-ink-400 italic">Aún no hay sesiones atendidas en 90d.</p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={sessionsByDow} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
                  <CartesianGrid stroke="var(--line-100)" vertical={false} />
                  <XAxis dataKey="day" stroke="var(--ink-400)" fontSize={11} />
                  <YAxis stroke="var(--ink-400)" fontSize={11} allowDecimals={false} />
                  <Tooltip contentStyle={{ background: "var(--surface)", border: "1px solid var(--line-200)", borderRadius: 10, fontSize: 12 }} />
                  <Bar dataKey="value" fill="var(--brand-700)" radius={[6, 6, 0, 0]} name="Sesiones" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </Card>

          <Card title="Riesgo clínico" subtitle="Distribución de pacientes activos">
            {patientsByRisk.every((r) => r.value === 0) ? (
              <div className="h-65 flex items-center justify-center">
                <p className="text-xs text-ink-400 italic">Sin datos de riesgo aún.</p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <PieChart>
                  <Pie data={patientsByRisk.filter((r) => r.value > 0)} dataKey="value" nameKey="level" innerRadius={50} outerRadius={85} paddingAngle={2}>
                    {patientsByRisk.filter((r) => r.value > 0).map((r, i) => <Cell key={i} fill={RISK_COLORS[r.key] ?? PIE_COLORS[i % PIE_COLORS.length]} />)}
                  </Pie>
                  <Tooltip contentStyle={{ background: "var(--surface)", border: "1px solid var(--line-200)", borderRadius: 10, fontSize: 12 }} />
                  <Legend wrapperStyle={{ fontSize: 11 }} iconSize={8} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </Card>
        </div>

        {/* Fila 3: Demografía pacientes (edad + sexo) */}
        <div className="grid lg:grid-cols-3 gap-5 mb-5">
          <Card title="Edad de pacientes" subtitle="Pacientes activos por rango etario" className="lg:col-span-2">
            {patientsByAge.every((b) => b.value === 0) ? (
              <div className="h-55 flex items-center justify-center">
                <p className="text-xs text-ink-400 italic">Sin datos de edad aún.</p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={patientsByAge} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
                  <CartesianGrid stroke="var(--line-100)" vertical={false} />
                  <XAxis dataKey="range" stroke="var(--ink-400)" fontSize={11} />
                  <YAxis stroke="var(--ink-400)" fontSize={11} allowDecimals={false} />
                  <Tooltip contentStyle={{ background: "var(--surface)", border: "1px solid var(--line-200)", borderRadius: 10, fontSize: 12 }} />
                  <Bar dataKey="value" fill="var(--lavender-400)" radius={[6, 6, 0, 0]} name="Pacientes" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </Card>

          <Card title="Sexo" subtitle="Pacientes activos">
            {patientsBySex.length === 0 ? (
              <div className="h-55 flex items-center justify-center">
                <p className="text-xs text-ink-400 italic">Sin datos de sexo aún.</p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie data={patientsBySex} dataKey="value" nameKey="sex" innerRadius={45} outerRadius={75} paddingAngle={2}>
                    {patientsBySex.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                  </Pie>
                  <Tooltip contentStyle={{ background: "var(--surface)", border: "1px solid var(--line-200)", borderRadius: 10, fontSize: 12 }} />
                  <Legend wrapperStyle={{ fontSize: 11 }} iconSize={8} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </Card>
        </div>

        {/* Fila 4: Motivos consulta + Retención */}
        <div className="grid lg:grid-cols-2 gap-5 mb-5">
          <Card title="Motivos de consulta" subtitle="Top 7 categorías">
            {reasons.length === 0 ? (
              <div className="h-65 flex items-center justify-center">
                <p className="text-xs text-ink-400 italic">Aún no hay pacientes con motivo registrado.</p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={reasons} layout="vertical" margin={{ top: 5, right: 15, left: 50, bottom: 5 }}>
                  <CartesianGrid stroke="var(--line-100)" horizontal={false} />
                  <XAxis type="number" stroke="var(--ink-400)" fontSize={11} allowDecimals={false} />
                  <YAxis dataKey="reason" type="category" stroke="var(--ink-400)" fontSize={11} width={80} />
                  <Tooltip contentStyle={{ background: "var(--surface)", border: "1px solid var(--line-200)", borderRadius: 10, fontSize: 12 }} />
                  <Bar dataKey="value" fill="var(--brand-700)" radius={[0, 6, 6, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </Card>

          <Card title="Retención de pacientes" subtitle="Últimos 6 meses · nuevos / retenidos / alta">
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={retention} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
                <CartesianGrid stroke="var(--line-100)" vertical={false} />
                <XAxis dataKey="mes" stroke="var(--ink-400)" fontSize={11} />
                <YAxis stroke="var(--ink-400)" fontSize={11} allowDecimals={false} />
                <Tooltip contentStyle={{ background: "var(--surface)", border: "1px solid var(--line-200)", borderRadius: 10, fontSize: 12 }} />
                <Legend wrapperStyle={{ fontSize: 11 }} iconSize={8} />
                <Bar dataKey="nuevos" stackId="a" fill="var(--lavender-400)" name="Nuevos" />
                <Bar dataKey="retenidos" stackId="a" fill="var(--brand-700)" name="Retenidos" />
                <Bar dataKey="alta" stackId="a" fill="var(--sage-500)" name="Alta" />
              </BarChart>
            </ResponsiveContainer>
          </Card>
        </div>

        {/* Fila 5: Tests aplicados + Métodos de pago */}
        <div className="grid lg:grid-cols-2 gap-5 mb-5">
          <Card title="Tests psicométricos" subtitle="Aplicaciones completadas por mes">
            {testsByMonth.every((m) => m.value === 0) ? (
              <div className="h-65 flex items-center justify-center">
                <Brain className="h-6 w-6 text-ink-300 mr-2" />
                <p className="text-xs text-ink-400 italic">Aún no hay tests completados.</p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <LineChart data={testsByMonth} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                  <CartesianGrid stroke="var(--line-100)" vertical={false} />
                  <XAxis dataKey="mes" stroke="var(--ink-400)" fontSize={11} />
                  <YAxis stroke="var(--ink-400)" fontSize={11} allowDecimals={false} />
                  <Tooltip contentStyle={{ background: "var(--surface)", border: "1px solid var(--line-200)", borderRadius: 10, fontSize: 12 }} />
                  <Line type="monotone" dataKey="value" stroke="var(--brand-700)" strokeWidth={2.5} dot={{ r: 4, fill: "var(--brand-700)" }} activeDot={{ r: 6 }} name="Tests" />
                </LineChart>
              </ResponsiveContainer>
            )}
          </Card>

          <Card title="Métodos de pago" subtitle="Ingresos por método (30d)">
            {revenueByMethod.length === 0 ? (
              <div className="h-65 flex items-center justify-center">
                <p className="text-xs text-ink-400 italic">Sin pagos en los últimos 30 días.</p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={revenueByMethod} layout="vertical" margin={{ top: 5, right: 15, left: 50, bottom: 5 }}>
                  <CartesianGrid stroke="var(--line-100)" horizontal={false} />
                  <XAxis type="number" stroke="var(--ink-400)" fontSize={11} tickFormatter={(v) => v >= 1_000_000 ? `${v / 1_000_000}M` : `${v / 1000}k`} />
                  <YAxis dataKey="method" type="category" stroke="var(--ink-400)" fontSize={11} width={80} />
                  <Tooltip
                    contentStyle={{ background: "var(--surface)", border: "1px solid var(--line-200)", borderRadius: 10, fontSize: 12 }}
                    formatter={(v: any, _n, p: any) => [COP.format(Number(v)), `${p.payload.count} recibo${p.payload.count === 1 ? "" : "s"}`]}
                  />
                  <Bar dataKey="value" fill="var(--sage-500)" radius={[0, 6, 6, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </Card>
        </div>

        {/* Fila 6: Top pacientes */}
        <Card title="Pacientes más activos" subtitle="Top 5 por sesiones atendidas (90d)">
          {topPatients.length === 0 ? (
            <div className="py-10 flex items-center justify-center">
              <Activity className="h-6 w-6 text-ink-300 mr-2" />
              <p className="text-xs text-ink-400 italic">Aún no hay pacientes con sesiones atendidas en 90d.</p>
            </div>
          ) : (
            <ul className="divide-y divide-line-100">
              {topPatients.map((p, i) => (
                <li key={p.id} className="flex items-center gap-3 py-3">
                  <span className="h-8 w-8 rounded-full bg-brand-50 text-brand-800 dark:text-white text-xs font-semibold inline-flex items-center justify-center tabular shrink-0">
                    {i + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-ink-900 truncate">{p.name}</p>
                    <p className="text-[11px] text-ink-500 tabular">{p.id}</p>
                  </div>
                  <span className="text-sm font-medium text-ink-900 tabular shrink-0">
                    {p.sessions} <span className="text-xs text-ink-500 font-normal">{p.sessions === 1 ? "sesión" : "sesiones"}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </AppShell>
  );
}

function Card({ title, subtitle, children, className }: { title: string; subtitle?: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={`rounded-xl bg-surface border border-line-200 shadow-soft p-5 ${className ?? ""}`}>
      <div className="mb-3">
        <h2 className="font-serif text-lg text-ink-900">{title}</h2>
        {subtitle && <p className="text-xs text-ink-500 mt-0.5">{subtitle}</p>}
      </div>
      {children}
    </section>
  );
}
