import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { List, LayoutGrid, Folder } from "lucide-react";

export type ViewMode = "list" | "cards" | "folders";

const ICONS: Record<ViewMode, React.ComponentType<{ className?: string }>> = {
  list: List,
  cards: LayoutGrid,
  folders: Folder,
};

const LABELS: Record<ViewMode, string> = {
  list: "Lista",
  cards: "Tarjetas",
  folders: "Carpetas",
};

/** Toggle visual de modos de visualización (lista / tarjetas / carpetas). */
export function ViewToggle({
  value,
  onChange,
  modes = ["list", "cards", "folders"],
  className,
}: {
  value: ViewMode;
  onChange: (v: ViewMode) => void;
  modes?: ViewMode[];
  className?: string;
}) {
  return (
    <div className={cn("inline-flex items-center rounded-lg border border-line-200 bg-bg-100/40 p-0.5", className)}>
      {modes.map((m) => {
        const Icon = ICONS[m];
        const active = value === m;
        return (
          <button
            key={m}
            type="button"
            onClick={() => onChange(m)}
            aria-pressed={active}
            title={LABELS[m]}
            className={cn(
              "h-8 px-3 rounded-md text-xs font-medium inline-flex items-center gap-1.5 transition-colors",
              active
                ? "bg-surface text-ink-900 shadow-sm border border-line-200"
                : "text-ink-500 hover:text-ink-700",
            )}
          >
            <Icon className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">{LABELS[m]}</span>
          </button>
        );
      })}
    </div>
  );
}

/** Hook para persistir el modo en localStorage. */
export function usePersistedViewMode(key: string, initial: ViewMode = "list"): [ViewMode, (v: ViewMode) => void] {
  const [mode, setMode] = useState<ViewMode>(initial);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(key);
      if (stored === "list" || stored === "cards" || stored === "folders") {
        setMode(stored);
      }
    } catch { /* ignore */ }
  }, [key]);

  const update = (v: ViewMode) => {
    setMode(v);
    try { localStorage.setItem(key, v); } catch { /* ignore */ }
  };

  return [mode, update];
}
