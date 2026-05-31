import { cn, displayPatientName } from "@/lib/utils";

/**
 * Carpeta estilo Apple Files / Photos: SVG de folder con tab y una "polaroid"
 * con la foto del paciente (o sus iniciales coloreadas) sobre la solapa.
 *
 * Los colores del folder vienen de CSS vars (--folder-N-*) que styles.css
 * sobrescribe en .dark con tonos oscuros sutiles — antes eran hex pastel
 * fijos y en modo oscuro se veían blanquecinos contra el fondo dark.
 *
 * Tamaño responsive: más pequeño en mobile que en desktop.
 */

const FOLDER_TONES: Array<{ body: string; tab: string; border: string }> = [
  { body: "var(--folder-1-body)", tab: "var(--folder-1-tab)", border: "var(--folder-1-border)" },
  { body: "var(--folder-2-body)", tab: "var(--folder-2-tab)", border: "var(--folder-2-border)" },
  { body: "var(--folder-3-body)", tab: "var(--folder-3-tab)", border: "var(--folder-3-border)" },
  { body: "var(--folder-4-body)", tab: "var(--folder-4-tab)", border: "var(--folder-4-border)" },
  { body: "var(--folder-5-body)", tab: "var(--folder-5-tab)", border: "var(--folder-5-border)" },
  { body: "var(--folder-6-body)", tab: "var(--folder-6-tab)", border: "var(--folder-6-border)" },
];

const AVATAR_TONES = [
  "bg-brand-100 text-brand-800",
  "bg-sage-200 text-sage-700",
  "bg-lavender-100 text-lavender-500",
  "bg-warning-soft text-risk-moderate",
];

function hashName(name: string): number {
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return h;
}

function initials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((n) => n[0])
    .join("")
    .toUpperCase();
}

export interface PatientFolderProps {
  name: string;
  preferredName?: string;
  photoUrl?: string | null;
  count?: number;
  onClick?: () => void;
  className?: string;
}

export function PatientFolder({ name, preferredName, photoUrl, count, onClick, className }: PatientFolderProps) {
  const h = hashName(name);
  const tone = FOLDER_TONES[h % FOLDER_TONES.length];
  const avatarTone = AVATAR_TONES[h % AVATAR_TONES.length];
  const displayName = displayPatientName({ name, preferredName });

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group flex flex-col items-center gap-1.5 p-2 sm:p-3 rounded-xl hover:bg-bg-100/60 transition-colors text-left",
        className,
      )}
      title={name}
    >
      <div
        className={cn(
          // Mobile más compacto. Antes era w-32/h-28 fijo y las carpetas
          // se veían demasiado grandes en pantallas chicas.
          "relative w-24 h-22 sm:w-32 sm:h-28 transform-gpu transition-transform duration-300 ease-out",
          "origin-[50%_85%]",
          "group-hover:-translate-y-1.5 group-hover:-rotate-3",
          "group-active:-translate-y-0.5 group-active:rotate-[-1.5deg] group-active:duration-100",
        )}
      >
        <svg viewBox="0 0 128 112" className="absolute inset-0 w-full h-full drop-shadow-sm group-hover:drop-shadow-md transition-all duration-300">
          <path
            d="M8 18 L8 92 Q8 100 16 100 L112 100 Q120 100 120 92 L120 30 Q120 22 112 22 L60 22 L52 14 Q50 12 46 12 L16 12 Q8 12 8 20 Z"
            fill={tone.tab}
            stroke={tone.border}
            strokeWidth="0.5"
          />
          <path
            d="M4 36 Q4 28 12 28 L116 28 Q124 28 124 36 L124 96 Q124 104 116 104 L12 104 Q4 104 4 96 Z"
            fill={tone.body}
            stroke={tone.border}
            strokeWidth="0.5"
          />
        </svg>

        <div
          className={cn(
            // bg-surface en lugar de bg-white para que la polaroid también
            // respete el modo oscuro (antes blanca cruda sobre dark).
            "absolute left-1/2 top-2 sm:top-3 bg-surface p-1 pb-2 sm:pb-3 rounded-sm shadow-md",
            "transform-gpu transition-transform duration-300 ease-out",
            "-translate-x-1/2 -rotate-3",
            "group-hover:-translate-y-1 group-hover:rotate-[-5deg]",
            "w-10 h-12 sm:w-[50px] sm:h-14",
          )}
        >
          {photoUrl ? (
            <img
              src={photoUrl}
              alt={displayName}
              className="w-full h-8 sm:h-10 object-cover rounded-sm"
              draggable={false}
            />
          ) : (
            <div className={cn("w-full h-8 sm:h-10 rounded-sm flex items-center justify-center text-[10px] sm:text-xs font-semibold", avatarTone)}>
              {initials(displayName)}
            </div>
          )}
        </div>
      </div>
      <div className="text-center w-full px-1">
        {/* min-h removido. Antes reservaba 2 líneas para alinear, pero
            generaba un hueco visible entre nombre y contador cuando el
            nombre cabía en 1 línea (el user pidió que estén más juntos). */}
        <div className="text-xs sm:text-sm text-ink-900 font-medium leading-tight line-clamp-2 wrap-break-word">
          {displayName}
        </div>
        {typeof count === "number" && (
          <div className="text-[10px] sm:text-[11px] text-ink-500 tabular mt-0.5">{count} {count === 1 ? "documento" : "documentos"}</div>
        )}
      </div>
    </button>
  );
}

export function GenericFolder({
  name, count, onClick, className, toneIdx = 0,
}: {
  name: string;
  count?: number;
  onClick?: () => void;
  className?: string;
  toneIdx?: number;
}) {
  const tone = FOLDER_TONES[toneIdx % FOLDER_TONES.length];
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group flex flex-col items-center gap-1.5 p-2 sm:p-3 rounded-xl hover:bg-bg-100/60 transition-colors text-left",
        className,
      )}
      title={name}
    >
      <div
        className={cn(
          "relative w-24 h-22 sm:w-32 sm:h-28 transform-gpu transition-transform duration-300 ease-out",
          "origin-[50%_85%]",
          "group-hover:-translate-y-1.5 group-hover:-rotate-3",
          "group-active:-translate-y-0.5 group-active:rotate-[-1.5deg] group-active:duration-100",
        )}
      >
        <svg viewBox="0 0 128 112" className="absolute inset-0 w-full h-full drop-shadow-sm group-hover:drop-shadow-md transition-all duration-300">
          <path
            d="M8 18 L8 92 Q8 100 16 100 L112 100 Q120 100 120 92 L120 30 Q120 22 112 22 L60 22 L52 14 Q50 12 46 12 L16 12 Q8 12 8 20 Z"
            fill={tone.tab}
            stroke={tone.border}
            strokeWidth="0.5"
          />
          <path
            d="M4 36 Q4 28 12 28 L116 28 Q124 28 124 36 L124 96 Q124 104 116 104 L12 104 Q4 104 4 96 Z"
            fill={tone.body}
            stroke={tone.border}
            strokeWidth="0.5"
          />
        </svg>
      </div>
      <div className="text-center w-full px-1">
        <div className="text-xs sm:text-sm text-ink-900 font-medium leading-tight line-clamp-2 wrap-break-word">
          {name}
        </div>
        {typeof count === "number" && (
          <div className="text-[10px] sm:text-[11px] text-ink-500 tabular mt-0.5">{count} {count === 1 ? "documento" : "documentos"}</div>
        )}
      </div>
    </button>
  );
}
