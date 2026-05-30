import { useEffect, useState } from "react";
import { Mic, Square, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";
import { useVoiceRecorder } from "@/lib/useVoiceRecorder";

/**
 * Botón "Dictar" reutilizable. Encapsula el ciclo completo:
 *   idle  → click → solicita micrófono → recording (con indicador
 *           visual de nivel + tiempo) → click → transcribing → idle
 *
 * El consumidor solo provee `onTranscript(text)` y decide cómo
 * insertar ese texto (appendear a un textarea, llamar a un comando
 * de TipTap, etc). Eso hace el componente agnóstico al destino.
 *
 * Variantes:
 *   - "icon"  (default): botón redondo h-9 con solo el icono. Ideal
 *     dentro de toolbars o al lado de inputs sin estorbar.
 *   - "compact": h-8 px-2.5 con icono + label corto. Para campos
 *     pequeños tipo "Motivo de consulta" donde queremos texto claro.
 *   - "labelled": h-9 px-3 con icono + "Dictar". Para áreas grandes
 *     tipo notas o editor de documento.
 */
type Variant = "icon" | "compact" | "labelled";

interface Props {
  onTranscript: (text: string) => void;
  /** Label custom — sobreescribe los defaults por variant. */
  label?: string;
  variant?: Variant;
  /** Deshabilita el botón (mientras el contenedor está disabled, etc). */
  disabled?: boolean;
  className?: string;
  /** Pasado a useVoiceRecorder. Default 5 min. */
  maxDurationMs?: number;
}

function fmtSec(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, "0")}`;
}

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

  const handleClick = async () => {
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
  };

  // Mostrar error como toast cuando aparece. useEffect evita ejecutar
  // toast.error() en cada render (sería loop infinito) — solo cuando
  // el estado pasa a 'error'. Después reseteamos a idle.
  useEffect(() => {
    if (rec.state === "error" && rec.error) {
      toast.error(rec.error);
      rec.cancel();
    }
  }, [rec.state, rec.error, rec]);

  const isRecording = rec.state === "recording";
  const isRequesting = rec.state === "requesting";
  const showLoader = transcribing || isRequesting;

  const baseLabel = label ?? (variant === "compact" ? "Dictar" : "Dictar");
  const recordingLabel = `${fmtSec(rec.elapsedMs)} · detener`;

  // Render por variant
  if (variant === "icon") {
    return (
      <button
        type="button"
        onClick={handleClick}
        disabled={disabled || showLoader}
        title={isRecording ? "Detener grabación" : "Dictar (voz a texto)"}
        aria-label={isRecording ? "Detener grabación" : "Iniciar dictado por voz"}
        aria-pressed={isRecording}
        className={cn(
          "relative h-9 w-9 rounded-lg border inline-flex items-center justify-center transition-all shrink-0",
          isRecording
            ? "border-rose-300 bg-rose-50 text-rose-700 hover:bg-rose-100"
            : "border-line-200 bg-surface text-ink-700 hover:border-brand-400",
          (disabled || showLoader) && "opacity-50 cursor-not-allowed",
          className,
        )}
      >
        {showLoader ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : isRecording ? (
          <>
            <Square className="h-3.5 w-3.5 fill-current" />
            <PulseRing level={rec.level} />
          </>
        ) : (
          <Mic className="h-4 w-4" />
        )}
      </button>
    );
  }

  const sizeCls = variant === "compact" ? "h-8 px-2.5 text-xs gap-1.5" : "h-9 px-3 text-sm gap-2";
  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={disabled || showLoader}
      aria-pressed={isRecording}
      className={cn(
        "relative inline-flex items-center rounded-lg border font-medium transition-all shrink-0",
        sizeCls,
        isRecording
          ? "border-rose-300 bg-rose-50 text-rose-700 hover:bg-rose-100"
          : "border-line-200 bg-surface text-ink-700 hover:border-brand-400",
        (disabled || showLoader) && "opacity-50 cursor-not-allowed",
        className,
      )}
    >
      {showLoader ? (
        <>
          <Loader2 className={cn(variant === "compact" ? "h-3.5 w-3.5" : "h-4 w-4", "animate-spin")} />
          {transcribing ? "Transcribiendo…" : "Esperando micrófono…"}
        </>
      ) : isRecording ? (
        <>
          <span className="relative inline-flex">
            <Square className={cn(variant === "compact" ? "h-3 w-3" : "h-3.5 w-3.5", "fill-current")} />
            <PulseRing level={rec.level} />
          </span>
          {recordingLabel}
        </>
      ) : (
        <>
          <Mic className={cn(variant === "compact" ? "h-3.5 w-3.5" : "h-4 w-4")} />
          {baseLabel}
        </>
      )}
    </button>
  );
}

/**
 * Anillo pulsante alrededor del icono "stop" mientras se graba.
 * Escala con el nivel de audio en tiempo real para feedback visual.
 */
function PulseRing({ level }: { level: number }) {
  const scale = 1 + Math.min(0.6, level * 1.2);
  return (
    <span
      className="absolute inset-0 rounded-full bg-rose-400/40 pointer-events-none"
      style={{
        transform: `scale(${scale})`,
        transition: "transform 80ms linear",
      }}
      aria-hidden
    />
  );
}
