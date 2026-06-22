import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  Send, X, Sparkles, Loader2, AlertTriangle, ShieldCheck, Trash2,
  MessageSquarePlus, ChevronLeft, Plus, History,
} from "lucide-react";
import { api, type LauraStreamEvent } from "@/lib/api";
import { cn } from "@/lib/utils";

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
};

type Props = {
  open: boolean;
  onClose: () => void;
};

export function LauraChat({ open, onClose }: Props) {
  const [conversationId, setConversationId] = useState<number | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
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
  const activePatientId = useMemo(() => {
    const m = currentPath.match(/^\/pacientes\/([^/]+)/);
    return m ? decodeURIComponent(m[1]) : null;
  }, [currentPath]);

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

  // ── Acciones ──────────────────────────────────────────────────────

  const send = useCallback(async (overrideText?: string) => {
    // Si viene texto explícito (ej: click en chip de sugerencia), lo
    // usamos en lugar del state del input. Eso evita el bug clásico de
    // setState + closure: setInput(text) + send() en el mismo handler
    // no ve el nuevo texto, porque la closure capturó el state viejo.
    const trimmed = (overrideText ?? input).trim();
    if (!trimmed || sending) return;

    setSending(true);
    setInput("");
    markSpoken();

    // Append mensaje del user y un placeholder del assistant
    setMessages((prev) => [
      ...prev,
      { role: "user", content: trimmed },
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
  }, [input, sending, conversationId, activePatientId, currentPath, markSpoken, refetchUsage]);

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
          "fixed top-0 right-0 z-50 h-screen w-full sm:w-[420px] bg-surface border-l border-line-200 shadow-2xl",
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
          />
        )}

        {/* Cuerpo: mensajes */}
        <div
          ref={scrollRef}
          className="flex-1 overflow-y-auto px-4 py-4 space-y-4"
        >
          {messages.length === 0 ? (
            <EmptyState onPick={(text) => { void send(text); }} />
          ) : (
            messages.map((m, i) => (
              <MessageBubble key={i} message={m} avatarActive={hasSpoken} />
            ))
          )}
        </div>

        {/* Input */}
        <form
          className="border-t border-line-100 p-3 shrink-0"
          onSubmit={(e) => { e.preventDefault(); void send(); }}
        >
          <div className="flex items-end gap-2">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={
                activePatientId
                  ? "Pregúntame sobre este paciente o sobre la app…"
                  : "¿En qué te ayudo? (uso de la plataforma, redacción clínica, etc.)"
              }
              rows={2}
              maxLength={8000}
              disabled={sending}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void send();
                }
              }}
              className="flex-1 min-h-[44px] max-h-40 px-3 py-2 rounded-lg border border-line-200 bg-bg text-sm text-ink-900 outline-none focus:border-brand-400 resize-y disabled:opacity-60"
            />
            <button
              type="submit"
              disabled={!input.trim() || sending}
              className="h-11 w-11 rounded-lg bg-brand-700 text-white hover:bg-brand-800 disabled:opacity-50 inline-flex items-center justify-center shrink-0"
              aria-label="Enviar"
            >
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </button>
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

  // Detección de "no disponible":
  //   1. Servicio interno caído (health.ok = false)
  //   2. Cuota agotada explícitamente
  //   3. Uso de la sesión >= 100% según la fuente real
  const sessionPct = quota?.session?.percent ?? null;
  const sessionFull = sessionPct !== null && sessionPct >= 100;
  const unavailable = !health.ok || (sub && !sub.ok) || sessionFull;

  const resetCo = formatResetTimeColombia(quota?.session?.resets_at);

  if (unavailable) {
    return (
      <div className="px-4 py-2.5 bg-rose-50 border-b border-rose-200">
        <p className="text-[11px] text-rose-900 font-semibold leading-snug flex items-center gap-1.5">
          <AlertTriangle className="h-3 w-3" />
          Laura IA no está disponible ahora
        </p>
        {resetCo ? (
          <p className="text-[11px] text-rose-800/90 leading-snug mt-0.5">
            Volverá a estar disponible {resetCo}{resetCo.includes("las") || resetCo.includes("mañana") || /\d/.test(resetCo) ? " (Colombia)" : ""}.
          </p>
        ) : (
          <p className="text-[11px] text-rose-800/90 leading-snug mt-0.5">
            Estaremos restableciendo el servicio pronto.
          </p>
        )}
      </div>
    );
  }

  const pct = sessionPct ?? 0;
  const barColor =
    pct < 60 ? "bg-emerald-500" :
    pct < 85 ? "bg-amber-500" :
    "bg-rose-500";

  return (
    <div className="px-4 py-2.5 bg-amber-50/60 border-b border-amber-200/60">
      {/* Header: estado + badge beta */}
      <p className="text-[11px] text-amber-900 font-semibold leading-snug flex items-center gap-1.5">
        <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500" />
        Laura IA · Beta
      </p>

      {/* Barra de uso (solo si ya cargó el primer fetch). Mientras tanto
          el banner se ve sin barra durante 3-5s la primera vez del día. */}
      {sessionPct !== null && (
        <>
          <div className="mt-1.5 flex items-center justify-between gap-2 text-[10px] text-amber-900/80">
            <span>Uso disponible</span>
            <span className="tabular font-medium">{sessionPct}% utilizado</span>
          </div>
          <div className="mt-0.5 h-1.5 w-full rounded-full bg-amber-100/80 overflow-hidden">
            <div
              className={cn("h-full transition-all duration-500", barColor)}
              style={{ width: `${Math.max(2, pct)}%` }}
            />
          </div>
          {resetCo && (
            <p className="text-[10px] text-amber-900/80 mt-1 leading-snug">
              Próxima renovación: <strong className="tabular">{resetCo}</strong>{" "}
              (Colombia)
            </p>
          )}
        </>
      )}

      <p className="text-[10px] text-amber-900/80 mt-1 leading-snug">
        Hoy: <strong>{messages} consulta{messages === 1 ? "" : "s"}</strong>{" "}
        realizada{messages === 1 ? "" : "s"}
      </p>

      <p className="text-[10px] text-amber-900/65 mt-1.5 leading-snug">
        Laura está en fase beta. Los límites de uso nos ayudan a mantener
        la estabilidad mientras mejoramos la experiencia.
      </p>
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
        <div className="max-w-[85%] rounded-2xl rounded-tr-sm bg-brand-700 text-white px-3 py-2 text-sm whitespace-pre-wrap leading-relaxed">
          {message.content}
        </div>
      </div>
    );
  }
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
          <div className="whitespace-pre-wrap break-words">
            {message.content}
            {isStreaming && (
              <span className="inline-block w-1.5 h-3.5 ml-0.5 bg-ink-400 align-text-bottom animate-pulse" />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function EmptyState({ onPick }: { onPick: (text: string) => void }) {
  return (
    <div className="h-full flex flex-col items-center justify-center text-center px-4 py-8 gap-4">
      <img
        src={AVATAR_INITIAL}
        alt=""
        className="h-32 w-32 rounded-2xl bg-brand-50 shadow-md object-cover ring-4 ring-brand-50/50"
      />
      <div>
        <h3 className="font-serif text-xl text-ink-900">Hola, soy Laura</h3>
        <p className="text-xs text-ink-500 mt-1.5 max-w-xs leading-relaxed">
          Tu asistente clínica. Conozco tu consulta y te ayudo con redacción,
          dudas sobre la plataforma o cómo manejar un caso. Pregúntame.
        </p>
      </div>
      <div className="w-full max-w-xs space-y-2 mt-1">
        <SuggestionChip text="¿Cómo agendo una cita?" onPick={onPick} />
        <SuggestionChip text="Dame ejercicios para ansiedad social" onPick={onPick} />
        <SuggestionChip text="¿Cómo agrego un diagnóstico DSM-5?" onPick={onPick} />
      </div>
    </div>
  );
}

function SuggestionChip({ text, onPick }: { text: string; onPick: (text: string) => void }) {
  return (
    <button
      type="button"
      onClick={() => onPick(text)}
      className="w-full text-left text-xs text-ink-700 px-3 py-2 rounded-lg border border-line-200 bg-surface hover:border-brand-400 hover:bg-brand-50/40 active:scale-[0.99] transition-all"
    >
      💡 {text}
    </button>
  );
}

function ConversationHistory({
  onPick, onClose,
}: {
  onPick: (id: number) => void;
  onClose: () => void;
}) {
  const { data, refetch } = useQuery({
    queryKey: ["laura-conversations"],
    queryFn: () => api.lauraListConversations({ limit: 50 }),
  });

  const handleDelete = async (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm("¿Eliminar esta conversación?")) return;
    await api.lauraDeleteConversation(id);
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
