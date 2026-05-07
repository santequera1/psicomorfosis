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

export const TOUR_NAMES = {
  welcome: "welcome",
  patients: "patients",
  history: "history",
  tests: "tests",
  invoices: "invoices",
} as const;

// ─── Tour 1: Bienvenida (auto en /) ────────────────────────────────
export const welcomeTour: TourStep[] = [
  {
    // Sin target — dialog centrado en pantalla. Anclarlo al contenedor
    // del dashboard hacía que TourGuide calculara la posición respecto
    // a un elemento gigante y el modal salía mal ubicado a la izquierda.
    title: "¡Bienvenido a Psicomorfosis!",
    content: "Te muestro lo más importante en menos de un minuto. Puedes saltar este tour cuando quieras — luego lo encuentras en Configuración → Tutoriales.",
  },
  {
    target: '[data-tour="sidebar-nav"]',
    title: "Tu menú principal",
    content: "Desde aquí llegas a todo: agenda, pacientes, tests, documentos y más. Puedes colapsarlo con el botón de abajo si necesitas más espacio.",
  },
  {
    target: '[data-tour="quick-actions"]',
    title: "Acciones rápidas",
    content: "Lo que más vas a hacer: agendar cita, crear paciente, generar recibo, aplicar test. Todo a un click sin tener que abrir cada página.",
    optional: true,
  },
  {
    target: '[data-tour="sidebar-link-agenda"]',
    title: "Tu agenda",
    content: "Citas del día, semana y mes. Marca asistencia, genera recibos y abre la historia clínica desde cada cita.",
  },
  {
    target: '[data-tour="sidebar-link-pacientes"]',
    title: "Tus pacientes",
    content: "Lista completa de pacientes activos, con búsqueda, filtros y etiquetas. Click en cualquiera para ver su ficha.",
  },
  {
    target: '[data-tour="fab-button"]',
    title: "Atajo flotante",
    content: "Este botón siempre está abajo a la derecha. Hace lo mismo que las acciones rápidas pero accesible desde cualquier página.",
    optional: true,
  },
  {
    target: '[data-tour="report-problem"]',
    title: "¿Algo raro?",
    content: "Si encuentras un bug o tienes una idea, repórtalo aquí. Puedes adjuntar capturas (Ctrl+V también funciona). Revisamos los reportes diariamente.",
  },
];

// ─── Tour 2: Pacientes (auto en /pacientes) ────────────────────────
export const patientsTour: TourStep[] = [
  {
    target: '[data-tour="pacientes-list"]',
    title: "Tus pacientes activos",
    content: "Aquí viven todos los pacientes que estás atendiendo. Los archivados quedan ocultos pero no se borran.",
  },
  {
    target: '[data-tour="pacientes-search"]',
    title: "Búsqueda rápida",
    content: "Búscalos por nombre, documento o etiqueta. La búsqueda es tolerante a acentos.",
    optional: true,
  },
  {
    target: '[data-tour="pacientes-filters"]',
    title: "Filtros",
    content: "Filtra por riesgo, modalidad o estado. Útil cuando tienes muchos pacientes.",
    optional: true,
  },
  {
    target: '[data-tour="pacientes-new"]',
    title: "Nuevo paciente",
    content: "Crea un paciente desde aquí. Después puedes invitarlo al portal para que firme consentimientos y vea sus tareas.",
  },
];

// ─── Tour 3: Historia clínica (auto en /pacientes/:id) ─────────────
export const historyTour: TourStep[] = [
  {
    target: '[data-tour="patient-header"]',
    title: "Ficha del paciente",
    content: "Toda la info clínica y administrativa del paciente en un solo lugar.",
  },
  {
    target: '[data-tour="patient-tabs"]',
    title: "Pestañas de la historia",
    content: "Motivo de consulta, evolución de sesiones, tareas, tests, documentos… Cada pestaña tiene su sección con su propio contenido.",
    optional: true,
  },
  {
    target: '[data-tour="patient-new-note"]',
    title: "Registrar una sesión",
    content: "Para cada sesión usa 'Nueva nota'. Puedes elegir formato libre o SOAP, agregar plan de tratamiento y crear tareas terapéuticas.",
    optional: true,
  },
];

// ─── Tour 4: Tests (auto en /tests) ────────────────────────────────
export const testsTour: TourStep[] = [
  {
    target: '[data-tour="tests-catalog"]',
    title: "Catálogo de tests",
    content: "Instrumentos psicométricos disponibles: MCMI-II, escalas de ansiedad, depresión, y los que crees tú mismo.",
  },
  {
    target: '[data-tour="tests-apply"]',
    title: "Aplicar un test",
    content: "Asigna un test a un paciente. Puede responderlo desde el portal o tú lo aplicas en consulta y registras las respuestas.",
    optional: true,
  },
  {
    target: '[data-tour="tests-create"]',
    title: "Crea tus propios tests",
    content: "Si necesitas un instrumento específico, créalo: V/F, Likert con suma y baremos, o formularios mixtos con widgets personalizados.",
    optional: true,
  },
];

// ─── Tour 5: Recibos (auto en /facturacion) ────────────────────────
export const invoicesTour: TourStep[] = [
  {
    target: '[data-tour="invoices-list"]',
    title: "Recibos",
    content: "Aquí ves todos los recibos que has generado. También se crean automáticamente desde la agenda al cobrar una cita.",
  },
  {
    target: '[data-tour="invoices-summary"]',
    title: "Resumen",
    content: "Ingresos del periodo, pendientes por cobrar, ticket promedio… para que sepas cómo va el mes sin abrir un Excel.",
    optional: true,
  },
  {
    target: '[data-tour="invoices-new"]',
    title: "Nuevo recibo manual",
    content: "Si necesitas registrar un cobro fuera de una sesión (paquete de varias citas, primera consulta, etc.), créalo desde aquí.",
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
