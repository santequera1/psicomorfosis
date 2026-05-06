import { cn, displayPatientName } from "@/lib/utils";

/**
 * Carpeta estilo Apple Files / Photos: SVG de folder con tab y una "polaroid"
 * con la foto del paciente (o sus iniciales coloreadas) sobre la solapa.
 *
 * Se usa en la vista Carpetas de Documentos y donde queramos representar a
 * un paciente como contenedor agregador. El color del folder se deriva del
 * nombre para variedad visual sin tener que persistirlo.
 */

const FOLDER_TONES = [
  { body: "#F4D78A", tab: "#E9C875", border: "#C8A553" }, // amarillo
  { body: "#C8E6B7", tab: "#B8D9A6", border: "#8FB37C" }, // verde
  { body: "#F4C7E0", tab: "#E5B5D2", border: "#C18BAA" }, // rosa
  { body: "#C5D8F4", tab: "#B5C9E6", border: "#8AA5C8" }, // azul
  { body: "#E5D2F4", tab: "#D6C2E6", border: "#A89BC8" }, // lavanda
  { body: "#F4D5B7", tab: "#E5C6A8", border: "#C8A07A" }, // durazno
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
  // displayPatientName trata "" y "   " como "no hay apodo" y cae al
  // nombre completo. El form guarda preferredName como string vacío
  // cuando el usuario lo borra, y un `??` antes dejaba la carpeta en
  // blanco (incluyendo iniciales).
  const displayName = displayPatientName({ name, preferredName });

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group flex flex-col items-center gap-2 p-3 rounded-xl hover:bg-bg-100/60 transition-colors text-left",
        className,
      )}
      title={name}
    >
      {/* Wrapper que aplica el lift + tilt al hover. transform-gpu para que la
          animación corra suave en compositor sin repintar capas. */}
      <div
        className={cn(
          "relative w-32 h-28 transform-gpu transition-transform duration-300 ease-out",
          "origin-[50%_85%]",
          "group-hover:-translate-y-1.5 group-hover:-rotate-3",
          "group-active:-translate-y-0.5 group-active:rotate-[-1.5deg] group-active:duration-100",
        )}
      >
        {/* SVG de la carpeta */}
        <svg viewBox="0 0 128 112" className="absolute inset-0 w-full h-full drop-shadow-sm group-hover:drop-shadow-md transition-all duration-300">
          {/* Tab posterior (fondo) */}
          <path
            d="M8 18 L8 92 Q8 100 16 100 L112 100 Q120 100 120 92 L120 30 Q120 22 112 22 L60 22 L52 14 Q50 12 46 12 L16 12 Q8 12 8 20 Z"
            fill={tone.tab}
            stroke={tone.border}
            strokeWidth="0.5"
          />
          {/* Cuerpo de la carpeta (más al frente) */}
          <path
            d="M4 36 Q4 28 12 28 L116 28 Q124 28 124 36 L124 96 Q124 104 116 104 L12 104 Q4 104 4 96 Z"
            fill={tone.body}
            stroke={tone.border}
            strokeWidth="0.5"
          />
        </svg>

        {/* Polaroid con foto/iniciales — se asoma un poco más al hover. */}
        <div
          className={cn(
            "absolute left-1/2 top-3 bg-white p-1 pb-3 rounded-sm shadow-md",
            "transform-gpu transition-transform duration-300 ease-out",
            "-translate-x-1/2 -rotate-3",
            "group-hover:-translate-y-1 group-hover:rotate-[-5deg]",
          )}
          style={{ width: 50, height: 56 }}
        >
          {photoUrl ? (
            <img
              src={photoUrl}
              alt={displayName}
              className="w-full h-10 object-cover rounded-sm"
              draggable={false}
            />
          ) : (
            <div className={cn("w-full h-10 rounded-sm flex items-center justify-center text-xs font-semibold", avatarTone)}>
              {initials(displayName)}
            </div>
          )}
        </div>
      </div>
      <div className="text-center w-full px-1">
        {/* min-h reserva siempre 2 líneas para que las cards queden alineadas
            entre sí: nombres cortos (apodos) y nombres largos producen la
            misma altura, y la línea "X documentos" cae a la misma Y. */}
        <div className="text-sm text-ink-900 font-medium leading-tight line-clamp-2 wrap-break-word min-h-10 flex items-start justify-center">
          <span>{displayName}</span>
        </div>
        {typeof count === "number" && (
          <div className="text-[11px] text-ink-500 tabular mt-0.5">{count} {count === 1 ? "documento" : "documentos"}</div>
        )}
      </div>
    </button>
  );
}

/**
 * Carpeta genérica (sin foto) — para "Sin paciente vinculado", "Plantillas", etc.
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
        "group flex flex-col items-center gap-2 p-3 rounded-xl hover:bg-bg-100/60 transition-colors text-left",
        className,
      )}
      title={name}
    >
      <div
        className={cn(
          "relative w-32 h-28 transform-gpu transition-transform duration-300 ease-out",
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
        {/* Misma reserva de 2 líneas que PatientFolder para alineación uniforme. */}
        <div className="text-sm text-ink-900 font-medium leading-tight line-clamp-2 wrap-break-word min-h-10 flex items-start justify-center">
          <span>{name}</span>
        </div>
        {typeof count === "number" && (
          <div className="text-[11px] text-ink-500 tabular mt-0.5">{count} {count === 1 ? "documento" : "documentos"}</div>
        )}
      </div>
    </button>
  );
}
