import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { Sun, Moon, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { easeOutExpo } from "./motion";
import { SectionHeader } from "./Features";

/**
 * Crossfade entre los 3 modos (claro / oscuro / aurora). AnimatePresence
 * permite la transición cruzada elegante con opacity + scale sutil.
 *
 * Auto-rotación cada 4s. Al click el usuario pasa a mandar y no
 * reanudamos el ciclo.
 */
type Mode = "claro" | "oscuro" | "aurora";

const MODES: { id: Mode; label: string; icon: typeof Sun; src: string }[] = [
  { id: "claro", label: "Claro", icon: Sun, src: "/landing/modo-claro.png" },
  { id: "oscuro", label: "Oscuro", icon: Moon, src: "/landing/modo-oscuro.png" },
  { id: "aurora", label: "Aurora", icon: Sparkles, src: "/landing/modo-aurora.png" },
];

const AUTOPLAY_MS = 4000;

export function ThemeShowcase() {
  const [active, setActive] = useState<Mode>("claro");
  const [paused, setPaused] = useState(false);
  const [inView, setInView] = useState(false);
  const sectionRef = useRef<HTMLElement>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Observer ligero para arrancar el ciclo solo al ver la sección.
  useEffect(() => {
    const el = sectionRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => setInView(entry.isIntersecting),
      { threshold: 0.3 },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  // Precarga las 3 imágenes apenas la sección entra en el rango cercano
  // (rootMargin generoso). Así, al hacer click en otro modo, la imagen
  // ya está en caché del navegador y el crossfade es instantáneo.
  // Antes esto se notaba como "lag" al cambiar de modo.
  useEffect(() => {
    const el = sectionRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        MODES.forEach((m) => {
          const img = new Image();
          img.src = m.src;
        });
        obs.disconnect();
      },
      { rootMargin: "600px 0px" },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    if (paused || !inView) return;
    timerRef.current = setInterval(() => {
      setActive((prev) => {
        const idx = MODES.findIndex((m) => m.id === prev);
        return MODES[(idx + 1) % MODES.length].id;
      });
    }, AUTOPLAY_MS);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [paused, inView]);

  const handleClick = (id: Mode) => {
    setActive(id);
    setPaused(true);
  };

  const activeMode = MODES.find((m) => m.id === active)!;

  return (
    <section ref={sectionRef} id="estilo" className="py-20 sm:py-28 relative">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <SectionHeader
          eyebrow="Tu plataforma, tu estilo"
          title="Adáptala a la manera en que trabajas"
          subtitle="Tres modos pensados para distintos momentos del día. Claro para mañanas frescas, oscuro para sesiones nocturnas, aurora cuando quieres sentir que tu consulta es de otra liga."
        />

        <motion.div
          initial={{ opacity: 0, y: 30, filter: "blur(10px)" }}
          whileInView={{ opacity: 1, y: 0, filter: "blur(0px)" }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ duration: 0.9, ease: easeOutExpo }}
          className="mt-14"
        >
          <div className="relative rounded-2xl overflow-hidden border border-line-200 shadow-2xl shadow-brand-700/10 bg-bg">
            {/* Spacer invisible para mantener aspect ratio del frame */}
            <img
              src={MODES[0].src}
              alt=""
              aria-hidden
              className="w-full h-auto block opacity-0 pointer-events-none"
            />

            <AnimatePresence mode="sync">
              <motion.img
                key={activeMode.id}
                src={activeMode.src}
                alt={`Psicomorfosis en modo ${activeMode.label}`}
                loading="lazy"
                className="absolute inset-0 w-full h-full object-cover object-top"
                initial={{ opacity: 0, scale: 1.02 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.99 }}
                transition={{ duration: 1, ease: easeOutExpo }}
              />
            </AnimatePresence>
          </div>

          {/* Controles */}
          <div className="mt-8 flex items-center justify-center gap-2 sm:gap-3 flex-wrap">
            {MODES.map((m) => {
              const Icon = m.icon;
              const isActive = active === m.id;
              return (
                <motion.button
                  key={m.id}
                  onClick={() => handleClick(m.id)}
                  whileHover={{ y: -2 }}
                  whileTap={{ scale: 0.96 }}
                  transition={{ duration: 0.3, ease: easeOutExpo }}
                  className={cn(
                    "inline-flex items-center gap-2 h-11 px-5 rounded-full text-sm font-medium transition-all duration-500",
                    isActive
                      ? "bg-brand-700 text-white shadow-lg shadow-brand-700/25 scale-105"
                      : "bg-bg-50 text-ink-700 border border-line-200 hover:border-brand-400",
                  )}
                  aria-pressed={isActive}
                >
                  <Icon className="h-4 w-4" />
                  {m.label}
                </motion.button>
              );
            })}
          </div>

          {!paused && (
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.6, delay: 0.4 }}
              className="mt-4 text-center text-xs text-ink-400"
            >
              Cambia solo cada 4 segundos · toca uno para fijarlo
            </motion.p>
          )}
        </motion.div>
      </div>
    </section>
  );
}
