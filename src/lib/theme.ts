/**
 * Sistema de apariencia de la app — tres ejes independientes:
 *
 *   1. mode (claro | oscuro | auto)         → claridad de la paleta
 *   2. themeFamily (clinico | bridgery | minimo | aurora) → familia de color
 *   3. fontFamily (editorial | clasica | academica | limpia | humanista)
 *
 * Cada eje persiste por separado en localStorage y se aplica al <html>
 * como atributo `data-mode`, `data-theme`, `data-font`. El CSS responde
 * a cualquier combinación (ej: [data-theme="bridgery"][data-mode="dark"]).
 *
 * Compatibilidad: la key vieja `psm.theme` sigue siendo el `mode`. Los
 * usuarios que ya tienen su preferencia guardada no notan cambio: el
 * tema cae a "clinico" (actual) por default y la tipografía a
 * "editorial" (Fraunces + Inter, la que ya tienen).
 *
 * Aurora es solo dark — si el user está en aurora con mode=claro, el
 * resolver de DOM lo trata como dark de todos modos. Es por estilo: las
 * auroras de gradiente solo tienen sentido sobre fondo oscuro.
 */

// ─── Tipos ───────────────────────────────────────────────────────────

export type ThemePreference = "claro" | "oscuro" | "auto";
export type ThemeFamily = "clinico" | "bridgery" | "minimo" | "aurora";
export type FontFamily = "editorial" | "clasica" | "academica" | "limpia" | "humanista" | "inter" | "manrope";

// ─── Keys de localStorage ───────────────────────────────────────────

const KEY_MODE = "psm.theme";       // legacy: solo el modo claro/oscuro
const KEY_FAMILY = "psm.theme.family";
const KEY_FONT = "psm.theme.font";

// ─── Catálogo: tema → solo soporta dark? ────────────────────────────

const DARK_ONLY_THEMES: ReadonlySet<ThemeFamily> = new Set(["aurora"]);

// ─── Catálogo: fuente → URL de Google Fonts y CSS variables ─────────
//
// Cada fuente carga un <link rel="stylesheet"> con la URL de Google
// Fonts. Lo hacemos lazy (solo cuando el user la elige) para no
// inflar el primer paint.

interface FontDescriptor {
  /** Etiqueta visible en la UI. */
  label: string;
  /** Pequeña explicación del estilo. */
  description: string;
  /** URL del stylesheet de Google Fonts. */
  href: string;
  /** Stack para --font-sans. */
  sans: string;
  /** Stack para --font-serif. */
  serif: string;
}

export const FONT_FAMILIES: Record<FontFamily, FontDescriptor> = {
  editorial: {
    label: "Editorial (actual)",
    description: "Fraunces + Inter — lo que tienes hoy.",
    href: "https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600&family=Inter:wght@400;500;600;700&display=swap",
    sans: '"Inter", system-ui, sans-serif',
    serif: '"Fraunces", Georgia, serif',
  },
  clasica: {
    label: "Clásica",
    description: "Lora + Source Sans 3 — más libro, menos magazine.",
    href: "https://fonts.googleapis.com/css2?family=Lora:wght@400;500;600;700&family=Source+Sans+3:wght@400;500;600;700&display=swap",
    sans: '"Source Sans 3", system-ui, sans-serif',
    serif: '"Lora", Georgia, serif',
  },
  academica: {
    label: "Académica",
    description: "Source Serif 4 + Source Sans 3 — sobria, documento clínico.",
    href: "https://fonts.googleapis.com/css2?family=Source+Sans+3:wght@400;500;600;700&family=Source+Serif+4:opsz,wght@8..60,400;8..60,500;8..60,600&display=swap",
    sans: '"Source Sans 3", system-ui, sans-serif',
    serif: '"Source Serif 4", Georgia, serif',
  },
  limpia: {
    label: "Limpia",
    description: "IBM Plex Serif + IBM Plex Sans — moderna, técnica.",
    href: "https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;700&family=IBM+Plex+Serif:wght@400;500;600;700&display=swap",
    sans: '"IBM Plex Sans", system-ui, sans-serif',
    serif: '"IBM Plex Serif", Georgia, serif',
  },
  humanista: {
    label: "Humanista",
    description: "Bitter + Nunito Sans — cálida, accesible.",
    href: "https://fonts.googleapis.com/css2?family=Bitter:wght@400;500;600;700&family=Nunito+Sans:wght@400;500;600;700&display=swap",
    sans: '"Nunito Sans", system-ui, sans-serif',
    serif: '"Bitter", Georgia, serif',
  },
  inter: {
    label: "Inter",
    description: "Inter para texto, Fraunces para títulos — clean + editorial.",
    href: "https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600;9..144,700&family=Inter:wght@400;500;600;700;800&display=swap",
    sans: '"Inter", system-ui, sans-serif',
    serif: '"Fraunces", Georgia, serif',
  },
  manrope: {
    label: "Manrope",
    description: "Manrope para texto, Fraunces para títulos — geométrica + serif suave.",
    href: "https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600;9..144,700&family=Manrope:wght@400;500;600;700;800&display=swap",
    sans: '"Manrope", system-ui, sans-serif',
    serif: '"Fraunces", Georgia, serif',
  },
};

// Cache de fuentes ya inyectadas para no duplicar el <link> al cambiar.
const injectedFonts = new Set<FontFamily>();

// ─── Catálogo de temas (metadata para la UI) ────────────────────────

interface ThemeDescriptor {
  label: string;
  description: string;
  /** Color representativo del tema, en oklch — para previews/swatches. */
  swatch: string;
  /** Si solo soporta dark mode. */
  darkOnly?: boolean;
}

export const THEME_FAMILIES: Record<ThemeFamily, ThemeDescriptor> = {
  clinico: {
    label: "Clínico",
    description: "Teal apagado profesional. Tu paleta original.",
    swatch: "oklch(0.53 0.045 200)",
  },
  bridgery: {
    label: "Bridgery",
    description: "Light vibrante con acento púrpura, iconos coloridos por KPI.",
    swatch: "oklch(0.55 0.18 295)",
  },
  minimo: {
    label: "Mínimo",
    description: "Ultra-clean, casi sin bordes, acento mint sutil.",
    swatch: "oklch(0.65 0.10 165)",
  },
  aurora: {
    label: "Aurora",
    description: "Dark premium con auroras de gradiente al fondo. Solo modo oscuro.",
    swatch: "oklch(0.50 0.20 290)",
    darkOnly: true,
  },
};

// ─── Lectores de preferencias ───────────────────────────────────────

export function getTheme(): ThemePreference {
  if (typeof window === "undefined") return "claro";
  const v = window.localStorage.getItem(KEY_MODE);
  if (v === "claro" || v === "oscuro" || v === "auto") return v;
  return "claro";
}

export function getThemeFamily(): ThemeFamily {
  if (typeof window === "undefined") return "clinico";
  const v = window.localStorage.getItem(KEY_FAMILY);
  if (v && (v in THEME_FAMILIES)) return v as ThemeFamily;
  return "clinico";
}

export function getFontFamily(): FontFamily {
  if (typeof window === "undefined") return "editorial";
  const v = window.localStorage.getItem(KEY_FONT);
  if (v && (v in FONT_FAMILIES)) return v as FontFamily;
  return "editorial";
}

// ─── Aplicación al DOM ──────────────────────────────────────────────

/**
 * Resuelve si el modo efectivo es oscuro, considerando "auto" y
 * que algunos temas son dark-only.
 */
function resolveEffectiveDark(mode: ThemePreference, family: ThemeFamily): boolean {
  if (DARK_ONLY_THEMES.has(family)) return true;
  if (mode === "oscuro") return true;
  if (mode === "auto") {
    return typeof window !== "undefined"
      && !!window.matchMedia?.("(prefers-color-scheme: dark)").matches;
  }
  return false;
}

/**
 * Inyecta el <link> de Google Fonts si todavía no está. Idempotente.
 */
function ensureFontLoaded(family: FontFamily) {
  if (typeof document === "undefined") return;
  if (injectedFonts.has(family)) return;
  const desc = FONT_FAMILIES[family];
  // Editorial ya está cargada por @import en styles.css desde siempre,
  // no duplicamos el link.
  if (family === "editorial") {
    injectedFonts.add(family);
    return;
  }
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = desc.href;
  link.setAttribute("data-psm-font", family);
  document.head.appendChild(link);
  injectedFonts.add(family);
}

/**
 * Aplica las 3 preferencias al <html>:
 *   - clase `.dark` cuando aplique (compat con CSS existente)
 *   - `data-mode`, `data-theme`, `data-font` para que el CSS nuevo
 *     responda a [data-theme="X"][data-mode="dark"], etc.
 *   - --font-sans / --font-serif inline con los stacks de la familia.
 */
export function applyTheme(
  mode: ThemePreference = getTheme(),
  family: ThemeFamily = getThemeFamily(),
  font: FontFamily = getFontFamily(),
): void {
  if (typeof document === "undefined") return;
  const html = document.documentElement;
  const dark = resolveEffectiveDark(mode, family);

  html.classList.toggle("dark", dark);
  html.setAttribute("data-mode", dark ? "dark" : "light");
  html.setAttribute("data-theme", family);
  html.setAttribute("data-font", font);

  // Tipografía: cargar Google Fonts (lazy) y aplicar variables CSS.
  ensureFontLoaded(font);
  const fontDesc = FONT_FAMILIES[font];
  html.style.setProperty("--font-sans", fontDesc.sans);
  html.style.setProperty("--font-serif", fontDesc.serif);
}

// ─── Setters (persisten + aplican) ──────────────────────────────────

export function setTheme(pref: ThemePreference): void {
  if (typeof window !== "undefined") window.localStorage.setItem(KEY_MODE, pref);
  applyTheme(pref, getThemeFamily(), getFontFamily());
}

export function setThemeFamily(family: ThemeFamily): void {
  // Si saliendo de un tema dark-only (Aurora) hacia uno que sí soporta
  // modo claro: forzamos mode="claro" porque el usuario quedaba atrapado
  // en oscuro. Al elegir Aurora habíamos forzado mode=oscuro (porque
  // Aurora no tiene claro). Al volver a otra familia, esa fuerza
  // persistía y la nueva familia se mostraba en su tono oscuro — no
  // era lo esperado por el usuario que solo cambió de familia.
  const prev = getThemeFamily();
  const wasDarkOnly = DARK_ONLY_THEMES.has(prev) && !DARK_ONLY_THEMES.has(family);
  if (typeof window !== "undefined") window.localStorage.setItem(KEY_FAMILY, family);
  let nextMode = getTheme();
  if (wasDarkOnly && typeof window !== "undefined") {
    nextMode = "claro";
    window.localStorage.setItem(KEY_MODE, "claro");
  }
  applyTheme(nextMode, family, getFontFamily());
}

export function setFontFamily(font: FontFamily): void {
  if (typeof window !== "undefined") window.localStorage.setItem(KEY_FONT, font);
  applyTheme(getTheme(), getThemeFamily(), font);
}

/**
 * Alterna entre claro y oscuro (preserva el tema y la fuente). Mismo
 * comportamiento de antes; solo el atajo Ctrl+Shift+L cambia el modo,
 * no el tema completo.
 */
export function toggleTheme(): ThemePreference {
  const current = getTheme();
  const family = getThemeFamily();
  // En temas dark-only (Aurora), el toggle hace de "reset": vuelve a
  // la familia default (clinico) en modo claro. Antes el botón quedaba
  // sin acción y confundía. Ahora actúa como "salir de este tema dark".
  if (DARK_ONLY_THEMES.has(family)) {
    setThemeFamily("clinico"); // ya resetea mode a claro internamente
    return "claro";
  }

  let effectiveDark = false;
  if (current === "oscuro") effectiveDark = true;
  else if (current === "auto" && typeof window !== "undefined") {
    effectiveDark = !!window.matchMedia?.("(prefers-color-scheme: dark)").matches;
  }
  const next: ThemePreference = effectiveDark ? "claro" : "oscuro";
  setTheme(next);
  return next;
}
