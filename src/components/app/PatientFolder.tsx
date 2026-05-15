import { cn, displayPatientName } from "@/lib/utils";

/**
 * Carpeta estilo "manila folder": cuerpo rectangular blanco con una
 * pestaña colorida sobresaliendo arriba a la izquierda. El color de la
 * pestaña se deriva del hash del nombre para que cada paciente tenga
 * una identidad visual estable sin tener que persistirla.
 *
 * Visual:
 *   ┌──────────┐
 *   │  ▔▔▔▔▔  │     ← pestaña arriba (colorida)
 *   │ ────────┴───┐
 *   │             │
 *   │  Título     │  ← body blanco con título + descripción
 *   │  Descripción│
 *   │             │
 *   └─────────────┘
 *
 * Usado en la vista Carpetas de Documentos para agrupar por paciente.
 */

const FOLDER_TONES = [
  { tab: "oklch(0.6 0.14 250)" },  // azul
  { tab: "oklch(0.55 0.18 350)" }, // magenta
  { tab: "oklch(0.68 0.16 60)" },  // naranja
  { tab: "oklch(0.6 0.13 145)" },  // verde
  { tab: "oklch(0.62 0.14 295)" }, // violeta
  { tab: "oklch(0.65 0.15 30)" },  // coral
  { tab: "oklch(0.6 0.12 195)" },  // teal
  { tab: "oklch(0.6 0.14 100)" },  // oliva
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

/**
 * Bloque visual compartido entre PatientFolder y GenericFolder. Renderiza
 * la pestaña + el body. El consumer decide qué va en el body (title,
 * descripción, avatar, etc).
 */
function FolderShell({
  tab,
  children,
  onClick,
  className,
  title,
}: {
  tab: { tab: string };
  children: React.ReactNode;
  onClick?: () => void;
  className?: string;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        // Reservamos espacio arriba para que la pestaña no quede recortada
        // por el container del grid (pt-3 = altura de la tab).
        "group relative block w-full text-left pt-3 transition-transform duration-200",
        "hover:-translate-y-1 active:translate-y-0 active:duration-75",
        className,
      )}
      title={title}
    >
      {/* Pestaña: arriba a la izquierda, sobresale ~12px del body. El
          ancho ~40% emula el corte de carpeta de archivo real. rounded-t
          solo arriba para que se vea como una solapa pegada al body. */}
      <div
        className="absolute top-0 left-3 h-3 w-2/5 rounded-t-md"
        style={{ backgroundColor: tab.tab }}
        aria-hidden
      />
      {/* Body: blanco con borde fino y sombra sutil. La línea superior
          izquierda usa el mismo color que la tab para que se vea como
          si la pestaña "se mete" en el body sin discontinuidad visual.
          group-hover:shadow-md eleva la card al hover (junto con el
          -translate-y-1 del wrapper). */}
      <div
        className={cn(
          "relative rounded-xl rounded-tl-none border border-line-200 bg-surface shadow-soft",
          "group-hover:shadow-card group-hover:border-line-300 transition-all duration-200",
          "p-4 min-h-32",
        )}
      >
        {/* Banda superior izquierda del mismo color que la tab — crea la
            continuidad visual con la pestaña. h-0.5 muy fino. */}
        <div
          className="absolute top-0 left-0 h-0.5 w-2/5 rounded-tr-md"
          style={{ backgroundColor: tab.tab }}
          aria-hidden
        />
        {children}
      </div>
    </button>
  );
}

export function PatientFolder({ name, preferredName, photoUrl, count, onClick, className }: PatientFolderProps) {
  const h = hashName(name);
  const tone = FOLDER_TONES[h % FOLDER_TONES.length];
  const displayName = displayPatientName({ name, preferredName });

  return (
    <FolderShell tab={tone} onClick={onClick} className={className} title={name}>
      <div className="flex items-start gap-3">
        {/* Avatar pequeño con foto o iniciales. Esquina superior izquierda
            del body, no encima de la tab. Mantiene la identidad del paciente
            sin la polaroid grande del diseño anterior. */}
        {photoUrl ? (
          <img
            src={photoUrl}
            alt={displayName}
            className="h-10 w-10 rounded-full object-cover shrink-0 border border-line-200"
            draggable={false}
          />
        ) : (
          <div
            className="h-10 w-10 rounded-full flex items-center justify-center text-xs font-semibold shrink-0 text-white"
            style={{ backgroundColor: tone.tab }}
          >
            {initials(displayName)}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium text-ink-900 leading-tight line-clamp-2">
            {displayName}
          </div>
          {typeof count === "number" && (
            <div className="text-[11px] text-ink-500 tabular mt-1">
              {count} {count === 1 ? "documento" : "documentos"}
            </div>
          )}
        </div>
      </div>
    </FolderShell>
  );
}

/**
 * Carpeta genérica (sin foto) — para "Sin paciente vinculado", "Plantillas", etc.
 * Mismo look que PatientFolder pero centrado, sin avatar.
 */
export function GenericFolder({
  name,
  count,
  onClick,
  className,
  toneIdx = 0,
}: {
  name: string;
  count?: number;
  onClick?: () => void;
  className?: string;
  toneIdx?: number;
}) {
  const tone = FOLDER_TONES[toneIdx % FOLDER_TONES.length];
  return (
    <FolderShell tab={tone} onClick={onClick} className={className} title={name}>
      <div className="text-sm font-medium text-ink-900 leading-tight line-clamp-2">
        {name}
      </div>
      {typeof count === "number" && (
        <div className="text-[11px] text-ink-500 tabular mt-1">
          {count} {count === 1 ? "documento" : "documentos"}
        </div>
      )}
    </FolderShell>
  );
}
