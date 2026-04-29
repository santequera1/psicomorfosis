/**
 * Helpers para el tema visual de la app.
 * El bootstrap script en __root.tsx ya aplica .dark al <html> al cargar; este
 * módulo encapsula el toggle en runtime para usarlo desde cualquier handler
 * (configuración, atajo de teclado, etc).
 */
export type ThemePreference = "claro" | "oscuro" | "auto";

const KEY = "psm.theme";

export function getTheme(): ThemePreference {
  if (typeof window === "undefined") return "claro";
  const v = window.localStorage.getItem(KEY);
  if (v === "claro" || v === "oscuro" || v === "auto") return v;
  return "claro";
}

export function applyTheme(pref: ThemePreference): void {
  if (typeof document === "undefined") return;
  const shouldDark =
    pref === "oscuro" ||
    (pref === "auto" && window.matchMedia?.("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", !!shouldDark);
}

export function setTheme(pref: ThemePreference): void {
  if (typeof window !== "undefined") window.localStorage.setItem(KEY, pref);
  applyTheme(pref);
}

/**
 * Alterna entre claro y oscuro, ignorando "auto" (lo deja explícito).
 * Devuelve el nuevo valor para que el caller pueda mostrar feedback.
 */
export function toggleTheme(): ThemePreference {
  const current = getTheme();
  // Si estaba en "auto", evaluamos el efectivo y vamos al opuesto.
  let effectiveDark = false;
  if (current === "oscuro") effectiveDark = true;
  else if (current === "auto" && typeof window !== "undefined") {
    effectiveDark = !!window.matchMedia?.("(prefers-color-scheme: dark)").matches;
  }
  const next: ThemePreference = effectiveDark ? "claro" : "oscuro";
  setTheme(next);
  return next;
}
