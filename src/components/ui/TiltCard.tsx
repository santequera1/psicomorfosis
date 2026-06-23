import { useRef, useCallback, type CSSProperties } from "react";
import { cn } from "@/lib/utils";

/**
 * Card con tilt 3D que sigue al puntero + glare (transitions.dev #19).
 *
 * Estructura:
 *   <TiltCard>           outer wrapper, captura pointer events
 *     <div t-tilt-card>  capa que rota (rx/ry leídas de CSS vars)
 *       {children}
 *       <div t-tilt-glare/>  capa de luz que sigue el cursor
 *
 * Implementación JS:
 *  - Trackeamos el pointer sobre el wrapper exterior (que NO rota).
 *  - Convertimos posición a porcentajes 0–100% para gx/gy.
 *  - Convertimos posición a grados +/- maxTilt para rx/ry.
 *  - Aplicamos `.is-tilting` mientras hay movimiento (follow rápido).
 *  - Aplicamos `.is-hover` para fade-in del glare.
 *  - Al salir, removemos ambas clases — el CSS hace return suave.
 *
 * No interfiere con clicks: solo seteamos custom properties y clases.
 * Los children siguen recibiendo eventos como siempre.
 */

type Props = {
  children: React.ReactNode;
  /** Inclinación máxima en grados. Default 10 — suficiente para sentirse, no mareante. */
  maxTilt?: number;
  /** Clase del wrapper exterior. */
  className?: string;
  /** Clase del card interior (con border-radius, fondo, etc). */
  cardClassName?: string;
  /** Estilo extra del card interior. */
  cardStyle?: CSSProperties;
};

export function TiltCard({
  children, maxTilt = 10, className, cardClassName, cardStyle,
}: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const tiltingTimeoutRef = useRef<number | null>(null);

  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const wrap = wrapRef.current;
    const card = cardRef.current;
    if (!wrap || !card) return;
    const rect = wrap.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const pctX = x / rect.width;   // 0..1
    const pctY = y / rect.height;  // 0..1

    // rotateY: cursor a la derecha → tilt hacia la derecha (positivo).
    // rotateX: cursor arriba → tilt hacia arriba (negativo en CSS).
    const ry = (pctX - 0.5) * 2 * maxTilt;       // -maxTilt..+maxTilt
    const rx = -(pctY - 0.5) * 2 * maxTilt;      // -maxTilt..+maxTilt

    card.style.setProperty("--tilt-rx", `${rx.toFixed(2)}deg`);
    card.style.setProperty("--tilt-ry", `${ry.toFixed(2)}deg`);
    card.style.setProperty("--tilt-gx", `${(pctX * 100).toFixed(2)}%`);
    card.style.setProperty("--tilt-gy", `${(pctY * 100).toFixed(2)}%`);

    if (!card.classList.contains("is-tilting")) {
      card.classList.add("is-tilting");
    }
    // Después de un quiet period sin movimiento, sacamos is-tilting
    // para que el siguiente cambio use el return suave en vez del follow.
    if (tiltingTimeoutRef.current) window.clearTimeout(tiltingTimeoutRef.current);
    tiltingTimeoutRef.current = window.setTimeout(() => {
      card.classList.remove("is-tilting");
    }, 120);
  }, [maxTilt]);

  const handlePointerEnter = useCallback(() => {
    wrapRef.current?.classList.add("is-hover");
  }, []);

  const handlePointerLeave = useCallback(() => {
    const wrap = wrapRef.current;
    const card = cardRef.current;
    if (!wrap || !card) return;
    wrap.classList.remove("is-hover");
    card.classList.remove("is-tilting");
    // Volver al estado flat — el return suave de --tilt-return (1s)
    // se encarga de la animación.
    card.style.setProperty("--tilt-rx", "0deg");
    card.style.setProperty("--tilt-ry", "0deg");
    if (tiltingTimeoutRef.current) {
      window.clearTimeout(tiltingTimeoutRef.current);
      tiltingTimeoutRef.current = null;
    }
  }, []);

  return (
    <div
      ref={wrapRef}
      className={cn("t-tilt", className)}
      onPointerMove={handlePointerMove}
      onPointerEnter={handlePointerEnter}
      onPointerLeave={handlePointerLeave}
    >
      <div ref={cardRef} className={cn("t-tilt-card", cardClassName)} style={cardStyle}>
        {children}
        <div className="t-tilt-glare" />
      </div>
    </div>
  );
}
