import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Send, X, ShieldCheck, ArrowRight } from "lucide-react";
import { easeOutExpo } from "./motion";

/**
 * Laura en la landing — réplica visual del chat REAL de la app
 * (src/components/laura/LauraChat.tsx): mismo drawer lateral, mismo
 * header con badge Beta y aviso de confianza, mismas burbujas y
 * composer. La landing debe ser una representación fiel del producto.
 *
 * Diferencia: es una demo guiada sin API — chips con respuestas
 * pre-escritas, y si escriben libre, Laura invita a conocerla por
 * dentro. Además (pedido 2 sep 2026) se abre sola una única vez cuando
 * el visitante llega cerca del final de la página.
 */

const AVATAR = "/laura/laura-profile-2.svg";

type Msg = { from: "laura" | "user"; text: string };

const OPCIONES: { q: string; a: string }[] = [
  {
    q: "¿Qué sabes hacer?",
    a: "Dentro de la app me pides las cosas en lenguaje normal y yo las hago: crear pacientes, agendar citas, redactar notas, asignar tests y tareas… Y por WhatsApp me encargo de confirmar y recordar las sesiones a tus pacientes.",
  },
  {
    q: "¿Cómo manejas las citas?",
    a: "Tú agendas (o el paciente reserva desde tu enlace público), yo confirmo por WhatsApp, el correo llega con el evento para el calendario, y si la sesión es virtual el Meet se crea solo. Si algo cambia, yo aviso a los dos.",
  },
  {
    q: "¿Cuánto cuesta?",
    a: "Nada durante todo el 2026 🙂 Sin tarjeta. Crea tu cuenta y me conoces trabajando de verdad.",
  },
  {
    q: "¿Qué pasa con mis datos?",
    a: "Son tuyos y se pueden exportar cuando quieras. Todo viaja cifrado, hay backups diarios y cumplimos Habeas Data (Ley 1581), la normativa de historia clínica (Res. 1995) y el secreto profesional. Y yo nunca toco la historia clínica sin tu visto bueno.",
  },
  {
    q: "¿Sirve para consultorios con equipo?",
    a: "Sí — la cuenta Consultorio permite varios profesionales, sedes, roles y reportes de todo el equipo. También gratis durante el 2026.",
  },
  {
    q: "¿Cómo empiezo?",
    a: "Creas tu cuenta (con Google o con tu correo), completas tu perfil y en minutos tienes agenda, enlace público de reservas y a mí en tu WhatsApp. ¿Vienes de Excel? Hay un importador de pacientes para traerlos de una.",
  },
];

const RESPUESTA_LIBRE =
  "Eso te lo respondo mejor por dentro 😉 En la landing soy una demo — en la app converso de verdad, con tu agenda y tus pacientes a la mano. Crea tu cuenta gratis y hablamos.";

export function LauraLandingChat() {
  const [open, setOpen] = useState(false);
  const [showHint, setShowHint] = useState(false);
  const [interacted, setInteracted] = useState(false); // abrió o cerró a propósito
  const [autoOpened, setAutoOpened] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([
    { from: "laura", text: "¡Hola! Soy Laura, la asistente de Psicomorfosis. Vivo dentro de la app y en el WhatsApp de cada consulta. ¿Qué quieres saber?" },
  ]);
  const [typing, setTyping] = useState(false);
  const [asked, setAsked] = useState<string[]>([]);
  const [draft, setDraft] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  // Burbuja de saludo a los 3s (se esconde sola).
  useEffect(() => {
    if (open || interacted) return;
    const t1 = setTimeout(() => setShowHint(true), 3000);
    const t2 = setTimeout(() => setShowHint(false), 14000);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [open, interacted]);

  // Apertura automática al llegar cerca del final (una sola vez, y solo
  // si el visitante no había abierto/cerrado el chat por su cuenta).
  useEffect(() => {
    if (autoOpened || interacted) return;
    const target = document.getElementById("demo");
    if (!target || typeof IntersectionObserver === "undefined") return;
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        obs.disconnect();
        setAutoOpened(true);
        setOpen(true);
        setShowHint(false);
        setTyping(true);
        setTimeout(() => {
          setTyping(false);
          setMessages((prev) => [...prev, {
            from: "laura",
            text: "¿Llegaste hasta el final? 🙂 Buena señal. Crea tu cuenta aquí mismo y me ves trabajar de verdad.",
          }]);
        }, 900);
      },
      { threshold: 0.35 },
    );
    obs.observe(target);
    return () => obs.disconnect();
  }, [autoOpened, interacted]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, typing, open]);

  function reply(text: string, answer: string) {
    if (typing) return;
    setMessages((prev) => [...prev, { from: "user", text }]);
    setTyping(true);
    setTimeout(() => {
      setTyping(false);
      setMessages((prev) => [...prev, { from: "laura", text: answer }]);
    }, 1100);
  }

  function ask(op: { q: string; a: string }) {
    setAsked((prev) => [...prev, op.q]);
    reply(op.q, op.a);
  }

  function sendFree() {
    const text = draft.trim();
    if (!text || typing) return;
    setDraft("");
    reply(text, RESPUESTA_LIBRE);
  }

  const pendientes = OPCIONES.filter((o) => !asked.includes(o.q));

  return (
    <>
      {/* FAB — mismo botón de la app (bg-surface, borde brand, dot beta) */}
      <div className="fixed bottom-20 sm:bottom-6 right-4 sm:right-5 z-40 flex items-end gap-2">
        <AnimatePresence>
          {showHint && !open && (
            <motion.button
              initial={{ opacity: 0, y: 8, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.95 }}
              transition={{ duration: 0.4, ease: easeOutExpo }}
              onClick={() => { setOpen(true); setShowHint(false); setInteracted(true); }}
              className="max-w-56 rounded-2xl rounded-br-md bg-surface border border-line-200 shadow-xl px-4 py-3 text-left"
            >
              <p className="text-sm text-ink-900 font-medium">Hola, soy Laura 👋</p>
              <p className="text-xs text-ink-500 mt-0.5">¿En qué te puedo ayudar?</p>
            </motion.button>
          )}
        </AnimatePresence>

        <button
          type="button"
          onClick={() => { setOpen((v) => !v); setShowHint(false); setInteracted(true); }}
          aria-label={open ? "Cerrar Laura" : "Abrir asistente Laura"}
          title="Laura — asistente clínica"
          className={
            "relative h-14 w-14 rounded-full shadow-lg bg-surface border-2 border-brand-700 " +
            "hover:scale-110 active:scale-95 transition-all duration-200 " +
            "flex items-center justify-center overflow-hidden shrink-0" +
            (open ? " ring-4 ring-brand-400/40 scale-95" : "")
          }
        >
          <img src={AVATAR} alt="" className="h-full w-full object-cover" />
          <span aria-hidden className="absolute -top-1 -right-1 h-3.5 w-3.5 rounded-full bg-amber-400 border-2 border-surface animate-pulse" title="Beta" />
        </button>
      </div>

      {/* Drawer lateral — misma estructura del chat de la app */}
      <AnimatePresence>
        {open && (
          <motion.aside
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ duration: 0.4, ease: easeOutExpo }}
            className="fixed top-0 right-0 z-50 h-dvh w-full sm:w-[420px] bg-surface border-l border-line-200 shadow-2xl flex flex-col"
            aria-label="Chat con Laura (demo)"
          >
            <header className="flex items-center gap-2 sm:gap-3 p-3 sm:p-4 border-b border-line-100 shrink-0">
              <img src={AVATAR} alt="" className="h-9 w-9 sm:h-10 sm:w-10 rounded-full object-cover bg-brand-50 shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <h2 className="font-serif text-base text-ink-900 truncate">Laura</h2>
                  <span className="text-[9px] sm:text-[10px] uppercase tracking-widest px-1.5 py-0.5 rounded-full bg-amber-50 border border-amber-200/70 text-amber-800 font-semibold shrink-0">
                    Beta
                  </span>
                </div>
                <p className="text-[10px] sm:text-[11px] text-ink-500 leading-tight truncate inline-flex items-center gap-1">
                  <ShieldCheck className="h-3 w-3 shrink-0" />
                  Nunca toca tus pacientes ni tu historia sin tu visto bueno
                </p>
              </div>
              <button
                type="button"
                onClick={() => { setOpen(false); setInteracted(true); }}
                className="h-8 w-8 rounded-md text-ink-500 hover:bg-bg-50 inline-flex items-center justify-center shrink-0"
                aria-label="Cerrar"
              >
                <X className="h-4 w-4" />
              </button>
            </header>

            {/* Mensajes — mismas burbujas de la app */}
            <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 sm:px-4 py-4 space-y-3">
              {messages.map((m, i) =>
                m.from === "user" ? (
                  <div key={i} className="flex justify-end">
                    <div className="max-w-[85%] rounded-2xl rounded-tr-sm bg-brand-700 text-white px-3 py-2 text-sm whitespace-pre-wrap leading-relaxed">
                      {m.text}
                    </div>
                  </div>
                ) : (
                  <div key={i} className="flex gap-2.5">
                    <img src={AVATAR} alt="" className="h-7 w-7 rounded-full bg-brand-50 shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <div className="max-w-[95%] rounded-2xl rounded-tl-sm px-3 py-2 text-sm leading-relaxed bg-bg-50 border border-line-100 text-ink-900">
                        {m.text}
                      </div>
                    </div>
                  </div>
                ),
              )}
              {typing && (
                <div className="flex gap-2.5">
                  <img src={AVATAR} alt="" className="h-7 w-7 rounded-full bg-brand-50 shrink-0 mt-0.5" />
                  <div className="rounded-2xl rounded-tl-sm px-4 py-3 bg-bg-50 border border-line-100 flex items-center gap-1">
                    {[0, 1, 2].map((d) => (
                      <span key={d} className="h-1.5 w-1.5 rounded-full bg-ink-300 animate-bounce" style={{ animationDelay: `${d * 150}ms` }} />
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Chips de la demo + CTA */}
            <div className="px-3 sm:px-4 pb-2 space-y-2 shrink-0">
              {pendientes.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {pendientes.map((op) => (
                    <button
                      key={op.q}
                      onClick={() => ask(op)}
                      disabled={typing}
                      className="h-8 px-3 rounded-full border border-brand-300 bg-brand-50/60 text-xs text-brand-800 font-medium hover:bg-brand-50 disabled:opacity-50"
                    >
                      {op.q}
                    </button>
                  ))}
                </div>
              )}
              <a
                href="#demo"
                onClick={() => { setOpen(false); setInteracted(true); }}
                className="w-full h-10 rounded-lg bg-brand-700 text-white text-sm font-medium hover:bg-brand-800 inline-flex items-center justify-center gap-2"
              >
                Crear mi cuenta gratis <ArrowRight className="h-4 w-4" />
              </a>
            </div>

            {/* Composer — mismo input de la app (aquí responde la demo) */}
            <div className="p-3 sm:p-4 pt-1 border-t border-line-100 shrink-0">
              <div className="flex items-end gap-2">
                <textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendFree(); } }}
                  rows={1}
                  placeholder="Escríbele a Laura…"
                  className="flex-1 min-w-0 min-h-11 max-h-28 px-4 py-3 rounded-[22px] sm:rounded-xl border border-line-200 bg-bg text-base sm:text-sm leading-relaxed text-ink-900 outline-none focus:border-brand-400 resize-none overflow-y-hidden"
                />
                <button
                  type="button"
                  onClick={sendFree}
                  disabled={!draft.trim() || typing}
                  aria-label="Enviar"
                  className="h-11 w-11 rounded-full sm:rounded-lg bg-brand-700 text-white hover:bg-brand-800 disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center justify-center shrink-0"
                >
                  <Send className="h-4 w-4" />
                </button>
              </div>
            </div>
          </motion.aside>
        )}
      </AnimatePresence>
    </>
  );
}
