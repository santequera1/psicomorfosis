import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app/AppShell";
import { TODAY_AGENDA, PATIENTS } from "@/lib/mock-data";
import { RiskBadge } from "@/components/app/RiskBadge";
import { KpiCard } from "@/components/app/KpiCard";
import { Calendar, ClipboardList, FileSignature, Brain, ChevronRight, Plus } from "lucide-react";

export const Route = createFileRoute("/agenda")({
  head: () => ({
    meta: [
      { title: "Agenda · Psicomorfosis" },
      { name: "description", content: "Agenda del día y panel de seguimiento clínico." },
    ],
  }),
  component: AgendaPage,
});

function AgendaPage() {
  const myPatientsRisk = PATIENTS.filter((p) => p.professional === "Dra. Lucía Méndez" && (p.risk === "high" || p.risk === "critical"));

  return (
    <AppShell>
      <div className="space-y-8">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm text-ink-500">Mi consulta · martes 14 de noviembre</p>
            <h1 className="font-serif text-[32px] leading-tight text-ink-900 mt-1">Mi día</h1>
          </div>
          <div className="flex gap-2">
            <button className="h-10 px-4 rounded-lg bg-brand-700 text-primary-foreground text-sm font-medium hover:bg-brand-800 inline-flex items-center gap-2">
              <Plus className="h-4 w-4" /> Nueva nota
            </button>
            <button className="h-10 px-4 rounded-lg border border-line-200 bg-surface text-ink-700 text-sm hover:border-brand-400">
              Asignar test
            </button>
          </div>
        </header>

        <section className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <KpiCard label="Mis pacientes activos" value="42" delta={{ neutral: true, value: "" }} hint="últimos 30 días" icon={<ClipboardList className="h-4 w-4" />} />
          <KpiCard label="Sesiones esta semana" value="18" delta={{ value: "+2", positive: true }} hint="meta 20" icon={<Calendar className="h-4 w-4" />} />
          <KpiCard label="Tests sin calificar" value="4" delta={{ neutral: true, value: "" }} hint="pendientes hoy" icon={<Brain className="h-4 w-4" />} />
          <KpiCard label="Notas en borrador" value="3" delta={{ neutral: true, value: "" }} hint="autoguardadas" icon={<FileSignature className="h-4 w-4" />} />
        </section>

        <section className="grid grid-cols-1 xl:grid-cols-3 gap-5">
          {/* Timeline */}
          <div className="xl:col-span-2 rounded-xl border border-line-200 bg-surface p-6">
            <div className="flex items-center justify-between mb-5">
              <div>
                <h3 className="font-serif text-lg text-ink-900">Agenda del día</h3>
                <p className="text-xs text-ink-500">{TODAY_AGENDA.length} citas · Sede Chapinero</p>
              </div>
              <div className="flex gap-1 p-1 rounded-md bg-bg-100">
                {["Día", "Semana", "Mes", "Lista"].map((v, i) => (
                  <button key={v} className={i === 0 ? "px-3 py-1.5 text-xs rounded bg-surface text-ink-900 font-medium shadow-xs" : "px-3 py-1.5 text-xs text-ink-500 hover:text-ink-900"}>{v}</button>
                ))}
              </div>
            </div>

            <ol className="relative">
              <div className="absolute left-[60px] top-2 bottom-2 w-px bg-line-200" />
              {TODAY_AGENDA.map((s, i) => (
                <li key={i} className="relative flex gap-5 py-3 group">
                  <div className="w-[60px] text-right shrink-0">
                    <div className="font-serif text-sm text-ink-900 tabular">{s.time}</div>
                    <div className="text-[10px] text-ink-400 uppercase tracking-wider">50 min</div>
                  </div>
                  <div className={
                    "absolute left-[56px] top-[18px] h-2 w-2 rounded-full ring-4 ring-surface " +
                    (s.status === "en_curso" ? "bg-brand-700" : s.status === "atendida" ? "bg-success" : s.status === "confirmada" ? "bg-brand-400" : "bg-ink-300")
                  } />
                  <div className={
                    "flex-1 rounded-lg border p-3.5 hover:border-brand-400 transition-colors cursor-pointer " +
                    (s.status === "en_curso" ? "border-brand-700/40 bg-brand-50" : "border-line-200 bg-surface")
                  }>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-ink-900 flex items-center gap-2">
                          {s.patient}
                          {s.risk === "high" && <RiskBadge risk="high" compact />}
                        </div>
                        <div className="text-xs text-ink-500 mt-0.5">
                          {s.modality === "individual" ? "Individual" : s.modality === "pareja" ? "Pareja" : s.modality === "familiar" ? "Familiar" : s.modality === "tele" ? "Telepsicología" : "Grupal"}
                          · {s.room} · {s.professional}
                        </div>
                      </div>
                      <ChevronRight className="h-4 w-4 text-ink-300 group-hover:text-brand-700 shrink-0" />
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          </div>

          {/* Side panels */}
          <div className="space-y-5">
            <div className="rounded-xl border border-brand-700/20 bg-brand-50/60 p-5">
              <div className="text-[11px] uppercase tracking-[0.1em] text-brand-800 font-medium mb-2">Próximo paciente</div>
              <h4 className="font-serif text-xl text-ink-900">María Camila Rondón</h4>
              <p className="text-xs text-ink-500 mt-1">10:30 · Individual · TCC · 8va sesión</p>
              <div className="mt-3 text-sm text-ink-700">
                <span className="text-ink-500">Última sesión:</span> trabajo en exposiciones graduales para ansiedad social. Tarea pendiente de revisar.
              </div>
              <div className="mt-3 flex items-center gap-2">
                <RiskBadge risk="low" compact />
                <span className="text-[11px] text-ink-500">Adherencia 92%</span>
              </div>
              <div className="mt-4 flex gap-2">
                <button className="flex-1 h-9 rounded-md bg-brand-700 text-primary-foreground text-xs font-medium hover:bg-brand-800">Abrir historia</button>
                <button className="h-9 px-3 rounded-md border border-line-200 bg-surface text-xs text-ink-700 hover:border-brand-400">Notas</button>
              </div>
            </div>

            <div className="rounded-xl border border-risk-high/25 bg-surface p-5">
              <h3 className="font-serif text-base text-ink-900 mb-1">Mi lista de riesgo</h3>
              <p className="text-xs text-ink-500 mb-3">Pacientes a mi cargo</p>
              <ul className="space-y-2.5">
                {myPatientsRisk.map((p) => (
                  <li key={p.id} className="flex items-center justify-between gap-2 text-sm">
                    <span className="text-ink-900 truncate">{p.preferredName ?? p.name}</span>
                    <RiskBadge risk={p.risk} compact />
                  </li>
                ))}
                {myPatientsRisk.length === 0 && <li className="text-xs text-ink-500">Sin pacientes en riesgo activo.</li>}
              </ul>
            </div>

            <div className="rounded-xl border border-line-200 bg-surface p-5">
              <h3 className="font-serif text-base text-ink-900 mb-3">Pendientes</h3>
              <ul className="space-y-2 text-sm">
                <li className="flex items-center justify-between text-ink-700"><span>Notas en borrador</span><span className="tabular text-ink-500">3</span></li>
                <li className="flex items-center justify-between text-ink-700"><span>Tests por calificar</span><span className="tabular text-ink-500">4</span></li>
                <li className="flex items-center justify-between text-ink-700"><span>Planes que vencen</span><span className="tabular text-ink-500">2</span></li>
                <li className="flex items-center justify-between text-ink-700"><span>Documentos por firmar</span><span className="tabular text-ink-500">1</span></li>
              </ul>
            </div>
          </div>
        </section>
      </div>
    </AppShell>
  );
}
