import { motion } from "framer-motion";
import { ArrowRight, Play, BellRing, CheckCircle2, CalendarCheck, Gift } from "lucide-react";
import { easeOutExpo, floating } from "./motion";
import { FloatingBadge } from "./FloatingBadge";
import { GoogleIcon, WhatsAppIcon, GoogleCalendarIcon, GoogleMeetIcon } from "./BrandIcons";

/**
 * Hero v2 (experimento /inicio2, 1 sep 2026). Cambia el ángulo del
 * mensaje: ya no "contra WhatsApp y Excel" sino a favor de lo que la
 * plataforma ES — y estrena la fila de integraciones reales (Google
 * login, Calendar, Meet, WhatsApp) que antes no existían cuando se
 * escribió el hero original. Misma coreografía de entrada que Hero v1.
 */
const HEADLINE_LINE_1 = ["Una", "plataforma", "para"];
const HEADLINE_LINE_2 = ["toda", "tu", "práctica", "clínica."];

const INTEGRATIONS = [
  { icon: GoogleIcon, label: "Entra con Google" },
  { icon: Gift, label: "Gratis durante el 2026" },
  { icon: WhatsAppIcon, label: "Avisos por WhatsApp" },
  { icon: GoogleCalendarIcon, label: "Google Calendar en tiempo real" },
  { icon: GoogleMeetIcon, label: "Meet automático en citas virtuales" },
];

export function Hero2() {
  return (
    <section
      id="hero"
      className="relative pt-20 pb-10 sm:pt-28 sm:pb-24 overflow-hidden"
    >
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
        {/* Badge */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: easeOutExpo, delay: 0.1 }}
          className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-brand-50 border border-brand-100 text-xs text-brand-800 font-medium"
        >
          <span className="h-1.5 w-1.5 rounded-full bg-brand-700 animate-pulse" />
          Construida con psicólogos colombianos
        </motion.div>

        {/* Headline — palabra por palabra */}
        <h1 className="mt-5 sm:mt-6 font-serif text-3xl sm:text-5xl md:text-6xl lg:text-7xl leading-[1.05] tracking-tight text-ink-900">
          <div className="overflow-hidden">
            {HEADLINE_LINE_1.map((word, i) => (
              <motion.span
                key={word}
                initial={{ opacity: 0, y: "100%" }}
                animate={{ opacity: 1, y: 0 }}
                transition={{
                  duration: 0.8,
                  ease: easeOutExpo,
                  delay: 0.25 + i * 0.08,
                }}
                className="inline-block mr-3"
              >
                {word}
              </motion.span>
            ))}
          </div>
          <div className="overflow-hidden">
            {HEADLINE_LINE_2.map((word, i) => (
              <motion.span
                key={word}
                initial={{ opacity: 0, y: "100%" }}
                animate={{ opacity: 1, y: 0 }}
                transition={{
                  duration: 0.8,
                  ease: easeOutExpo,
                  delay: 0.55 + i * 0.08,
                }}
                className="inline-block mr-3 text-brand-700"
              >
                {word}
              </motion.span>
            ))}
          </div>
        </h1>

        {/* Subheadline */}
        <motion.p
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: easeOutExpo, delay: 0.95 }}
          className="mt-4 sm:mt-6 max-w-2xl mx-auto text-sm sm:text-lg text-ink-500 leading-relaxed px-2"
        >
          Pacientes, agenda, historia clínica, documentos, psicometría y
          seguimiento terapéutico — organizados en un solo lugar, conectado
          con las herramientas que ya usas todos los días.
        </motion.p>

        {/* CTAs */}
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: easeOutExpo, delay: 1.1 }}
          className="mt-6 sm:mt-9 flex items-stretch sm:items-center justify-center gap-2 sm:gap-3 px-2"
        >
          <motion.a
            href="#demo"
            whileHover={{ y: -2, scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            transition={{ duration: 0.3, ease: easeOutExpo }}
            className="flex-1 sm:flex-initial h-11 sm:h-12 px-3 sm:px-6 rounded-lg bg-brand-700 text-white text-xs sm:text-sm font-medium hover:bg-brand-800 inline-flex items-center justify-center gap-1.5 sm:gap-2 shadow-lg shadow-brand-700/20 whitespace-nowrap"
          >
            Quiero acceso <ArrowRight className="h-4 w-4 shrink-0" />
          </motion.a>
          <motion.a
            href="#capabilities"
            whileHover={{ y: -2 }}
            transition={{ duration: 0.3, ease: easeOutExpo }}
            className="flex-1 sm:flex-initial h-11 sm:h-12 px-3 sm:px-6 rounded-lg border border-line-200 bg-surface text-ink-700 text-xs sm:text-sm font-medium hover:border-brand-400 inline-flex items-center justify-center gap-1.5 sm:gap-2 whitespace-nowrap"
          >
            <Play className="h-4 w-4 shrink-0" /> Ver plataforma
          </motion.a>
        </motion.div>

        {/* Integraciones. En desktop: chips con stagger. En móvil los
            chips parecían una pila de botones junto a los CTAs (feedback
            1 sep 2026) → una sola línea muda de texto. */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6, ease: easeOutExpo, delay: 1.3 }}
          className="sm:hidden mt-5 px-6 text-[11px] text-ink-400 leading-relaxed"
        >
          Entra con Google · Gratis durante el 2026 · WhatsApp, Google Calendar y Meet conectados
        </motion.p>
        <div className="hidden sm:flex mt-6 sm:mt-8 flex-wrap items-center justify-center gap-2 px-2">
          {INTEGRATIONS.map(({ icon: Icon, label }, i) => (
            <motion.span
              key={label}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, ease: easeOutExpo, delay: 1.3 + i * 0.09 }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-surface/80 backdrop-blur border border-line-200 text-[11px] sm:text-xs text-ink-700"
            >
              <Icon className="h-3.5 w-3.5 text-brand-700 shrink-0" />
              {label}
            </motion.span>
          ))}
        </div>
      </div>

      {/* Video frame — igual que el hero v1 */}
      <div className="mt-8 sm:mt-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: 30, filter: "blur(12px)" }}
          animate={{ opacity: 1, scale: 1, y: 0, filter: "blur(0px)" }}
          transition={{ duration: 1.2, ease: easeOutExpo, delay: 1.5 }}
          className="relative"
        >
          <motion.div
            className="absolute -inset-x-20 -top-20 -bottom-20 -z-10 pointer-events-none blur-3xl"
            style={{
              background:
                "radial-gradient(ellipse at center, oklch(0.7 0.12 175 / 0.35), transparent 65%)",
            }}
            animate={{ opacity: [0.4, 0.7, 0.4] }}
            transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
            aria-hidden
          />

          <motion.div animate={floating} className="relative overflow-hidden">
            <video
              src="/landing/Video-Dashboard-Psic.mp4"
              autoPlay
              loop
              muted
              playsInline
              preload="metadata"
              className="w-full h-auto block"
              aria-label="Demo de Psicomorfosis"
            />
          </motion.div>

          <div className="hidden sm:contents">
          <FloatingBadge
            icon={CalendarCheck}
            label="Sesión agendada"
            tone="brand"
            position={{ top: "-1.5rem", left: "-0.5rem" }}
            delay={2.0}
            floatPhase={0}
          />
          <FloatingBadge
            icon={BellRing}
            label="Recordatorio enviado"
            tone="neutral"
            position={{ top: "30%", right: "-1rem" }}
            delay={2.3}
            floatPhase={1}
          />
          <FloatingBadge
            icon={CheckCircle2}
            label="PHQ-9 completado"
            tone="success"
            position={{ bottom: "-1rem", left: "8%" }}
            delay={2.6}
            floatPhase={2}
          />
          </div>
        </motion.div>
      </div>
    </section>
  );
}
