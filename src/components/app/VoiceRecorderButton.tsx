import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Mic, Square, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";
import { useVoiceRecorder } from "@/lib/useVoiceRecorder";

/**
 * Botón "Dictar" reutilizable.
 *
 * Ciclo:
 *   idle → click → requesting (loader) → recording (botón Detener +
 *   botón Cancelar al lado) → click Detener → transcribing (loader)
 *   → idle
 *
 * Click Cancelar descarta la grabación y vuelve a idle sin llamar
 * a la API (sin gasto).
 *
 * Transición entre estados con AnimatePresence (~250ms, suave). Antes
 * el cambio Mic → Square era instantáneo y chocaba con el resto de
 * microinteracciones de la app.
 *
 * Variantes:
 *   - "icon": botón cuadrado h-9 solo icono (toolbars).
 *   - "compact": h-8 con icono + label corto.
 *   - "labelled": h-9 con icono + "Dictar" completo.
 */
type Variant = "icon" | "compact" | "labelled";

interface Props {
  onTranscript: (text: string) => void;
  label?: string;
  variant?: Variant;
  disabled?: boolean;
  className?: string;
  maxDurationMs?: number;
}

function fmtSec(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, "0")}`;
}

const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1];
const ANIM = { duration: 0.25, ease: EASE };

export function VoiceRecorderButton({
  onTranscript,
  label,
  variant = "icon",
  disabled,
  className,
  maxDurationMs,
}: Props) {
  const rec = useVoiceRecorder({ maxDurationMs });
  const [transcribing, setTranscribing] = useState(false);

  async function startOrStop() {
    if (transcribing) return;
    if (rec.state === "idle" || rec.state === "error") {
      await rec.start();
      return;
    }
    if (rec.state === "recording") {
      const blob = await rec.stop();
      if (!blob || blob.size < 100) {
        toast.error("Grabación muy corta — intenta otra vez.");
        return;
      }
      setTranscribing(true);
      try {
        const result = await api.transcribeVoice(blob);
        if (result.success) {
          const text = result.text.trim();
          if (text) {
            onTranscript(text);
          } else {
            toast.warning("No detectamos voz en el audio.");
          }
        } else {
          toast.error(result.error);
        }
      } catch (e: any) {
        toast.error(e?.message ?? "Error procesando el audio.");
      } finally {
        setTranscribing(false);
      }
    }
  }

  function handleCancel() {
    rec.cancel();
    // No gasto a la API porque no enviamos blob — solo descartamos.
  }

  useEffect(() => {
    if (rec.state === "error" && rec.error) {
      toast.error(rec.error);
      rec.cancel();
    }
  }, [rec.state, rec.error, rec]);

  const isRecording = rec.state === "recording";
  const isRequesting = rec.state === "requesting";
  const showLoader = transcribing || isRequesting;

  // ── Variante "icon": botón único cuadrado. Cuando graba se vuelve
  //    rojizo con Square; al lado aparece un mini-botón X para cancelar.
  if (variant === "icon") {
    return (
      <div className="inline-flex items-center gap-1 shrink-0">
        <motion.button
          type="button"
          onClick={startOrStop}
          disabled={disabled || showLoader}
          title={isRecording ? "Detener grabación" : "Dictar (voz a texto)"}
          aria-label={isRecording ? "Detener grabación" : "Iniciar dictado por voz"}
          aria-pressed={isRecording}
          animate={{
            backgroundColor: isRecording ? "rgb(255 241 242)" : "rgb(255 255 255)",
            borderColor: isRecording ? "rgb(253 164 175)" : "rgb(231 229 225)",
            color: isRecording ? "rgb(190 18 60)" : "rgb(68 64 60)",
          }}
          transition={ANIM}
          className={cn(
            "relative h-9 w-9 rounded-lg border inline-flex items-center justify-center shrink-0",
            (disabled || showLoader) && "opacity-50 cursor-not-allowed",
            className,
          )}
        >
          <IconCrossfade
            mode={showLoader ? "loader" : isRecording ? "stop" : "mic"}
            level={rec.level}
            sizeCls="h-4 w-4"
            stopSizeCls="h-3.5 w-3.5"
          />
        </motion.button>

        <AnimatePresence>
          {isRecording && (
            <motion.button
              type="button"
              onClick={handleCancel}
              title="Cancelar grabación (descartar)"
              aria-label="Cancelar grabación"
              initial={{ opacity: 0, x: -6, width: 0 }}
              animate={{ opacity: 1, x: 0, width: "auto" }}
              exit={{ opacity: 0, x: -6, width: 0 }}
              transition={ANIM}
              className="h-9 px-2 rounded-lg border border-line-200 bg-surface text-ink-500 hover:text-ink-900 hover:border-brand-400 inline-flex items-center justify-center shrink-0 overflow-hidden"
            >
              <X className="h-4 w-4" />
            </motion.button>
          )}
        </AnimatePresence>
      </div>
    );
  }

  // ── Variantes con label (compact / labelled): botón principal + X cancelar.
  const sizeCls = variant === "compact" ? "h-8 px-2.5 text-xs gap-1.5" : "h-9 px-3 text-sm gap-2";
  const iconCls = variant === "compact" ? "h-3.5 w-3.5" : "h-4 w-4";
  const recordingLabel = `${fmtSec(rec.elapsedMs)} · detener`;
  const idleLabel = label ?? "Dictar";

  return (
    <div className="inline-flex items-center gap-1 shrink-0">
      <motion.button
        type="button"
        onClick={startOrStop}
        disabled={disabled || showLoader}
        aria-pressed={isRecording}
        animate={{
          backgroundColor: isRecording ? "rgb(255 241 242)" : "rgb(255 255 255)",
          borderColor: isRecording ? "rgb(253 164 175)" : "rgb(231 229 225)",
          color: isRecording ? "rgb(190 18 60)" : "rgb(68 64 60)",
        }}
        transition={ANIM}
        className={cn(
          "relative inline-flex items-center rounded-lg border font-medium shrink-0",
          sizeCls,
          (disabled || showLoader) && "opacity-50 cursor-not-allowed",
          className,
        )}
      >
        <IconCrossfade
          mode={showLoader ? "loader" : isRecording ? "stop" : "mic"}
          level={rec.level}
          sizeCls={iconCls}
          stopSizeCls={variant === "compact" ? "h-3 w-3" : "h-3.5 w-3.5"}
        />
        <AnimatePresence mode="wait" initial={false}>
          <motion.span
            key={showLoader ? "loading" : isRecording ? "rec" : "idle"}
            initial={{ opacity: 0, y: 3 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -3 }}
            transition={ANIM}
            className="whitespace-nowrap"
          >
            {showLoader
              ? transcribing ? "Transcribiendo…" : "Esperando micrófono…"
              : isRecording ? recordingLabel
              : idleLabel}
          </motion.span>
        </AnimatePresence>
      </motion.button>

      <AnimatePresence>
        {isRecording && (
          <motion.button
            type="button"
            onClick={handleCancel}
            title="Cancelar grabación (descartar)"
            aria-label="Cancelar grabación"
            initial={{ opacity: 0, x: -6, width: 0 }}
            animate={{ opacity: 1, x: 0, width: "auto" }}
            exit={{ opacity: 0, x: -6, width: 0 }}
            transition={ANIM}
            className={cn(
              "rounded-lg border border-line-200 bg-surface text-ink-500 hover:text-ink-900 hover:border-brand-400 inline-flex items-center justify-center shrink-0 overflow-hidden",
              variant === "compact" ? "h-8 px-1.5" : "h-9 px-2",
            )}
          >
            <X className={iconCls} />
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  );
}

/**
 * Crossfade entre los 3 estados de icono (mic / stop / loader). Sin
 * `mode="wait"` el icono nuevo entra mientras el viejo sale — más fluido
 * para algo tan rápido (250ms). El stop incluye el PulseRing del nivel
 * de audio, así que solo se renderiza con la variante 'stop'.
 */
function IconCrossfade({
  mode, level, sizeCls, stopSizeCls,
}: {
  mode: "mic" | "stop" | "loader";
  level: number;
  sizeCls: string;
  stopSizeCls: string;
}) {
  return (
    <span className="relative inline-flex items-center justify-center">
      <AnimatePresence mode="wait" initial={false}>
        {mode === "mic" && (
          <motion.span
            key="mic"
            initial={{ opacity: 0, scale: 0.7 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.7 }}
            transition={ANIM}
            className="inline-flex"
          >
            <Mic className={sizeCls} />
          </motion.span>
        )}
        {mode === "stop" && (
          <motion.span
            key="stop"
            initial={{ opacity: 0, scale: 0.7 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.7 }}
            transition={ANIM}
            className="relative inline-flex"
          >
            <Square className={cn(stopSizeCls, "fill-current")} />
            <PulseRing level={level} />
          </motion.span>
        )}
        {mode === "loader" && (
          <motion.span
            key="loader"
            initial={{ opacity: 0, scale: 0.7 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.7 }}
            transition={ANIM}
            className="inline-flex"
          >
            <Loader2 className={cn(sizeCls, "animate-spin")} />
          </motion.span>
        )}
      </AnimatePresence>
    </span>
  );
}

/** Pulso de fondo del Square que escala con el nivel de audio. */
function PulseRing({ level }: { level: number }) {
  const scale = 1 + Math.min(0.6, level * 1.2);
  return (
    <span
      className="absolute -inset-1 rounded-full bg-rose-400/40 pointer-events-none"
      style={{
        transform: `scale(${scale})`,
        transition: "transform 80ms linear",
      }}
      aria-hidden
    />
  );
}
