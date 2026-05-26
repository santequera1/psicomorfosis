import { useEffect, useState } from "react";
import { ArrowRight, Play } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Hero de la landing. Texto stagger fade-in, video debajo en bucle
 * (loop muted autoplay para que arranque sin click — política de
 * autoplay del browser permite con muted). preload="metadata" para
 * no descargar los 31MB hasta que el usuario realmente lo necesite
 * (al menos no en el primer paint).
 *
 * El gradient de fondo es sutil (off-white → blanco). Sin imagen
 * de fondo pesada — la atención debe ir al video.
 */
export function Hero() {
  // Marcamos `mounted` después del primer paint para disparar las
  // animaciones del lado cliente. Evita que el SSR sirva HTML con
  // opacity-0 que parpadee si JS tarda.
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    // requestAnimationFrame asegura que la transición de
    // mounted=false → true se renderice como animación, no como
    // instantáneo (React batches sino).
    const id = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(id);
  }, []);

  return (
    <section
      id="hero"
      className="relative pt-32 pb-16 sm:pt-40 sm:pb-24 overflow-hidden"
    >
      {/* Fondo decorativo — gradiente radial muy sutil + ruido implícito
          via off-white. Sin imagen para no robar protagonismo al video. */}
      <div
        className="absolute inset-0 -z-10 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse 80% 60% at 50% -20%, oklch(0.94 0.04 175 / 0.4), transparent 70%), linear-gradient(180deg, oklch(0.985 0.005 90), oklch(0.99 0.003 90))",
        }}
        aria-hidden
      />

      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
        {/* Tag pill */}
        <div
          className={cn(
            "inline-flex items-center gap-2 px-3 py-1 rounded-full bg-brand-50 border border-brand-100 text-xs text-brand-800 font-medium",
            "transition-all duration-700 ease-out",
            mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2",
          )}
        >
          <span className="h-1.5 w-1.5 rounded-full bg-brand-700 animate-pulse" />
          Construida con psicólogas colombianas
        </div>

        {/* Title — stagger por línea */}
        <h1 className="mt-6 font-serif text-4xl sm:text-5xl md:text-6xl lg:text-7xl leading-[1.05] tracking-tight text-ink-900">
          <span
            className={cn(
              "block transition-all duration-700 ease-out",
              mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4",
            )}
            style={{ transitionDelay: "120ms" }}
          >
            La consulta clínica
          </span>
          <span
            className={cn(
              "block transition-all duration-700 ease-out text-brand-700",
              mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4",
            )}
            style={{ transitionDelay: "240ms" }}
          >
            sin WhatsApp ni Excel.
          </span>
        </h1>

        <p
          className={cn(
            "mt-6 max-w-2xl mx-auto text-base sm:text-lg text-ink-500 leading-relaxed",
            "transition-all duration-700 ease-out",
            mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-3",
          )}
          style={{ transitionDelay: "380ms" }}
        >
          Agenda, historia clínica, tests psicométricos, firma electrónica y portal del paciente.
          Todo en un solo lugar, hecho para psicólogas que ya están cansadas de pegar todo manual.
        </p>

        <div
          className={cn(
            "mt-9 flex items-center justify-center gap-3 flex-wrap",
            "transition-all duration-700 ease-out",
            mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-3",
          )}
          style={{ transitionDelay: "520ms" }}
        >
          <a
            href="#demo"
            className="h-12 px-6 rounded-lg bg-brand-700 text-white text-sm font-medium hover:bg-brand-800 inline-flex items-center gap-2 shadow-lg shadow-brand-700/20 transition-all hover:-translate-y-0.5"
          >
            Solicitar demo <ArrowRight className="h-4 w-4" />
          </a>
          <a
            href="#features"
            className="h-12 px-6 rounded-lg border border-line-200 bg-surface text-ink-700 text-sm font-medium hover:border-brand-400 inline-flex items-center gap-2 transition-colors"
          >
            <Play className="h-4 w-4" /> Ver funciones
          </a>
        </div>
      </div>

      {/* Video frame — slide-in-from-bottom con la entrada más dramática */}
      <div className="mt-12 sm:mt-20 max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div
          className={cn(
            "relative rounded-2xl overflow-hidden border border-line-200 shadow-2xl shadow-brand-700/10 bg-surface",
            "transition-all duration-1000 ease-out",
            mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-12",
          )}
          style={{ transitionDelay: "700ms" }}
        >
          {/* Loop muted autoplay — única forma de que arranque sin
              click en mobile/desktop modernos. playsInline para iOS. */}
          <video
            src="/landing/video-demo2.mp4"
            autoPlay
            loop
            muted
            playsInline
            preload="metadata"
            className="w-full h-auto block"
            aria-label="Demo de Psicomorfosis"
          />
          {/* Glow alrededor */}
          <div
            className="absolute -inset-x-20 -top-20 -bottom-20 -z-10 pointer-events-none opacity-40 blur-3xl"
            style={{
              background:
                "radial-gradient(ellipse at center, oklch(0.7 0.12 175 / 0.4), transparent 60%)",
            }}
            aria-hidden
          />
        </div>
      </div>
    </section>
  );
}
