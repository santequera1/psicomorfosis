import { Link, useRouterState } from "@tanstack/react-router";
import { Search, Bell, ChevronDown, Building2, MessageSquareWarning } from "lucide-react";
import { SEDES } from "@/lib/mock-data";

const ROUTE_LABELS: Record<string, string> = {
  "/": "Inicio",
  "/agenda": "Agenda",
  "/pacientes": "Pacientes",
  "/historia": "Historia clínica",
  "/tests": "Tests psicométricos",
  "/prescripcion": "Prescripción",
  "/documentos": "Documentos",
  "/mensajes": "Mensajes",
  "/facturacion": "Facturación",
  "/reportes": "Reportes",
  "/configuracion": "Configuración",
};

export function Topbar() {
  const { location } = useRouterState();
  const label = ROUTE_LABELS[location.pathname] ?? "Psicomorfosis";

  return (
    <header className="sticky top-0 z-30 h-16 bg-surface/85 backdrop-blur border-b border-line-100">
      <div className="h-full px-6 flex items-center gap-4">
        <nav className="flex items-center gap-2 text-sm text-ink-500">
          <Link to="/" className="hover:text-ink-900">Psicomorfosis</Link>
          <span className="text-ink-300">/</span>
          <span className="text-ink-900 font-medium">{label}</span>
        </nav>

        <div className="flex-1 max-w-xl mx-auto">
          <button className="w-full h-10 flex items-center gap-2 px-3.5 rounded-lg border border-line-200 bg-bg-100/60 text-ink-400 text-sm hover:border-brand-400 hover:text-ink-700 transition-colors">
            <Search className="h-4 w-4" />
            <span className="flex-1 text-left">Buscar paciente, cita, documento…</span>
            <kbd className="text-[11px] px-1.5 py-0.5 rounded border border-line-200 bg-surface text-ink-500 tabular">⌘K</kbd>
          </button>
        </div>

        <button className="hidden md:flex items-center gap-2 h-10 px-3 rounded-lg border border-line-200 bg-surface text-ink-700 text-sm hover:border-brand-400">
          <Building2 className="h-4 w-4 text-ink-400" />
          <span>{SEDES[0]}</span>
          <ChevronDown className="h-4 w-4 text-ink-400" />
        </button>

        <button className="relative h-10 w-10 rounded-lg border border-line-200 bg-surface text-ink-700 hover:border-brand-400 flex items-center justify-center" aria-label="Protocolo de crisis">
          <MessageSquareWarning className="h-4 w-4 text-risk-high" />
        </button>

        <button className="relative h-10 w-10 rounded-lg border border-line-200 bg-surface text-ink-700 hover:border-brand-400 flex items-center justify-center" aria-label="Notificaciones">
          <Bell className="h-4 w-4" />
          <span className="absolute top-2 right-2 h-2 w-2 rounded-full bg-risk-high ring-2 ring-surface" />
        </button>

        <div className="h-10 w-10 rounded-full bg-brand-100 text-brand-800 flex items-center justify-center text-sm font-semibold border border-line-200">
          LM
        </div>
      </div>
    </header>
  );
}
