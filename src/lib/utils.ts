import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Devuelve el nombre a mostrar para un paciente. Usa el apodo (preferredName)
 * si existe y no está vacío; si no, cae al nombre completo.
 *
 * IMPORTANTE: el form de paciente guarda preferredName como string vacío
 * cuando el usuario lo borra, por eso `??` no sirve aquí (solo cae con
 * null/undefined). Usar `||` con trim para tratar "" y "   " como "no
 * hay apodo" y caer al nombre completo.
 */
export function displayPatientName(p: { name: string; preferredName?: string | null }): string {
  const trimmed = p.preferredName?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : p.name;
}

/**
 * Variante corta: usa el apodo si existe, si no el primer nombre del nombre
 * completo. Útil para encabezados breves ("Hola, Stiven") o breadcrumbs.
 */
export function displayPatientShortName(p: { name: string; preferredName?: string | null }): string {
  const trimmed = p.preferredName?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : (p.name.split(" ")[0] ?? p.name);
}

/**
 * Label legible del rol del usuario para mostrar en UI.
 *
 * En la BD `super_admin` significa "primer admin del workspace" — el
 * psicólogo titular que arma su consulta y crea otros staff. NO
 * significa admin de la plataforma: eso lo distingue la bandera
 * separada `isPlatformAdmin` (solo el dueño de Psicomorfosis).
 *
 * Mostrar "super admin" en el sidebar de un psicólogo titular era
 * confuso porque sugería permisos de plataforma que no tiene.
 *
 * Mapeo:
 *   isPlatformAdmin → "Administrador de plataforma"
 *   super_admin (workspace owner) → "Psicólogo/a"
 *   admin (staff admin del workspace) → "Administrador"
 *   psicologa → "Psicólogo/a"
 *   paciente → "Paciente"
 */
export function roleLabel(u: { role: string; isPlatformAdmin?: boolean }): string {
  if (u.isPlatformAdmin) return "Administrador de plataforma";
  switch (u.role) {
    case "super_admin": return "Psicólogo/a";
    case "admin": return "Administrador";
    case "psicologa": return "Psicólogo/a";
    case "paciente": return "Paciente";
    default: return u.role.replace("_", " ");
  }
}

/**
 * Parsea una fecha que puede venir del backend en distintos formatos:
 *   - ISO con Z o offset → se respeta la TZ del string
 *   - ISO sin Z (ej. de SQLite `datetime('now')` → "2026-05-09 02:50:00")
 *     se asume UTC, que es lo que SQLite efectivamente guarda
 *   - undefined/null → null
 *
 * Esto evita el bug donde una nota guardada en SQLite a las 21:50 hora
 * Colombia (= 02:50 UTC del día siguiente) se mostraba con `new Date(...)`
 * sin sufijo Z como hora local del navegador, lo que en algunos
 * sistemas / SSR renderizaba como las 2:50 a.m. del día equivocado.
 */
export function parseBackendDate(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  // Si ya trae Z o offset, confiamos en el string.
  if (/[zZ]|[+-]\d{2}:?\d{2}$/.test(iso)) return new Date(iso);
  // Caso típico de SQLite "YYYY-MM-DD HH:MM:SS" → asumimos UTC.
  const normalized = iso.includes(" ") ? iso.replace(" ", "T") : iso;
  return new Date(normalized + "Z");
}

/** Formatea una fecha ISO del backend en hora Colombia, fecha + hora. */
export function formatDateTimeCO(
  iso: string | null | undefined,
  options: Intl.DateTimeFormatOptions = { dateStyle: "medium", timeStyle: "short" },
): string {
  const d = parseBackendDate(iso);
  if (!d) return "—";
  try {
    return d.toLocaleString("es-CO", { timeZone: "America/Bogota", ...options });
  } catch {
    return d.toString();
  }
}

/** Formatea una fecha ISO del backend en hora Colombia, solo fecha. */
export function formatDateCO(
  iso: string | null | undefined,
  options: Intl.DateTimeFormatOptions = { day: "2-digit", month: "short", year: "numeric" },
): string {
  const d = parseBackendDate(iso);
  if (!d) return "—";
  try {
    return d.toLocaleDateString("es-CO", { timeZone: "America/Bogota", ...options });
  } catch {
    return d.toString();
  }
}
