import { useEffect, useRef, useState } from "react";

/**
 * Hook que activa un flag `revealed = true` cuando el elemento entra
 * en viewport. Una sola vez (no se desactiva al scrollear fuera) —
 * típico de animación de "scroll reveal" en landings.
 *
 * Uso:
 *   const { ref, revealed } = useScrollReveal();
 *   <div ref={ref} className={revealed ? "opacity-100" : "opacity-0"} />
 *
 * Sin librerías externas (GSAP, framer-motion). Intersection Observer
 * es nativo y suficiente para un fade/slide en scroll.
 */
export function useScrollReveal<T extends HTMLElement = HTMLDivElement>(
  options?: { threshold?: number; rootMargin?: string },
) {
  const ref = useRef<T | null>(null);
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // Si el browser no soporta IntersectionObserver (browsers viejos),
    // mostramos todo de una para no romper la UX.
    if (typeof IntersectionObserver === "undefined") {
      setRevealed(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            setRevealed(true);
            observer.disconnect();
            break;
          }
        }
      },
      { threshold: options?.threshold ?? 0.15, rootMargin: options?.rootMargin },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [options?.threshold, options?.rootMargin]);

  return { ref, revealed };
}

/**
 * Hook que retorna true cuando el scrollY supera un threshold (default 40px).
 * Útil para el sticky header: cambia de transparente a blur+bg al hacer scroll.
 */
export function useScrolledPast(threshold = 40): boolean {
  const [past, setPast] = useState(false);
  useEffect(() => {
    const onScroll = () => setPast(window.scrollY > threshold);
    onScroll(); // estado inicial correcto si la página carga con scroll > 0
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [threshold]);
  return past;
}
