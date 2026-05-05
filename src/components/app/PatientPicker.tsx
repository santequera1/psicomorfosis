import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, type ApiPatient } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Search, X, Check, User, Loader2 } from "lucide-react";

/**
 * Selector de paciente con búsqueda incremental (typeahead).
 *
 * Reemplaza al `<select>` largo de pacientes que no escala bien cuando hay
 * muchos. El listado completo se carga una vez (con la query "patients" del
 * react-query, así se comparte con otras vistas), y filtramos en cliente:
 * - normaliza acentos para que "ramirez" matchee "Ramírez"
 * - busca en preferredName, name, doc e id
 * - debounce ligero de 120ms para no reflujear el dropdown en cada tecla
 *
 * Modo controlado:
 *   value=patientId | null
 *   onChange(id|null, name|null)
 *
 * Si `value` está seteado, muestra un chip con el paciente y un botón ✕
 * para limpiarlo y volver al input de búsqueda.
 */

export interface PatientPickerProps {
  value: string | null | undefined;
  onChange: (id: string | null, name: string | null) => void;
  placeholder?: string;
  autoFocus?: boolean;
  /** Si se provee, evita pedir el listado y usa este. Útil cuando ya está cargado. */
  patients?: ApiPatient[];
  /** Permite el valor "sin paciente". Default true. */
  allowEmpty?: boolean;
  /** Tamaño visual. */
  compact?: boolean;
  className?: string;
}

function normalize(s: string): string {
  return (s ?? "")
    .toString()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

export function PatientPicker({
  value,
  onChange,
  placeholder = "Buscar paciente por nombre, documento o ID…",
  autoFocus,
  patients: passedPatients,
  allowEmpty = true,
  compact = false,
  className,
}: PatientPickerProps) {
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Carga si no se pasaron pacientes pre-cargados
  const enabled = !passedPatients;
  const { data: fetched, isLoading } = useQuery({
    queryKey: ["patients"],
    queryFn: () => api.listPatients(),
    enabled,
  });
  const allPatients = passedPatients ?? fetched ?? [];

  // Debounce input
  useEffect(() => {
    const t = setTimeout(() => setDebounced(query), 120);
    return () => clearTimeout(t);
  }, [query]);

  // Cerrar al click fuera
  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const selected = useMemo(
    () => (value ? allPatients.find((p) => p.id === value) : null),
    [allPatients, value],
  );

  const filtered = useMemo(() => {
    const q = normalize(debounced.trim());
    if (!q) return allPatients.slice(0, 20);
    return allPatients
      .filter((p) => {
        return (
          normalize(p.preferredName ?? "").includes(q) ||
          normalize(p.name).includes(q) ||
          normalize(p.doc ?? "").includes(q) ||
          normalize(p.id).includes(q)
        );
      })
      .slice(0, 30);
  }, [allPatients, debounced]);

  useEffect(() => setHighlight(0), [filtered]);

  function handleSelect(p: ApiPatient) {
    onChange(p.id, p.name);
    setOpen(false);
    setQuery("");
  }

  function clear() {
    onChange(null, null);
    setQuery("");
    // foco al input para seguir buscando
    setTimeout(() => inputRef.current?.focus(), 0);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setHighlight((i) => Math.min(filtered.length - 1, i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((i) => Math.max(0, i - 1));
    } else if (e.key === "Enter") {
      if (filtered[highlight]) {
        e.preventDefault();
        handleSelect(filtered[highlight]);
      }
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  // Si ya hay valor seleccionado, mostrar chip + botón limpiar
  if (selected) {
    return (
      <div className={cn("flex items-center gap-2", className)}>
        <div className={cn(
          "flex-1 min-w-0 inline-flex items-center gap-2 rounded-md border border-line-200 bg-bg-100/60 px-3",
          compact ? "h-8" : "h-10",
        )}>
          <User className="h-3.5 w-3.5 text-ink-400 shrink-0" />
          <span className="flex-1 min-w-0 truncate text-sm text-ink-900">
            {selected.name}{selected.preferredName ? ` · ${selected.preferredName}` : ""}
            <span className="text-ink-400 ml-1">({selected.id})</span>
          </span>
          {allowEmpty && (
            <button
              type="button"
              onClick={clear}
              className="h-6 w-6 rounded-md hover:bg-bg-100 text-ink-500 flex items-center justify-center shrink-0"
              title="Cambiar paciente"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>
    );
  }

  // Sin valor: input con dropdown de resultados
  return (
    <div ref={containerRef} className={cn("relative", className)}>
      <div className={cn(
        "flex items-center gap-2 rounded-md border bg-surface px-3",
        compact ? "h-8" : "h-10",
        open ? "border-brand-700" : "border-line-200",
      )}>
        <Search className="h-3.5 w-3.5 text-ink-400 shrink-0" />
        <input
          ref={inputRef}
          autoFocus={autoFocus}
          value={query}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          className="flex-1 bg-transparent text-sm text-ink-900 placeholder:text-ink-400 outline-none min-w-0"
        />
        {isLoading && enabled && <Loader2 className="h-3.5 w-3.5 animate-spin text-ink-400" />}
      </div>
      {open && (
        <div className="absolute z-30 left-0 right-0 mt-1 rounded-lg border border-line-200 bg-surface shadow-modal max-h-72 overflow-y-auto">
          {allowEmpty && (
            <button
              type="button"
              onClick={() => { onChange(null, null); setOpen(false); }}
              className={cn(
                "w-full flex items-center gap-2 px-3 py-2 text-sm text-left",
                value == null ? "bg-brand-50 text-brand-800" : "text-ink-700 hover:bg-bg-100",
              )}
            >
              {value == null ? <Check className="h-3.5 w-3.5" /> : <span className="w-3.5" />}
              <span className="text-ink-500 italic">Sin paciente vinculado</span>
            </button>
          )}
          {filtered.length === 0 ? (
            <div className="px-3 py-3 text-xs text-ink-500">
              {debounced ? `Sin coincidencias para "${debounced}"` : "Empieza a escribir para buscar…"}
            </div>
          ) : (
            filtered.map((p, i) => {
              const isHighlighted = i === highlight;
              return (
                <button
                  key={p.id}
                  type="button"
                  onMouseEnter={() => setHighlight(i)}
                  onClick={() => handleSelect(p)}
                  className={cn(
                    "w-full flex items-start gap-2 px-3 py-2 text-sm text-left transition-colors",
                    isHighlighted ? "bg-brand-50" : "hover:bg-bg-100",
                  )}
                >
                  <div className="h-7 w-7 rounded-full bg-brand-100 text-brand-800 flex items-center justify-center text-[10px] font-semibold shrink-0">
                    {(p.preferredName ?? p.name).split(" ").slice(0, 2).map((n) => n[0]).join("").toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-ink-900 truncate">
                      {p.name}{p.preferredName ? ` · ${p.preferredName}` : ""}
                    </div>
                    <div className="text-[11px] text-ink-500 tabular truncate">
                      {p.doc} · {p.id}
                    </div>
                  </div>
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
