/**
 * Validadores de username y email para staff.
 *
 * Reglas decididas para la beta:
 *  - username: 3-50 caracteres. Empieza con letra. Solo letras, dígitos,
 *    punto, guion bajo y guion. Case-insensitive en almacenamiento (lo
 *    guardamos en lowercase).
 *  - email: regex razonable (no RFC completo, pero suficiente para
 *    rechazar errores típicos). Case-insensitive.
 *
 * El check de DISPONIBILIDAD vive en routes/auth.js — esto solo valida
 * formato sintáctico.
 */

const USERNAME_RE = /^[a-zA-Z][a-zA-Z0-9._-]{2,49}$/;
// Pragmático, no RFC 5322 estricto. Acepta la mayoría de emails reales y
// rechaza errores típicos (sin @, sin TLD, espacios). Igual lo normalizamos
// a lowercase para que la comparación de unicidad sea case-insensitive.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function validateUsername(raw) {
  if (typeof raw !== "string") return { ok: false, error: "Username inválido" };
  const value = raw.trim();
  if (!USERNAME_RE.test(value)) {
    return {
      ok: false,
      error: "El nombre de usuario debe tener 3-50 caracteres, empezar con letra y solo usar letras, números, punto, guion bajo o guion.",
    };
  }
  return { ok: true, value: value.toLowerCase() };
}

export function validateEmail(raw) {
  if (typeof raw !== "string") return { ok: false, error: "Email inválido" };
  const value = raw.trim();
  if (value.length > 200) return { ok: false, error: "Email demasiado largo" };
  if (!EMAIL_RE.test(value)) return { ok: false, error: "El correo no parece válido" };
  return { ok: true, value: value.toLowerCase() };
}

/** ¿El identificador parece email? Heurística: contiene @. */
export function looksLikeEmail(s) {
  return typeof s === "string" && s.includes("@");
}
