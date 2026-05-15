import * as React from "react";
import {
  Dialog as ShadDialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

/**
 * Wrapper sobre shadcn Dialog con la API que ya usa la app:
 *
 *   {open && <AppDialog onClose={() => setOpen(false)} title="...">
 *     <body />
 *     <footer>...</footer>
 *   </AppDialog>}
 *
 * Beneficios sobre el patrón manual `fixed inset-0 z-50 bg-ink-900/50...`:
 *   - Cierra con Escape automáticamente.
 *   - Click fuera cierra (overlay).
 *   - Focus trap (Tab no escapa al fondo).
 *   - aria-modal, aria-labelledby, role="dialog" gratis.
 *   - Restaura el focus al elemento que lo abrió al cerrar.
 *   - Animaciones consistentes.
 *
 * No es una migración masiva — los modales que ya existen siguen
 * funcionando con su markup manual. Este wrapper queda para modales NUEVOS
 * y para refactor incremental.
 */
export interface AppDialogProps {
  /** Si false, el dialog no se renderiza. */
  open: boolean;
  onClose: () => void;
  /** Título visible en el header. También usado para aria-labelledby. */
  title: React.ReactNode;
  /** Descripción opcional bajo el título. */
  description?: React.ReactNode;
  /** Tag pequeño arriba del título (ej: "Pacientes"). */
  eyebrow?: React.ReactNode;
  /** Ancho máximo. Default "lg". */
  size?: "sm" | "md" | "lg" | "xl" | "2xl";
  /** Si es false, no se puede cerrar con Escape ni click fuera. Default true. */
  dismissible?: boolean;
  className?: string;
  children: React.ReactNode;
}

const SIZE_CLASS: Record<NonNullable<AppDialogProps["size"]>, string> = {
  sm: "sm:max-w-sm",
  md: "sm:max-w-md",
  lg: "sm:max-w-lg",
  xl: "sm:max-w-xl",
  "2xl": "sm:max-w-2xl",
};

export function AppDialog({
  open,
  onClose,
  title,
  description,
  eyebrow,
  size = "lg",
  dismissible = true,
  className,
  children,
}: AppDialogProps) {
  return (
    <ShadDialog
      open={open}
      onOpenChange={(o) => {
        if (!o && dismissible) onClose();
      }}
    >
      <DialogContent
        // overflow-hidden (igual que el fix de modales manuales) evita que
        // las sombras de botones internos escapen por las esquinas redondeadas.
        // max-h-[92vh] permite scroll cuando el contenido es más alto que la
        // pantalla (típico en forms largos).
        className={cn(
          "p-0 gap-0 max-h-[92vh] overflow-hidden flex flex-col bg-surface border-line-200",
          SIZE_CLASS[size],
          className,
        )}
        onEscapeKeyDown={(e) => { if (!dismissible) e.preventDefault(); }}
        onPointerDownOutside={(e) => { if (!dismissible) e.preventDefault(); }}
      >
        <DialogHeader className="px-5 py-4 border-b border-line-100 text-left">
          {eyebrow && (
            <p className="text-[11px] uppercase tracking-widest text-brand-800 font-medium">
              {eyebrow}
            </p>
          )}
          <DialogTitle className="font-serif text-xl text-ink-900">{title}</DialogTitle>
          {description && (
            <DialogDescription className="text-xs text-ink-500 mt-1">
              {description}
            </DialogDescription>
          )}
        </DialogHeader>
        <div className="flex-1 overflow-y-auto">
          {children}
        </div>
      </DialogContent>
    </ShadDialog>
  );
}
