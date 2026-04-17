import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app/AppShell";
import { KpiCard } from "@/components/app/KpiCard";
import { Users, CalendarCheck, TrendingUp, HeartHandshake, Download } from "lucide-react";
import { REVENUE_7D, REASONS, SESSIONS_BY_MODALITY } from "@/lib/mock-data";
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip,
  BarChart, Bar, PieChart, Pie, Cell, Legend, CartesianGrid,
} from "recharts";

export const Route = createFileRoute("/reportes")({
  head: () => ({ meta: [{ title: "Reportes — Psicomorfosis" }] }),
  component: ReportesPage,
});

const PIE_COLORS = ["var(--brand-700)", "var(--sage-500)", "var(--lavender-400)", "var(--brand-400)", "var(--warning)"];

const RETENCION = [
  { mes: "Ene", nuevos: 12, retenidos: 38, alta: 4 },
  { mes: "Feb", nuevos: 15, retenidos: 42, alta: 3 },
  { mes: "Mar", nuevos: 18, retenidos: 49, alta: 5 },
  { mes: "Abr", nuevos: 14, retenidos: 56, alta: 6 },
];

function ReportesPage() {
  return (
    <AppShell>
      <div className="px-8 py-8 max-w-[1280px] mx-auto">
        <header className="flex items-end justify-between mb-6">
          <div>
            <div className="text-xs uppercase tracking-[0.14em] text-brand-700 font-semibold">Inteligencia clínica</div>
            <h1 className="font-serif text-3xl text-ink-900 mt-1">Reportes</h1>
            <p className="text-sm text-ink-500 mt-1">Indicadores operativos y clínicos · Últimos 30 días</p>
          </div>
          <button className="h-10 px-4 rounded-lg border border-line-200 bg-surface text-sm text-ink-700 hover:border-brand-400 flex items-center gap-2">
            <Download className="h-4 w-4" /> Exportar PDF
          </button>
        </header>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <KpiCard icon={Users} label="Pacientes activos" value="186" delta="+8 vs mes anterior" tone="success" />
          <KpiCard icon={CalendarCheck} label="Sesiones realizadas" value="256" delta="92% asistencia" tone="default" />
          <KpiCard icon={HeartHandshake} label="Adherencia tratamiento" value="78%" delta="+4 pts" tone="success" />
          <KpiCard icon={TrendingUp} label="Reducción GAD-7 promedio" value="-6.2 pts" delta="bloque cerrado" tone="success" />
        </div>

        <div className="grid lg:grid-cols-3 gap-5 mb-6">
          <Card title="Ingresos · semana" subtitle="Tendencia diaria" className="lg:col-span-2">
            <ResponsiveContainer width="100%" height={260}>
              <AreaChart data={REVENUE_7D} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                <defs>
                  <linearGradient id="rev" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--brand-700)" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="var(--brand-700)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="var(--line-100)" vertical={false} />
                <XAxis dataKey="day" stroke="var(--ink-400)" fontSize={11} />
                <YAxis stroke="var(--ink-400)" fontSize={11} tickFormatter={(v) => `${v / 1000000}M`} />
                <Tooltip contentStyle={{ background: "var(--surface)", border: "1px solid var(--line-200)", borderRadius: 10, fontSize: 12 }} />
                <Area type="monotone" dataKey="value" stroke="var(--brand-700)" strokeWidth={2} fill="url(#rev)" />
              </AreaChart>
            </ResponsiveContainer>
          </Card>

          <Card title="Modalidades" subtitle="Distribución del mes">
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie data={SESSIONS_BY_MODALITY} dataKey="value" nameKey="modality" innerRadius={50} outerRadius={85} paddingAngle={2}>
                  {SESSIONS_BY_MODALITY.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                </Pie>
                <Legend wrapperStyle={{ fontSize: 11 }} iconSize={8} />
              </PieChart>
            </ResponsiveContainer>
          </Card>
        </div>

        <div className="grid lg:grid-cols-2 gap-5">
          <Card title="Motivos de consulta" subtitle="Top 7 categorías">
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={REASONS} layout="vertical" margin={{ top: 5, right: 15, left: 50, bottom: 5 }}>
                <CartesianGrid stroke="var(--line-100)" horizontal={false} />
                <XAxis type="number" stroke="var(--ink-400)" fontSize={11} />
                <YAxis dataKey="reason" type="category" stroke="var(--ink-400)" fontSize={11} width={80} />
                <Tooltip contentStyle={{ background: "var(--surface)", border: "1px solid var(--line-200)", borderRadius: 10, fontSize: 12 }} />
                <Bar dataKey="value" fill="var(--brand-700)" radius={[0, 6, 6, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </Card>

          <Card title="Retención de pacientes" subtitle="Nuevos vs retenidos vs alta">
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={RETENCION} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
                <CartesianGrid stroke="var(--line-100)" vertical={false} />
                <XAxis dataKey="mes" stroke="var(--ink-400)" fontSize={11} />
                <YAxis stroke="var(--ink-400)" fontSize={11} />
                <Tooltip contentStyle={{ background: "var(--surface)", border: "1px solid var(--line-200)", borderRadius: 10, fontSize: 12 }} />
                <Legend wrapperStyle={{ fontSize: 11 }} iconSize={8} />
                <Bar dataKey="nuevos" stackId="a" fill="var(--lavender-400)" name="Nuevos" />
                <Bar dataKey="retenidos" stackId="a" fill="var(--brand-700)" name="Retenidos" />
                <Bar dataKey="alta" stackId="a" fill="var(--sage-500)" name="Alta" />
              </BarChart>
            </ResponsiveContainer>
          </Card>
        </div>
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
