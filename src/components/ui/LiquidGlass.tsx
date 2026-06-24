import { useEffect, useRef } from "react";

/**
 * Pareja de utilidades para el efecto Liquid Glass:
 *
 *  - <LiquidGlassDefs/>: SVG oculto con los <filter> que las clases
 *    .lg-surface y .lg-cursor referencian via `filter: url(#id)`.
 *    Se monta una vez (idealmente en el root). Sin esto, las clases
 *    siguen funcionando pero pierden la refracción (caen al fallback
 *    de blur + borde + gradient).
 *
 *  - <LiquidGlassCursor/>: el círculo flotante que sigue al puntero
 *    con un efecto glass propio. Listener `pointermove` actualiza
 *    dos CSS vars (--lg-cursor-x/y) — el CSS hace el translate3d en
 *    GPU para no encolar reflows. Se oculta automáticamente en
 *    devices touch via @media (hover:none).
 *
 * Patrón del filter: feTurbulence genera ruido de tipo Perlin →
 * feDisplacementMap usa el ruido para mover px de la capa de fondo
 * (que el backdrop-filter ya tiene desenfocada). Resultado: la
 * imagen detrás del cristal se ondula sutilmente en los bordes,
 * imitando un cristal real.
 */

export function LiquidGlassDefs() {
  return (
    <svg
      aria-hidden
      width="0"
      height="0"
      style={{ position: "absolute", inset: 0, pointerEvents: "none" }}
    >
      <defs>
        {/* Distorsión sutil — para superficies grandes (modales,
            drawer, header). baseFrequency baja = ondulaciones largas.
            scale=8 es la magnitud del desplazamiento en px. */}
        <filter id="liquid-glass-distortion" x="0%" y="0%" width="100%" height="100%">
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.008 0.012"
            numOctaves="2"
            seed="4"
            result="noise"
          />
          <feDisplacementMap in="SourceGraphic" in2="noise" scale="8" />
        </filter>
        {/* Distorsión más fuerte — para el cursor flotante.
            scale=18 hace que el "lente" doble más lo de atrás. */}
        <filter id="liquid-glass-distortion-strong" x="-20%" y="-20%" width="140%" height="140%">
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.02 0.025"
            numOctaves="2"
            seed="7"
            result="noise"
          />
          <feDisplacementMap in="SourceGraphic" in2="noise" scale="18" />
        </filter>
      </defs>
    </svg>
  );
}

export function LiquidGlassCursor() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    // Detección de touch: si el browser no tiene puntero fino, no
    // montamos el listener para ahorrar CPU. El CSS también lo
    // oculta vía media query, pero esto evita el pointermove inútil.
    const isTouch = window.matchMedia("(hover: none), (pointer: coarse)").matches;
    if (isTouch) return;

    const el = ref.current;
    if (!el) return;

    let rafId = 0;
    let pendingX = 0;
    let pendingY = 0;

    function onMove(e: PointerEvent) {
      pendingX = e.clientX;
      pendingY = e.clientY;
      if (!rafId) {
        rafId = window.requestAnimationFrame(() => {
          if (el) {
            el.style.setProperty("--lg-cursor-x", `${pendingX}px`);
            el.style.setProperty("--lg-cursor-y", `${pendingY}px`);
            if (!el.classList.contains("is-visible")) {
              el.classList.add("is-visible");
            }
          }
          rafId = 0;
        });
      }
    }
    function onLeave() {
      if (el) el.classList.remove("is-visible");
    }

    window.addEventListener("pointermove", onMove, { passive: true });
    document.addEventListener("pointerleave", onLeave);

    return () => {
      window.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerleave", onLeave);
      if (rafId) window.cancelAnimationFrame(rafId);
    };
  }, []);

  return <div ref={ref} className="lg-cursor" aria-hidden />;
}
