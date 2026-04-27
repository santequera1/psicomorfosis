import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Calendar, MapPin, Video, Clock, Loader2 } from "lucide-react";
import { PortalShell } from "@/components/portal/PortalShell";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/p_/citas")({
  head: () => ({ meta: [{ title: "Mis citas · Mi portal" }] }),
  component: PortalAppointments,
});

const STATUS_STYLE: Record<string, { label: string; bg: string }> = {
  confirmada:  { label: "Confirmada",  bg: "bg-sage-200/40 text-sage-700" },
  pendiente:   { label: "Por confirmar", bg: "bg-warning-soft text-risk-moderate" },
  en_curso:    { label: "En curso",    bg: "bg-brand-50 text-brand-700" },
  atendida:    { label: "Atendida",    bg: "bg-bg-100 text-ink-500" },
  cancelada:   { label: "Cancelada",   bg: "bg-rose-500/10 text-rose-700" },
};

function PortalAppointments() {
  const { data: appointments = [], isLoading } = useQuery({
    queryKey: ["portal-appointments"],
    queryFn: () => api.portalAppointments(),
  });

  const today = new Date().toISOString().slice(0, 10);
  const upcoming = appointments.filter((a) => a.date >= today);
  const past = appointments.filter((a) => a.date < today);

  return (
    <PortalShell>
      <header className="mb-8">
        <p className="text-xs uppercase tracking-widest text-brand-700 font-semibold">Tu agenda</p>
        <h1 className="font-serif text-3xl text-ink-900 mt-1">Mis citas</h1>
        <p className="text-sm text-ink-500 mt-2">Aquí ves tus citas próximas y el historial de las atendidas.</p>
      </header>

      {isLoading && (
        <div className="text-center py-10 text-ink-500"><Loader2 className="h-5 w-5 mx-auto animate-spin" /></div>
      )}

      {!isLoading && appointments.length === 0 && (
        <div className="rounded-2xl border border-dashed border-line-200 bg-surface p-12 text-center">
          <Calendar className="h-8 w-8 mx-auto text-ink-300 mb-3" />
          <p className="text-sm text-ink-500">Aún no tienes citas agendadas.</p>
          <p className="text-xs text-ink-400 mt-1">Tu psicóloga te avisará cuando programe la próxima.</p>
        </div>
      )}

      {upcoming.length > 0 && (
        <section className="mb-8">
          <h2 className="font-serif text-lg text-ink-900 mb-3">Próximas</h2>
          <ul className="space-y-2">
            {upcoming.map((a) => <AppointmentRow key={a.id} appt={a} />)}
          </ul>
        </section>
      )}

      {past.length > 0 && (
        <section>
          <h2 className="font-serif text-lg text-ink-900 mb-3">Historial</h2>
          <ul className="space-y-2">
            {past.slice(0, 20).map((a) => <AppointmentRow key={a.id} appt={a} past />)}
          </ul>
        </section>
      )}
    </PortalShell>
  );
}

function AppointmentRow({ appt, past }: { appt: any; past?: boolean }) {
  const status = STATUS_STYLE[appt.status] ?? STATUS_STYLE.confirmada;
  const dateStr = new Date(appt.date).toLocaleDateString("es-CO", { weekday: "short", day: "numeric", month: "short", year: appt.date.slice(0, 4) !== String(new Date().getFullYear()) ? "numeric" : undefined });

  return (
    <li className={cn(
      "rounded-xl border bg-surface p-4 sm:p-5 transition-shadow",
      past ? "border-line-100 opacity-75" : "border-line-200 hover:shadow-soft"
    )}>
      <div className="flex items-start gap-4">
        <div className={cn(
          "h-12 w-12 rounded-lg flex flex-col items-center justify-center shrink-0 text-center",
          past ? "bg-bg-100 text-ink-500" : "bg-brand-50 text-brand-700"
        )}>
          <span className="text-[10px] uppercase tracking-wider leading-none">{new Date(appt.date).toLocaleDateString("es-CO", { month: "short" })}</span>
          <span className="font-serif text-lg leading-none mt-0.5">{new Date(appt.date).getDate()}</span>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-serif text-base text-ink-900 capitalize">{dateStr}</h3>
            <span className={cn("text-[10px] uppercase tracking-widest px-2 py-0.5 rounded-full font-medium", status.bg)}>
              {status.label}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-500 mt-1.5">
            <span className="inline-flex items-center gap-1.5"><Clock className="h-3 w-3" /> {appt.time}{appt.duration_min ? ` · ${appt.duration_min} min` : ""}</span>
            {appt.modality === "tele" ? (
              <span className="inline-flex items-center gap-1.5"><Video className="h-3 w-3" /> Telepsicología</span>
            ) : appt.sede_name ? (
              <span className="inline-flex items-center gap-1.5"><MapPin className="h-3 w-3" /> {appt.sede_name}</span>
            ) : null}
          </div>
          {appt.professional_name && (
            <p className="text-xs text-ink-700 mt-1.5">Con {appt.professional_name}</p>
          )}
        </div>
      </div>
    </li>
  );
}
