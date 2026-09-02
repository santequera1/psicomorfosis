import { motion } from "framer-motion";
import { CalendarPlus } from "lucide-react";
import { easeOutExpo, fadeUpSubtle, staggerParent } from "./motion";
import { WhatsAppIcon, GoogleMeetIcon, GoogleCalendarIcon } from "./BrandIcons";

/**
 * Timeline horizontal (pedido 1 sep 2026, reemplaza al bloque de
 * "Posicionamiento"): el viaje de una cita por las integraciones, en
 * este orden — Agenda → WhatsApp → Google Meet → Google Calendar.
 * Desktop: 4 nodos sobre una línea que se dibuja al entrar en viewport.
 * Móvil: carrusel horizontal con snap.
 */
const STEPS = [
  {
    icon: CalendarPlus,
    label: "Agenda",
    text: "El paciente reserva desde tu enlace público, o tú creas la cita en segundos.",
  },
  {
    icon: WhatsAppIcon,
    label: "WhatsApp",
    text: "Laura confirma la cita y le recuerda la sesión al paciente — y a ti también.",
  },
  {
    icon: GoogleMeetIcon,
    label: "Google Meet",
    text: "Si la sesión es virtual, el enlace se crea y se envía solo.",
  },
  {
    icon: GoogleCalendarIcon,
    label: "Google Calendar",
    text: "La cita queda en tu calendario. Si cambia o se cancela, se actualiza sola.",
  },
];

export function FlowTimeline() {
  return (
    <section id="flujo" className="py-14 sm:py-24 relative">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div
          variants={staggerParent}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, amount: 0.4 }}
          className="text-center max-w-2xl mx-auto"
        >
          <motion.p variants={fadeUpSubtle} className="text-xs uppercase tracking-widest text-brand-700 font-semibold">
            Así fluye una cita
          </motion.p>
          <motion.h2 variants={fadeUpSubtle} className="mt-2 font-serif text-3xl sm:text-5xl text-ink-900 tracking-tight text-balance">
            Agendas una vez. Todo lo demás pasa solo.
          </motion.h2>
          <motion.p variants={fadeUpSubtle} className="mt-3 text-sm sm:text-base text-ink-500">
            Cada cita dispara la cadena completa sin que toques nada más.
          </motion.p>
        </motion.div>

        {/* Desktop: línea horizontal que se dibuja + nodos en cascada */}
        <div className="relative mt-14 hidden md:block">
          <motion.div
            initial={{ scaleX: 0 }}
            whileInView={{ scaleX: 1 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 1.4, ease: easeOutExpo }}
            className="absolute top-6 left-[12.5%] right-[12.5%] h-px bg-brand-200 origin-left"
            aria-hidden
          />
          <div className="grid grid-cols-4 gap-6">
            {STEPS.map(({ icon: Icon, label, text }, i) => (
              <motion.div
                key={label}
                initial={{ opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-80px" }}
                transition={{ duration: 0.6, ease: easeOutExpo, delay: 0.25 + i * 0.28 }}
                className="text-center"
              >
                <div className="relative inline-flex">
                  <span className="h-12 w-12 rounded-full bg-surface border-2 border-brand-300 shadow-soft grid place-content-center text-brand-700">
                    <Icon className="h-5 w-5" />
                  </span>
                  <span className="absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full bg-brand-700 text-white text-[10px] font-semibold grid place-content-center tabular-nums">
                    {i + 1}
                  </span>
                </div>
                <h3 className="mt-4 font-serif text-xl text-ink-900">{label}</h3>
                <p className="mt-1.5 text-sm text-ink-500 leading-relaxed max-w-56 mx-auto">{text}</p>
              </motion.div>
            ))}
          </div>
        </div>

        {/* Móvil: el mismo timeline, deslizable en horizontal */}
        <div className="mt-10 md:hidden flex gap-3 overflow-x-auto pb-3 -mx-4 px-4 snap-x snap-mandatory [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {STEPS.map(({ icon: Icon, label, text }, i) => (
            <div
              key={label}
              className="snap-center shrink-0 w-[78%] max-w-72 rounded-2xl border border-line-200 bg-surface p-5"
            >
              <div className="flex items-center gap-3">
                <span className="h-10 w-10 rounded-full bg-brand-50 border border-brand-200 grid place-content-center text-brand-700 shrink-0">
                  <Icon className="h-4.5 w-4.5" />
                </span>
                <div>
                  <span className="text-[10px] uppercase tracking-widest text-brand-700 font-semibold">Paso {i + 1}</span>
                  <h3 className="font-serif text-lg text-ink-900 leading-tight">{label}</h3>
                </div>
              </div>
              <p className="mt-3 text-sm text-ink-500 leading-relaxed">{text}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
