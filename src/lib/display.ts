// Helpers para mostrar nombres y datos de paciente de forma consistente.
import type { ApiPatient } from "./api";

/**
 * Nombre corto para tablas y listas compactas.
 * Prioriza el nombre preferido; si no hay, usa el nombre completo.
 */
export function patientShortName(p: Pick<ApiPatient, "name" | "preferredName">): string {
  return p.preferredName?.trim() ? p.preferredName : p.name;
}

/**
 * Nombre completo con apodo entre paréntesis si existe.
 * Ej: "María Camila Rondón (Cami)" o "Andrés Felipe Galeano".
 * Úsalo en headers y detalles, donde hay espacio.
 */
export function patientFullName(p: Pick<ApiPatient, "name" | "preferredName">): string {
  return p.preferredName?.trim() && p.preferredName !== p.name
    ? `${p.name} (${p.preferredName})`
    : p.name;
}

/**
 * Iniciales (máx. 2 letras).
 */
export function patientInitials(p: Pick<ApiPatient, "name" | "preferredName">): string {
  const source = patientShortName(p);
  return source
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((n) => n[0])
    .join("")
    .toUpperCase();
}
