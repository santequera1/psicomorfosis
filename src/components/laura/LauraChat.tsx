import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  Send, X, Sparkles, Loader2, AlertTriangle, ShieldCheck, Trash2,
  MessageSquarePlus, ChevronLeft, Plus, History,
  Paperclip, Image as ImageIcon, Mic, Square,
} from "lucide-react";
import { api, type LauraStreamEvent } from "@/lib/api";
import { cn } from "@/lib/utils";
import { LauraProposalCard, type ProposedAction } from "./LauraProposalCard";
import { useVoiceRecorder } from "@/lib/useVoiceRecorder";
import { toast } from "sonner";

/**
 * Chat de Laura — drawer lateral derecho con conversación streaming.
 *
 * Estructura:
 *   - Header: avatar + título + cerrar
 *   - Banner beta (cuota actual + status DARIO)
 *   - Lista de mensajes (markdown ligero)
 *   - Input + send
 *   - Banner permanente "Laura nunca toca tu historia sin tu permiso"
 *
 * Maneja:
 *   - Streaming SSE de respuestas
 *   - Auto-detect del paciente activo desde la URL (/pacientes/$id/...)
 *   - Cambio de avatar 1→2 al primer mensaje del usuario
 *   - Historial de conversaciones previas (lista lateral colapsable)
 */

// Único avatar: profile-2 desde el inicio (decidido por UX — profile-1
// queda como sprite alterno para iteraciones futuras o badge animado).
const AVATAR_INITIAL = "/laura/laura-profile-2.svg";
const AVATAR_ACTIVE = "/laura/laura-profile-2.svg";

type Message = {
  id?: number;
  role: "user" | "assistant";
  content: string;
  // Solo para assistant: "streaming" mientras llega, "ok"/"error" cuando termina
  status?: "streaming" | "ok" | "error";
  error?: string | null;
  /** Solo para mensajes del user: dataURLs de imágenes adjuntas
   *  para mostrar inline en la burbuja después de enviarlas. */
  imageDataUrls?: string[];
  /** Solo para assistant: acciones propuestas (tool_use). Cada una
   *  se renderiza como una <LauraProposalCard> debajo del texto. */
  proposedActions?: ProposedAction[];
};

type AttachedImage = {
  id: string;
  dataUrl: string;          // "data:image/jpeg;base64,..." para preview <img>
  base64: string;           // solo bytes (sin prefijo) — eso es lo que va al server
  mediaType: string;        // image/jpeg | image/png | etc.
  filename: string;
  sizeBytes: number;
};

const ALLOWED_IMAGE_TYPES = new Set([
  "image/jpeg", "image/png", "image/gif", "image/webp",
]);
const MAX_IMAGES = 5;
const MAX_IMAGE_BYTES = 4 * 1024 * 1024; // 4MB por imagen

type Props = {
  open: boolean;
  onClose: () => void;
};

/**
 * Key de sessionStorage donde guardamos el id de la conversación
 * activa. AppShell se remonta en cada cambio de ruta (ver LauraFab),
 * así que si Laura ejecuta una acción y navega, el state local de
 * este componente se vacía. Persistimos el id acá para poder
 * rehidratar los mensajes al volver a montar.
 */
const STORAGE_CONV_ID = "laura.activeConvId";

export function LauraChat({ open, onClose }: Props) {
  const [conversationId, setConversationId] = useState<number | null>(() => {
    if (typeof window === "undefined") return null;
    const raw = window.sessionStorage.getItem(STORAGE_CONV_ID);
    const n = raw ? Number(raw) : NaN;
    return Number.isFinite(n) ? n : null;
  });
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [attachedImages, setAttachedImages] = useState<AttachedImage[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Dictado de voz: useVoiceRecorder maneja el MediaRecorder + nivel
  // RMS + timer. transcribing es el estado entre stop() y respuesta
  // de /api/voice/transcribe (Whisper). Cap a 5 min para que el
  // psicólogo pueda dictar una sesión entera sin pasar el límite de
  // Whisper (25MB).
  const voice = useVoiceRecorder({ maxDurationMs: 5 * 60 * 1000 });
  const [transcribing, setTranscribing] = useState(false);

  async function startDictation() {
    if (sending || isResting || transcribing) return;
    await voice.start();
  }
  async function stopDictation() {
    if (voice.state !== "recording") return;
    setTranscribing(true);
    const blob = await voice.stop();
    if (!blob) { setTranscribing(false); return; }
    const result = await api.transcribeVoice(blob, { filename: "dictado.webm" });
    setTranscribing(false);
    if (!result.success) {
      toast.error(result.error || "No pude transcribir el audio.");
      return;
    }
    if (!result.text.trim()) {
      toast.info("No se detectó voz en la grabación.");
      return;
    }
    // Anexar al input actual (no pisar). Si había texto previo,
    // separamos con espacio para que quede prolijo.
    setInput((prev) => {
      const sep = prev.trim().length > 0 ? " " : "";
      return prev + sep + result.text.trim();
    });
    // Focus al textarea para que el psicólogo pueda editar / mandar.
    window.setTimeout(() => inputRef.current?.focus(), 50);
  }
  function cancelDictation() {
    voice.cancel();
  }
  // Decisiones tomadas por el usuario sobre las propuestas (tool_use).
  // Una propuesta puede estar "approved" o "dismissed". Si no aparece
  // en el map, sigue siendo interactiva. Persistimos en sessionStorage
  // para que reabrir el chat no pierda el estado de las decisiones.
  const [toolDecisions, setToolDecisions] = useState<Record<string, "approved" | "dismissed">>(() => {
    if (typeof window === "undefined") return {};
    try {
      const raw = window.sessionStorage.getItem("laura.toolDecisions");
      return raw ? JSON.parse(raw) : {};
    } catch { return {}; }
  });
  const decideTool = useCallback((toolId: string, decision: "approved" | "dismissed") => {
    setToolDecisions((prev) => {
      const next = { ...prev, [toolId]: decision };
      try { window.sessionStorage.setItem("laura.toolDecisions", JSON.stringify(next)); } catch {}
      return next;
    });
  }, []);
  // mounted controla la animación: cuando `open` pasa a false, no
  // desmontamos inmediatamente — mantenemos `mounted=true` mientras se
  // ejecuta la animación de salida, luego desmontamos al terminar.
  const [mounted, setMounted] = useState(open);
  const [entering, setEntering] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Ciclo de mount/animate/unmount: cuando open=true → mount inmediato y
  // dispara animación de entrada. Cuando open=false → animación de
  // salida (220ms) y luego unmount.
  useEffect(() => {
    if (open) {
      setMounted(true);
      // Pequeño tick para que el primer render parta de las clases
      // "out" y luego entre. Sin esto el browser no detecta el cambio
      // y no anima.
      requestAnimationFrame(() => {
        requestAnimationFrame(() => setEntering(true));
      });
    } else if (mounted) {
      setEntering(false);
      const t = setTimeout(() => setMounted(false), 240);
      return () => clearTimeout(t);
    }
  }, [open, mounted]);

  // Auto-detect: si estamos en /pacientes/<id> esa es la ficha activa.
  const routerState = useRouterState();
  const currentPath = routerState.location.pathname;
  // TanStack expone `search` como objeto ya parseado, NO como string.
  const routerSearch = routerState.location.search as Record<string, unknown> | undefined;
  const searchId = typeof routerSearch?.id === "string" ? routerSearch.id : null;
  // Patient activo: detectamos en /pacientes/$id (param dinámico) Y
  // en /historia?id=X (la vista de historia clínica usa query param).
  // Cuando Laura tiene patient activo, el backend inyecta toda su
  // ficha (notas, tareas, tests, diagnósticos) en el system prompt.
  const activePatientId = useMemo(() => {
    const m = currentPath.match(/^\/pacientes\/([^/]+)/);
    if (m) return decodeURIComponent(m[1]);
    if (currentPath === "/historia" && searchId) return searchId;
    return null;
  }, [currentPath, searchId]);

  // Health + usage para el banner de cuota
  const { data: health } = useQuery({
    queryKey: ["laura-health"],
    queryFn: () => api.lauraHealth(),
    enabled: open,
    refetchInterval: 60_000,
    staleTime: 30_000,
  });
  const { data: usage, refetch: refetchUsage } = useQuery({
    queryKey: ["laura-usage"],
    queryFn: () => api.lauraUsage(),
    enabled: open,
    refetchInterval: 30_000,
  });
  // Cuota real de Claude (% sesión + % semana). Primera llamada
  // tarda ~3-5s; siguientes instantáneas por cache server-side.
  const { data: quota } = useQuery({
    queryKey: ["laura-quota"],
    queryFn: () => api.lauraQuota(),
    enabled: open,
    // Refresh cada 2 min — la barra se actualiza sola si el usuario
    // deja el chat abierto.
    refetchInterval: 120_000,
    staleTime: 60_000,
  });

  // Estado derivado para el banner y para deshabilitar el input
  // cuando Laura no puede responder (cuota al 100% o servicio caído).
  const lauraStatus = deriveLauraStatus(health, quota);
  const isResting = lauraStatus === "resting";

  // Avatar dinámico: el ÚNICO disparo de cambio es enviar el primer
  // mensaje del usuario en esta conversación. Una vez ocurre, persiste
  // en sessionStorage para que reabrir el chat mantenga el estado.
  const [hasSpoken, setHasSpoken] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.sessionStorage.getItem("laura.spoken") === "1";
  });
  const markSpoken = useCallback(() => {
    setHasSpoken(true);
    try { window.sessionStorage.setItem("laura.spoken", "1"); } catch {}
  }, []);

  // Persistir conversationId activo. Esto sobrevive a navegaciones
  // (AppShell remonta este componente entero al cambiar de ruta).
  useEffect(() => {
    try {
      if (conversationId == null) {
        window.sessionStorage.removeItem(STORAGE_CONV_ID);
      } else {
        window.sessionStorage.setItem(STORAGE_CONV_ID, String(conversationId));
      }
    } catch { /* SSR / quota / private mode */ }
  }, [conversationId]);

  // Rehidratar mensajes cuando el componente se monta con un
  // conversationId persistido en storage. Si la conversación fue
  // borrada en el backend, limpiamos el estado y dejamos chat vacío.
  useEffect(() => {
    if (conversationId == null) return;
    if (messages.length > 0) return; // mensajes ya cargados, no pisar
    let cancelled = false;
    (async () => {
      try {
        const { messages: msgs } = await api.lauraGetConversation(conversationId);
        if (cancelled) return;
        setMessages(msgs.map((m) => ({
          id: m.id,
          role: m.role,
          content: m.content,
          status: m.error ? "error" : "ok",
          error: m.error,
          proposedActions: m.proposed_actions ?? undefined,
        })));
      } catch {
        if (!cancelled) {
          // Conv ya no existe (borrada o id inválido), reset
          setConversationId(null);
          setMessages([]);
        }
      }
    })();
    return () => { cancelled = true; };
    // Intencionalmente solo al mount (con el conv inicial del storage)
    // — no queremos re-fetch cada vez que conversationId cambia por
    // acciones del usuario (loadConversation ya hace el fetch).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Scroll auto al fondo cuando llegan mensajes nuevos o tokens
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  // Focus al abrir
  useEffect(() => {
    if (open && !sending) {
      const t = setTimeout(() => inputRef.current?.focus(), 100);
      return () => clearTimeout(t);
    }
  }, [open, sending]);

  // ── Manejo de imágenes adjuntas ──────────────────────────────────

  // Convierte un File a dataURL + base64 puro (sin el prefijo
  // "data:...;base64,"). Valida tipo y tamaño y devuelve un
  // AttachedImage o null con un error.
  const fileToAttachment = useCallback(async (file: File): Promise<AttachedImage | string> => {
    if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
      return `Tipo no soportado (${file.type || "desconocido"}). Usa JPG, PNG, GIF o WebP.`;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      return `La imagen pesa ${(file.size / 1024 / 1024).toFixed(1)} MB. Máximo 4 MB.`;
    }
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result));
      r.onerror = () => reject(r.error);
      r.readAsDataURL(file);
    });
    // dataUrl viene como "data:image/jpeg;base64,<base64>". Cortamos.
    const commaIdx = dataUrl.indexOf(",");
    const base64 = commaIdx >= 0 ? dataUrl.slice(commaIdx + 1) : dataUrl;
    return {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      dataUrl,
      base64,
      mediaType: file.type,
      filename: file.name || "imagen",
      sizeBytes: file.size,
    };
  }, []);

  const addFiles = useCallback(async (files: FileList | File[] | null | undefined) => {
    if (!files) return;
    const arr = Array.from(files);
    if (arr.length === 0) return;
    setAttachedImages((prev) => {
      const room = MAX_IMAGES - prev.length;
      if (room <= 0) return prev;
      return prev; // se actualiza luego con append
    });
    const next: AttachedImage[] = [];
    for (const file of arr) {
      const r = await fileToAttachment(file);
      if (typeof r === "string") {
        // Error de validación: lo añadimos como toast simple via alert
        // ligero (sin librería para no crecer dependencias acá).
        console.warn("[laura] upload:", r);
        continue;
      }
      next.push(r);
    }
    if (next.length === 0) return;
    setAttachedImages((prev) => [...prev, ...next].slice(0, MAX_IMAGES));
  }, [fileToAttachment]);

  const removeAttachedImage = useCallback((id: string) => {
    setAttachedImages((prev) => prev.filter((i) => i.id !== id));
  }, []);

  const onPaste = useCallback((e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    const files: File[] = [];
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      if (it.kind === "file") {
        const f = it.getAsFile();
        if (f && ALLOWED_IMAGE_TYPES.has(f.type)) files.push(f);
      }
    }
    if (files.length > 0) {
      e.preventDefault();
      void addFiles(files);
    }
  }, [addFiles]);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
    const files = e.dataTransfer?.files;
    if (files && files.length > 0) void addFiles(files);
  }, [addFiles]);

  // ── Acciones ──────────────────────────────────────────────────────

  const send = useCallback(async (overrideText?: string) => {
    // Si viene texto explícito (ej: click en chip de sugerencia), lo
    // usamos en lugar del state del input. Eso evita el bug clásico de
    // setState + closure: setInput(text) + send() en el mismo handler
    // no ve el nuevo texto, porque la closure capturó el state viejo.
    const trimmed = (overrideText ?? input).trim();
    const hasImages = attachedImages.length > 0;
    // Permitimos enviar solo imágenes (sin texto) — Claude visión las
    // describe / interpreta. Requerimos al menos una de las dos cosas.
    if ((!trimmed && !hasImages) || sending) return;
    // Si Laura está descansando (cuota agotada o servicio caído),
    // bloqueamos el envío en el cliente para no gastar un round-trip
    // que sabemos va a fallar. El backend igual está protegido si
    // alguien fuerza la request — devuelve quota_exhausted.
    if (isResting) return;

    // Snapshot de las imágenes antes de limpiarlas (para mostrarlas
    // en la burbuja del user y para mandarlas al backend).
    const sendingImages = attachedImages;

    setSending(true);
    setInput("");
    setAttachedImages([]);
    markSpoken();

    // Append mensaje del user (con sus imágenes inline) y placeholder
    setMessages((prev) => [
      ...prev,
      {
        role: "user",
        content: trimmed,
        imageDataUrls: sendingImages.map((i) => i.dataUrl),
      },
      { role: "assistant", content: "", status: "streaming" },
    ]);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      await api.lauraChatStream(
        {
          conversation_id: conversationId,
          patient_id: activePatientId,
          current_path: currentPath,
          message: trimmed,
          images: sendingImages.length > 0
            ? sendingImages.map((i) => ({ data: i.base64, media_type: i.mediaType }))
            : undefined,
        },
        (ev: LauraStreamEvent) => {
          if (ev.type === "conversation_id") {
            setConversationId(ev.id);
          } else if (ev.type === "delta") {
            setMessages((prev) => {
              const next = [...prev];
              const last = next[next.length - 1];
              if (last?.role === "assistant") {
                next[next.length - 1] = { ...last, content: last.content + ev.text };
              }
              return next;
            });
          } else if (ev.type === "tool_call") {
            // Acumulamos cada acción propuesta en el mensaje del
            // assistant en curso. La UI ya muestra la tarjeta debajo
            // del texto del bubble apenas llega.
            setMessages((prev) => {
              const next = [...prev];
              const last = next[next.length - 1];
              if (last?.role === "assistant") {
                const actions = last.proposedActions ?? [];
                next[next.length - 1] = {
                  ...last,
                  proposedActions: [
                    ...actions,
                    { tool_id: ev.tool_id, name: ev.name, input: ev.input },
                  ],
                };
              }
              return next;
            });
          } else if (ev.type === "error") {
            setMessages((prev) => {
              const next = [...prev];
              const last = next[next.length - 1];
              if (last?.role === "assistant") {
                next[next.length - 1] = {
                  ...last,
                  status: "error",
                  error: ev.message,
                  content: last.content || ev.message,
                };
              }
              return next;
            });
          } else if (ev.type === "done") {
            setMessages((prev) => {
              const next = [...prev];
              const last = next[next.length - 1];
              if (last?.role === "assistant" && last.status === "streaming") {
                next[next.length - 1] = { ...last, status: "ok" };
              }
              return next;
            });
            if (ev.conversation_id) setConversationId(ev.conversation_id);
            refetchUsage();
          }
        },
        controller.signal,
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setMessages((prev) => {
        const next = [...prev];
        const last = next[next.length - 1];
        if (last?.role === "assistant") {
          next[next.length - 1] = {
            ...last,
            status: "error",
            error: msg,
            content: last.content || `Error: ${msg}`,
          };
        }
        return next;
      });
    } finally {
      // Safety net: si la burbuja del assistant sigue en "streaming"
      // cuando el stream se cierra (sin error explícito ni done), la
      // marcamos como completada o con un error genérico para no
      // dejar el cursor parpadeando para siempre.
      setMessages((prev) => {
        const next = [...prev];
        const last = next[next.length - 1];
        if (last?.role === "assistant" && last.status === "streaming") {
          if (last.content) {
            next[next.length - 1] = { ...last, status: "ok" };
          } else {
            next[next.length - 1] = {
              ...last,
              status: "error",
              error: "Stream cerrado sin respuesta",
              content: "No recibí respuesta del servidor. Reintenta o avísanos si persiste.",
            };
          }
        }
        return next;
      });
      setSending(false);
      abortRef.current = null;
    }
  }, [input, sending, isResting, conversationId, activePatientId, currentPath, markSpoken, refetchUsage]);

  const newConversation = useCallback(() => {
    if (sending) abortRef.current?.abort();
    setConversationId(null);
    setMessages([]);
    setInput("");
  }, [sending]);

  const loadConversation = useCallback(async (id: number) => {
    setShowHistory(false);
    if (sending) abortRef.current?.abort();
    try {
      const { messages: msgs } = await api.lauraGetConversation(id);
      setConversationId(id);
      setMessages(msgs.map((m) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        status: m.error ? "error" : "ok",
        error: m.error,
        proposedActions: m.proposed_actions ?? undefined,
      })));
    } catch {
      // si falla, no cambiamos el estado
    }
  }, [sending]);

  if (!mounted) return null;

  return (
    <>
      {/* Backdrop — solo en mobile, con fade */}
      <div
        className={cn(
          "lg:hidden fixed inset-0 z-40 bg-ink-900/40 backdrop-blur-sm",
          "transition-opacity duration-200 ease-out",
          entering ? "opacity-100" : "opacity-0",
        )}
        onClick={onClose}
        aria-hidden
      />

      {/* Drawer lateral derecho — desliza desde la derecha + fade del
          backdrop. Easing levemente "spring-y" con cubic-bezier para
          que se sienta orgánico, no robótico. */}
      <aside
        className={cn(
          // h-[100dvh] = "dynamic viewport height": en mobile se ajusta
          // automáticamente cuando aparece el teclado virtual y no deja
          // el input/footer tapado. h-screen (100vh) ignora el teclado
          // y por eso antes el footer se escondía debajo.
          // lg-surface aplica liquid glass: blur + saturate + borde
          // brillante + refracción SVG. Override del rounded para que
          // pegue al borde derecho del viewport (no flotante).
          "lg-surface lg-surface--solid rounded-none! border-l!",
          "fixed top-0 right-0 z-50 h-dvh w-full sm:w-[420px]",
          "flex flex-col",
          "transition-transform duration-300",
          entering
            ? "translate-x-0"
            : "translate-x-full",
        )}
        style={{
          transitionTimingFunction: entering
            ? "cubic-bezier(0.16, 1, 0.3, 1)" // overshoot ligero al entrar
            : "cubic-bezier(0.7, 0, 0.84, 0)", // aceleración al salir
        }}
        role="dialog"
        aria-label="Asistente Laura"
      >
        {/* Header */}
        <header className="flex items-center gap-3 p-4 border-b border-line-100 shrink-0">
          <img
            src={hasSpoken ? AVATAR_ACTIVE : AVATAR_INITIAL}
            alt=""
            className="h-10 w-10 rounded-full object-cover bg-brand-50"
          />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <h2 className="font-serif text-base text-ink-900">Laura</h2>
              <span className="text-[10px] uppercase tracking-widest px-1.5 py-0.5 rounded-full bg-amber-50 border border-amber-200/70 text-amber-800 font-semibold">
                Beta
              </span>
            </div>
            <p className="text-[11px] text-ink-500 leading-tight">
              Asistente clínica · Memoria de tu consulta
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowHistory((v) => !v)}
            className={cn(
              "h-8 w-8 rounded-md inline-flex items-center justify-center",
              showHistory ? "bg-brand-50 text-brand-800" : "text-ink-500 hover:bg-bg-50",
            )}
            title="Historial de conversaciones"
          >
            <History className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={newConversation}
            className="h-8 w-8 rounded-md text-ink-500 hover:bg-bg-50 inline-flex items-center justify-center"
            title="Nueva conversación"
          >
            <Plus className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={onClose}
            className="h-8 w-8 rounded-md text-ink-500 hover:bg-bg-50 inline-flex items-center justify-center"
            aria-label="Cerrar"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        {/* Banner cuota/estado */}
        <BetaBanner health={health} usage={usage} quota={quota} />

        {/* Contexto activo */}
        {activePatientId && messages.length === 0 && (
          <div className="px-4 py-2 border-b border-line-100 bg-brand-50/40">
            <p className="text-[11px] text-brand-800 inline-flex items-center gap-1.5">
              <Sparkles className="h-3 w-3" />
              Estoy mirando la ficha del paciente activo.
            </p>
          </div>
        )}

        {/* Lista historial (overlay deslizable) */}
        {showHistory && (
          <ConversationHistory
            onPick={loadConversation}
            onClose={() => setShowHistory(false)}
            onDeleted={(deletedId) => {
              // Si borraron la conv activa, limpiar el chat para
              // que al cerrar el historial no vuelva a aparecer.
              if (deletedId === conversationId) {
                newConversation();
              }
            }}
          />
        )}

        {/* Cuerpo: mensajes */}
        <div
          ref={scrollRef}
          className="flex-1 overflow-y-auto px-4 py-4 space-y-4"
        >
          {messages.length === 0 ? (
            <EmptyState
              onPick={(text) => { void send(text); }}
              disabled={isResting}
            />
          ) : (
            messages.map((m, i) => (
              <div key={i} className="space-y-2">
                <MessageBubble message={m} avatarActive={hasSpoken} />
                {/* Tarjetas de propuesta (solo en mensajes del assistant) */}
                {m.role === "assistant" && m.proposedActions && m.proposedActions.length > 0 && (
                  <div className="pl-9 space-y-2">
                    {m.proposedActions.map((action) => (
                      <LauraProposalCard
                        key={action.tool_id}
                        action={action}
                        decision={toolDecisions[action.tool_id] ?? null}
                        onDecide={decideTool}
                      />
                    ))}
                  </div>
                )}
              </div>
            ))
          )}
        </div>

        {/* Input + attachments */}
        <form
          className="border-t border-line-100 p-3 shrink-0"
          onSubmit={(e) => { e.preventDefault(); void send(); }}
          onDragEnter={(e) => {
            if (isResting) return;
            const items = e.dataTransfer?.items;
            if (items && Array.from(items).some((i) => i.kind === "file")) {
              setDragOver(true);
            }
          }}
          onDragOver={(e) => {
            if (isResting) return;
            e.preventDefault(); // habilita el drop
          }}
          onDragLeave={(e) => {
            // El leave se dispara cuando entra a hijos también; verificar
            // que sale del contenedor real.
            if (e.currentTarget.contains(e.relatedTarget as Node)) return;
            setDragOver(false);
          }}
          onDrop={onDrop}
        >
          {/* Previews de imágenes adjuntas */}
          {attachedImages.length > 0 && (
            <div className="mb-2 flex flex-wrap gap-1.5">
              {attachedImages.map((img) => (
                <div
                  key={img.id}
                  className="relative group h-16 w-16 rounded-md overflow-hidden border border-line-200 bg-bg-50"
                  title={`${img.filename} · ${(img.sizeBytes / 1024).toFixed(0)} KB`}
                >
                  <img src={img.dataUrl} alt={img.filename} className="h-full w-full object-cover" />
                  <button
                    type="button"
                    onClick={() => removeAttachedImage(img.id)}
                    className="absolute top-0.5 right-0.5 h-5 w-5 rounded-full bg-ink-900/70 text-white hover:bg-ink-900 inline-flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                    aria-label={`Quitar ${img.filename}`}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
              {attachedImages.length < MAX_IMAGES && (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="h-16 w-16 rounded-md border-2 border-dashed border-line-200 hover:border-brand-400 text-ink-400 hover:text-brand-700 inline-flex items-center justify-center"
                  title="Agregar más imágenes"
                  disabled={isResting}
                >
                  <Plus className="h-4 w-4" />
                </button>
              )}
            </div>
          )}

          {/* Drop overlay visible cuando arrastras un archivo encima */}
          <div className="relative">
            {dragOver && !isResting && (
              <div className="absolute inset-0 z-10 rounded-lg border-2 border-dashed border-brand-400 bg-brand-50/90 flex items-center justify-center pointer-events-none">
                <span className="text-xs text-brand-800 font-medium inline-flex items-center gap-1.5">
                  <ImageIcon className="h-4 w-4" />
                  Suelta las imágenes acá
                </span>
              </div>
            )}
            {/* Mientras grabamos, ocultamos el textarea y mostramos
                un panel rojo con timer + nivel + cancelar/parar. Mismo
                alto que el textarea (44px) para que no salte el layout. */}
            {voice.state === "recording" ? (
              <RecordingPanel
                level={voice.level}
                elapsedMs={voice.elapsedMs}
                onCancel={cancelDictation}
                onStop={stopDictation}
              />
            ) : transcribing ? (
              <TranscribingPanel onCancel={() => setTranscribing(false)} />
            ) : (
            <div className="flex items-end gap-2">
              {/* Botón adjuntar — paperclip */}
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={sending || isResting || attachedImages.length >= MAX_IMAGES}
                className="h-11 w-11 rounded-lg border border-line-200 text-ink-600 hover:border-brand-400 hover:text-brand-700 disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center justify-center shrink-0"
                aria-label="Adjuntar imagen"
                title={
                  attachedImages.length >= MAX_IMAGES
                    ? `Máximo ${MAX_IMAGES} imágenes`
                    : "Adjuntar imagen (también puedes pegar con Ctrl+V o arrastrar)"
                }
              >
                <Paperclip className="h-4 w-4" />
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/gif,image/webp"
                multiple
                hidden
                onChange={(e) => {
                  void addFiles(e.target.files);
                  e.target.value = ""; // permite re-elegir el mismo archivo después
                }}
              />

              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onPaste={onPaste}
                onFocus={() => {
                  // En mobile el teclado virtual oculta el último
                  // mensaje. Scrolleamos al fondo tras un beat para
                  // que el browser termine de medir el nuevo viewport.
                  window.setTimeout(() => {
                    if (scrollRef.current) {
                      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
                    }
                  }, 250);
                }}
                placeholder={
                  isResting
                    ? "Laura está descansando — escribir queda deshabilitado hasta la renovación"
                    : attachedImages.length > 0
                      ? "Describe lo que ves, o envía solo la imagen…"
                      : activePatientId
                        ? "Pregúntame sobre este paciente o sobre la app…"
                        : "¿En qué te ayudo? (uso de la plataforma, redacción clínica, etc.)"
                }
                rows={2}
                maxLength={8000}
                disabled={sending || isResting}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void send();
                  }
                }}
                className="flex-1 min-h-[44px] max-h-40 px-3 py-2 rounded-lg border border-line-200 bg-bg text-sm text-ink-900 outline-none focus:border-brand-400 resize-y disabled:opacity-60 disabled:cursor-not-allowed"
              />
              {/* Botón dictado por voz — Whisper */}
              <button
                type="button"
                onClick={() => void startDictation()}
                disabled={sending || isResting}
                className="h-11 w-11 rounded-lg border border-line-200 text-ink-600 hover:border-brand-400 hover:text-brand-700 disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center justify-center shrink-0"
                aria-label="Dictar por voz"
                title="Dictar por voz — Laura puede convertir el dictado a SOAP o cualquier otro formato si se lo pedís"
              >
                <Mic className="h-4 w-4" />
              </button>
              <button
                type="submit"
                disabled={(!input.trim() && attachedImages.length === 0) || sending || isResting}
                className="h-11 w-11 rounded-lg bg-brand-700 text-white hover:bg-brand-800 disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center justify-center shrink-0"
                aria-label="Enviar"
                title={isResting ? "Laura está descansando" : "Enviar"}
              >
                {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </button>
            </div>
            )}
          </div>

          <p className="mt-2 text-[10px] text-ink-500 inline-flex items-center gap-1">
            <ShieldCheck className="h-3 w-3" />
            Laura nunca toca tus pacientes ni tu historia sin tu visto bueno.
          </p>
        </form>
      </aside>
    </>
  );
}

// ─── Subcomponentes ──────────────────────────────────────────────────

/**
 * Panel de grabación de voz. Reemplaza la row del input mientras
 * recording=true. Muestra timer mm:ss + barra de nivel reactiva al
 * volumen + dos acciones: cancelar (descarta) y parar (transcribe).
 *
 * El nivel se mapea a una barra horizontal con bg-rose-500 que sube
 * y baja con el RMS del audio — feedback visual de "te estoy oyendo".
 */
function RecordingPanel({
  level, elapsedMs, onCancel, onStop,
}: {
  level: number;
  elapsedMs: number;
  onCancel: () => void;
  onStop: () => void;
}) {
  const mm = Math.floor(elapsedMs / 60000);
  const ss = Math.floor((elapsedMs % 60000) / 1000);
  const timeLabel = `${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
  // Nivel a porcentaje con piso de 4% para que la barra nunca quede
  // completamente vacía y se sienta "viva" durante silencios cortos.
  const levelPct = Math.max(4, Math.min(100, level * 100));
  return (
    <div className="flex items-center gap-2 h-11 px-3 rounded-lg border border-rose-300 bg-rose-50/70">
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-rose-800 tabular shrink-0">
        <span className="h-2 w-2 rounded-full bg-rose-500 animate-pulse" />
        {timeLabel}
      </span>
      <div className="flex-1 h-1.5 rounded-full bg-rose-200/60 overflow-hidden">
        <div
          className="h-full bg-rose-500 rounded-full transition-all duration-100"
          style={{ width: `${levelPct}%` }}
        />
      </div>
      <button
        type="button"
        onClick={onCancel}
        className="h-8 w-8 rounded-md text-rose-700 hover:bg-rose-100 inline-flex items-center justify-center shrink-0"
        aria-label="Cancelar grabación"
        title="Cancelar (descarta el audio)"
      >
        <X className="h-4 w-4" />
      </button>
      <button
        type="button"
        onClick={onStop}
        className="h-8 w-8 rounded-md bg-rose-600 text-white hover:bg-rose-700 inline-flex items-center justify-center shrink-0"
        aria-label="Parar y transcribir"
        title="Parar y transcribir"
      >
        <Square className="h-3.5 w-3.5 fill-current" />
      </button>
    </div>
  );
}

/**
 * Panel mientras Whisper transcribe. Aparece entre el stop de la
 * grabación y que el texto entre al input. Usa el shimmer text de
 * transitions.dev para que se sienta vivo en lugar de un spinner
 * estático.
 */
function TranscribingPanel({ onCancel }: { onCancel: () => void }) {
  return (
    <div className="flex items-center gap-2 h-11 px-3 rounded-lg border border-line-200 bg-bg-50">
      <Loader2 className="h-4 w-4 animate-spin text-brand-700 shrink-0" />
      <span className="t-shimmer flex-1 text-xs font-medium" data-text="Transcribiendo audio…">
        Transcribiendo audio…
      </span>
      <button
        type="button"
        onClick={onCancel}
        className="h-8 px-2 rounded-md text-[11px] text-ink-600 hover:bg-bg-100 shrink-0"
        title="Cancelar"
      >
        Cancelar
      </button>
    </div>
  );
}

/**
 * Estado derivado del banner usado para deshabilitar el input cuando
 * corresponda. "resting" = no se puede enviar (cuota al 100% o
 * servicio caído). "high_demand" sigue habilitado (todavía hay margen).
 */
type LauraStatus = "available" | "high_demand" | "resting";

function deriveLauraStatus(
  health: { ok: boolean; subscription?: { ok: boolean } } | undefined,
  quota: { session: { percent: number } | null } | undefined,
): LauraStatus {
  if (!health) return "available";
  const serviceDown = !health.ok || (health.subscription && !health.subscription.ok);
  const sessionPct = quota?.session?.percent ?? null;
  if (serviceDown || (sessionPct !== null && sessionPct >= 100)) return "resting";
  if (sessionPct !== null && sessionPct >= 80) return "high_demand";
  return "available";
}

/**
 * Convierte la fecha de reset que devuelve Claude Code CLI ("Jun 22,
 * 8:29pm (UTC)" o "Jun 24, 10:59am (UTC)") a hora local Colombia con
 * formato amigable. Si no parsea, devuelve el string original como
 * fallback (mejor algo que nada).
 *
 * Devuelve algo como:
 *   - mismo día:  "3:29 p. m."
 *   - mañana:     "mañana a las 5:59 a. m."
 *   - otro día:   "mié 24 a las 5:59 a. m."
 */
function formatResetTimeColombia(resetStr: string | null | undefined): string | null {
  if (!resetStr) return null;
  const m = resetStr.match(/^(\w{3})\s+(\d+),?\s+(\d{1,2}):(\d{2})\s*(am|pm)\s*\(UTC\)$/i);
  if (!m) return resetStr;
  const monthMap: Record<string, number> = {
    jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
    jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
  };
  const month = monthMap[m[1].toLowerCase()];
  if (month === undefined) return resetStr;
  const day = parseInt(m[2], 10);
  let hour = parseInt(m[3], 10);
  const min = parseInt(m[4], 10);
  const ampm = m[5].toLowerCase();
  if (ampm === "pm" && hour !== 12) hour += 12;
  if (ampm === "am" && hour === 12) hour = 0;

  // Construimos en UTC. Asumimos el año actual; si el resultado queda
  // en el pasado (caso raro: cambio de año), probamos año+1.
  const now = new Date();
  let utc = new Date(Date.UTC(now.getUTCFullYear(), month, day, hour, min, 0));
  if (utc.getTime() < now.getTime() - 60_000) {
    utc = new Date(Date.UTC(now.getUTCFullYear() + 1, month, day, hour, min, 0));
  }

  // Diferencia en días naturales considerando timezone Colombia
  const todayCo = new Date(now.toLocaleString("en-US", { timeZone: "America/Bogota" }));
  const resetCo = new Date(utc.toLocaleString("en-US", { timeZone: "America/Bogota" }));
  const dayDiff = Math.floor(
    (new Date(resetCo.getFullYear(), resetCo.getMonth(), resetCo.getDate()).getTime() -
     new Date(todayCo.getFullYear(), todayCo.getMonth(), todayCo.getDate()).getTime()) /
    (24 * 60 * 60 * 1000),
  );

  const timeStr = utc.toLocaleTimeString("es-CO", {
    timeZone: "America/Bogota",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });

  if (dayDiff === 0) return timeStr;
  if (dayDiff === 1) return `mañana a las ${timeStr}`;
  const dayLabel = utc.toLocaleDateString("es-CO", {
    timeZone: "America/Bogota",
    weekday: "short",
    day: "numeric",
  });
  return `${dayLabel} a las ${timeStr}`;
}

function BetaBanner({
  health, usage, quota,
}: {
  health?: {
    ok: boolean;
    latencyMs?: number;
    error?: string;
    model: string;
    subscription?: { ok: boolean; status: string | null; expires_in: string | null; error?: string | null };
  };
  usage?: { messages_today: number; tokens_in_today: number; tokens_out_today: number };
  quota?: {
    session: { percent: number; resets_at: string } | null;
    week: { percent: number; resets_at: string } | null;
    error?: string;
  };
}) {
  if (!health) return null;

  const sub = health.subscription;
  const messages = usage?.messages_today ?? 0;
  const sessionPct = quota?.session?.percent ?? null;
  const resetCo = formatResetTimeColombia(quota?.session?.resets_at);

  // Tres estados visuales claros (sin barra — genera ansiedad de ver
  // el % subir). Los umbrales son los que ya usábamos para colorear
  // la barra, ahora aplicados a fondo + dot + mensaje.
  //
  //   🟢 Disponible:   pct < 80% (y servicio sano)
  //   🟠 Alta demanda: pct >= 80% (cerca del límite)
  //   🔴 Descansando:  pct >= 100% O servicio caído O suscripción agotada
  const serviceDown = !health.ok || (sub && !sub.ok);
  const isResting = serviceDown || (sessionPct !== null && sessionPct >= 100);
  const isHighDemand = !isResting && sessionPct !== null && sessionPct >= 80;

  if (isResting) {
    return (
      <div className="px-4 py-2.5 bg-rose-50 border-b border-rose-200">
        <p className="text-[11px] text-rose-900 font-semibold leading-snug flex items-center gap-1.5">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-rose-500" />
          Laura descansando un momento
        </p>
        <p className="text-[11px] text-rose-800/90 leading-snug mt-1">
          La capacidad beta se ha alcanzado.
        </p>
        {resetCo && (
          <p className="text-[11px] text-rose-800/90 leading-snug mt-0.5">
            Estará disponible nuevamente {resetCo.includes("a las") ? resetCo : `a las ${resetCo}`}.
          </p>
        )}
      </div>
    );
  }

  if (isHighDemand) {
    return (
      <div className="px-4 py-2.5 bg-amber-100/70 border-b border-amber-300/70">
        <p className="text-[11px] text-amber-900 font-semibold leading-snug flex items-center gap-1.5">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-amber-500" />
          Alta demanda
        </p>
        <p className="text-[11px] text-amber-900/85 leading-snug mt-1">
          Laura está cerca del límite temporal de la beta.
        </p>
        {resetCo && (
          <p className="text-[11px] text-amber-900/85 leading-snug mt-0.5">
            La capacidad se renovará {resetCo.includes("a las") ? resetCo : `a las ${resetCo}`}.
          </p>
        )}
      </div>
    );
  }

  // Estado normal (verde) — colapsable. Cuando alta demanda o
  // descansando, NO se colapsa (info crítica que debe quedar visible).
  return <AvailableBanner messages={messages} resetCo={resetCo} />;
}

/**
 * Variante colapsable del banner cuando Laura está disponible. Por
 * default colapsado (solo el dot + título); el usuario puede expandir
 * para ver renovación, consultas del día y disclaimer.
 *
 * Persistencia en sessionStorage para que la elección se conserve al
 * cerrar/abrir el chat dentro de la misma sesión.
 */
function AvailableBanner({ messages, resetCo }: { messages: number; resetCo: string | null }) {
  const [expanded, setExpanded] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.sessionStorage.getItem("laura.banner.expanded") === "1";
  });
  useEffect(() => {
    try { window.sessionStorage.setItem("laura.banner.expanded", expanded ? "1" : "0"); } catch {}
  }, [expanded]);

  return (
    <div
      className="t-acc bg-emerald-50/50 border-b border-emerald-200/50"
      data-open={expanded ? "true" : "false"}
    >
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="t-acc-head w-full px-4 py-2 flex items-center justify-between gap-2 hover:bg-emerald-100/30 transition-colors"
        aria-expanded={expanded}
      >
        <span className="text-[11px] text-emerald-900 font-semibold leading-snug inline-flex items-center gap-1.5">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500" />
          Laura IA · Beta
          {!expanded && (
            <span className="ml-1 text-emerald-900/65 font-normal">
              · Disponible
            </span>
          )}
        </span>
        {/* Chevron simétrico (path en V centrado en 16x16) — flip
            scaleY(-1) lo convierte en "^". El path tiene vertex
            symmetry para que el flip coincida exactamente. */}
        <span className="t-acc-chevron text-emerald-900/70">
          <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 6.5L8 10.5L12 6.5" />
          </svg>
        </span>
      </button>
      <div className="t-acc-panel">
        <div className="t-acc-panel-inner">
          <div className="px-4 pb-2.5">
            <p className="text-[11px] text-emerald-900/85 leading-snug">
              Estado: <strong>Disponible</strong>
            </p>
            <p className="text-[11px] text-emerald-900/85 leading-snug mt-0.5">
              Hoy: <strong>{messages} consulta{messages === 1 ? "" : "s"} realizada{messages === 1 ? "" : "s"}</strong>
            </p>
            {resetCo && (
              <p className="text-[11px] text-emerald-900/80 leading-snug mt-0.5">
                Renovación de capacidad: <strong className="tabular">{resetCo}</strong> (Colombia)
              </p>
            )}
            <p className="text-[10px] text-emerald-900/65 mt-1.5 leading-snug">
              Laura está en fase beta. Estamos aumentando gradualmente su capacidad
              durante las pruebas.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function MessageBubble({ message, avatarActive }: { message: Message; avatarActive: boolean }) {
  const isUser = message.role === "user";
  const isStreaming = message.status === "streaming";
  const isError = message.status === "error";

  if (isUser) {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] space-y-1.5">
          {message.imageDataUrls && message.imageDataUrls.length > 0 && (
            <div className={cn(
              "grid gap-1.5",
              message.imageDataUrls.length === 1 ? "grid-cols-1" :
              message.imageDataUrls.length === 2 ? "grid-cols-2" :
              "grid-cols-3",
            )}>
              {message.imageDataUrls.map((url, i) => (
                <a
                  key={i}
                  href={url}
                  target="_blank"
                  rel="noreferrer"
                  className="block rounded-xl overflow-hidden border border-line-200 bg-bg-50"
                  title="Abrir en pestaña nueva"
                >
                  <img src={url} alt={`Imagen adjunta ${i + 1}`} className="w-full h-auto max-h-48 object-cover" />
                </a>
              ))}
            </div>
          )}
          {message.content && (
            <div className="rounded-2xl rounded-tr-sm bg-brand-700 text-white px-3 py-2 text-sm whitespace-pre-wrap leading-relaxed">
              {message.content}
            </div>
          )}
        </div>
      </div>
    );
  }
  // Mientras espera el primer token, mostramos un loader de 3 puntos
  // saltando estilo chat. En cuanto llegan deltas (content > 0), el
  // loader desaparece y se va viendo el texto streamear.
  const showTypingLoader = isStreaming && message.content.length === 0;

  return (
    <div className="flex gap-2.5">
      <img
        src={avatarActive ? AVATAR_ACTIVE : AVATAR_INITIAL}
        alt=""
        className="h-7 w-7 rounded-full bg-brand-50 shrink-0 mt-0.5"
      />
      <div className="flex-1 min-w-0">
        <div className={cn(
          "max-w-[95%] rounded-2xl rounded-tl-sm px-3 py-2 text-sm leading-relaxed",
          isError
            ? "bg-rose-50 border border-rose-200 text-rose-900"
            : "bg-bg-50 border border-line-100 text-ink-900",
        )}>
          {isError && (
            <p className="text-[11px] font-semibold text-rose-700 mb-1 inline-flex items-center gap-1">
              <AlertTriangle className="h-3 w-3" />
              {message.error ?? "Error"}
            </p>
          )}
          {showTypingLoader ? (
            <TypingDots />
          ) : (
            <MarkdownLite text={message.content} streaming={isStreaming} />
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Loader "Laura está escribiendo…" con 3 puntos que saltan en cascada.
 * Más elegante que el cursor pulsante que teníamos antes (un cuadrito
 * gris que parecía bug). Usa keyframes inline porque el comportamiento
 * de delay escalonado no se logra con tailwind sin animaciones custom.
 */
function TypingDots() {
  return (
    <div className="flex items-center gap-1 py-0.5" aria-label="Laura está escribiendo">
      <span className="h-1.5 w-1.5 rounded-full bg-ink-400 animate-laura-dot" style={{ animationDelay: "0ms" }} />
      <span className="h-1.5 w-1.5 rounded-full bg-ink-400 animate-laura-dot" style={{ animationDelay: "150ms" }} />
      <span className="h-1.5 w-1.5 rounded-full bg-ink-400 animate-laura-dot" style={{ animationDelay: "300ms" }} />
    </div>
  );
}

/**
 * Mini-parser de Markdown para la respuesta de Laura. Soporta:
 *  - **negrita** y __negrita__
 *  - *cursiva* y _cursiva_
 *  - `código inline`
 *  - Listas con guión / asterisco / número (las dejamos como texto
 *    formateado vía whitespace-pre-wrap; no construimos <ul> porque
 *    el modelo a veces las mezcla en líneas sueltas).
 *  - Saltos de línea preservados (whitespace-pre-wrap).
 *
 * Decisión: NO usamos react-markdown ni similares para mantener el
 * bundle inicial sin sumar 80KB. El parser inline es suficiente para
 * los 4 patrones que el modelo usa el 99% del tiempo.
 *
 * Mientras streaming=true, ocultamos el último cursor de un `**` o `_`
 * sin cerrar para evitar que aparezca un asterisco suelto a media
 * generación.
 */
function MarkdownLite({ text, streaming }: { text: string; streaming?: boolean }) {
  // Tokens reconocidos como pares delimitadores. Cada item: { open, close, render }.
  // El parser hace múltiples pasadas reemplazando pares balanceados; lo
  // que no calza queda como texto plano.
  const safe = text;
  // Si streaming y hay un par abierto sin cerrar al final, lo cortamos
  // para no mostrar "**" colgando.
  const display = streaming ? trimDanglingMarkers(safe) : safe;
  const nodes = parseInline(display);
  return (
    <div className="whitespace-pre-wrap break-words">
      {nodes}
      {streaming && <span className="inline-block w-1.5 h-3.5 ml-0.5 bg-ink-400 align-text-bottom animate-pulse" />}
    </div>
  );
}

/**
 * Si el texto termina con un marcador abierto (ej "**hola mu" durante
 * streaming), recortamos los caracteres del marcador para evitar
 * mostrar "**" o "_" colgando. Es heurístico y conservador.
 */
function trimDanglingMarkers(text: string): string {
  // Pares: **, __, *, _, `
  for (const marker of ["**", "__", "*", "_", "`"]) {
    const occurrences = (text.match(new RegExp(escapeRegex(marker), "g")) ?? []).length;
    if (occurrences % 2 === 1) {
      // Hay uno sin cerrar. Si está cerca del final, lo recortamos.
      const lastIdx = text.lastIndexOf(marker);
      if (lastIdx >= text.length - 50) {
        return text.slice(0, lastIdx);
      }
    }
  }
  return text;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Parser inline simple: itera el texto buscando pares de marcadores
 * y construye un array de React.ReactNode (strings + <strong>/<em>/<code>).
 * No es bonito pero hace el trabajo para el 95% de respuestas del
 * modelo. Para edge cases (marcadores anidados raros) cae a texto plano.
 */
function parseInline(text: string): React.ReactNode[] {
  // Regex que captura: **bold**, __bold__, *italic*, _italic_, `code`.
  // El orden importa — primero los dobles para no consumir un solo *.
  const pattern = /(\*\*[^*\n]+\*\*|__[^_\n]+__|\*[^*\n]+\*|_[^_\n]+_|`[^`\n]+`)/g;
  const nodes: React.ReactNode[] = [];
  let lastIndex = 0;
  let key = 0;
  let m: RegExpExecArray | null;
  while ((m = pattern.exec(text)) !== null) {
    if (m.index > lastIndex) {
      nodes.push(text.slice(lastIndex, m.index));
    }
    const token = m[0];
    if (token.startsWith("**") && token.endsWith("**")) {
      nodes.push(<strong key={key++} className="font-semibold">{token.slice(2, -2)}</strong>);
    } else if (token.startsWith("__") && token.endsWith("__")) {
      nodes.push(<strong key={key++} className="font-semibold">{token.slice(2, -2)}</strong>);
    } else if (token.startsWith("*") && token.endsWith("*")) {
      nodes.push(<em key={key++}>{token.slice(1, -1)}</em>);
    } else if (token.startsWith("_") && token.endsWith("_")) {
      nodes.push(<em key={key++}>{token.slice(1, -1)}</em>);
    } else if (token.startsWith("`") && token.endsWith("`")) {
      nodes.push(<code key={key++} className="px-1 py-0.5 rounded bg-bg-100 text-[11px] font-mono">{token.slice(1, -1)}</code>);
    }
    lastIndex = m.index + token.length;
  }
  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }
  return nodes;
}

function EmptyState({
  onPick, disabled = false,
}: {
  onPick: (text: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="h-full flex flex-col items-center justify-center text-center px-4 py-8 gap-4">
      <img
        src={AVATAR_INITIAL}
        alt=""
        className={cn(
          "h-32 w-32 rounded-2xl bg-brand-50 shadow-md object-cover ring-4 ring-brand-50/50",
          disabled && "grayscale opacity-60",
        )}
      />
      <div>
        <h3 className="font-serif text-xl text-ink-900">Hola, soy Laura</h3>
        <p className="text-xs text-ink-500 mt-1.5 max-w-xs leading-relaxed">
          Tu asistente clínica. Conozco tu consulta y te ayudo con redacción,
          dudas sobre la plataforma o cómo manejar un caso. Pregúntame.
        </p>
      </div>
      <div className="w-full max-w-xs space-y-2 mt-1">
        <SuggestionChip text="¿Cómo agendo una cita?" onPick={onPick} disabled={disabled} />
        <SuggestionChip text="Dame ejercicios para ansiedad social" onPick={onPick} disabled={disabled} />
        <SuggestionChip text="¿Cómo agrego un diagnóstico DSM-5?" onPick={onPick} disabled={disabled} />
      </div>
    </div>
  );
}

function SuggestionChip({
  text, onPick, disabled = false,
}: {
  text: string;
  onPick: (text: string) => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={() => onPick(text)}
      disabled={disabled}
      className={cn(
        "w-full text-left text-xs text-ink-700 px-3 py-2 rounded-lg border border-line-200 bg-surface",
        "hover:border-brand-400 hover:bg-brand-50/40 active:scale-[0.99] transition-all",
        "disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:border-line-200 disabled:hover:bg-surface disabled:active:scale-100",
      )}
    >
      💡 {text}
    </button>
  );
}

function ConversationHistory({
  onPick, onClose, onDeleted,
}: {
  onPick: (id: number) => void;
  onClose: () => void;
  onDeleted: (id: number) => void;
}) {
  const { data, refetch } = useQuery({
    queryKey: ["laura-conversations"],
    queryFn: () => api.lauraListConversations({ limit: 50 }),
  });

  const handleDelete = async (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm("¿Eliminar esta conversación?")) return;
    await api.lauraDeleteConversation(id);
    onDeleted(id);
    refetch();
  };

  return (
    <div className="absolute inset-x-0 top-[60px] bottom-0 z-10 bg-surface border-t border-line-100 flex flex-col">
      <div className="px-4 py-2 border-b border-line-100 flex items-center gap-2">
        <button
          type="button"
          onClick={onClose}
          className="h-7 w-7 rounded-md text-ink-500 hover:bg-bg-50 inline-flex items-center justify-center"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <h3 className="text-sm font-medium text-ink-900">Conversaciones</h3>
      </div>
      <ul className="flex-1 overflow-y-auto p-2 space-y-1">
        {(data?.items ?? []).map((c) => (
          <li key={c.id}>
            <button
              type="button"
              onClick={() => onPick(c.id)}
              className="w-full text-left p-2.5 rounded-lg border border-transparent hover:bg-bg-50 hover:border-line-200 group"
            >
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-medium text-ink-900 truncate flex-1">
                  {c.title ?? "(sin título)"}
                </p>
                <button
                  type="button"
                  onClick={(e) => handleDelete(c.id, e)}
                  className="opacity-0 group-hover:opacity-100 h-6 w-6 rounded text-ink-400 hover:text-rose-700 inline-flex items-center justify-center"
                  title="Eliminar"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
              <p className="text-[10px] text-ink-500 mt-0.5">
                {c.patient_name && `${c.patient_preferred || c.patient_name} · `}
                {c.message_count} mensaje{c.message_count === 1 ? "" : "s"} ·{" "}
                {new Date(c.updated_at).toLocaleDateString("es-CO", { day: "numeric", month: "short" })}
              </p>
            </button>
          </li>
        ))}
        {(data?.items ?? []).length === 0 && (
          <li className="text-center py-12 text-xs text-ink-500">
            <MessageSquarePlus className="h-6 w-6 mx-auto mb-2 text-ink-300" />
            Aún no hay conversaciones.
          </li>
        )}
      </ul>
    </div>
  );
}
