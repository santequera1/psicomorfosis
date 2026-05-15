import * as React from "react";
import { CalendarDays, X } from "lucide-react";
import { format, parse, isValid } from "date-fns";
import { es } from "date-fns/locale";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

/**
 * Wrapper sobre shadcn Calendar + Popover con la firma de un <input type="date">:
 *   value: string en formato ISO "YYYY-MM-DD" (igual que el nativo)
 *   onChange(value: string): emite ISO o "" cuando se borra
 *
 * Tres razones de existir:
 *  1. El <input type="date"> nativo se ve distinto en cada OS (Windows lo
 *     pinta horrible en dark mode, ignora nuestro tema) y los formatos
 *     localizados varían (dd/MM/aaaa vs MM/dd/yyyy según locale del browser).
 *  2. El calendario shadcn (react-day-picker) respeta tema light/dark, abre
 *     en popover con auto-flip, y soporta navegación por teclado.
 *  3. Mostramos el valor en español (es-CO) sin importar el OS: "15 may 2026".
 *
 * Conserva la API ISO para que el componente consumer no cambie su modelo
 * de datos. Internamente convierte entre string ISO ↔ Date.
 */
export interface AppDatePickerProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  size?: "sm" | "md";
  /** Si true, muestra un botón X para limpiar el valor. */
  clearable?: boolean;
  id?: string;
  "aria-label"?: string;
}

/** ISO YYYY-MM-DD ⇄ Date local (sin desfase de TZ). */
function isoToDate(iso: string): Date | undefined {
  if (!iso) return undefined;
  // parse de date-fns trata "2026-05-15" como local — evita el shift
  // de 1 día que ocurre con new Date("2026-05-15") (UTC) cuando el
  // usuario está en zona negativa (Bogotá -5).
  const d = parse(iso, "yyyy-MM-dd", new Date());
  return isValid(d) ? d : undefined;
}
function dateToIso(d: Date | undefined): string {
  return d ? format(d, "yyyy-MM-dd") : "";
}
function formatHuman(iso: string): string {
  const d = isoToDate(iso);
  if (!d) return "";
  return format(d, "d MMM yyyy", { locale: es });
}

export function AppDatePicker({
  value,
  onChange,
  placeholder = "Selecciona fecha",
  disabled,
  className,
  size = "md",
  clearable = false,
  id,
  "aria-label": ariaLabel,
}: AppDatePickerProps) {
  const [open, setOpen] = React.useState(false);
  const date = isoToDate(value);

  return (
    <Popover open={open} onOpenChange={setOpen} modal={false}>
      <PopoverTrigger asChild>
        <button
          id={id}
          type="button"
          aria-label={ariaLabel ?? "Fecha"}
          disabled={disabled}
          className={cn(
            "w-full inline-flex items-center justify-between gap-2 rounded-md border border-line-200 bg-surface text-left",
            "hover:border-brand-400 focus:border-brand-700 focus:outline-none focus:ring-0",
            "disabled:opacity-50 disabled:cursor-not-allowed",
            size === "sm" ? "h-8 px-2.5 text-xs" : "h-10 px-3 text-sm",
            className,
          )}
        >
          <span className="inline-flex items-center gap-2 min-w-0">
            <CalendarDays className="h-3.5 w-3.5 text-ink-400 shrink-0" />
            {value ? (
              <span className="text-ink-900 truncate">{formatHuman(value)}</span>
            ) : (
              <span className="text-ink-400">{placeholder}</span>
            )}
          </span>
          {clearable && value && !disabled && (
            <span
              role="button"
              tabIndex={-1}
              onClick={(e) => {
                e.stopPropagation();
                onChange("");
              }}
              className="h-5 w-5 rounded text-ink-400 hover:text-ink-900 hover:bg-bg-100 inline-flex items-center justify-center shrink-0"
              aria-label="Limpiar fecha"
            >
              <X className="h-3 w-3" />
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-auto p-0 bg-popover border-line-200"
      >
        <Calendar
          mode="single"
          selected={date}
          onSelect={(d) => {
            onChange(dateToIso(d));
            setOpen(false);
          }}
          locale={es}
          initialFocus
        />
      </PopoverContent>
    </Popover>
  );
}
