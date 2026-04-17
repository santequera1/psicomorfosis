import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app/AppShell";
import { PATIENTS } from "@/lib/mock-data";
import { RiskBadge } from "@/components/app/RiskBadge";
import { Search, Filter, Download, Plus, MoreHorizontal, Tag } from "lucide-react";

export const Route = createFileRoute("/pacientes")({
  head: () => ({
    meta: [
      { title: "Pacientes · Psicomorfosis" },
      { name: "description", content: "Listado de pacientes activos de la clínica." },
    ],
  }),
  component: PatientsPage,
});

const STATUS_STYLE: Record<string, string> = {
  activo:   "bg-success-soft text-success",
  pausa:    "bg-warning-soft text-risk-moderate",
  alta:     "bg-brand-100 text-brand-800",
  derivado: "bg-lavender-100 text-lavender-500",
};

const MODALITY_LABEL: Record<string, string> = {
  individual: "Individual",
  pareja: "Pareja",
  familiar: "Familiar",
  grupal: "Grupal",
  tele: "Telepsicología",
};

function initials(name: string) {
  return name.split(" ").filter(Boolean).slice(0, 2).map((n) => n[0]).join("").toUpperCase();
}
function avatarTone(name: string) {
  const tones = ["bg-brand-100 text-brand-800", "bg-sage-200 text-sage-700", "bg-lavender-100 text-lavender-500", "bg-warning-soft text-risk-moderate"];
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) % tones.length;
  return tones[h];
}

function PatientsPage() {
  return (
    <AppShell>
      <div className="space-y-6">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm text-ink-500">Sede Chapinero · {PATIENTS.length} pacientes</p>
            <h1 className="font-serif text-[32px] leading-tight text-ink-900 mt-1">Pacientes</h1>
          </div>
          <div className="flex gap-2">
            <button className="h-10 px-3 rounded-lg border border-line-200 bg-surface text-ink-700 text-sm hover:border-brand-400 inline-flex items-center gap-2">
              <Download className="h-4 w-4" /> Exportar
            </button>
            <button className="h-10 px-4 rounded-lg bg-brand-700 text-primary-foreground text-sm font-medium hover:bg-brand-800 inline-flex items-center gap-2">
              <Plus className="h-4 w-4" /> Nuevo paciente
            </button>
          </div>
        </header>

        <div className="rounded-xl border border-line-200 bg-surface">
          <div className="p-4 flex flex-wrap items-center gap-2 border-b border-line-100">
            <div className="flex-1 min-w-[260px] flex items-center gap-2 h-10 px-3 rounded-md border border-line-200 bg-bg-100/50">
              <Search className="h-4 w-4 text-ink-400" />
              <input
                placeholder="Buscar por nombre, documento o motivo de consulta…"
                className="flex-1 bg-transparent text-sm text-ink-900 placeholder:text-ink-400 outline-none"
              />
            </div>
            {[
              { l: "Estado: Activo" },
              { l: "Profesional" },
              { l: "Modalidad" },
              { l: "Bandera de riesgo" },
              { l: "EPS" },
            ].map((f) => (
              <button key={f.l} className="h-10 px-3 rounded-md border border-line-200 bg-surface text-xs text-ink-700 hover:border-brand-400 inline-flex items-center gap-1.5">
                <Filter className="h-3.5 w-3.5 text-ink-400" /> {f.l}
              </button>
            ))}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-[0.08em] text-ink-500 bg-bg-100/50 border-b border-line-100">
                  <th className="px-5 py-3 font-medium">Paciente</th>
                  <th className="px-3 py-3 font-medium">Edad</th>
                  <th className="px-3 py-3 font-medium">Motivo</th>
                  <th className="px-3 py-3 font-medium">Profesional</th>
                  <th className="px-3 py-3 font-medium">Modalidad</th>
                  <th className="px-3 py-3 font-medium">Estado</th>
                  <th className="px-3 py-3 font-medium">Bandera</th>
                  <th className="px-3 py-3 font-medium">Próxima sesión</th>
                  <th className="px-3 py-3 font-medium w-10"></th>
                </tr>
              </thead>
              <tbody>
                {PATIENTS.map((p) => (
                  <tr key={p.id} className="border-b border-line-100 last:border-0 hover:bg-brand-50/60 transition-colors">
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-3">
                        <div className={`h-9 w-9 rounded-full flex items-center justify-center text-xs font-semibold ${avatarTone(p.name)}`}>
                          {initials(p.preferredName ?? p.name)}
                        </div>
                        <div className="min-w-0">
                          <div className="text-ink-900 font-medium truncate flex items-center gap-1.5">
                            {p.preferredName ?? p.name}
                            {p.preferredName && <span className="text-[10px] text-ink-400 font-normal">({p.pronouns})</span>}
                          </div>
                          <div className="text-[11px] text-ink-500 truncate tabular">{p.doc} · {p.id}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-3.5 text-ink-700 tabular">{p.age || "—"}</td>
                    <td className="px-3 py-3.5 text-ink-700 max-w-[220px] truncate">{p.reason}</td>
                    <td className="px-3 py-3.5 text-ink-700">{p.professional}</td>
                    <td className="px-3 py-3.5 text-ink-700">{MODALITY_LABEL[p.modality]}</td>
                    <td className="px-3 py-3.5">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium capitalize ${STATUS_STYLE[p.status]}`}>
                        {p.status}
                      </span>
                    </td>
                    <td className="px-3 py-3.5"><RiskBadge risk={p.risk} compact /></td>
                    <td className="px-3 py-3.5 text-ink-700 tabular">{p.nextSession ?? <span className="text-ink-400">—</span>}</td>
                    <td className="px-3 py-3.5">
                      <button className="h-7 w-7 rounded-md hover:bg-bg-100 text-ink-500 inline-flex items-center justify-center">
                        <MoreHorizontal className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="px-5 py-3 flex items-center justify-between text-xs text-ink-500 border-t border-line-100">
            <div className="flex items-center gap-2">
              <Tag className="h-3.5 w-3.5" />
              Mostrando {PATIENTS.length} de {PATIENTS.length}
            </div>
            <div className="flex items-center gap-1">
              <button className="px-2 py-1 rounded hover:bg-bg-100">Anterior</button>
              <span className="px-2 py-1 rounded bg-brand-100 text-brand-800 font-medium tabular">1</span>
              <button className="px-2 py-1 rounded hover:bg-bg-100">Siguiente</button>
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
