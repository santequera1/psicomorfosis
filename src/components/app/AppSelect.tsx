import * as React from "react";
import {
  Select as ShadSelect,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

/**
 * Wrapper sobre el Select de shadcn con la firma que usamos en toda la app:
 * `value` + `onChange(value)` + `options`. Replica el shape del `<select>`
 * nativo para que la migración sea drop-in (solo cambia el import).
 *
 * Tres razones por las que existe este wrapper en lugar de usar shadcn directo:
 *  1. Los nativos se ven horrible en dark mode (especialmente en Windows
 *     donde el browser pinta el dropdown con su propio tema, ignorando el
 *     nuestro). Este componente respeta el tema en cualquier OS.
 *  2. shadcn pide 6 sub-componentes (Root/Trigger/Value/Content/Item/...)
 *     para cada select. La mitad del código repetía el mismo boilerplate.
 *  3. Permite forzar consistencia visual: altura h-10 (alineada con inputs),
 *     placeholder en gris, borde brand al focus.
 */
export interface AppSelectOption {
  value: string;
  label: string;
  /** Deshabilita la opción individual. */
  disabled?: boolean;
}

export interface AppSelectProps {
  value: string;
  onChange: (value: string) => void;
  options: AppSelectOption[];
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  /** Altura: "sm" (h-8) o "md" (h-10, default). */
  size?: "sm" | "md";
  /** id para asociar con un <label htmlFor>. */
  id?: string;
  /** Identificador para tests / aria. */
  "aria-label"?: string;
}

/**
 * Radix Select RECHAZA value="" — no permite que un SelectItem represente
 * "sin valor". Pero muchos `<select>` nativos lo usan como primera opción
 * ("Sin asignar", "—", "Cualquiera"). Truco: internamente mapeamos "" a un
 * sentinel improbable y revertimos en el callback. Para el consumidor el
 * value="" sigue funcionando exactamente igual.
 */
const EMPTY_SENTINEL = "__app_select_empty__";

export function AppSelect({
  value,
  onChange,
  options,
  placeholder = "Selecciona…",
  disabled,
  className,
  size = "md",
  id,
  "aria-label": ariaLabel,
}: AppSelectProps) {
  const internalValue = value === "" ? EMPTY_SENTINEL : value;
  const handleChange = (v: string) => onChange(v === EMPTY_SENTINEL ? "" : v);

  return (
    <ShadSelect value={internalValue} onValueChange={handleChange} disabled={disabled}>
      <SelectTrigger
        id={id}
        aria-label={ariaLabel}
        className={cn(
          // Tamaños alineados con el resto de inputs de la app.
          size === "sm" ? "h-8 text-xs px-2.5" : "h-10 text-sm px-3",
          // Borde y bg consistentes con `<input>` custom (line-200 / bg-50/60).
          "border-line-200 bg-bg-50/60 focus:border-brand-700 focus:ring-0 focus:ring-offset-0",
          "data-placeholder:text-ink-400",
          className,
        )}
      >
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent className="border-line-200 bg-surface text-ink-900">
        {options.map((o) => (
          <SelectItem
            key={o.value || "_empty"}
            value={o.value === "" ? EMPTY_SENTINEL : o.value}
            disabled={o.disabled}
            className="text-sm focus:bg-brand-50 focus:text-brand-900"
          >
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </ShadSelect>
  );
}
