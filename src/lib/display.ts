// Helpers para mostrar nombres y datos de paciente de forma consistente.
import type { ApiPatient } from "./api";

/**
 * Construye una URL wa.me a partir de un teléfono colombiano. Acepta formatos
 * con +57, espacios, paréntesis y guiones — los limpia. Si el número parece
 * local (10 dígitos sin código), prepende 57. Devuelve null si no es válido.
 */
export function whatsappUrl(phone: string | null | undefined, message?: string): string | null {
  if (!phone) return null;
  const digits = phone.replace(/[^\d]/g, "");
  if (digits.length < 10) return null;
  // 10 dígitos = local Colombia → prepender 57. Si ya empieza por 57, OK.
  const normalized = digits.length === 10 ? "57" + digits : digits;
  const url = `https://wa.me/${normalized}`;
  return message ? `${url}?text=${encodeURIComponent(message)}` : url;
}

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
