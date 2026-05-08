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
