import { motion } from "framer-motion";
import { ArrowRight, Play, BellRing, CheckCircle2, CalendarCheck } from "lucide-react";
import { easeOutExpo, floating } from "./motion";
import { FloatingBadge } from "./FloatingBadge";

/**
 * Hero cinematográfico. Secuencia de entrada:
 *   1. Badge fade in
 *   2. Headline palabra por palabra
 *   3. Subheadline
 *   4. CTAs
 *   5. Video frame escala desde 0.96 → 1.0 con blur dissolve
 *
 * Después del entrance:
 *   - El frame del video flota infinito (-8/+8 px, 6s)
 *   - 3 badges flotantes sobre el video sugieren actividad real
 *   - Glow radial detrás del frame respira lentamente
 */
const HEADLINE_LINE_1 = ["La", "consulta", "clínica"];
const HEADLINE_LINE_2 = ["sin", "WhatsApp", "ni", "Excel."];

export function Hero() {
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
          Construida con psicólogas colombianas
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
          Menos tiempo administrando. Más tiempo atendiendo pacientes.
          Organiza sesiones, historia clínica y seguimiento terapéutico
          desde un solo lugar pensado para psicólogos en Colombia.
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
      </div>

      {/* Video frame — scale-in con dissolve, después flota infinito.
          Más ancho que el resto del hero (7xl vs 6xl) para que el video
          se sienta integrado a la página, no contenido en una card. */}
      <div className="mt-8 sm:mt-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: 30, filter: "blur(12px)" }}
          animate={{ opacity: 1, scale: 1, y: 0, filter: "blur(0px)" }}
          transition={{ duration: 1.2, ease: easeOutExpo, delay: 1.3 }}
          className="relative"
        >
          {/* Glow respirante detrás del frame */}
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

          {/* Floating wrapper — solo el frame interno flota, los badges
              tienen su propia oscilación con fase distinta. Sin shadow
              ni background: el video viene exportado con fondo #F8F7F2
              que coincide con la página, así se mezcla como si fuera
              una ventana embebida en la web. */}
          <motion.div
            animate={floating}
            className="relative overflow-hidden"
          >
            {/* <source> con WebM primero: browsers modernos (Chrome,
                Firefox, Edge, Safari 14.1+, iOS 16+) lo eligen y
                ahorran ~40% de ancho de banda. Safari/iOS viejos
                caen al MP4 fallback. El MP4 se genera en el VPS con
                ffmpeg desde el WebM, no se mantiene manualmente. */}
            <video
              autoPlay
              loop
              muted
              playsInline
              preload="metadata"
              className="w-full h-auto block"
              aria-label="Demo de Psicomorfosis"
            >
              <source src="/landing/Video-Dashboard-Psic.webm" type="video/webm" />
              <source src="/landing/Video-Dashboard-Psic.mp4" type="video/mp4" />
            </video>
          </motion.div>

          {/* Badges flotantes — sugieren actividad real */}
          <FloatingBadge
            icon={CalendarCheck}
            label="Sesión agendada"
            tone="brand"
            position={{ top: "-1.5rem", left: "-0.5rem" }}
            delay={1.8}
            floatPhase={0}
          />
          <FloatingBadge
            icon={BellRing}
            label="Recordatorio enviado"
            tone="neutral"
            position={{ top: "30%", right: "-1rem" }}
            delay={2.1}
            floatPhase={1}
          />
          <FloatingBadge
            icon={CheckCircle2}
            label="PHQ-9 completado"
            tone="success"
            position={{ bottom: "-1rem", left: "8%" }}
            delay={2.4}
            floatPhase={2}
          />
        </motion.div>
      </div>
    </section>
  );
}
