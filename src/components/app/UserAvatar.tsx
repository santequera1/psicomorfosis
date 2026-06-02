import { cn } from "@/lib/utils";

/**
 * Avatar reutilizable: si hay `photoUrl` muestra la imagen; si no,
 * cae al patrón anterior de iniciales coloreadas. Tamaños predefinidos
 * para mantener consistencia (h-9 sidebar/topbar, h-10 modales, h-14 perfil).
 */
type Size = "xs" | "sm" | "md" | "lg" | "xl";

const SIZE_CLS: Record<Size, string> = {
  xs: "h-7 w-7 text-[10px]",
  sm: "h-9 w-9 text-xs",
  md: "h-10 w-10 text-sm",
  lg: "h-14 w-14 text-base",
  xl: "h-20 w-20 text-lg",
};

function initials(name: string): string {
  return (name ?? "?")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((n) => n[0])
    .join("")
    .toUpperCase() || "?";
}

interface Props {
  name: string;
  photoUrl?: string | null;
  size?: Size;
  className?: string;
  /** Aplicado solo al fallback de iniciales. Para mantener el color
      brand que usaban los avatares anteriores en sidebar/topbar. */
  fallbackClassName?: string;
}

export function UserAvatar({ name, photoUrl, size = "sm", className, fallbackClassName }: Props) {
  const sizeCls = SIZE_CLS[size];
  if (photoUrl) {
    return (
      <img
        src={photoUrl}
        alt={name}
        className={cn(
          "rounded-full object-cover shrink-0",
          sizeCls,
          className,
        )}
        draggable={false}
        // Si la imagen falla, el browser muestra el alt — no es lo
        // óptimo pero evita un onError loop con state. Caso muy raro
        // (foto recién subida no debería 404).
      />
    );
  }
  return (
    <div
      className={cn(
        "rounded-full font-semibold flex items-center justify-center shrink-0",
        sizeCls,
        fallbackClassName ?? "bg-brand-100 text-brand-800 dark:text-white",
        className,
      )}
      aria-label={name}
    >
      {initials(name)}
    </div>
  );
}
