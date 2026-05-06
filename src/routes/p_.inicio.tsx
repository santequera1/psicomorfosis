import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Calendar, ListChecks, FileText, ChevronRight, Sparkles } from "lucide-react";
import { PortalShell } from "@/components/portal/PortalShell";
import { api } from "@/lib/api";

export const Route = createFileRoute("/p_/inicio")({
  head: () => ({ meta: [{ title: "Inicio · Mi portal" }] }),
  component: PortalHome,
});

function PortalHome() {
  const { data: me } = useQuery({ queryKey: ["portal-me"], queryFn: () => api.portalMe() });
  const { data: appointments = [] } = useQuery({ queryKey: ["portal-appointments"], queryFn: () => api.portalAppointments() });
  const { data: tasks = [] } = useQuery({ queryKey: ["portal-tasks"], queryFn: () => api.portalTasks() });
  const { data: docs = [] } = useQuery({ queryKey: ["portal-documents"], queryFn: () => api.portalDocuments() });

  const today = new Date().toISOString().slice(0, 10);
  const upcoming = appointments.filter((a) => a.date >= today && a.status !== "cancelada").slice(0, 1)[0];
  const pendingTasks = tasks.filter((t) => t.status !== "completada").length;
  const pendingDocs = docs.filter((d) => d.status === "pendiente_firma").length;

  // Trim + ?? para tratar preferredName="" como "no hay apodo" y caer
  // al primer nombre. El form de paciente guarda "" cuando se borra.
  const trimmedPreferred = me?.patient?.preferredName?.trim();
  const firstName = (trimmedPreferred && trimmedPreferred.length > 0)
    ? trimmedPreferred
    : (me?.patient?.name?.split(" ")[0] ?? "");

  return (
    <PortalShell>
      <section className="mb-8">
        <p className="text-sm text-ink-500">{getGreeting()}{firstName ? `, ${firstName}` : ""}.</p>
        <h1 className="font-serif text-3xl sm:text-4xl text-ink-900 mt-1 leading-tight">
          Tu espacio terapéutico
        </h1>
        {me?.professional && (
          <p className="text-sm text-ink-500 mt-3">
            Acompañado por <span className="text-ink-900 font-medium">{me.professional.name}</span>
            {me.professional.title ? ` · ${me.professional.title}` : ""}
          </p>
        )}
      </section>

      {/* Próxima cita destacada */}
      {upcoming && (
        <section className="mb-6 rounded-2xl bg-linear-to-br from-brand-700 to-brand-600 p-6 sm:p-8 text-white shadow-card">
          <div className="flex items-start gap-4">
            <div className="h-12 w-12 rounded-xl bg-white/15 flex items-center justify-center shrink-0">
              <Calendar className="h-5 w-5" />
            </div>
            <div className="flex-1">
              <p className="text-xs uppercase tracking-widest text-white/70 font-medium">Tu próxima cita</p>
              <h2 className="font-serif text-2xl mt-1">
                {new Date(upcoming.date).toLocaleDateString("es-CO", { weekday: "long", day: "numeric", month: "long" })}
              </h2>
              <p className="text-sm text-white/85 mt-1">
                {upcoming.time}{upcoming.duration_min ? ` · ${upcoming.duration_min} min` : ""}
                {upcoming.modality === "tele" ? " · Telepsicología" : upcoming.sede_name ? ` · ${upcoming.sede_name}` : ""}
              </p>
              <Link to="/p/citas" className="inline-flex items-center gap-1 text-sm text-white/90 hover:text-white mt-3">
                Ver detalles <ChevronRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </section>
      )}

      {/* Cards de acceso rápido */}
      <section className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-8">
        <QuickCard
          to="/p/tareas"
          icon={<ListChecks className="h-5 w-5" />}
          label="Tareas"
          count={pendingTasks}
          countLabel={pendingTasks === 1 ? "pendiente" : "pendientes"}
          empty="Sin tareas pendientes"
        />
        <QuickCard
          to="/p/documentos"
          icon={<FileText className="h-5 w-5" />}
          label="Documentos"
          count={pendingDocs > 0 ? pendingDocs : docs.length}
          countLabel={pendingDocs > 0 ? (pendingDocs === 1 ? "por firmar" : "por firmar") : "compartido(s)"}
          empty="Aún sin documentos"
        />
        <QuickCard
          to="/p/citas"
          icon={<Calendar className="h-5 w-5" />}
          label="Mis citas"
          count={appointments.filter((a) => a.date >= today).length}
          countLabel="próxima(s)"
          empty="Sin citas agendadas"
        />
      </section>

      {/* Frase calmada */}
      <section className="rounded-xl border border-line-200 bg-surface p-5 flex items-start gap-3">
        <Sparkles className="h-5 w-5 text-brand-700 mt-0.5 shrink-0" />
        <div>
          <p className="text-sm text-ink-700 leading-relaxed">
            Este es tu espacio. Tu información está protegida y solo tú y tu psicóloga pueden verla.
            Si tienes una urgencia fuera de tu sesión, recuerda que la línea oficial 24/7 en Bogotá es <strong>106</strong> y la línea nacional de emergencias es <strong>123</strong>.
          </p>
        </div>
      </section>
    </PortalShell>
  );
}

function QuickCard({ to, icon, label, count, countLabel, empty }: { to: string; icon: React.ReactNode; label: string; count: number; countLabel: string; empty: string }) {
  return (
    <Link
      to={to}
      className="rounded-xl border border-line-200 bg-surface p-5 hover:border-brand-400 hover:shadow-soft transition-all group"
    >
      <div className="h-10 w-10 rounded-lg bg-brand-50 text-brand-700 flex items-center justify-center mb-3">
        {icon}
      </div>
      {count > 0 ? (
        <>
          <div className="text-2xl font-serif text-ink-900 leading-none tabular">{count}</div>
          <div className="text-xs text-ink-500 mt-1">{label} {countLabel}</div>
        </>
      ) : (
        <>
          <div className="text-sm font-medium text-ink-900">{label}</div>
          <div className="text-xs text-ink-400 mt-1">{empty}</div>
        </>
      )}
    </Link>
  );
}

function getGreeting() {
  const h = new Date().getHours();
  if (h < 6) return "Buenas noches";
  if (h < 12) return "Buenos días";
  if (h < 19) return "Buenas tardes";
  return "Buenas noches";
}
