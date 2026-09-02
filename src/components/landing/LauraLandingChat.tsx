import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { X, ArrowRight } from "lucide-react";
import { easeOutExpo } from "./motion";

/**
 * Laura en la landing (pedido 2 sep 2026): el mismo chat flotante que
 * vive dentro de la app, pero en modo demo — conversación guiada con
 * respuestas pre-escritas (sin API: costo cero y sin exponer el modelo
 * al público). El objetivo es que quien visita /inicio2 conozca a Laura
 * antes de crear la cuenta.
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
];

export function LauraLandingChat() {
  const [open, setOpen] = useState(false);
  const [showHint, setShowHint] = useState(false);
  const [hintDismissed, setHintDismissed] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([
    { from: "laura", text: "¡Hola! Soy Laura, la asistente de Psicomorfosis. Vivo dentro de la app y en el WhatsApp de cada consulta. ¿Qué quieres saber?" },
  ]);
  const [typing, setTyping] = useState(false);
  const [asked, setAsked] = useState<string[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

  // El saludo aparece a los 3s y se va solo si no le paran bolas.
  useEffect(() => {
    if (open || hintDismissed) return;
    const t1 = setTimeout(() => setShowHint(true), 3000);
    const t2 = setTimeout(() => setShowHint(false), 14000);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [open, hintDismissed]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, typing]);

  function ask(op: { q: string; a: string }) {
    if (typing) return;
    setAsked((prev) => [...prev, op.q]);
    setMessages((prev) => [...prev, { from: "user", text: op.q }]);
    setTyping(true);
    setTimeout(() => {
      setTyping(false);
      setMessages((prev) => [...prev, { from: "laura", text: op.a }]);
    }, 1100);
  }

  const pendientes = OPCIONES.filter((o) => !asked.includes(o.q));

  return (
    <>
      {/* FAB + burbuja de saludo */}
      <div className="fixed bottom-20 sm:bottom-6 right-4 sm:right-6 z-40 flex items-end gap-2">
        <AnimatePresence>
          {showHint && !open && (
            <motion.button
              initial={{ opacity: 0, y: 8, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.95 }}
              transition={{ duration: 0.4, ease: easeOutExpo }}
              onClick={() => { setOpen(true); setShowHint(false); setHintDismissed(true); }}
              className="max-w-56 rounded-2xl rounded-br-md bg-surface border border-line-200 shadow-xl px-4 py-3 text-left"
            >
              <p className="text-sm text-ink-900 font-medium">Hola, soy Laura 👋</p>
              <p className="text-xs text-ink-500 mt-0.5">¿En qué te puedo ayudar?</p>
            </motion.button>
          )}
        </AnimatePresence>

        <motion.button
          onClick={() => { setOpen((v) => !v); setShowHint(false); setHintDismissed(true); }}
          whileHover={{ scale: 1.06 }}
          whileTap={{ scale: 0.94 }}
          className="relative h-14 w-14 rounded-full bg-brand-700 shadow-xl shadow-brand-700/30 border-2 border-white/60 overflow-hidden shrink-0"
          aria-label={open ? "Cerrar chat de Laura" : "Abrir chat de Laura"}
        >
          <img src={AVATAR} alt="" className="absolute inset-0 h-full w-full object-cover" />
          <span className="absolute bottom-0.5 right-0.5 h-3 w-3 rounded-full bg-emerald-400 ring-2 ring-white" aria-hidden />
        </motion.button>
      </div>

      {/* Panel del chat */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 24, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 24, scale: 0.96 }}
            transition={{ duration: 0.35, ease: easeOutExpo }}
            className="fixed bottom-36 sm:bottom-24 right-4 sm:right-6 z-40 w-[calc(100vw-2rem)] max-w-sm rounded-3xl border border-line-200 bg-surface shadow-2xl overflow-hidden flex flex-col"
            style={{ maxHeight: "min(560px, calc(100svh - 12rem))" }}
          >
            <header className="px-4 py-3 bg-brand-700 text-white flex items-center gap-3 shrink-0">
              <span className="relative h-9 w-9 rounded-full overflow-hidden border border-white/40 shrink-0">
                <img src={AVATAR} alt="" className="h-full w-full object-cover" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold leading-tight">Laura</p>
                <p className="text-[11px] text-white/75 leading-tight">Asistente de Psicomorfosis · demo</p>
              </div>
              <button onClick={() => setOpen(false)} className="h-8 w-8 rounded-full hover:bg-white/15 flex items-center justify-center" aria-label="Cerrar">
                <X className="h-4 w-4" />
              </button>
            </header>

            <div ref={scrollRef} className="flex-1 overflow-y-auto px-3.5 py-4 space-y-2.5 bg-bg-50/60">
              {messages.map((m, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, ease: easeOutExpo }}
                  className={m.from === "user" ? "flex justify-end" : "flex justify-start"}
                >
                  <div className={
                    m.from === "user"
                      ? "max-w-[85%] rounded-2xl rounded-br-md bg-brand-700 text-white px-3.5 py-2.5 text-sm leading-relaxed"
                      : "max-w-[85%] rounded-2xl rounded-bl-md bg-surface border border-line-200 px-3.5 py-2.5 text-sm text-ink-800 leading-relaxed"
                  }>
                    {m.text}
                  </div>
                </motion.div>
              ))}
              {typing && (
                <div className="flex justify-start">
                  <div className="rounded-2xl rounded-bl-md bg-surface border border-line-200 px-4 py-3 flex items-center gap-1">
                    {[0, 1, 2].map((d) => (
                      <span key={d} className="h-1.5 w-1.5 rounded-full bg-ink-300 animate-bounce" style={{ animationDelay: `${d * 150}ms` }} />
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="p-3 border-t border-line-100 bg-surface space-y-2 shrink-0">
              {pendientes.length > 0 ? (
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
              ) : (
                <p className="text-[11px] text-ink-400 text-center">Lo demás te lo cuento por dentro 😉</p>
              )}
              <a
                href="#demo"
                onClick={() => setOpen(false)}
                className="w-full h-10 rounded-xl bg-brand-700 text-white text-sm font-medium hover:bg-brand-800 inline-flex items-center justify-center gap-2"
              >
                Crear mi cuenta gratis <ArrowRight className="h-4 w-4" />
              </a>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
