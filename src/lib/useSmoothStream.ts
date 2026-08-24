import { useEffect, useRef, useState } from "react";

/**
 * Suaviza texto que llega en streaming.
 *
 * El servidor manda el texto por trozos irregulares (a veces 3 letras, a
 * veces media frase, a veces nada durante 400 ms). Pintarlos tal cual se
 * ve "a retazos". Aquí los trozos entran a un buffer y la pantalla revela
 * caracteres a un ritmo continuo, ajustado al tamaño del atraso:
 *
 *   - poco atraso  → ~45 caracteres/segundo (ritmo de lectura cómodo);
 *   - mucho atraso → acelera hasta ~500 c/s, así nunca se queda muy detrás
 *     del servidor ni "termina" segundos después de que Laura acabó;
 *   - fin del stream → vacía el buffer rápido y se queda quieto.
 *
 * No es un efecto de "máquina de escribir" sobre texto completo (eso
 * añadiría latencia artificial): la salida sigue al servidor de cerca,
 * solo sin saltos. Con prefers-reduced-motion se muestra tal cual llega.
 */
export function useSmoothStream(target: string, active: boolean): string {
  const [displayed, setDisplayed] = useState(active ? "" : target);
  const displayedRef = useRef(displayed);
  const targetRef = useRef(target);
  const activeRef = useRef(active);
  const rafRef = useRef<number | null>(null);
  const lastRef = useRef<number>(0);
  const carryRef = useRef<number>(0);

  targetRef.current = target;
  activeRef.current = active;

  // Texto que se reinicia (mensaje nuevo o se borró): sincronizar de golpe.
  if (!target.startsWith(displayedRef.current)) {
    displayedRef.current = active ? "" : target;
    carryRef.current = 0;
  }
  // Sin streaming y con el texto completo: nada que animar.
  if (!active && displayedRef.current !== target && !isStreamingLike(displayedRef.current, target)) {
    displayedRef.current = target;
  }

  useEffect(() => {
    const reduced = typeof window !== "undefined"
      && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      displayedRef.current = target;
      setDisplayed(target);
      return;
    }
    const tick = (now: number) => {
      const t = targetRef.current;
      const d = displayedRef.current;
      if (d === t) {
        rafRef.current = null;
        return;
      }
      const dt = lastRef.current ? Math.min(100, now - lastRef.current) : 16;
      lastRef.current = now;
      const backlog = t.length - d.length;
      // Caracteres por segundo según atraso. Calibrado con el stream real:
      // el proxy entrega trozos de ~120-150 caracteres (5-7 por respuesta),
      // así que el techo debe ser bajo para que un trozo entero se lea
      // ENTRANDO y no aparezca de golpe: 180 c/s mientras llega, 320 c/s
      // al terminar (vaciado ágil pero visible). Salvaguarda: nunca más de
      // ~5 s de atraso, por si llega un bloque enorme.
      const floor = backlog / 5;
      const cps = Math.max(
        floor,
        !activeRef.current ? 320 : Math.min(180, 40 + backlog * 1.2),
      );
      carryRef.current += (cps * dt) / 1000;
      let n = Math.floor(carryRef.current);
      if (n < 1) {
        rafRef.current = requestAnimationFrame(tick);
        return;
      }
      carryRef.current -= n;
      n = Math.min(n, backlog);
      // No partir un carácter de dos unidades (emoji, tildes combinadas).
      let cut = d.length + n;
      while (cut < t.length && isLowSurrogate(t.charCodeAt(cut))) cut += 1;
      displayedRef.current = t.slice(0, cut);
      setDisplayed(displayedRef.current);
      rafRef.current = requestAnimationFrame(tick);
    };
    // La ref puede haberse sincronizado de golpe durante el render (texto
    // reiniciado o completo): reflejarlo en el estado, o el mensaje se
    // quedaría sin pintar cuando no hay nada que animar.
    setDisplayed((prev) => (prev === displayedRef.current ? prev : displayedRef.current));
    if (rafRef.current == null && displayedRef.current !== target) {
      lastRef.current = 0;
      rafRef.current = requestAnimationFrame(tick);
    }
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
  }, [target, active]);

  return displayed;
}

function isLowSurrogate(code: number): boolean {
  return code >= 0xdc00 && code <= 0xdfff;
}

/** ¿`displayed` es un prefijo de `target` que aún va "alcanzándolo"? */
function isStreamingLike(displayed: string, target: string): boolean {
  return target.startsWith(displayed) && target.length - displayed.length < 4000;
}
