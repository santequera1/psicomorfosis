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
