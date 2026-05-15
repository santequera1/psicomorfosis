import { cn, displayPatientName } from "@/lib/utils";

/**
 * Carpeta visual estilo manila folder (referencia: Reflect, Mem, apps
 * premium de notas). Se dibuja con SVG inline para tener la forma física
 * real — body cream con esquinas redondeadas + tab arriba a la izquierda
 * que se asoma como un papel doblado. NO es una franja decorativa.
 *
 * Paleta terapéutica calmada (sage, sand, terracotta, olive, dusty blue…),
 * intencionalmente baja en chroma para sentirse mate y orgánica, sin los
 * colores saturados de productivity apps frías.
 *
 * El color de la tab se deriva del hash del nombre para que cada paciente
 * tenga identidad visual estable sin tener que persistirla.
 */

const FOLDER_TONES = [
  { tab: "oklch(0.74 0.045 145)" },  // sage green
  { tab: "oklch(0.82 0.04 80)" },    // sand
  { tab: "oklch(0.68 0.07 35)" },    // muted terracotta
  { tab: "oklch(0.72 0.025 60)" },   // warm gray
  { tab: "oklch(0.74 0.055 110)" },  // soft olive
  { tab: "oklch(0.78 0.06 220)" },   // dusty blue
  { tab: "oklch(0.72 0.05 305)" },   // muted purple
  { tab: "oklch(0.78 0.08 85)" },    // muted mustard
];

// Body cream/off-white — un tono cálido más oscuro que blanco puro para
// que se sienta papel mate, no plástico digital. Único valor para todas
// las carpetas (la variación visual viene del color de la tab).
const FOLDER_BODY = "oklch(0.985 0.008 80)";
const FOLDER_STROKE = "oklch(0.86 0.015 80)";

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
 * Forma SVG del folder. preserveAspectRatio=none para que escale al
 * tamaño del container manteniendo la silueta. El viewBox 200x200 es
 * arbitrario; lo importante son las proporciones internas.
 *
 * Estructura del SVG:
 *  - Tab (arriba a la izquierda) — dibujada PRIMERO para que el body
 *    aparezca encima de su parte inferior, creando el efecto "papel
 *    detrás del papel". La tab tiene los 2 corners superiores
 *    redondeados, el inferior recto (queda oculto bajo el body).
 *  - Body — rectángulo grande redondeado que ocupa la mayor parte. Sus
 *    bordes top tapan la base de la tab.
 *  - Stroke gris muy claro solo en el body para definir el contorno
 *    general sin que la tab tenga doble borde donde se monta.
 *  - drop-shadow muy sutil (dy=2, stdDev=3, opacity=0.06) para
 *    profundidad sin pesar visualmente.
 */
function FolderShape({ tab }: { tab: string }) {
  const filterId = `folder-shadow-${tab.replace(/[^a-z0-9]/gi, "")}`;
  return (
    <svg
      viewBox="0 0 200 200"
      preserveAspectRatio="none"
      className="absolute inset-0 w-full h-full"
      aria-hidden
    >
      <defs>
        <filter id={filterId} x="-5%" y="-5%" width="110%" height="115%">
          <feDropShadow dx="0" dy="2" stdDeviation="3" floodColor="rgb(31 57 63)" floodOpacity="0.07" />
        </filter>
      </defs>
      <g filter={`url(#${filterId})`}>
        {/* TAB — arriba a la izquierda. Las esquinas superiores tienen
            radio 10, las inferiores son rectas (las cubre el body). El
            ancho llega hasta el 55% del folder, posicionada desde 10% a
            la izquierda. */}
        <path
          d="M 18 32
             L 18 14
             Q 18 4 28 4
             L 102 4
             Q 112 4 112 14
             L 112 32 Z"
          fill={tab}
        />
        {/* BODY — rectángulo redondeado que va por encima de la tab,
            tapándole la base. Radio 14 en las 4 esquinas, suficiente
            para sentirse "soft paper" sin perder la forma de folder. */}
        <path
          d="M 4 46
             Q 4 32 18 32
             L 182 32
             Q 196 32 196 46
             L 196 182
             Q 196 196 182 196
             L 18 196
             Q 4 196 4 182 Z"
          fill={FOLDER_BODY}
          stroke={FOLDER_STROKE}
          strokeWidth="1"
        />
        {/* Highlight sutil interno en la parte superior del body — emula
            la luz que reflejaría un papel real. opacity muy baja para no
            saturar. */}
        <path
          d="M 8 46
             Q 8 36 18 36
             L 182 36
             Q 192 36 192 46
             L 192 52
             L 8 52 Z"
          fill="white"
          opacity="0.4"
        />
      </g>
    </svg>
  );
}

export function PatientFolder({ name, preferredName, photoUrl, count, onClick, className }: PatientFolderProps) {
  const h = hashName(name);
  const tone = FOLDER_TONES[h % FOLDER_TONES.length];
  const displayName = displayPatientName({ name, preferredName });

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group relative block w-full text-left transition-transform duration-200",
        "hover:-translate-y-1 active:translate-y-0 active:duration-75",
        // aspect-ratio para mantener proporciones del SVG. ~1:1.05.
        "aspect-[1/1.05]",
        className,
      )}
      title={name}
    >
      <FolderShape tab={tone.tab} />
      {/* Contenido encima del SVG. Padding generoso. Sin overflow del
          área del body. pt-12 deja respirar arriba para no chocar con
          la tab visualmente. */}
      <div className="relative h-full flex flex-col p-5 pt-14">
        <div className="flex items-start gap-3 min-w-0">
          {photoUrl ? (
            <img
              src={photoUrl}
              alt={displayName}
              className="h-9 w-9 rounded-full object-cover shrink-0 border border-line-200/60"
              draggable={false}
            />
          ) : (
            <div
              className="h-9 w-9 rounded-full flex items-center justify-center text-[10px] font-semibold shrink-0 text-white/95"
              style={{ backgroundColor: tone.tab }}
            >
              {initials(displayName)}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <div className="text-[15px] font-semibold text-ink-900 leading-snug line-clamp-2">
              {displayName}
            </div>
          </div>
        </div>
        {typeof count === "number" && (
          <div className="mt-auto text-xs text-ink-500 tabular">
            {count} {count === 1 ? "documento" : "documentos"}
          </div>
        )}
      </div>
    </button>
  );
}

/**
 * Carpeta genérica (sin foto/avatar) — para "Sin paciente vinculado",
 * "Plantillas", etc. Mismo look visual con SVG de folder, sin avatar.
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
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group relative block w-full text-left transition-transform duration-200",
        "hover:-translate-y-1 active:translate-y-0 active:duration-75",
        "aspect-[1/1.05]",
        className,
      )}
      title={name}
    >
      <FolderShape tab={tone.tab} />
      <div className="relative h-full flex flex-col p-5 pt-14">
        <div className="text-[15px] font-semibold text-ink-900 leading-snug line-clamp-3">
          {name}
        </div>
        {typeof count === "number" && (
          <div className="mt-auto text-xs text-ink-500 tabular">
            {count} {count === 1 ? "documento" : "documentos"}
          </div>
        )}
      </div>
    </button>
  );
}
