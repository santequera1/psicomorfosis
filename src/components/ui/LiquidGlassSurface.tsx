import { lazy, Suspense, useEffect, useState, type CSSProperties } from "react";
import { cn } from "@/lib/utils";

/**
 * Wrapper theme-aware sobre liquid-glass-react (rdev/liquid-glass-react).
 *
 * IMPORTANTE: la librería usa WebGL/Canvas y rompe en SSR (no hay
 * `window`, `HTMLCanvasElement`, etc.). Por eso:
 *   1. La importamos vía React.lazy() — se carga SOLO cuando se
 *      monta en el browser, nunca en el render del servidor.
 *   2. Antes de mountar en el cliente (durante hydration), o si el
 *      tema no es "liquid", caemos a un <div> plano con las clases
 *      tailwind del componente padre. Cero overhead WebGL en esos
 *      casos.
 *
 * Observamos data-theme via MutationObserver para reaccionar en
 * vivo cuando el usuario cambia el tema desde Configuración sin
 * recargar.
 */

// Lazy: la librería se descarga solo cuando JS del cliente la pide.
// No corre en SSR. import() default da el módulo entero — la
// librería exporta default LiquidGlass.
const LiquidGlassImpl = lazy(() => import("liquid-glass-react"));

type Props = {
  children: React.ReactNode;
  className?: string;
  style?: CSSProperties;
  cornerRadius?: number;
  displacementScale?: number;
  padding?: string;
  overLight?: boolean;
  onClick?: () => void;
};

export function LiquidGlassSurface({
  children, className, style, cornerRadius = 16,
  displacementScale = 60, padding, overLight = false, onClick,
}: Props) {
  const isLiquid = useIsLiquidTheme();
  const isClient = useIsClient();

  // Hasta que estemos en cliente Y el tema sea liquid, renderizamos
  // un div plano. Esto resuelve el SSR (servidor) Y mantiene la UI
  // responsive en otros temas.
  if (!isClient || !isLiquid) {
    return (
      <div className={className} style={style} onClick={onClick}>
        {children}
      </div>
    );
  }

  // En cliente + tema liquid: cargamos la librería WebGL.
  // El fallback de Suspense es el mismo <div> plano para que durante
  // el chunk loading el layout no salte.
  return (
    <Suspense fallback={<div className={className} style={style} onClick={onClick}>{children}</div>}>
      <LiquidGlassImpl
        className={className}
        style={style}
        cornerRadius={cornerRadius}
        displacementScale={displacementScale}
        blurAmount={0.05}
        saturation={130}
        aberrationIntensity={1}
        elasticity={0}
        padding={padding}
        overLight={overLight}
        onClick={onClick}
      >
        {children}
      </LiquidGlassImpl>
    </Suspense>
  );
}

/**
 * Guard para hydration mismatch + SSR safety: durante el render
 * del servidor isClient=false. En el primer effect del cliente
 * pasa a true. Garantiza que el primer render del cliente
 * coincide con el del servidor (no hay mismatch), y solo después
 * se monta el WebGL.
 */
function useIsClient(): boolean {
  const [isClient, setIsClient] = useState(false);
  useEffect(() => { setIsClient(true); }, []);
  return isClient;
}

/**
 * Hook reactivo: true cuando html[data-theme="liquid"]. Cambia en
 * vivo cuando el usuario alterna tema desde Configuración.
 */
function useIsLiquidTheme(): boolean {
  const [isLiquid, setIsLiquid] = useState<boolean>(() => {
    if (typeof document === "undefined") return false;
    return document.documentElement.getAttribute("data-theme") === "liquid";
  });

  useEffect(() => {
    if (typeof document === "undefined") return;
    const html = document.documentElement;
    const update = () => setIsLiquid(html.getAttribute("data-theme") === "liquid");
    update();
    const observer = new MutationObserver(update);
    observer.observe(html, { attributes: true, attributeFilter: ["data-theme"] });
    return () => observer.disconnect();
  }, []);

  return isLiquid;
}

export { cn };
