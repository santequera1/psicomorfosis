import { useEffect, useState, type CSSProperties } from "react";
import LiquidGlass from "liquid-glass-react";
import { cn } from "@/lib/utils";

/**
 * Wrapper theme-aware sobre liquid-glass-react (rdev/liquid-glass-react).
 *
 * Comportamiento:
 *  - Si data-theme="liquid" está activo en <html>: renderiza el
 *    componente real de la librería, que hace refracción WebGL +
 *    chromatic aberration + edge highlights.
 *  - Si no: renderiza un <div> plano con las clases tailwind que
 *    el componente padre pasa en `className`. Es no-op, sin
 *    overhead WebGL, ideal para los otros temas (Clínico, Aurora,
 *    etc.).
 *
 * Observamos data-theme via MutationObserver para reaccionar en
 * vivo cuando el usuario cambia el tema desde Configuración.
 *
 * Props de la librería que exponemos con defaults afinados para
 * superficies tipo card/modal de UI (no para botones flotantes):
 *  - displacementScale: 60  (default 70 era muy fuerte para texto)
 *  - blurAmount: 0.05       (default 0.0625 era un poco lechoso)
 *  - saturation: 130        (default 140 sobre-saturaba la imagen)
 *  - aberrationIntensity: 1 (default 2 daba franjas RGB muy fuertes)
 *  - elasticity: 0          (rigid feel — para cards/cont. estructurales)
 *  - cornerRadius: 16       (matching nuestro radius design system)
 */

type Props = {
  children: React.ReactNode;
  /** Clases tailwind que el padre define. Se aplican siempre, en
   *  los dos modos (con/sin liquid glass). */
  className?: string;
  /** Estilo extra. Se mergea con el del LiquidGlass cuando está activo. */
  style?: CSSProperties;
  /** Override de cornerRadius para casos específicos (drawer pegado
   *  al borde derecho usa 0). */
  cornerRadius?: number;
  /** Override de displacementScale — un cursor o badge puede querer
   *  algo más intenso que una card. */
  displacementScale?: number;
  /** Padding interno. Pasarlo aquí (no por className) cuando el
   *  tema liquid esté activo, porque la librería necesita aplicarlo
   *  internamente para que el efecto cubra todo el área. */
  padding?: string;
  /** Si el fondo de la página es claro pasar true. En nuestro caso
   *  (theme liquid = dark only sobre fondo fotográfico) siempre
   *  queda false. */
  overLight?: boolean;
  /** onClick para casos en que la superficie es interactiva. */
  onClick?: () => void;
};

export function LiquidGlassSurface({
  children, className, style, cornerRadius = 16,
  displacementScale = 60, padding, overLight = false, onClick,
}: Props) {
  const isLiquid = useIsLiquidTheme();

  if (!isLiquid) {
    return (
      <div className={className} style={style} onClick={onClick}>
        {children}
      </div>
    );
  }

  return (
    <LiquidGlass
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
    </LiquidGlass>
  );
}

/**
 * Hook reactivo que devuelve true cuando html[data-theme="liquid"].
 * Cambia automáticamente cuando el usuario alterna tema desde
 * Configuración (MutationObserver sobre el atributo data-theme).
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

/**
 * Helper utility: combina clases. Re-exportado para que los call
 * sites de LiquidGlassSurface no tengan que importar cn de utils
 * en archivos que solo necesitan este wrapper.
 */
export { cn };
