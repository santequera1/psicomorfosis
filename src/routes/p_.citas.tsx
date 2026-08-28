import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Calendar, MapPin, Video, Clock, Loader2, AlertCircle, RefreshCw, CalendarClock, XCircle, X } from "lucide-react";
import { PortalShell } from "@/components/portal/PortalShell";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/p_/citas")({
  head: () => ({ meta: [{ title: "Mis citas · Mi portal" }] }),
  component: PortalAppointments,
});

const STATUS_STYLE: Record<string, { label: string; bg: string }> = {
  confirmada:  { label: "Confirmada",  bg: "bg-sage-200/40 text-sage-700" },
  pendiente:   { label: "Programada", bg: "bg-brand-50 text-brand-700" },
  solicitada:  { label: "Por confirmar", bg: "bg-warning-soft text-risk-moderate" },
  en_curso:    { label: "En curso",    bg: "bg-brand-50 text-brand-700" },
  atendida:    { label: "Atendida",    bg: "bg-bg-100 text-ink-500" },
  cancelada:   { label: "Cancelada",   bg: "bg-rose-500/10 text-rose-700" },
};

function PortalAppointments() {
  const { data: appointments = [], isLoading, isError, refetch } = useQuery({
    queryKey: ["portal-appointments"],
    queryFn: () => api.portalAppointments(),
  });

  const today = (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; })();
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

      {isError && (
        <div className="rounded-2xl border border-rose-500/20 bg-rose-50/40 p-8 text-center">
          <AlertCircle className="h-8 w-8 mx-auto text-rose-600 mb-3" />
          <p className="text-sm text-ink-900 font-medium">No pudimos cargar tus citas</p>
          <p className="text-xs text-ink-500 mt-1 mb-4">Verifica tu conexión e inténtalo de nuevo.</p>
          <button
            onClick={() => refetch()}
            className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg bg-brand-700 text-white text-sm font-medium hover:bg-brand-800"
          >
            <RefreshCw className="h-3.5 w-3.5" /> Reintentar
          </button>
        </div>
      )}

      {!isLoading && !isError && appointments.length === 0 && (
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
  const [resched, setResched] = useState(false);
  const [cancelling, setCancelling] = useState(false);
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
            {appt.modality === "tele" || appt.modality === "virtual" ? (
              appt.meeting_url && !past ? (
                <a href={appt.meeting_url} target="_blank" rel="noreferrer noopener"
                   className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-full bg-brand-700 text-white text-[11px] font-medium hover:bg-brand-800">
                  <Video className="h-3 w-3" /> Unirme a la videollamada
                </a>
              ) : (
                <span className="inline-flex items-center gap-1.5"><Video className="h-3 w-3" /> Videollamada</span>
              )
            ) : appt.sede_name ? (
              <span className="inline-flex items-center gap-1.5"><MapPin className="h-3 w-3" /> {appt.sede_name}</span>
            ) : null}
          </div>
          {appt.professional_name && (
            <p className="text-xs text-ink-700 mt-1.5">Con {appt.professional_name}</p>
          )}
          {appt.status === "solicitada" && !past && (
            <p className="text-xs text-risk-moderate mt-1.5">Pendiente de que tu psicólogo/a confirme este horario.</p>
          )}
          {!past && EDITABLE.has(appt.status) && (
            <div className="flex flex-wrap items-center gap-2 mt-3">
              <button
                type="button"
                onClick={() => setResched(true)}
                className="inline-flex items-center gap-1.5 h-8 px-3 rounded-full border border-line-200 text-xs text-ink-700 hover:border-brand-400 hover:text-ink-900"
              >
                <CalendarClock className="h-3.5 w-3.5" /> Cambiar hora
              </button>
              <button
                type="button"
                onClick={() => setCancelling(true)}
                className="inline-flex items-center gap-1.5 h-8 px-3 rounded-full border border-line-200 text-xs text-rose-700 hover:border-rose-400 hover:bg-rose-500/5"
              >
                <XCircle className="h-3.5 w-3.5" /> Cancelar
              </button>
            </div>
          )}
        </div>
      </div>
      {resched && <RescheduleSheet appt={appt} onClose={() => setResched(false)} />}
      {cancelling && <CancelSheet appt={appt} onClose={() => setCancelling(false)} />}
    </li>
  );
}

// Citas que el paciente puede mover o cancelar desde el portal.
const EDITABLE = new Set(["pendiente", "confirmada", "solicitada"]);

function fmtDay(iso: string) {
  const d = new Date(`${iso}T00:00:00`);
  return d.toLocaleDateString("es-CO", { weekday: "long", day: "numeric", month: "long" });
}
function fmtTime(t: string) {
  const [h, m] = t.split(":").map(Number);
  const suffix = h >= 12 ? "p. m." : "a. m.";
  const hh = h % 12 === 0 ? 12 : h % 12;
  return `${hh}:${String(m).padStart(2, "0")} ${suffix}`;
}

/** Hoja simple a pantalla completa en móvil / centrada en escritorio. */
function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-ink-900/40 p-0 sm:p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        className="w-full sm:max-w-md max-h-[90vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl bg-surface shadow-modal"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-line-100">
          <h3 className="font-serif text-lg text-ink-900">{title}</h3>
          <button type="button" onClick={onClose} className="h-8 w-8 rounded-full inline-flex items-center justify-center text-ink-500 hover:bg-bg-100" aria-label="Cerrar">
            <X className="h-4 w-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function RescheduleSheet({ appt, onClose }: { appt: any; onClose: () => void }) {
  const qc = useQueryClient();
  const [pick, setPick] = useState<{ date: string; time: string } | null>(null);
  const { data, isLoading } = useQuery({
    queryKey: ["portal-availability", appt.id],
    queryFn: () => api.portalAppointmentAvailability(appt.id),
  });
  const mu = useMutation({
    mutationFn: () => api.portalRescheduleAppointment(appt.id, pick as { date: string; time: string }),
    onSuccess: () => {
      toast.success("Listo: tu psicólogo/a recibió la solicitud y te confirmará el nuevo horario.");
      qc.invalidateQueries({ queryKey: ["portal-appointments"] });
      onClose();
    },
    onError: (e: any) => toast.error(e?.message ?? "No pudimos cambiar la hora"),
  });
  return (
    <Sheet title="Cambiar hora" onClose={onClose}>
      <div className="p-5 space-y-4">
        <p className="text-xs text-ink-600 leading-relaxed">
          Tu cita actual: <span className="font-medium text-ink-900 capitalize">{fmtDay(appt.date)} · {fmtTime(appt.time)}</span>.
          Elige otro horario; quedará <strong>por confirmar</strong> hasta que tu psicólogo/a lo apruebe.
        </p>
        {isLoading ? (
          <p className="text-sm text-ink-500 py-6 text-center"><Loader2 className="h-4 w-4 inline animate-spin mr-1" /> Buscando horarios…</p>
        ) : !data || data.days.length === 0 ? (
          <p className="text-sm text-ink-500 py-6 text-center">No hay horarios libres en las próximas semanas. Escríbele a tu psicólogo/a.</p>
        ) : (
          <div className="space-y-3 max-h-[46vh] overflow-y-auto pr-1">
            {data.days.map((d) => (
              <div key={d.date}>
                <p className="text-[11px] uppercase tracking-wider text-ink-500 font-medium capitalize mb-1.5">{fmtDay(d.date)}</p>
                <div className="flex flex-wrap gap-1.5">
                  {d.slots.map((t) => {
                    const active = pick?.date === d.date && pick?.time === t;
                    return (
                      <button
                        key={t}
                        type="button"
                        onClick={() => setPick({ date: d.date, time: t })}
                        className={cn(
                          "h-8 px-3 rounded-full border text-xs transition-colors",
                          active ? "bg-brand-700 border-brand-700 text-white" : "border-line-200 text-ink-700 hover:border-brand-400",
                        )}
                      >
                        {fmtTime(t)}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
        <button
          type="button"
          disabled={!pick || mu.isPending}
          onClick={() => mu.mutate()}
          className="w-full h-11 rounded-lg bg-brand-700 text-white text-sm font-medium hover:bg-brand-800 disabled:opacity-50 inline-flex items-center justify-center gap-2"
        >
          {mu.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
          {pick ? `Pedir ${fmtDay(pick.date)} · ${fmtTime(pick.time)}` : "Elige un horario"}
        </button>
      </div>
    </Sheet>
  );
}

function CancelSheet({ appt, onClose }: { appt: any; onClose: () => void }) {
  const qc = useQueryClient();
  const mu = useMutation({
    mutationFn: () => api.portalCancelAppointment(appt.id),
    onSuccess: () => {
      toast.success("Cita cancelada. Le avisamos a tu psicólogo/a.");
      qc.invalidateQueries({ queryKey: ["portal-appointments"] });
      onClose();
    },
    onError: (e: any) => toast.error(e?.message ?? "No pudimos cancelar"),
  });
  return (
    <Sheet title="Cancelar cita" onClose={onClose}>
      <div className="p-5 space-y-4">
        <p className="text-sm text-ink-700 leading-relaxed">
          ¿Cancelar la cita del <span className="font-medium capitalize">{fmtDay(appt.date)} · {fmtTime(appt.time)}</span>?
          Tu psicólogo/a recibirá el aviso. Si solo quieres otra hora, usa <strong>Cambiar hora</strong>.
        </p>
        <div className="flex gap-2">
          <button type="button" onClick={onClose} className="flex-1 h-11 rounded-lg border border-line-200 text-sm text-ink-700 hover:border-brand-400">Volver</button>
          <button
            type="button"
            disabled={mu.isPending}
            onClick={() => mu.mutate()}
            className="flex-1 h-11 rounded-lg bg-rose-600 text-white text-sm font-medium hover:bg-rose-700 disabled:opacity-50 inline-flex items-center justify-center gap-2"
          >
            {mu.isPending && <Loader2 className="h-4 w-4 animate-spin" />} Sí, cancelar
          </button>
        </div>
      </div>
    </Sheet>
  );
}
