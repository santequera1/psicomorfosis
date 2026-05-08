/**
 * Definición de los tours de onboarding de Psicomorfosis y un hook
 * `useAutoTour` que los dispara automáticamente la primera vez que el
 * usuario entra a una página.
 *
 * Tono: cercano + tuteo (consistente con el resto de la app).
 *
 * Convenciones:
 *  - Cada tour tiene un nombre único usado como key en localStorage.
 *  - Los selectores apuntan a atributos `data-tour="..."` en los
 *    componentes — más estables que clases Tailwind volátiles.
 *  - Pasos opcionales (`optional: true`) se saltan si su target no
 *    existe en el DOM cuando arranca el tour. Útil para casos como
 *    "el FAB solo aparece si el usuario es staff".
 */
import { useEffect } from "react";
import { runTour, type TourStep, openSidebarIfMobile, closeSidebarIfMobile } from "./tour";
import { toggleTheme } from "./theme";

/**
 * Helper: abre el drawer del sidebar en mobile y espera a que termine
 * la animación de apertura (~250ms en CSS) antes de continuar. TourGuide
 * await-ea Promises que devuelva beforeEnter, así que esto bloquea el
 * cálculo de posición del highlight hasta que el sidebar esté en su
 * posición final.
 *
 * En desktop/tablet (>= 640px) es no-op casi instantáneo — no hay
 * animación porque el sidebar ya es sticky.
 */
async function openSidebarAndWait() {
  openSidebarIfMobile();
  if (typeof window !== "undefined" && window.innerWidth < 640) {
    await new Promise((r) => setTimeout(r, 280));
  }
}

/**
 * Botón "Saltar tour" inline para todos los pasos.
 *
 * TourGuideJS no tiene una opción nativa de "skip" como botón con texto,
 * solo el `closeButton` (X). Para hacerlo más obvio inyectamos un link
 * en el content del step que llama __psmTour.exit() — el client se
 * expone en window al iniciar el tour (ver lib/tour.ts).
 *
 * Style inline porque TourGuide renderiza el contenido en un Shadow DOM
 * sin acceso a las clases Tailwind del documento principal.
 */
const SKIP_LINK = `<div style="margin-top: 18px; padding-top: 12px; border-top: 1px solid rgba(0,0,0,0.08); text-align: right;"><button type="button" onclick="window.__psmTour && window.__psmTour.exit()" style="font-size: 12px; color: #888; background: none; border: none; cursor: pointer; padding: 4px 8px; text-decoration: underline;">Saltar tour</button></div>`;

function withSkip(html: string): string {
  return html + SKIP_LINK;
}

export const TOUR_NAMES = {
  welcome: "welcome",
  patients: "patients",
  history: "history",
  tests: "tests",
  invoices: "invoices",
} as const;

// ─── Tour 1: Bienvenida (auto en /) ────────────────────────────────
//
// Demo de tema: en el step "theme-toggle" hacemos un toggle automático
// al entrar para que el usuario VEA el cambio, esperamos un momento, y
// restauramos al salir hacia el siguiente paso. Si el usuario cierra el
// tour mientras está en este step, también se restaura (TourGuide llama
// beforeLeave antes de exit). Diseño defensivo: guardamos un flag
// closure-local para garantizar que solo restauremos UNA vez aunque el
// callback se dispare múltiple.
// SVG inline del icono de luna+sol (mismo set Lucide que usamos). Va en
// el título del step para reforzar visualmente "claro/oscuro".
const THEME_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display: inline-block; vertical-align: -3px; margin-right: 6px;"><circle cx="12" cy="12" r="4"></circle><path d="M12 2v2"></path><path d="M12 20v2"></path><path d="m4.93 4.93 1.41 1.41"></path><path d="m17.66 17.66 1.41 1.41"></path><path d="M2 12h2"></path><path d="M20 12h2"></path><path d="m6.34 17.66-1.41 1.41"></path><path d="m19.07 4.93-1.41 1.41"></path></svg>`;

function makeThemeDemoStep(): TourStep {
  let toggled = false;
  return {
    target: '[data-tour="theme-toggle"]',
    // El icono inline en el title hace evidente de qué trata el paso
    // antes de leer el contenido. TourGuide renderiza el title como
    // HTML, así que el SVG funciona.
    title: `${THEME_ICON}¿Claro u oscuro?`,
    content: withSkip(
      "Acá cambias entre tema claro y oscuro (también con <strong>Ctrl + Shift + L</strong>). " +
      "Mira cómo se ve el otro modo — vuelvo al tuyo en un momento."
    ),
    // En mobile cerramos el drawer si quedó abierto del paso anterior
    // (sidebar-nav). closeSidebarIfMobile es no-op en desktop/tablet.
    beforeEnter: closeSidebarIfMobile,
    afterEnter: () => {
      // Toggle visible para que el usuario note el cambio.
      toggleTheme();
      toggled = true;
    },
    beforeLeave: () => {
      // Restauramos al estado original ANTES de salir del step.
      if (toggled) {
        toggleTheme();
        toggled = false;
      }
    },
  };
}

export const welcomeTour: TourStep[] = [
  {
    // Sin target — dialog centrado en pantalla. Anclarlo al contenedor
    // del dashboard hacía que TourGuide calculara la posición respecto
    // a un elemento gigante y el modal salía mal ubicado a la izquierda.
    title: "¡Bienvenido a Psicomorfosis!",
    content: withSkip("Te muestro lo más importante en menos de un minuto. Puedes saltar este tour cuando quieras — luego lo encuentras en Configuración → Tutoriales."),
  },
  {
    // En mobile, el sidebar es drawer cerrado por default. beforeEnter
    // lo abre y espera a que termine la animación (~280ms) antes de que
    // TourGuide calcule la posición del highlight. En desktop/tablet
    // es no-op casi instantáneo. Mismo patrón en los demás pasos del
    // sidebar abajo.
    target: '[data-tour="sidebar-nav"]',
    title: "Tu menú principal",
    content: withSkip("Desde aquí llegas a todo: agenda, pacientes, tests, documentos y más. Puedes colapsarlo con el botón de abajo si necesitas más espacio."),
    beforeEnter: openSidebarAndWait,
  },
  makeThemeDemoStep(),
  {
    target: '[data-tour="sidebar-link-agenda"]',
    title: "Tu agenda",
    content: withSkip("Citas del día, semana y mes. Marca asistencia, genera recibos y abre la historia clínica desde cada cita."),
    beforeEnter: openSidebarAndWait,
  },
  {
    target: '[data-tour="sidebar-link-pacientes"]',
    title: "Tus pacientes",
    content: withSkip("Lista completa de pacientes activos, con búsqueda, filtros y etiquetas. Click en cualquiera para ver su ficha."),
    beforeEnter: openSidebarAndWait,
  },
  {
    target: '[data-tour="fab-button"]',
    title: "Atajo flotante",
    content: withSkip("Este botón siempre está abajo a la derecha. Hace lo mismo que las acciones rápidas pero accesible desde cualquier página."),
    optional: true,
    // Cierra el drawer en mobile para que el FAB no quede tapado.
    beforeEnter: closeSidebarIfMobile,
  },
  {
    target: '[data-tour="report-problem"]',
    title: "¿Algo raro?",
    content: withSkip("Si encuentras un bug o tienes una idea, repórtalo aquí. Puedes adjuntar capturas (Ctrl+V también funciona). Revisamos los reportes diariamente."),
    beforeEnter: openSidebarAndWait,
  },
  {
    // Step final motivacional con CTA. Sin target → dialog centrado.
    // Botón "Crear primer paciente" inline que cierra el tour y navega
    // a /pacientes (el tour de Pacientes arrancará automáticamente al
    // llegar — primera vez).
    title: "¡Listo para empezar!",
    content: `
      Ya conoces lo básico. El siguiente paso es crear tu primer paciente — desde ahí puedes agendar citas, hacer notas, aplicar tests y todo lo demás.
      <div style="margin-top: 16px;">
        <button
          type="button"
          onclick="window.__psmTour && window.__psmTour.exit(); window.location.href='/pacientes';"
          style="display: inline-flex; align-items: center; gap: 8px; padding: 8px 16px; background: oklch(36% .025 200); color: white; font-size: 13px; font-weight: 500; border: none; border-radius: 8px; cursor: pointer;"
        >
          Crear mi primer paciente →
        </button>
      </div>
    `,
    beforeEnter: closeSidebarIfMobile,
  },
];

// ─── Tour 2: Pacientes (auto en /pacientes) ────────────────────────
//
// Los tours de página arrancan con un step INTRODUCTORIO sin target
// (centrado en pantalla). Razones:
//   1. Anclar el primer paso a un panel grande hace que TourGuide
//      calcule mal la posición del dialog y se salga del viewport.
//   2. El target podría no estar montado todavía (queries hidratando)
//      cuando arranca el tour — un step centrado siempre se ve bien.
// Los pasos siguientes apuntan a anchors concretos y son `optional`
// para que se filtren con gracia si el DOM no terminó de hidratar.
export const patientsTour: TourStep[] = [
  {
    title: "Tus pacientes",
    content: withSkip("Aquí viven todos los pacientes que estás atendiendo. Los archivados quedan ocultos pero no se borran. Te muestro cómo está organizada esta vista."),
  },
  {
    target: '[data-tour="pacientes-search"]',
    title: "Búsqueda rápida",
    content: withSkip("Búscalos por nombre, documento o etiqueta. La búsqueda es tolerante a acentos."),
    optional: true,
  },
  {
    target: '[data-tour="pacientes-filters"]',
    title: "Filtros",
    content: withSkip("Filtra por riesgo, modalidad o estado. Útil cuando tienes muchos pacientes."),
    optional: true,
  },
  {
    target: '[data-tour="pacientes-new"]',
    title: "Nuevo paciente",
    content: withSkip("Crea un paciente desde aquí. Después puedes invitarlo al portal para que firme consentimientos y vea sus tareas."),
    optional: true,
  },
];

// ─── Tour 3: Historia clínica (auto en /pacientes/:id) ─────────────
export const historyTour: TourStep[] = [
  {
    title: "Ficha del paciente",
    content: withSkip("Toda la información clínica y administrativa del paciente en un solo lugar. Te muestro las partes principales."),
  },
  {
    target: '[data-tour="patient-tabs"]',
    title: "Pestañas de la historia",
    content: withSkip("Motivo de consulta, evolución de sesiones, tareas, tests, documentos… Cada pestaña tiene su sección con su propio contenido."),
    optional: true,
  },
  {
    target: '[data-tour="patient-new-note"]',
    title: "Registrar una sesión",
    content: withSkip("Para cada sesión usa 'Nueva nota'. Puedes elegir formato libre o SOAP, agregar plan de tratamiento y crear tareas terapéuticas."),
    optional: true,
  },
];

// ─── Tour 4: Tests (auto en /tests) ────────────────────────────────
export const testsTour: TourStep[] = [
  {
    title: "Tests psicométricos",
    content: withSkip("Instrumentos disponibles: MCMI-II, escalas de ansiedad, depresión, y los que crees tú mismo. Te muestro cómo se usan."),
  },
  {
    target: '[data-tour="tests-apply"]',
    title: "Aplicar un test",
    content: withSkip("Asigna un test a un paciente. Puede responderlo desde el portal o tú lo aplicas en consulta y registras las respuestas."),
    optional: true,
  },
  {
    target: '[data-tour="tests-create"]',
    title: "Crea tus propios tests",
    content: withSkip("Si necesitas un instrumento específico, créalo: V/F, Likert con suma y baremos, o formularios mixtos con widgets personalizados."),
    optional: true,
  },
];

// ─── Tour 5: Recibos (auto en /facturacion) ────────────────────────
export const invoicesTour: TourStep[] = [
  {
    title: "Recibos",
    content: withSkip("Aquí ves todos los recibos que has generado. También se crean automáticamente desde la agenda al cobrar una cita."),
  },
  {
    target: '[data-tour="invoices-summary"]',
    title: "Resumen",
    content: withSkip("Ingresos del periodo, pendientes por cobrar, ticket promedio… para que sepas cómo va el mes sin abrir un Excel."),
    optional: true,
  },
  {
    target: '[data-tour="invoices-new"]',
    title: "Nuevo recibo manual",
    content: withSkip("Si necesitas registrar un cobro fuera de una sesión (paquete de varias citas, primera consulta, etc.), créalo desde aquí."),
    optional: true,
  },
];

// ─── Hook de auto-disparo ──────────────────────────────────────────

/**
 * Dispara un tour automáticamente al montar el componente, una sola
 * vez por usuario (controlado por flag en localStorage).
 *
 * Diseño defensivo:
 *  - Solo corre en cliente.
 *  - El propio runTour() ya hace el check `hasCompletedTour` y poll
 *    para que el target exista. Si la página aún no terminó de
 *    montarse, espera hasta 3 segundos antes de abortar.
 *  - El cleanup no detiene el tour activo a propósito: si el usuario
 *    está en medio del tour y nosotros desmontáramos al cambiar de
 *    ruta, lo cortaríamos a la mitad. El tour vive su ciclo solo.
 */
export function useAutoTour(name: string, steps: TourStep[]) {
  useEffect(() => {
    // 1500ms le da tiempo de hidratar a páginas con varias queries
    // en paralelo (/pacientes/:id, /tests, /facturacion). Páginas
    // que tardan más en cargar producían tour con dialogs vacíos
    // porque los anchors data-tour aún no estaban montados al
    // evaluar el filtro de visibilidad. 1500ms cubre la mayoría de
    // conexiones; si igual no carga, el filtro descarta los steps
    // con targets ausentes.
    const t = setTimeout(() => {
      runTour(name, steps).catch((err) => {
        if (typeof console !== "undefined") console.warn("[tour]", name, err);
      });
    }, 1500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name]);
}
