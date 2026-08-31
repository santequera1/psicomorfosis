import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import {
  MapPin, Instagram, Facebook, Youtube, Linkedin, Calendar, ChevronLeft, ChevronRight, X, Video,
  Building2, Check, Loader2, ArrowRight, Sparkles, ExternalLink,
} from "lucide-react";
import { easeOutExpo } from "@/components/landing/motion";
import { bgByKey } from "@/lib/public-profile";
import { Calendar as CalendarPicker } from "@/components/ui/calendar";
import { es } from "date-fns/locale";
import { VoiceRecorderButton } from "@/components/app/VoiceRecorderButton";

const isoOf = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** Transcripción para visitantes (sin sesión): endpoint público con límite por conexión. */
async function publicTranscribe(audio: Blob): Promise<{ success: true; text: string } | { success: false; error: string }> {
  try {
    const fd = new FormData();
    fd.append("audio", audio, "audio.webm");
    const r = await fetch("/api/public/voice/transcribe", { method: "POST", body: fd });
    const j = await r.json().catch(() => null);
    if (r.ok && j?.success) return { success: true, text: String(j.text ?? "") };
    return { success: false, error: j?.error ?? "No pudimos transcribir el audio. Escríbelo, sin afán." };
  } catch {
    return { success: false, error: "Sin conexión para transcribir. Escríbelo, sin afán." };
  }
}

/** lucide no trae logos de TikTok; SVG oficial simplificado. */
function TikTokIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <path d="M16.6 5.82A4.28 4.28 0 0 1 15.54 3h-3.09v12.4a2.59 2.59 0 0 1-2.59 2.5 2.59 2.59 0 0 1-2.59-2.59 2.59 2.59 0 0 1 3.4-2.46V9.7a5.73 5.73 0 0 0-.81-.06A5.66 5.66 0 0 0 4.2 15.3 5.66 5.66 0 0 0 9.86 21a5.66 5.66 0 0 0 5.66-5.66V9.01a7.35 7.35 0 0 0 4.28 1.37V7.3a4.27 4.27 0 0 1-3.2-1.48z" />
    </svg>
  );
}

/**
 * Perfil público tipo linktree por profesional + wizard de reserva.
 *
 * Mobile-first (la referencia competitiva es psicora.ar). El wizard son
 * 4 pasos como el de ellos — con la diferencia de que los slots salen de
 * la agenda REAL del profesional y la solicitud dispara aviso inmediato
 * al psicólogo por WhatsApp (Laura). La cita queda 'solicitada' hasta
 * que el profesional la confirme desde su agenda.
 */

export const Route = createFileRoute("/perfil_/$slug")({
  head: ({ params }) => ({
    meta: [
      { title: `Reservar cita · ${params.slug} · Psicomorfosis` },
      { name: "robots", content: "index,follow" },
    ],
  }),
  component: PerfilPublico,
});

/* ─── API pública (sin auth) ────────────────────────────────────────────── */
type PublicProfile = {
  slug: string; name: string; title: string | null; bio: string;
  photo_url: string | null; location: string | null; instagram: string | null;
  areas: string[]; whatsapp: string | null;
  links: Array<{ label: string; url: string }>;
  socials: Partial<Record<"instagram" | "tiktok" | "facebook" | "youtube" | "linkedin", string | null>>;
  bg: string | null;
};
type Availability = { days: Array<{ date: string; slots: string[] }>; duration_min: number };

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((body as any)?.error ?? "Error de red");
  return body as T;
}

/* ─── Página ────────────────────────────────────────────────────────────── */
function PerfilPublico() {
  const { slug } = Route.useParams();
  const [wizardOpen, setWizardOpen] = useState(false);

  // Tema claro fijo, igual que las landings públicas.
  useEffect(() => {
    const root = document.documentElement;
    const prev = { dark: root.classList.contains("dark"), mode: root.getAttribute("data-mode"), theme: root.getAttribute("data-theme") };
    root.classList.remove("dark");
    root.setAttribute("data-mode", "light");
    root.setAttribute("data-theme", "clinico");
    return () => {
      if (prev.dark) root.classList.add("dark");
      if (prev.mode) root.setAttribute("data-mode", prev.mode); else root.removeAttribute("data-mode");
      if (prev.theme) root.setAttribute("data-theme", prev.theme); else root.removeAttribute("data-theme");
    };
  }, []);

  const { data: profile, isLoading, error } = useQuery({
    queryKey: ["public-profile", slug],
    queryFn: () => fetchJson<PublicProfile>(`/api/public/professionals/${slug}`),
    retry: 1,
  });

  if (isLoading) {
    return (
      <div className="min-h-[100svh] bg-bg-50 flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-brand-700" />
      </div>
    );
  }
  if (error || !profile) {
    return (
      <div className="min-h-[100svh] bg-bg-50 flex flex-col items-center justify-center gap-3 text-center px-6">
        <p className="font-serif text-2xl text-ink-900">Perfil no encontrado</p>
        <p className="text-sm text-ink-500">El enlace puede estar mal escrito o el perfil ya no está disponible.</p>
      </div>
    );
  }

  const wa = profile.whatsapp
    ? `https://wa.me/${profile.whatsapp}?text=${encodeURIComponent(`Hola ${profile.name.split(" ")[0]}, vi tu perfil y me gustaría más información`)}`
    : null;

  return (
    <div className="min-h-[100svh] bg-bg-50 text-ink-900 relative overflow-x-clip">
      {/* Fondo elegido en Configuración → Perfil público (catálogo en
          src/lib/public-profile.ts). Por defecto, los washes de marca. */}
      <div
        aria-hidden
        className="absolute inset-0 -z-10"
        style={{ background: bgByKey(profile.bg).css }}
      />

      <main className="max-w-md mx-auto px-5 pt-12 pb-10 flex flex-col items-center text-center">
        {/* Foto */}
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.7, ease: easeOutExpo }}
          className="relative"
        >
          <div className="h-28 w-28 rounded-full overflow-hidden ring-4 ring-surface shadow-card">
            {profile.photo_url
              ? <img src={profile.photo_url} alt={profile.name} className="h-full w-full object-cover object-top" />
              : <div className="h-full w-full bg-brand-100 flex items-center justify-center font-serif text-3xl text-brand-800">{profile.name[0]}</div>}
          </div>
          <span className="absolute bottom-1 right-1 h-6 w-6 rounded-full bg-brand-700 ring-2 ring-surface flex items-center justify-center">
            <Check className="h-3.5 w-3.5 text-white" />
          </span>
        </motion.div>

        {/* Identidad */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: easeOutExpo, delay: 0.15 }}
        >
          <h1 className="mt-4 font-serif text-2xl">{profile.name}</h1>
          {profile.title && <p className="text-sm text-brand-800 font-medium mt-0.5">{profile.title}</p>}
          {profile.bio && <p className="mt-3 text-sm text-ink-500 leading-relaxed">{profile.bio}</p>}
        </motion.div>

        {/* Áreas */}
        {profile.areas.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: easeOutExpo, delay: 0.25 }}
            className="mt-4 flex flex-wrap justify-center gap-1.5"
          >
            {profile.areas.map((a) => (
              <span key={a} className="text-xs px-3 py-1 rounded-full bg-brand-50 border border-brand-100 text-brand-800">{a}</span>
            ))}
          </motion.div>
        )}

        {/* Ubicación */}
        {profile.location && (
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.35 }}
            className="mt-3 inline-flex items-center gap-1.5 text-xs text-ink-500 bg-surface border border-line-200 rounded-full px-3 py-1"
          >
            <MapPin className="h-3 w-3" /> {profile.location}
          </motion.p>
        )}

        {/* Social */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: easeOutExpo, delay: 0.4 }}
          className="mt-5 flex items-center gap-3"
        >
          {wa && (
            <a href={wa} target="_blank" rel="noreferrer" aria-label="WhatsApp"
               className="h-11 w-11 rounded-full bg-surface border border-line-200 shadow-xs flex items-center justify-center text-[#25D366] hover:border-brand-400 transition-colors">
              <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5" aria-hidden>
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.52.149-.174.198-.298.297-.497.1-.198.05-.371-.025-.52-.074-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z" />
              </svg>
            </a>
          )}
          {([
            ["instagram", "Instagram", <Instagram className="h-5 w-5" />],
            ["tiktok", "TikTok", <TikTokIcon className="h-5 w-5" />],
            ["facebook", "Facebook", <Facebook className="h-5 w-5" />],
            ["youtube", "YouTube", <Youtube className="h-5 w-5" />],
            ["linkedin", "LinkedIn", <Linkedin className="h-5 w-5" />],
          ] as const).map(([key, label, icon]) => {
            const href = profile.socials?.[key];
            if (!href) return null;
            return (
              <a key={key} href={href} target="_blank" rel="noreferrer noopener" aria-label={label}
                 className="h-11 w-11 rounded-full bg-surface border border-line-200 shadow-xs flex items-center justify-center text-ink-700 hover:border-brand-400 transition-colors">
                {icon}
              </a>
            );
          })}
        </motion.div>

        {/* Enlaces libres (web, YouTube, LinkedIn, artículos…) */}
        {(profile.links ?? []).length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: easeOutExpo, delay: 0.45 }}
            className="mt-6 w-full space-y-2"
          >
            {profile.links.map((l) => (
              <a
                key={l.url}
                href={l.url}
                target="_blank"
                rel="noreferrer noopener"
                className="flex items-center justify-between gap-3 w-full h-12 px-4 rounded-2xl bg-surface border border-line-200 shadow-xs text-sm font-medium text-ink-900 hover:border-brand-400 hover:-translate-y-0.5 transition-all"
              >
                <span className="truncate">{l.label}</span>
                <ExternalLink className="h-4 w-4 text-ink-400 shrink-0" />
              </a>
            ))}
          </motion.div>
        )}

        {/* CTA principal */}
        <motion.button
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: easeOutExpo, delay: 0.5 }}
          whileHover={{ y: -2, scale: 1.01 }}
          whileTap={{ scale: 0.98 }}
          onClick={() => setWizardOpen(true)}
          className="mt-7 w-full h-13 py-3.5 rounded-2xl bg-brand-700 text-white text-sm font-semibold hover:bg-brand-800 inline-flex items-center justify-center gap-2 shadow-lg shadow-brand-700/25"
        >
          <Calendar className="h-4 w-4" /> Reservar cita
        </motion.button>
        <p className="mt-2.5 text-[11px] text-ink-400">
          Eliges día y hora de la agenda real — {profile.name.split(" ")[0]} te confirma por WhatsApp.
        </p>
      </main>

      <footer className="pb-8 text-center text-[11px] text-ink-400">
        <a href="/inicio" className="inline-flex items-center gap-1 hover:text-brand-700 transition-colors">
          <Sparkles className="h-3 w-3" /> con tecnología de <strong>Psicomorfosis</strong>
        </a>
      </footer>

      <AnimatePresence>
        {wizardOpen && <BookingWizard profile={profile} onClose={() => setWizardOpen(false)} />}
      </AnimatePresence>
    </div>
  );
}

/* ─── Wizard de reserva — 4 pasos ───────────────────────────────────────── */
const DIAS_CORTOS = ["DOM", "LUN", "MAR", "MIÉ", "JUE", "VIE", "SÁB"];
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

function BookingWizard({ profile, onClose }: { profile: PublicProfile; onClose: () => void }) {
  const [step, setStep] = useState(1);
  const [modality, setModality] = useState<"tele" | "individual" | null>(null);
  const [date, setDate] = useState<string | null>(null);
  const [time, setTime] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", age: "", phone: "", email: "", motivo: "", website: "" });
  // Cierre protegido: el clic fuera ya no cierra (se perdía todo el
  // proceso); la X pregunta si hay algo diligenciado.
  const [confirmClose, setConfirmClose] = useState(false);
  function requestClose() {
    const hasProgress = !!modality || !!date || !!time
      || [form.name, form.age, form.phone, form.email, form.motivo].some((v) => v.trim() !== "");
    if (done || !hasProgress) return onClose();
    setConfirmClose(true);
  }
  const ageNum = Number.parseInt(form.age, 10);
  const ageOk = Number.isInteger(ageNum) && ageNum >= 1 && ageNum <= 120;

  const { data: avail, isLoading: loadingAvail } = useQuery({
    queryKey: ["public-availability", profile.slug],
    queryFn: () => fetchJson<Availability>(`/api/public/professionals/${profile.slug}/availability?days=30`),
    enabled: step === 2,
    staleTime: 60_000,
  });

  const book = useMutation({
    mutationFn: () =>
      fetchJson<{ ok: true; message: string }>(`/api/public/professionals/${profile.slug}/booking`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ modality, date, time, ...form }),
      }),
  });

  const availDates = useMemo(() => new Set((avail?.days ?? []).map((d) => d.date)), [avail]);
  const daySlots = useMemo(
    () => avail?.days.find((d) => d.date === date)?.slots ?? [],
    [avail, date],
  );

  const canContinue =
    step === 1 ? !!modality :
    step === 2 ? !!date && !!time :
    step === 3 ? form.name.trim().length >= 3 && ageOk && form.phone.replace(/\D/g, "").length >= 10 :
    true;

  function fmtDia(iso: string) {
    const d = new Date(`${iso}T12:00:00`);
    return { dow: DIAS_CORTOS[d.getDay()], num: d.getDate() };
  }
  function fmtLargo(iso: string) {
    const d = new Date(`${iso}T12:00:00`);
    return `${DIAS_CORTOS[d.getDay()].toLowerCase()} ${d.getDate()} de ${MESES[d.getMonth()]}`;
  }
  function fmtHora(t: string) {
    const [h, m] = t.split(":").map(Number);
    const ampm = h >= 12 ? "p. m." : "a. m.";
    const h12 = h % 12 === 0 ? 12 : h % 12;
    return `${String(h12).padStart(2, "0")}:${String(m).padStart(2, "0")} ${ampm}`;
  }

  const done = book.isSuccess;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-ink-900/50 backdrop-blur-sm flex items-end sm:items-center justify-center"
    >
      <motion.div
        initial={{ y: "100%", opacity: 0.6 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: "100%", opacity: 0 }}
        transition={{ duration: 0.45, ease: easeOutExpo }}
        onClick={(e) => e.stopPropagation()}
        className="relative w-full sm:max-w-lg bg-surface rounded-t-3xl sm:rounded-3xl shadow-modal max-h-[92svh] overflow-y-auto"
      >
        {/* Header con progreso */}
        <div className="sticky top-0 bg-surface/95 backdrop-blur px-5 pt-4 pb-3 border-b border-line-100 z-10">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs text-ink-500">
              {step > 1 && !done && (
                <button onClick={() => setStep((s) => s - 1)} className="h-8 w-8 -ml-2 rounded-full hover:bg-bg-100 flex items-center justify-center" aria-label="Atrás">
                  <ChevronLeft className="h-4 w-4" />
                </button>
              )}
              {!done && <span className="font-medium">Paso {step} de 4</span>}
            </div>
            <button onClick={requestClose} className="h-9 w-9 rounded-full bg-bg-100 hover:bg-bg-200 text-ink-500 flex items-center justify-center" aria-label="Cerrar">
              <X className="h-4 w-4" />
            </button>
          </div>
          {!done && (
            <div className="mt-2.5 h-1 rounded-full bg-bg-100 overflow-hidden">
              <motion.div
                className="h-full bg-brand-700 rounded-full"
                animate={{ width: `${(step / 4) * 100}%` }}
                transition={{ duration: 0.4, ease: easeOutExpo }}
              />
            </div>
          )}
        </div>

        <div className="px-5 py-5">
          {done ? (
            /* ─── Éxito ─── */
            <div className="text-center py-6">
              <motion.div
                initial={{ scale: 0.5, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ duration: 0.5, ease: easeOutExpo }}
                className="mx-auto h-16 w-16 rounded-full bg-success-soft text-success flex items-center justify-center"
              >
                <Check className="h-8 w-8" />
              </motion.div>
              <h3 className="mt-4 font-serif text-2xl">¡Solicitud enviada!</h3>
              <p className="mt-2 text-sm text-ink-500 leading-relaxed max-w-xs mx-auto">
                {fmtLargo(date!)} · {fmtHora(time!)}<br />
                {book.data?.message ?? "Te confirmarán por WhatsApp."}
              </p>
              <button onClick={onClose} className="mt-6 h-11 px-8 rounded-xl bg-brand-700 text-white text-sm font-medium hover:bg-brand-800">
                Listo
              </button>
            </div>
          ) : step === 1 ? (
            /* ─── Paso 1: Modalidad ─── */
            <>
              <h3 className="font-serif text-2xl">Modalidad</h3>
              <p className="text-sm text-ink-500 mt-1">¿Cómo prefieres tu sesión?</p>
              <div className="mt-4 space-y-3">
                {[
                  { key: "tele" as const, Icon: Video, t: "Online", d: "Sesión por videollamada" },
                  { key: "individual" as const, Icon: Building2, t: "Presencial", d: "Sesión en consultorio" },
                ].map((o) => (
                  <button
                    key={o.key}
                    onClick={() => setModality(o.key)}
                    className={`w-full flex items-center gap-4 rounded-2xl border-2 p-4 text-left transition-colors ${
                      modality === o.key ? "border-brand-700 bg-brand-50" : "border-line-200 bg-surface hover:border-brand-400"
                    }`}
                  >
                    <span className={`h-11 w-11 rounded-xl flex items-center justify-center ${modality === o.key ? "bg-brand-700 text-white" : "bg-bg-100 text-ink-500"}`}>
                      <o.Icon className="h-5 w-5" />
                    </span>
                    <span>
                      <span className="block text-sm font-semibold text-ink-900">{o.t}</span>
                      <span className="block text-xs text-ink-500 mt-0.5">{o.d}</span>
                    </span>
                  </button>
                ))}
              </div>
            </>
          ) : step === 2 ? (
            /* ─── Paso 2: Día y horario ─── */
            <>
              <h3 className="font-serif text-2xl">Día y horario</h3>
              <p className="text-sm text-ink-500 mt-1">Disponibilidad real de la agenda</p>
              {loadingAvail ? (
                <div className="py-12 flex justify-center"><Loader2 className="h-5 w-5 animate-spin text-brand-700" /></div>
              ) : !avail?.days.length ? (
                <p className="py-10 text-center text-sm text-ink-500">No hay horarios disponibles en las próximas semanas.</p>
              ) : (
                <>
                  {/* Calendario de mes (pedido de las testers: los chips
                      sueltos no dejaban saber en qué mes o día estabas).
                      Solo se pueden tocar los días con huecos libres. */}
                  <div className="mt-4 rounded-2xl border border-line-200 flex justify-center py-2">
                    <CalendarPicker
                      mode="single"
                      locale={es}
                      selected={date ? new Date(`${date}T12:00:00`) : undefined}
                      onSelect={(d) => {
                        if (!d) return;
                        const iso = isoOf(d);
                        if (!availDates.has(iso)) return;
                        setDate(iso);
                        setTime(null);
                      }}
                      disabled={(d) => !availDates.has(isoOf(d))}
                    />
                  </div>
                  {date && (
                    <>
                      <p className="mt-5 text-[11px] uppercase tracking-widest text-ink-400 font-semibold">Horarios disponibles</p>
                      <div className="mt-2 grid grid-cols-2 gap-2">
                        {daySlots.map((t) => {
                          const sel = time === t;
                          return (
                            <button
                              key={t}
                              onClick={() => setTime(t)}
                              className={`rounded-xl border-2 p-3 text-left transition-colors ${sel ? "border-brand-700 bg-brand-700 text-white" : "border-line-200 hover:border-brand-400"}`}
                            >
                              <span className="block text-sm font-semibold">{fmtHora(t)}</span>
                              <span className={`block text-[11px] mt-0.5 ${sel ? "text-white/75" : "text-ink-400"}`}>
                                {avail.duration_min} min · {modality === "tele" ? "Online" : "Presencial"}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </>
                  )}
                </>
              )}
            </>
          ) : step === 3 ? (
            /* ─── Paso 3: Datos ─── */
            <>
              <h3 className="font-serif text-2xl">Tus datos</h3>
              <p className="text-sm text-ink-500 mt-1">Para confirmarte la cita por WhatsApp</p>
              <div className="mt-4 space-y-3">
                <label className="block">
                  <span className="text-xs font-medium text-ink-500">Nombre completo *</span>
                  <input
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder="Tu nombre y apellido"
                    className="mt-1 w-full h-12 px-4 rounded-xl border border-line-200 bg-bg-50/50 text-sm focus:outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-400/20"
                  />
                </label>
                <label className="block">
                  <span className="text-xs font-medium text-ink-500">Edad *</span>
                  <input
                    value={form.age}
                    onChange={(e) => setForm({ ...form, age: e.target.value.replace(/\D/g, "").slice(0, 3) })}
                    placeholder="Ej. 28"
                    inputMode="numeric"
                    className="mt-1 w-full h-12 px-4 rounded-xl border border-line-200 bg-bg-50/50 text-sm focus:outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-400/20"
                  />
                  <span className="block mt-1 text-[11px] text-ink-400">Si la cita es para otra persona (p. ej. tu hijo/a), pon la edad de quien asistirá.</span>
                </label>
                <label className="block">
                  <span className="text-xs font-medium text-ink-500">WhatsApp *</span>
                  <input
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    placeholder="300 123 4567"
                    inputMode="tel"
                    className="mt-1 w-full h-12 px-4 rounded-xl border border-line-200 bg-bg-50/50 text-sm focus:outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-400/20"
                  />
                </label>
                <label className="block">
                  <span className="text-xs font-medium text-ink-500">Email (opcional)</span>
                  <input
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    placeholder="tu@correo.com"
                    inputMode="email"
                    className="mt-1 w-full h-12 px-4 rounded-xl border border-line-200 bg-bg-50/50 text-sm focus:outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-400/20"
                  />
                </label>
                <label className="block">
                  <span className="text-xs font-medium text-ink-500 flex items-center justify-between gap-2">
                    <span>¿Qué te trae a consulta? (opcional)</span>
                    <VoiceRecorderButton
                      variant="compact"
                      label="Dictar"
                      transcribe={publicTranscribe}
                      onTranscript={(t) => setForm((f) => ({ ...f, motivo: (f.motivo ? f.motivo.trimEnd() + " " : "") + t }))}
                    />
                  </span>
                  <textarea
                    value={form.motivo}
                    onChange={(e) => setForm({ ...form, motivo: e.target.value })}
                    placeholder="Cuéntale brevemente el motivo…"
                    rows={3}
                    className="mt-1 w-full px-4 py-3 rounded-xl border border-line-200 bg-bg-50/50 text-sm resize-none focus:outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-400/20"
                  />
                </label>
                {/* Honeypot invisible anti-bots */}
                <input
                  value={form.website}
                  onChange={(e) => setForm({ ...form, website: e.target.value })}
                  tabIndex={-1}
                  autoComplete="off"
                  aria-hidden
                  className="absolute opacity-0 h-0 w-0 pointer-events-none"
                />
              </div>
            </>
          ) : (
            /* ─── Paso 4: Resumen ─── */
            <>
              <h3 className="font-serif text-2xl">Confirma tu solicitud</h3>
              <div className="mt-4 rounded-2xl border border-line-200 divide-y divide-line-100">
                {[
                  ["Profesional", profile.name],
                  ["Modalidad", modality === "tele" ? "Online (videollamada)" : "Presencial"],
                  ["Fecha", fmtLargo(date!)],
                  ["Hora", `${fmtHora(time!)} · 50 min`],
                  ["Nombre", form.name],
                  ["Edad", `${form.age} años`],
                  ["WhatsApp", form.phone],
                ].map(([k, v]) => (
                  <div key={k} className="flex justify-between gap-4 px-4 py-3 text-sm">
                    <span className="text-ink-400">{k}</span>
                    <span className="text-ink-900 font-medium text-right">{v}</span>
                  </div>
                ))}
              </div>
              <p className="mt-3 text-[11px] text-ink-400 leading-relaxed">
                Al enviar, {profile.name.split(" ")[0]} recibe tu solicitud al instante y te
                confirma la cita (y el honorario) por WhatsApp.
              </p>
              {book.isError && (
                <p className="mt-3 text-xs text-error bg-error-soft rounded-lg px-3 py-2">
                  {(book.error as Error)?.message ?? "No se pudo enviar. Intenta de nuevo."}
                </p>
              )}
            </>
          )}
        </div>

        {/* Footer CTA */}
        {!done && (
          <div className="sticky bottom-0 bg-surface/95 backdrop-blur px-5 py-4 border-t border-line-100">
            <button
              disabled={!canContinue || book.isPending}
              onClick={() => (step < 4 ? setStep(step + 1) : book.mutate())}
              className="w-full h-12 rounded-xl bg-brand-700 text-white text-sm font-semibold hover:bg-brand-800 disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2 transition-opacity"
            >
              {book.isPending
                ? <Loader2 className="h-4 w-4 animate-spin" />
                : step < 4
                  ? <>Continuar <ChevronRight className="h-4 w-4" /></>
                  : <>Enviar solicitud <ArrowRight className="h-4 w-4" /></>}
            </button>
          </div>
        )}

        {confirmClose && (
          <div className="absolute inset-0 z-20 bg-surface/95 backdrop-blur-sm flex items-center justify-center p-6">
            <div className="text-center max-w-xs">
              <p className="text-base font-semibold text-ink-900">¿Cerrar sin terminar?</p>
              <p className="text-sm text-ink-500 mt-1">Se perderá lo que llevas diligenciado.</p>
              <div className="mt-5 grid gap-2">
                <button onClick={() => setConfirmClose(false)} className="h-11 rounded-xl bg-brand-700 text-white text-sm font-semibold hover:bg-brand-800">Seguir con mi solicitud</button>
                <button onClick={onClose} className="h-11 rounded-xl border border-line-200 text-sm text-ink-700 hover:border-brand-400">Cerrar de todos modos</button>
              </div>
            </div>
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}
