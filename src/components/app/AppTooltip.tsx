import * as React from "react";
import {
  Tooltip as ShadTooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

/**
 * Wrapper sobre shadcn Tooltip optimizado para el patrón más común en la app:
 *
 *   <AppTooltip label="Editar">
 *     <button><Edit3 /></button>
 *   </AppTooltip>
 *
 * Beneficios sobre `title=` HTML nativo:
 *   - Aparece a los 300ms (vs 700ms del browser).
 *   - Estilo consistente con el DS (no el tooltip gris/amarillo del OS).
 *   - Soporta teclado (focus → muestra).
 *   - Auto-flip arriba/abajo según espacio.
 *   - A11y completo via Radix.
 *
 * El TooltipProvider vive en __root.tsx globalmente para que todos los
 * tooltips compartan el delayDuration y se comporten coherentemente.
 */
export interface AppTooltipProps {
  label: React.ReactNode;
  children: React.ReactNode;
  /** Lado preferido del tooltip. Default top. */
  side?: "top" | "right" | "bottom" | "left";
  /** Si es true (o el label es vacío), no envuelve nada. */
  disabled?: boolean;
}

export function AppTooltip({ label, children, side = "top", disabled }: AppTooltipProps) {
  if (disabled || !label) return <>{children}</>;
  return (
    <ShadTooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side={side} className="bg-ink-900 text-bg-50 max-w-xs">
        {label}
      </TooltipContent>
    </ShadTooltip>
  );
}
