import { motion } from "framer-motion";
import { ArrowRight, Play, Mail } from "lucide-react";
import { easeOutExpo, floating } from "./motion";
import { HeroVideo } from "./HeroVideo";
import {
  GoogleIcon, WhatsAppIcon, GoogleCalendarIcon, GoogleMeetIcon,
  ZoomIcon, GmailIcon, OutlookIcon, MicrosoftIcon,
} from "./BrandIcons";

/**
 * Hero de la landing. Desktop: texto a la izquierda, video a la
 * derecha (rediseño 2 sep 2026 — el video nuevo Hero-1Psico dura 8s y
 * pesa 1.3 MB, loopea perfecto en una columna). Móvil: apilado y
 * centrado, como estaba.
 */
const HEADLINE_LINE_1 = ["Una", "plataforma", "para"];
const HEADLINE_LINE_2 = ["toda", "tu", "práctica", "clínica."];

// Fila de logos bajo los CTAs: las herramientas con las que la app
// convive, sin texto ni promesas — solo están ahí. Grises en reposo,
// color de marca + mini-lift al pasar el mouse.
const LOGOS: { icon: React.ComponentType<{ className?: string }>; label: string; color: string }[] = [
  { icon: GoogleMeetIcon, label: "Google Meet", color: "#00832d" },
  { icon: GoogleIcon, label: "Google", color: "#4285F4" },
  { icon: ZoomIcon, label: "Zoom", color: "#2D8CFF" },
  { icon: GoogleCalendarIcon, label: "Google Calendar", color: "#4285F4" },
  { icon: Mail, label: "Correo", color: "#64748B" },
  { icon: GmailIcon, label: "Gmail", color: "#EA4335" },
  { icon: OutlookIcon, label: "Outlook", color: "#0F6CBD" },
  { icon: WhatsAppIcon, label: "WhatsApp", color: "#25D366" },
  { icon: MicrosoftIcon, label: "Microsoft 365", color: "#F25022" },
];

export function Hero2() {
  return (
    <section
      id="hero"
      className="relative pt-20 pb-12 sm:pt-28 sm:pb-20 overflow-hidden"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid lg:grid-cols-12 gap-10 lg:gap-12 items-center">
          {/* Columna de texto — centrada en móvil, a la izquierda en desktop */}
          <div className="text-center lg:text-left lg:col-span-5">
            <h1 className="font-serif text-3xl sm:text-5xl lg:text-[3.4rem] xl:text-6xl leading-[1.05] tracking-tight text-ink-900">
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

            <motion.p
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, ease: easeOutExpo, delay: 0.95 }}
              className="mt-4 sm:mt-6 max-w-2xl mx-auto lg:mx-0 text-sm sm:text-lg text-ink-500 leading-relaxed px-2 lg:px-0"
            >
              Pacientes, agenda, historia clínica, documentos, psicometría y
              seguimiento terapéutico — organizados en un solo lugar, conectado
              con las herramientas que ya usas todos los días.
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, ease: easeOutExpo, delay: 1.1 }}
              className="mt-6 sm:mt-8 flex items-stretch sm:items-center justify-center lg:justify-start gap-2 sm:gap-3 px-2 lg:px-0"
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

            {/* Logos de las herramientas — presencia silenciosa */}
            <div className="mt-7 flex flex-wrap items-center justify-center lg:justify-start gap-4 sm:gap-5">
              {LOGOS.map(({ icon: Icon, label, color }, i) => (
                <motion.span
                  key={label}
                  title={label}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  whileHover={{ y: -3, scale: 1.25 }}
                  transition={{ duration: 0.4, ease: easeOutExpo, delay: 1.25 + i * 0.06 }}
                  style={{ "--hc": color } as React.CSSProperties}
                  className="text-ink-300 hover:text-[var(--hc)] transition-colors duration-300 cursor-default"
                >
                  <Icon className="h-4 w-4 sm:h-[18px] sm:w-[18px]" />
                </motion.span>
              ))}
              <motion.span
                title="Laura, tu asistente"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                whileHover={{ y: -3, scale: 1.25 }}
                transition={{ duration: 0.4, ease: easeOutExpo, delay: 1.25 + 9 * 0.06 }}
                className="cursor-default"
              >
                <img
                  src="/laura/laura-profile-2.svg"
                  alt="Laura"
                  draggable={false}
                  className="h-5 w-5 rounded-full bg-brand-50 border border-line-200 grayscale hover:grayscale-0 transition-[filter] duration-300"
                />
              </motion.span>
            </div>
          </div>

          {/* Columna del video — sin marco ni fondo: el video viene con el
              mismo color de página y se funde como ventana embebida */}
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 30, filter: "blur(12px)" }}
            animate={{ opacity: 1, scale: 1, y: 0, filter: "blur(0px)" }}
            transition={{ duration: 1.2, ease: easeOutExpo, delay: 1.2 }}
            className="relative lg:col-span-7"
          >
            {/* Glow respirante detrás del frame */}
            <motion.div
              className="absolute -inset-x-16 -top-16 -bottom-16 -z-10 pointer-events-none blur-3xl"
              style={{
                background:
                  "radial-gradient(ellipse at center, oklch(0.7 0.12 175 / 0.35), transparent 65%)",
              }}
              animate={{ opacity: [0.4, 0.7, 0.4] }}
              transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
              aria-hidden
            />

            <motion.div animate={floating} className="relative overflow-hidden">
              <HeroVideo
                src="/landing/Hero-1Psico.mp4"
                poster="/landing/hero-1psico-poster.jpg"
                aspect="1920 / 1080"
              />
            </motion.div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
