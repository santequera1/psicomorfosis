import { motion } from "framer-motion";
import { Mic, Square, X, MessageSquare, Sparkles, Lock } from "lucide-react";
import { cn } from "@/lib/utils";
import { fadeUp, staggerParent, easeOutExpo } from "./motion";

/**
 * Sección "Dictado con IA" — spotlight de una capacidad nueva.
 * Layout split: copy a la izquierda, mockup interactivo a la derecha.
 *
 * El mockup imita la UI real del VoiceRecorderButton:
 *   - mic central pulsante
 *   - waveforms animadas a ambos lados
 *   - pill 0:05 · detener simulando grabación
 *   - preview de texto transcrito con sparkle (IA)
 *
 * Vive entre Features y ThemeShowcase. No hay copy técnica de OpenAI
 * más allá de mencionar "Whisper de ChatGPT" para reconocimiento de
 * marca y confianza.
 */
export function VoiceDictation() {
  return (
    <section className="py-14 sm:py-24 relative">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div
          variants={staggerParent}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: "-100px" }}
          className="relative rounded-3xl border border-line-200 bg-surface/60 backdrop-blur-sm overflow-hidden p-6 sm:p-10 lg:p-14"
        >
          {/* Glow ambiental brand-violet, anclado a la derecha donde
              está el mockup, para que la sección vibre sin invadir el
              copy. */}
          <div
            aria-hidden
            className="absolute -top-24 -right-24 h-80 w-80 rounded-full blur-3xl pointer-events-none"
            style={{
              background:
                "radial-gradient(circle, oklch(0.62 0.18 295 / 0.18), transparent 70%)",
            }}
          />

          <div className="relative grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-14 items-center">
            <Copy />
            <Mockup />
          </div>
        </motion.div>
      </div>
    </section>
  );
}

function Copy() {
  return (
    <div className="lg:col-span-6 order-2 lg:order-1">
      {/* Chip "Dictado con IA" + badge NUEVO */}
      <motion.div variants={fadeUp} className="flex items-center gap-2 flex-wrap">
        <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-brand-50 border border-brand-200/70 text-brand-800 text-xs font-semibold">
          <Mic className="h-3.5 w-3.5" />
          Dictado con IA
        </span>
        <span className="inline-flex items-center px-2.5 py-1 rounded-full bg-brand-100 border border-brand-200/70 text-brand-800 text-[10px] font-bold tracking-widest uppercase">
          Nuevo
        </span>
      </motion.div>

      <motion.h2
        variants={fadeUp}
        className="mt-6 font-serif text-3xl sm:text-4xl lg:text-5xl text-ink-900 leading-[1.1] tracking-tight text-balance"
      >
        Tu asistente de escritura clínica
      </motion.h2>

      <motion.p
        variants={fadeUp}
        className="mt-5 text-base sm:text-lg text-ink-500 leading-relaxed max-w-xl"
      >
        Registra información clínica usando tu voz y deja que la plataforma se
        encargue de la transcripción.
      </motion.p>

      <motion.div
        variants={fadeUp}
        className="mt-8 grid grid-cols-1 sm:grid-cols-3 gap-5"
      >
        <Benefit icon={MessageSquare} label={"Dicta notas,\nsesiones y más"} />
        <Benefit icon={Sparkles} label={"Transcripción\nrápida y precisa"} />
        <Benefit icon={Lock} label={"Privado y seguro"} />
      </motion.div>
    </div>
  );
}

function Benefit({
  icon: Icon,
  label,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
}) {
  return (
    <div className="flex flex-col items-start gap-2">
      <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-brand-50 text-brand-700 border border-brand-200/60">
        <Icon className="h-5 w-5" />
      </span>
      <span className="text-xs text-ink-600 leading-snug whitespace-pre-line font-medium">
        {label}
      </span>
    </div>
  );
}

function Mockup() {
  return (
    <motion.div
      variants={fadeUp}
      className="lg:col-span-6 order-1 lg:order-2"
    >
      <div className="relative mx-auto max-w-md lg:max-w-none rounded-2xl border border-line-200 bg-surface shadow-xl shadow-brand-700/5 p-6 sm:p-8">
        {/* Fila waveform + mic central */}
        <div className="flex items-center justify-center gap-3 sm:gap-4">
          <Waveform side="left" />
          <MicCircle />
          <Waveform side="right" />
        </div>

        {/* Pill grabando */}
        <div className="mt-6 flex items-center justify-center gap-2">
          <RecordingPill />
          <CancelButton />
        </div>

        {/* Preview de texto transcrito */}
        <Transcription />
      </div>
    </motion.div>
  );
}

function MicCircle() {
  return (
    <div className="relative shrink-0">
      {/* Pulse ring */}
      <motion.span
        aria-hidden
        className="absolute inset-0 rounded-full bg-brand-400/30"
        animate={{ scale: [1, 1.18, 1], opacity: [0.6, 0, 0.6] }}
        transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut" }}
      />
      <div className="relative h-20 w-20 sm:h-24 sm:w-24 rounded-full bg-surface border border-brand-200/70 shadow-lg shadow-brand-700/10 flex flex-col items-center justify-center gap-0.5">
        <Mic className="h-7 w-7 text-brand-700" />
        <span className="text-[10px] text-ink-700 font-medium">Dictar</span>
      </div>
    </div>
  );
}

/**
 * Waveform decorativa. 24 barras con alturas pseudo-aleatorias que
 * oscilan en bucle. La generamos determinista (sin Math.random durante
 * render) para que el SSR coincida con el cliente.
 */
const BAR_HEIGHTS_LEFT = [
  0.4, 0.7, 0.5, 0.9, 0.35, 0.55, 0.8, 0.45, 0.6, 0.95, 0.5, 0.7,
  0.4, 0.85, 0.6, 0.5, 0.75, 0.4, 0.55, 0.65, 0.35, 0.5, 0.45, 0.3,
];
const BAR_HEIGHTS_RIGHT = [
  0.3, 0.5, 0.45, 0.7, 0.4, 0.6, 0.85, 0.5, 0.95, 0.55, 0.7, 0.4,
  0.6, 0.5, 0.85, 0.45, 0.65, 0.5, 0.9, 0.4, 0.55, 0.7, 0.35, 0.5,
];

function Waveform({ side }: { side: "left" | "right" }) {
  const heights = side === "left" ? BAR_HEIGHTS_LEFT : BAR_HEIGHTS_RIGHT;
  return (
    <div
      className={cn(
        "flex items-center gap-[2px] h-16 sm:h-20 flex-1 min-w-0",
        side === "left" ? "justify-end" : "justify-start",
      )}
      aria-hidden
    >
      {heights.map((h, i) => (
        <motion.span
          key={i}
          className="block w-[3px] sm:w-1 rounded-full bg-brand-400/70"
          style={{ height: `${h * 100}%` }}
          animate={{
            scaleY: [1, 0.45 + h * 0.5, 1, 0.7, 1],
          }}
          transition={{
            duration: 1.4 + (i % 5) * 0.15,
            repeat: Infinity,
            ease: "easeInOut",
            delay: i * 0.04,
          }}
        />
      ))}
    </div>
  );
}

function RecordingPill() {
  return (
    <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-rose-50 border border-rose-200/70 text-rose-700 text-sm font-semibold">
      <motion.span
        className="inline-flex h-3.5 w-3.5 items-center justify-center"
        animate={{ opacity: [1, 0.5, 1] }}
        transition={{ duration: 1.2, repeat: Infinity, ease: "easeInOut" }}
      >
        <Square className="h-3 w-3 fill-rose-600 text-rose-600" />
      </motion.span>
      <span className="tabular-nums">0:05</span>
      <span className="text-rose-600/80 font-normal">· detener</span>
    </span>
  );
}

function CancelButton() {
  return (
    <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-bg border border-line-200 text-ink-600">
      <X className="h-3.5 w-3.5" />
    </span>
  );
}

function Transcription() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-50px" }}
      transition={{ duration: 0.7, delay: 0.25, ease: easeOutExpo }}
      className="mt-6 rounded-xl bg-bg/70 border border-line-200 p-4 flex items-start gap-3"
    >
      <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-700 border border-brand-200/60">
        <Sparkles className="h-3.5 w-3.5" />
      </span>
      <p className="text-sm text-ink-700 leading-relaxed">
        El paciente presenta avances significativos en el manejo de la ansiedad.
        Se recomienda continuar…
      </p>
    </motion.div>
  );
}
