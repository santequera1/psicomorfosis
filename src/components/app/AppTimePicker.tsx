import * as React from "react";
import { Clock } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

/**
 * Wrapper para selección de hora. Igual que AppDatePicker pero para tiempo.
 *
 * API: value/onChange en formato "HH:MM" (24h, padded). Igual que el
 * <input type="time"> nativo, para que la migración sea drop-in.
 *
 * Diseño:
 *  - Trigger button con icono Clock + texto formateado "10:30 a. m." (es-CO).
 *  - Popover con grid de 2 columnas:
 *      Izq: horas 7-22 (rango típico de consulta). Click → setea hora.
 *      Der: minutos 00/15/30/45. Click → setea minuto.
 *  - Slots de 15 min porque las citas clínicas no se agendan a las 10:37.
 *  - Si el value viene fuera del rango (ej. 06:00 o 23:30), se agrega esa
 *    hora arriba/abajo para preservar la selección.
 *
 * No usa <input type="time"> nativo porque se ve distinto en cada OS y el
 * picker del browser ignora dark mode.
 */
export interface AppTimePickerProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  size?: "sm" | "md";
  id?: string;
  "aria-label"?: string;
}

const DEFAULT_HOURS = Array.from({ length: 16 }, (_, i) => 7 + i); // 7..22
const MINUTES = ["00", "15", "30", "45"];

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/** "HH:MM" → ["HH", "MM"] o null si inválido. */
function parseTime(v: string): [number, number] | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(v ?? "");
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (!Number.isInteger(h) || !Number.isInteger(min)) return null;
  if (h < 0 || h > 23 || min < 0 || min > 59) return null;
  return [h, min];
}

/** "HH:MM" → "10:30 a. m." en es-CO. */
function formatHuman(value: string): string {
  const parsed = parseTime(value);
  if (!parsed) return "";
  const [h, m] = parsed;
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return d.toLocaleTimeString("es-CO", { hour: "numeric", minute: "2-digit", hour12: true });
}

export function AppTimePicker({
  value,
  onChange,
  placeholder = "Selecciona hora",
  disabled,
  className,
  size = "md",
  id,
  "aria-label": ariaLabel,
}: AppTimePickerProps) {
  const [open, setOpen] = React.useState(false);
  const parsed = parseTime(value);
  const currentHour = parsed?.[0] ?? null;
  const currentMinute = parsed?.[1] ?? null;

  // Asegurar que la hora actual del value (si está fuera del rango por
  // default 7-22) aparezca en la lista. Sin esto, una cita guardada a
  // las 06:00 dejaría el botón seleccionado sin highlight visible.
  const hours = React.useMemo(() => {
    const set = new Set<number>(DEFAULT_HOURS);
    if (currentHour != null) set.add(currentHour);
    return Array.from(set).sort((a, b) => a - b);
  }, [currentHour]);

  // Mismo razonamiento para minutos no-cuarto (ej. 10:37 de una cita vieja).
  const minutes = React.useMemo(() => {
    const set = new Set<string>(MINUTES);
    if (currentMinute != null) set.add(pad(currentMinute));
    return Array.from(set).sort();
  }, [currentMinute]);

  function setHour(h: number) {
    const m = currentMinute ?? 0;
    onChange(`${pad(h)}:${pad(m)}`);
  }
  function setMinute(m: number) {
    const h = currentHour ?? 9; // 9am default sensato para consulta
    onChange(`${pad(h)}:${pad(m)}`);
    // Cuando ya hay hora seleccionada y el usuario eligió minuto, cerrar.
    if (currentHour != null) setOpen(false);
  }

  return (
    <Popover open={open} onOpenChange={setOpen} modal={false}>
      <PopoverTrigger asChild>
        <button
          id={id}
          type="button"
          aria-label={ariaLabel ?? "Hora"}
          disabled={disabled}
          className={cn(
            "w-full inline-flex items-center gap-2 rounded-md border border-line-200 bg-surface text-left",
            "hover:border-brand-400 focus:border-brand-700 focus:outline-none focus:ring-0",
            "disabled:opacity-50 disabled:cursor-not-allowed",
            size === "sm" ? "h-8 px-2.5 text-xs" : "h-10 px-3 text-sm",
            className,
          )}
        >
          <Clock className="h-3.5 w-3.5 text-ink-400 shrink-0" />
          {value ? (
            <span className="text-ink-900 truncate">{formatHuman(value)}</span>
          ) : (
            <span className="text-ink-400">{placeholder}</span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        data-slot="popover-content"
        className="w-auto p-0 bg-popover border-line-200"
      >
        <div className="flex divide-x divide-line-200">
          <div className="p-1.5 max-h-64 overflow-y-auto">
            <div className="text-[10px] uppercase tracking-wider text-ink-500 font-medium px-2 py-1">Hora</div>
            <div className="grid gap-0.5">
              {hours.map((h) => {
                const selected = h === currentHour;
                return (
                  <button
                    key={h}
                    type="button"
                    onClick={() => setHour(h)}
                    className={cn(
                      "w-14 h-8 rounded text-sm tabular text-center transition-colors",
                      selected
                        ? "bg-brand-700 text-primary-foreground font-medium"
                        : "text-ink-900 hover:bg-accent hover:text-accent-foreground",
                    )}
                  >
                    {pad(h)}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="p-1.5 max-h-64 overflow-y-auto">
            <div className="text-[10px] uppercase tracking-wider text-ink-500 font-medium px-2 py-1">Min</div>
            <div className="grid gap-0.5">
              {minutes.map((mStr) => {
                const m = Number(mStr);
                const selected = m === currentMinute;
                return (
                  <button
                    key={mStr}
                    type="button"
                    onClick={() => setMinute(m)}
                    className={cn(
                      "w-12 h-8 rounded text-sm tabular text-center transition-colors",
                      selected
                        ? "bg-brand-700 text-primary-foreground font-medium"
                        : "text-ink-900 hover:bg-accent hover:text-accent-foreground",
                    )}
                  >
                    {mStr}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
