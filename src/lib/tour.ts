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
   *  por defecto para no acoplar a clases Tailwind volátiles.
   *  OMITIR el target en steps introductorios o de cierre — el dialog
   *  se mostrará centrado en pantalla en lugar de anclado a un elemento.
   *  Anclar a un elemento muy grande (como el contenedor de toda la
   *  página) hace que TourGuide posicione mal el dialog. */
  target?: string;
  title?: string;
  /** Puede contener HTML — útil para botones inline (ej: "Saltar tour"). */
  content: string;
  /** Si el target opcional aún no está montado, se salta el step en
   *  silencio en lugar de fallar. Útil para targets condicionales. */
  optional?: boolean;
  /** Callback al ENTRAR al step (después de animación). Útil para hacer
   *  demos visuales — ej: cambiar el tema momentáneamente. */
  afterEnter?: () => void | Promise<void>;
  /** Callback al SALIR del step (antes de animación). Usar para
   *  restaurar lo que afterEnter cambió. */
  beforeLeave?: () => void | Promise<void>;
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
 * Heurística para saber si un elemento está realmente visible en
 * pantalla — no solo "existe en el DOM". Útil para mobile donde el
 * sidebar es un drawer fuera del viewport (translate-x-full).
 */
function isElementVisible(el: Element): boolean {
  if (!inBrowser()) return true;
  const rect = el.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return false;
  // Fuera del viewport horizontal (drawer cerrado).
  if (rect.right < 0 || rect.left > window.innerWidth) return false;
  return true;
}

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

  // Esperamos a que aparezca el primer target REAL (no necesariamente
  // del primer step, porque el step intro puede no tener target).
  // Si no hay ningún step con target, asumimos que la página ya está
  // lista y no hace falta poll.
  const firstWithTarget = steps.find((s) => s.target);
  if (firstWithTarget?.target) {
    const ok = await waitForTarget(firstWithTarget.target);
    if (!ok) return;  // Aborta en silencio: el usuario probablemente no está en la página esperada.
  }

  // Filtramos steps cuyos targets opcionales no existen O no están
  // visibles (ej: sidebar como drawer cerrado en mobile — el target
  // existe en DOM pero está fuera del viewport con translate-x-full).
  // Steps sin target se muestran centrados — siempre válidos.
  const validSteps = steps.filter((s) => {
    if (!s.target) return true;
    const el = document.querySelector(s.target);
    if (!el) return false;
    if (s.optional && !isElementVisible(el)) return false;
    return true;
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
      // null hace que TourGuide muestre el dialog centrado en pantalla
      // (sin highlight). Útil para steps introductorios o de cierre.
      target: s.target ?? null,
      title: s.title,
      content: s.content,
      group: name,
      order: 999,
      // Callbacks de TourGuide. afterEnter corre tras la animación de
      // entrada al step; beforeLeave antes de salir hacia el siguiente
      // (o al cerrar). Útil para demos visuales (ej: cambiar tema).
      afterEnter: s.afterEnter ? () => Promise.resolve(s.afterEnter!()) : undefined,
      beforeLeave: s.beforeLeave ? () => Promise.resolve(s.beforeLeave!()) : undefined,
    })),
  });

  // Marcamos completado tanto al terminar como al salir. Si el usuario
  // quiere repetirlo, hay botón "Reiniciar tutoriales" en /configuracion.
  const markDone = () => markTourCompleted(name);
  client.onFinish(markDone);
  client.onAfterExit(() => {
    markDone();
    // Limpiar la referencia global del client al cerrar el tour.
    delete (window as any).__psmTour;
  });

  // Exponemos el client en window para que el HTML inline del content
  // pueda llamar __psmTour.exit() (botón "Saltar tour"). Es feo pero
  // funciona y no requiere un parser de eventos custom.
  (window as any).__psmTour = client;

  await client.start(name);
}
