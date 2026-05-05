import { useState, useRef } from "react";
import { X } from "lucide-react";

/**
 * Editor de etiquetas con autocompletado.
 *
 * - Tecla Enter / coma / Tab → confirma el tag tipeado.
 * - Backspace en input vacío → elimina el último tag.
 * - Sugerencias: las que ya existen en el workspace + atajos populares.
 *
 * El componente es agnóstico de la fuente de datos: la página/modal que lo
 * usa pasa `suggestions` (típicamente derivadas de `patients.flatMap(p => p.tags)`).
 */

const POPULAR_TAGS = [
  "Ansiedad", "Depresión", "Adolescente", "Alto riesgo",
  "TCC", "DBT", "Psiquiatría", "Duelo", "TCA",
];

export function TagEditor({
  value,
  onChange,
  suggestions = [],
  placeholder = "Escribe una etiqueta y presiona Enter",
}: {
  value: string[];
  onChange: (next: string[]) => void;
  suggestions?: string[];
  placeholder?: string;
}) {
  const [input, setInput] = useState("");
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  function add(raw: string) {
    const t = raw.trim();
    if (!t) return;
    if (value.includes(t)) {
      // Limpia el input pero no duplica.
      setInput("");
      return;
    }
    onChange([...value, t]);
    setInput("");
  }

  function remove(tag: string) {
    onChange(value.filter((t) => t !== tag));
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === "," || e.key === "Tab") {
      if (input.trim()) {
        e.preventDefault();
        add(input);
      }
    } else if (e.key === "Backspace" && input === "" && value.length > 0) {
      remove(value[value.length - 1]);
    }
  }

  // Filtrado de sugerencias: excluir las ya elegidas + match contra input.
  const allSuggestions = Array.from(new Set([...suggestions, ...POPULAR_TAGS]));
  const filtered = allSuggestions
    .filter((s) => !value.includes(s))
    .filter((s) => (input ? s.toLowerCase().includes(input.toLowerCase()) : true))
    .slice(0, 8);

  // Atajos populares no agregados aún (solo cuando el input está vacío para
  // no competir con el dropdown).
  const quickAdds = !input
    ? POPULAR_TAGS.filter((t) => !value.includes(t)).slice(0, 6)
    : [];

  return (
    <div>
      <div
        className="flex flex-wrap items-center gap-1.5 min-h-10 px-2.5 py-1.5 rounded-md border border-line-200 bg-surface focus-within:border-brand-700"
        onClick={() => inputRef.current?.focus()}
      >
        {value.map((t) => (
          <span
            key={t}
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] uppercase tracking-[0.06em] bg-lavender-100 text-lavender-500 font-medium"
          >
            {t}
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); remove(t); }}
              className="hover:text-risk-high"
              aria-label={`Quitar ${t}`}
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          onFocus={() => setFocused(true)}
          onBlur={() => {
            // Pequeño delay para que el clic en una sugerencia llegue antes
            // de que el dropdown desaparezca.
            setTimeout(() => setFocused(false), 120);
          }}
          placeholder={value.length ? "" : placeholder}
          className="flex-1 min-w-[120px] h-7 bg-transparent text-sm text-ink-900 outline-none placeholder:text-ink-400"
        />
      </div>

      {focused && input && filtered.length > 0 && (
        <div className="mt-1 rounded-md border border-line-200 bg-surface shadow-modal max-h-48 overflow-y-auto">
          {filtered.map((s) => (
            <button
              key={s}
              type="button"
              onMouseDown={(e) => { e.preventDefault(); add(s); }}
              className="w-full text-left px-3 py-1.5 text-sm text-ink-700 hover:bg-bg-100"
            >
              {s}
            </button>
          ))}
        </div>
      )}

      {quickAdds.length > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <span className="text-[10px] uppercase tracking-wider text-ink-400">Sugeridas:</span>
          {quickAdds.map((t) => (
            <button
              type="button"
              key={t}
              onClick={() => add(t)}
              className="text-[11px] px-2 py-0.5 rounded-full text-ink-500 hover:text-brand-700 hover:bg-brand-50 border border-line-200 hover:border-brand-400 transition-colors"
            >
              + {t}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
