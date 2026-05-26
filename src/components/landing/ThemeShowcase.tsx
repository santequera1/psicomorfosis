import { useEffect, useRef, useState } from "react";
import { Sun, Moon, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { useScrollReveal } from "./useScrollReveal";
import { SectionHeader } from "./Features";

/**
 * Crossfade entre los 3 modos de la app (claro / oscuro / aurora).
 * Las 3 imágenes son exactamente del mismo screen (Configuración →
 * Apariencia), así que al alternar dan la sensación de "antes/después"
 * sin que se mueva nada del layout.
 *
 * Auto-rotación cada 4s. Cuando el usuario toca un botón, pausamos
 * el ciclo (respeto a su intención).
 */
type Mode = "claro" | "oscuro" | "aurora";

const MODES: { id: Mode; label: string; icon: typeof Sun; src: string; tint: string }[] = [
  { id: "claro", label: "Claro", icon: Sun, src: "/landing/modo-claro.png", tint: "from-amber-100 to-transparent" },
  { id: "oscuro", label: "Oscuro", icon: Moon, src: "/landing/modo-oscuro.png", tint: "from-slate-900/40 to-transparent" },
  { id: "aurora", label: "Aurora", icon: Sparkles, src: "/landing/modo-aurora.png", tint: "from-violet-400/30 to-transparent" },
];

const AUTOPLAY_MS = 4000;

export function ThemeShowcase() {
  const { ref, revealed } = useScrollReveal<HTMLDivElement>();
  const [active, setActive] = useState<Mode>("claro");
  const [paused, setPaused] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Auto-cycle solo si no está pausado por click del usuario.
  // Lo arrancamos cuando el bloque ya entró en viewport para que
  // no consuma CPU mientras la sección no se ve.
  useEffect(() => {
    if (paused || !revealed) return;
    timerRef.current = setInterval(() => {
      setActive((prev) => {
        const idx = MODES.findIndex((m) => m.id === prev);
        return MODES[(idx + 1) % MODES.length].id;
      });
    }, AUTOPLAY_MS);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [paused, revealed]);

  const handleClick = (id: Mode) => {
    setActive(id);
    setPaused(true); // Al primer click el usuario manda. Nunca reanudamos.
  };

  return (
    <section id="estilo" className="py-20 sm:py-28 bg-surface">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <SectionHeader
          eyebrow="Tu plataforma, tu estilo"
          title="Adáptala a la manera en que trabajas"
          subtitle="Tres modos pensados para distintos momentos del día. Claro para mañanas frescas, oscuro para sesiones nocturnas, aurora cuando quieres sentir que tu consulta es de otra liga."
        />

        <div
          ref={ref}
          className={cn(
            "mt-14 transition-all duration-700 ease-out",
            revealed ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8",
          )}
        >
          {/* Stack de imágenes con crossfade. Todas absolutas excepto el
              wrapper que define la altura (usa la primera como referencia
              con un img invisible para mantener aspect ratio). */}
          <div className="relative rounded-2xl overflow-hidden border border-line-200 shadow-2xl shadow-brand-700/10 bg-bg">
            {/* Spacer para mantener aspect ratio sin que el SSR colapse */}
            <img
              src={MODES[0].src}
              alt=""
              aria-hidden
              className="w-full h-auto block opacity-0 pointer-events-none"
            />

            {MODES.map((m) => (
              <img
                key={m.id}
                src={m.src}
                alt={`Psicomorfosis en modo ${m.label}`}
                loading="lazy"
                className={cn(
                  "absolute inset-0 w-full h-full object-cover object-top transition-opacity duration-1000 ease-in-out",
                  active === m.id ? "opacity-100" : "opacity-0",
                )}
              />
            ))}

            {/* Glow tint según modo activo — capa decorativa muy sutil */}
            <div
              className={cn(
                "absolute inset-x-0 top-0 h-24 bg-linear-to-b pointer-events-none transition-opacity duration-1000",
                "from-current/0 to-transparent",
              )}
              aria-hidden
            />
          </div>

          {/* Controles abajo del frame — pills grandes y claras */}
          <div className="mt-8 flex items-center justify-center gap-2 sm:gap-3 flex-wrap">
            {MODES.map((m) => {
              const Icon = m.icon;
              const isActive = active === m.id;
              return (
                <button
                  key={m.id}
                  onClick={() => handleClick(m.id)}
                  className={cn(
                    "inline-flex items-center gap-2 h-11 px-5 rounded-full text-sm font-medium transition-all duration-300",
                    isActive
                      ? "bg-brand-700 text-white shadow-lg shadow-brand-700/25 scale-105"
                      : "bg-bg-50 text-ink-700 border border-line-200 hover:border-brand-400",
                  )}
                  aria-pressed={isActive}
                >
                  <Icon className="h-4 w-4" />
                  {m.label}
                </button>
              );
            })}
          </div>

          {/* Indicador de auto-cycle (sutil, solo si sigue activo) */}
          {!paused && (
            <p className="mt-4 text-center text-xs text-ink-400">
              Cambia solo cada 4 segundos · toca uno para fijarlo
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
