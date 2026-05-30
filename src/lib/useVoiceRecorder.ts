import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Hook que encapsula MediaRecorder para captura de audio del micrófono.
 *
 * Estados:
 *   - idle: no hay grabación activa.
 *   - requesting: pidiendo permiso al micrófono (puede tardar si el
 *     browser muestra el prompt nativo).
 *   - recording: grabando. `level` (0..1) refleja el volumen actual
 *     para que el componente pueda animar un indicador visual.
 *   - error: algo falló (permiso denegado, no hay micrófono, etc.).
 *
 * El consumidor llama start() / stop(); al stop() se resuelve con un
 * Blob de audio (webm/opus en Chrome y Firefox, mp4 en Safari). El
 * Blob va al backend tal cual — Whisper acepta ambos.
 *
 * El nivel se computa con AnalyserNode y un loop con rAF. Más liviano
 * que ScriptProcessorNode y no está deprecated como AudioWorkletNode
 * para casos simples.
 */

export type VoiceRecorderState = "idle" | "requesting" | "recording" | "error";

interface UseVoiceRecorderOptions {
  /** ms máximos. Whisper soporta hasta 25MB; ~5 min de webm/opus
   *  caben sobrados. Default 5 min — auto-stop si el usuario se olvida. */
  maxDurationMs?: number;
}

export interface UseVoiceRecorderApi {
  state: VoiceRecorderState;
  /** 0..1, volumen RMS en tiempo real. Solo válido durante 'recording'. */
  level: number;
  /** ms transcurridos desde que arrancó la grabación. */
  elapsedMs: number;
  error: string | null;
  start: () => Promise<void>;
  /** Detiene la grabación y resuelve con el Blob final. */
  stop: () => Promise<Blob | null>;
  /** Cancela: para el stream y descarta lo grabado, sin resolver Blob. */
  cancel: () => void;
}

/** Mime type preferido. Chromium/Firefox soportan webm/opus, Safari mp4. */
function pickMime(): string {
  if (typeof MediaRecorder === "undefined") return "";
  const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg"];
  for (const m of candidates) {
    try { if (MediaRecorder.isTypeSupported(m)) return m; } catch { /* noop */ }
  }
  return "";
}

export function useVoiceRecorder(opts: UseVoiceRecorderOptions = {}): UseVoiceRecorderApi {
  const maxDurationMs = opts.maxDurationMs ?? 5 * 60 * 1000;
  const [state, setState] = useState<VoiceRecorderState>("idle");
  const [level, setLevel] = useState(0);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [error, setError] = useState<string | null>(null);

  // Refs: ningún re-render entre estos, son recursos del browser que
  // hay que limpiar manualmente al detener/cancelar.
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const rafRef = useRef<number | null>(null);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startedAtRef = useRef<number>(0);
  const stopResolversRef = useRef<{ resolve: (b: Blob | null) => void } | null>(null);
  const mimeRef = useRef<string>("");

  const cleanup = useCallback(() => {
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (tickRef.current != null) {
      clearInterval(tickRef.current);
      tickRef.current = null;
    }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (audioCtxRef.current && audioCtxRef.current.state !== "closed") {
      void audioCtxRef.current.close();
    }
    audioCtxRef.current = null;
    analyserRef.current = null;
    recorderRef.current = null;
    chunksRef.current = [];
    setLevel(0);
  }, []);

  // Cleanup al desmontar — evita que un componente que se desmonta
  // a media grabación deje el micrófono activo (LED indicador del SO
  // queda encendido y es feo).
  useEffect(() => {
    return () => { cleanup(); };
  }, [cleanup]);

  const start = useCallback(async () => {
    if (state === "recording" || state === "requesting") return;
    setError(null);
    setState("requesting");

    try {
      if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
        throw new Error("Tu navegador no soporta grabación de audio.");
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      streamRef.current = stream;

      const mime = pickMime();
      mimeRef.current = mime;
      const rec = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
      recorderRef.current = rec;
      chunksRef.current = [];

      rec.ondataavailable = (ev) => {
        if (ev.data && ev.data.size > 0) chunksRef.current.push(ev.data);
      };
      rec.onstop = () => {
        const blob = new Blob(chunksRef.current, {
          type: mimeRef.current || rec.mimeType || "audio/webm",
        });
        const resolver = stopResolversRef.current;
        stopResolversRef.current = null;
        cleanup();
        setState("idle");
        if (resolver) resolver.resolve(blob);
      };
      rec.onerror = (ev: any) => {
        setError(String(ev?.error?.message ?? "Error grabando audio"));
        cleanup();
        setState("error");
        stopResolversRef.current?.resolve(null);
        stopResolversRef.current = null;
      };

      // Analyser para nivel de volumen
      try {
        const ctx = new AudioContext();
        audioCtxRef.current = ctx;
        const src = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 512;
        analyser.smoothingTimeConstant = 0.7;
        src.connect(analyser);
        analyserRef.current = analyser;
        const buf = new Uint8Array(analyser.frequencyBinCount);
        const tick = () => {
          if (!analyserRef.current) return;
          analyserRef.current.getByteTimeDomainData(buf);
          // RMS aproximado normalizado 0..1
          let sumSq = 0;
          for (let i = 0; i < buf.length; i++) {
            const v = (buf[i] - 128) / 128;
            sumSq += v * v;
          }
          const rms = Math.sqrt(sumSq / buf.length);
          // Escala perceptual — un dictado normal da ~0.05-0.15 RMS.
          // Mapeamos a [0,1] con boost para que el indicador sea visible.
          setLevel(Math.min(1, rms * 4));
          rafRef.current = requestAnimationFrame(tick);
        };
        rafRef.current = requestAnimationFrame(tick);
      } catch (_e) {
        // Sin analyser, la grabación funciona pero no hay indicador
        // de volumen. No bloqueamos por esto.
      }

      // Timer para elapsedMs + auto-stop al máximo
      startedAtRef.current = Date.now();
      setElapsedMs(0);
      tickRef.current = setInterval(() => {
        const e = Date.now() - startedAtRef.current;
        setElapsedMs(e);
        if (e >= maxDurationMs) {
          // Auto-stop al llegar al máximo. El consumidor se entera
          // por su .then() del stop pendiente o por el cambio a 'idle'.
          recorderRef.current?.stop();
        }
      }, 200);

      rec.start();
      setState("recording");
    } catch (err: any) {
      cleanup();
      setState("error");
      // Mensajes claros para los casos típicos
      if (err?.name === "NotAllowedError" || err?.name === "SecurityError") {
        setError("Permiso de micrófono denegado. Habilítalo en la configuración del navegador.");
      } else if (err?.name === "NotFoundError") {
        setError("No se detectó ningún micrófono.");
      } else {
        setError(err?.message ?? "No se pudo acceder al micrófono.");
      }
    }
  }, [state, maxDurationMs, cleanup]);

  const stop = useCallback(async (): Promise<Blob | null> => {
    const rec = recorderRef.current;
    if (!rec || rec.state === "inactive") return null;
    return new Promise<Blob | null>((resolve) => {
      stopResolversRef.current = { resolve };
      rec.stop();
    });
  }, []);

  const cancel = useCallback(() => {
    const rec = recorderRef.current;
    if (rec && rec.state !== "inactive") {
      // Descartar el blob: limpiamos chunks ANTES del stop así onstop
      // ve buffer vacío y no hay confusión.
      chunksRef.current = [];
      try { rec.stop(); } catch { /* noop */ }
    }
    cleanup();
    setState("idle");
    setError(null);
  }, [cleanup]);

  return { state, level, elapsedMs, error, start, stop, cancel };
}
