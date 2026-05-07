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
import { runTour, type TourStep } from "./tour";
import { toggleTheme } from "./theme";

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
function makeThemeDemoStep(): TourStep {
  let toggled = false;
  return {
    target: '[data-tour="theme-toggle"]',
    title: "¿Claro u oscuro?",
    content: withSkip(
      "Acá cambias entre tema claro y oscuro (también con <strong>Ctrl + Shift + L</strong>). " +
      "Mira cómo se ve el otro modo — vuelvo al tuyo en un momento."
    ),
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
    // Opcional porque en mobile el sidebar es drawer cerrado (off-screen)
    // y el highlight quedaría fuera del viewport. Mismo razonamiento
    // para los demás steps del sidebar abajo.
    target: '[data-tour="sidebar-nav"]',
    title: "Tu menú principal",
    content: withSkip("Desde aquí llegas a todo: agenda, pacientes, tests, documentos y más. Puedes colapsarlo con el botón de abajo si necesitas más espacio."),
    optional: true,
  },
  makeThemeDemoStep(),
  {
    target: '[data-tour="sidebar-link-agenda"]',
    title: "Tu agenda",
    content: withSkip("Citas del día, semana y mes. Marca asistencia, genera recibos y abre la historia clínica desde cada cita."),
    optional: true,
  },
  {
    target: '[data-tour="sidebar-link-pacientes"]',
    title: "Tus pacientes",
    content: withSkip("Lista completa de pacientes activos, con búsqueda, filtros y etiquetas. Click en cualquiera para ver su ficha."),
    optional: true,
  },
  {
    target: '[data-tour="fab-button"]',
    title: "Atajo flotante",
    content: withSkip("Este botón siempre está abajo a la derecha. Hace lo mismo que las acciones rápidas pero accesible desde cualquier página."),
    optional: true,
  },
  {
    target: '[data-tour="report-problem"]',
    title: "¿Algo raro?",
    content: withSkip("Si encuentras un bug o tienes una idea, repórtalo aquí. Puedes adjuntar capturas (Ctrl+V también funciona). Revisamos los reportes diariamente."),
    optional: true,
  },
  {
    // Step final motivacional con CTA. Sin target → dialog centrado.
    // Botón "Crear primer paciente" inline que cierra el tour y navega
    // a /pacientes (el tour de Pacientes arrancará automáticamente al
    // llegar — primera vez). El botón Saltar también está pero en este
    // contexto el "Listo" del footer cumple el mismo rol.
    title: "¡Listo para empezar!",
    content: `
      Ya conoces lo básico. El siguiente paso es crear tu primer paciente — desde ahí puedes agendar citas, hacer notas, aplicar tests y todo lo demás.
      <div style="margin-top: 16px;">
        <button
          type="button"
          onclick="window.__psmTour && window.__psmTour.exit(); window.location.href='/pacientes';"
          style="display: inline-flex; align-items: center; gap: 8px; padding: 8px 16px; background: #0f4c81; color: white; font-size: 13px; font-weight: 500; border: none; border-radius: 8px; cursor: pointer;"
        >
          Crear mi primer paciente →
        </button>
      </div>
    `,
  },
];

// ─── Tour 2: Pacientes (auto en /pacientes) ────────────────────────
export const patientsTour: TourStep[] = [
  {
    target: '[data-tour="pacientes-list"]',
    title: "Tus pacientes activos",
    content: withSkip("Aquí viven todos los pacientes que estás atendiendo. Los archivados quedan ocultos pero no se borran."),
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
  },
];

// ─── Tour 3: Historia clínica (auto en /pacientes/:id) ─────────────
export const historyTour: TourStep[] = [
  {
    target: '[data-tour="patient-header"]',
    title: "Ficha del paciente",
    content: withSkip("Toda la info clínica y administrativa del paciente en un solo lugar."),
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
    target: '[data-tour="tests-catalog"]',
    title: "Catálogo de tests",
    content: withSkip("Instrumentos psicométricos disponibles: MCMI-II, escalas de ansiedad, depresión, y los que crees tú mismo."),
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
    target: '[data-tour="invoices-list"]',
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
    // setTimeout para dejar que React termine de renderizar y los
    // queries hidraten el contenido. 250ms es un buen compromiso
    // entre "no demorar" y "no dispararse antes de que el DOM esté".
    const t = setTimeout(() => {
      runTour(name, steps).catch((err) => {
        if (typeof console !== "undefined") console.warn("[tour]", name, err);
      });
    }, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name]);
}
