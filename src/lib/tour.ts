/**
 * Tours guiados (onboarding) con TourGuideJS.
 *
 * Diseño:
 *  - Cada tour tiene un nombre único (ej: "welcome", "patients").
 *  - Persistimos en localStorage si el usuario ya vio cada tour, con la key
 *    `psm.tour.{name}.completed`. Si el flag está, NO se vuelve a disparar.
 *  - El usuario puede "reiniciar tutoriales" desde /configuracion (limpia
 *    todos los flags) — escape hatch para los que se salieron sin querer.
 *  - Cargamos el módulo + CSS de forma lazy la primera vez que se necesita
 *    para no inflar el bundle inicial. SSR-safe: todo dentro de checks
 *    `typeof window !== "undefined"`.
 *  - Marcamos como completado tanto al finalizar como al salir (Esc, click
 *    fuera, botón cerrar). Esto evita que el tour se reanude cada vez que
 *    el usuario vuelve al dashboard. Si quiere repetirlo, tiene el botón
 *    de reset en /configuracion.
 */

const PREFIX = "psm.tour.";

export type TourStep = {
  /** Selector CSS del elemento a destacar. Usar `[data-tour="..."]`
   *  por defecto para no acoplar a clases Tailwind volátiles. */
  target: string;
  title?: string;
  content: string;
  /** Si el target todavía no está montado, qué hacer. Default: skip step. */
  optional?: boolean;
};

/** ¿Estamos en cliente? (TourGuideJS toca window/document.) */
function inBrowser(): boolean {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

export function hasCompletedTour(name: string): boolean {
  if (!inBrowser()) return false;
  try {
    return window.localStorage.getItem(PREFIX + name) === "1";
  } catch {
    return false;
  }
}

export function markTourCompleted(name: string) {
  if (!inBrowser()) return;
  try {
    window.localStorage.setItem(PREFIX + name, "1");
  } catch { /* localStorage puede estar bloqueado */ }
}

export function resetTour(name: string) {
  if (!inBrowser()) return;
  try {
    window.localStorage.removeItem(PREFIX + name);
  } catch { /* */ }
}

/** Limpia todos los flags `psm.tour.*`. Usado por el botón "Reiniciar
 *  tutoriales" en /configuracion. */
export function resetAllTours(): number {
  if (!inBrowser()) return 0;
  let n = 0;
  try {
    const keys: string[] = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i);
      if (k && k.startsWith(PREFIX)) keys.push(k);
    }
    for (const k of keys) { window.localStorage.removeItem(k); n++; }
  } catch { /* */ }
  return n;
}

// ─── Carga lazy del paquete ──────────────────────────────────────────
// El cliente y el CSS sólo se descargan la primera vez que se dispara
// un tour. Cacheamos la promesa para que las siguientes llamadas usen
// la misma instancia del módulo.

type TourModule = typeof import("@sjmc11/tourguidejs/src/Tour");
let modulePromise: Promise<TourModule> | null = null;

async function loadTourModule(): Promise<TourModule> {
  if (!modulePromise) {
    modulePromise = (async () => {
      // CSS minificado del dist — estable, no depende del resolver SCSS.
      // @ts-ignore - el paquete no exporta tipos para el CSS.
      await import("@sjmc11/tourguidejs/dist/css/tour.min.css");
      const mod = await import("@sjmc11/tourguidejs/src/Tour");
      return mod;
    })();
  }
  return modulePromise;
}

// ─── Wrapper de runTour ──────────────────────────────────────────────

type RunOpts = {
  /** Si true, ignora el flag "completed" y corre igual. Útil para
   *  el botón "Reiniciar tutoriales". */
  force?: boolean;
};

/**
 * Espera (con poll) a que el target del PRIMER paso aparezca en el DOM
 * antes de iniciar — necesario porque las páginas de TanStack Router
 * pueden estar montándose cuando se llama runTour().
 */
async function waitForTarget(selector: string, maxMs = 3000): Promise<boolean> {
  if (!inBrowser()) return false;
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    if (document.querySelector(selector)) return true;
    await new Promise((r) => setTimeout(r, 100));
  }
  return false;
}

/**
 * Corre un tour si:
 *  - estamos en cliente
 *  - aún no se completó (a menos que opts.force)
 *  - el target del primer paso existe en el DOM (con poll de 3s)
 *
 * Filtra steps cuyos targets opcionales no existen — más resiliente que
 * fallar en silencio en medio del tour.
 */
export async function runTour(name: string, steps: TourStep[], opts: RunOpts = {}): Promise<void> {
  if (!inBrowser()) return;
  if (!opts.force && hasCompletedTour(name)) return;
  if (steps.length === 0) return;

  const ok = await waitForTarget(steps[0].target);
  if (!ok) {
    // Si ni el primer target está, abortamos en silencio (el usuario
    // probablemente no está viendo la página esperada).
    return;
  }

  // Filtramos steps cuyos targets opcionales no existen, para no
  // saltar a un step que apunta a algo que ya no está.
  const validSteps = steps.filter((s) => {
    if (!s.optional) return true;
    return document.querySelector(s.target) !== null;
  });

  const { TourGuideClient } = await loadTourModule();

  const client = new TourGuideClient({
    // Defaults pensados para Psicomorfosis — tono cercano + tuteo.
    nextLabel: "Siguiente",
    prevLabel: "Atrás",
    finishLabel: "Listo",
    keyboardControls: true,
    exitOnEscape: true,
    exitOnClickOutside: false,        // evitar cierres accidentales
    showStepDots: true,
    showStepProgress: true,
    closeButton: true,
    autoScroll: true,
    autoScrollSmooth: true,
    targetPadding: 6,
    backdropAnimate: true,
    dialogAnimate: true,
    completeOnFinish: false,          // gestionamos el flag nosotros
    rememberStep: false,
    debug: false,
    steps: validSteps.map((s) => ({
      target: s.target,
      title: s.title,
      content: s.content,
      group: name,
      order: 999,
    })),
  });

  // Marcamos completado tanto al terminar como al salir. Si el usuario
  // quiere repetirlo, hay botón "Reiniciar tutoriales" en /configuracion.
  const markDone = () => markTourCompleted(name);
  client.onFinish(markDone);
  client.onAfterExit(markDone);

  await client.start(name);
}
