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
 * Wrapper neutral para el content del step.
 *
 * En versiones anteriores este helper inyectaba un botón "Saltar tour"
 * con onclick inline. Resultó que algunos navegadores con escudos de
 * seguridad activos (Brave por defecto, Firefox con NoScript) sanitizan
 * el HTML cuando detectan inline event handlers, y al hacerlo borran
 * TODO el contenido del bloque — produciendo dialogs vacíos.
 *
 * El cierre del tour ya está disponible vía:
 *   - X arriba a la derecha del dialog (closeButton: true)
 *   - Tecla Escape (exitOnEscape: true)
 *   - Botón "Reiniciar tutoriales" en /configuración (escape hatch)
 *
 * Mantengo la firma de la función para no tener que tocar todos los
 * tours; ahora simplemente devuelve el HTML sin modificación.
 */
function withSkip(html: string): string {
  return html;
}

export const TOUR_NAMES = {
  welcome: "welcome",
  patients: "patients",
  history: "history",
  tests: "tests",
  invoices: "invoices",
  documents: "documents",
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
    // En mobile el dialog está fijo abajo y tapa el FAB; mejor saltar
    // este paso en pantalla chica. El FAB sigue siendo visible y obvio.
    desktopOnly: true,
    // Cierra el drawer en mobile para que el FAB no quede tapado.
    beforeEnter: closeSidebarIfMobile,
  },
  {
    target: '[data-tour="report-problem"]',
    title: "¿Algo raro?",
    content: withSkip("Si encuentras un bug o tienes una idea, repórtalo aquí. Puedes adjuntar capturas (Ctrl+V también funciona). Revisamos los reportes diariamente."),
    // El botón vive en el footer del sidebar; en mobile el drawer es
    // overlay y el dialog del tour fijo abajo lo solapa. Saltamos en
    // mobile — el botón se descubre de manera natural en el sidebar.
    desktopOnly: true,
    beforeEnter: openSidebarAndWait,
  },
  {
    // Step final motivacional. Sin target → dialog centrado.
    //
    // ANTES tenía un <button onclick="...">Crear mi primer paciente</button>
    // pero los navegadores con escudos de seguridad (Brave, Firefox con
    // NoScript) sanitizan inline event handlers y borran el contenido
    // entero del dialog → quedaba vacío. Ahora usamos solo texto y un
    // <a href="/pacientes"> simple que el browser maneja sin JS.
    title: "¡Listo para empezar!",
    content: `
      Ya conoces lo básico. El siguiente paso es crear tu primer paciente — desde ahí puedes agendar citas, hacer notas, aplicar tests y todo lo demás.
      <div style="margin-top: 16px;">
        <a
          href="/pacientes"
          style="display: inline-flex; align-items: center; gap: 8px; padding: 8px 16px; background: oklch(36% .025 200); color: white; font-size: 13px; font-weight: 500; border-radius: 8px; text-decoration: none;"
        >
          Crear mi primer paciente →
        </a>
      </div>
    `,
    beforeEnter: closeSidebarIfMobile,
  },
];

// ─── Tour 2: Pacientes (auto en /pacientes) ────────────────────────
//
// Cada tour de página arranca con un paso anclado al H1 de la página
// (data-tour="page-title"). Es un elemento que ya existe en el primer
// render (no depende de queries) y es lo bastante pequeño para que
// TourGuide calcule la posición correctamente. Los pasos siguientes
// apuntan a anchors concretos y son `optional` — si el DOM aún no
// terminó de hidratar, se filtran con gracia.
export const patientsTour: TourStep[] = [
  {
    target: '[data-tour="page-title"]',
    title: "Tus pacientes",
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
    optional: true,
  },
];

// ─── Tour 3: Historia clínica (auto en /pacientes/:id) ─────────────
export const historyTour: TourStep[] = [
  {
    target: '[data-tour="page-title"]',
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
    target: '[data-tour="page-title"]',
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

// ─── Tour 6: Documentos (auto en /documentos) ──────────────────────
//
// Documentos es una de las vistas más usadas, por eso el tour es más
// detallado: explica los dos modos de organización (carpetas vs lista),
// las plantillas con variables auto-rellenadas, y la opción de subir
// los propios documentos del psicólogo (Word editable, otros formatos
// para guardar).
export const documentsTour: TourStep[] = [
  {
    target: '[data-tour="page-title"]',
    title: "Documentos clínicos",
    content: withSkip("Aquí guardas todos los documentos: consentimientos, contratos, certificados, informes, remisiones. Te muestro las opciones."),
  },
  {
    target: '[data-tour="docs-view-toggle"]',
    title: "Carpetas o lista",
    content: withSkip("Cambia entre dos formas de ver tus documentos: <strong>Carpetas</strong> (una por paciente, como organizador físico) o <strong>Lista/Tarjetas</strong> (todos en una sola vista, ideal para buscar)."),
    optional: true,
  },
  {
    target: '[data-tour="docs-templates"]',
    title: "Plantillas listas para usar",
    content: withSkip("Plantillas oficiales del sistema (consentimientos, contratos, informes…) con <strong>variables que se rellenan solas</strong> con los datos del paciente al elegirlo: {{paciente.nombre}}, {{paciente.documento}}, etc."),
    optional: true,
  },
  {
    target: '[data-tour="docs-upload-template"]',
    title: "Sube tus propios documentos",
    content: withSkip("Sube un <strong>Word (.docx)</strong> y queda editable dentro de la app — útil para tus formatos propios. También puedes subir <strong>PDF, imágenes y otros archivos</strong> desde \"Nuevo documento → Subir archivo\" si solo los quieres guardar adjuntos al paciente."),
    optional: true,
  },
  {
    target: '[data-tour="docs-new"]',
    title: "Crear un documento nuevo",
    content: withSkip("Empieza desde una plantilla, en blanco, o sube un archivo existente. Al vincular un paciente, las variables del documento se rellenan automáticamente y puedes pedirle firma desde el portal."),
    optional: true,
  },
];

// ─── Tour 5: Recibos (auto en /facturacion) ────────────────────────
export const invoicesTour: TourStep[] = [
  {
    target: '[data-tour="page-title"]',
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
    // En mobile (< 640px) solo disparamos el tour principal de
    // bienvenida. Los tours de página (pacientes, tests, recibos,
    // historia, documentos) son más útiles en desktop, donde:
    //   - el sidebar y los anchors están todos visibles a la vez,
    //   - el dialog flotante no compite por espacio,
    //   - el psicólogo típicamente arma su flujo de trabajo.
    // En mobile el tour se vuelve más ruidoso que útil — el usuario
    // ya conoce las páginas y solo necesita la introducción inicial.
    const isMobile = typeof window !== "undefined" && window.innerWidth < 640;
    if (isMobile && name !== "welcome") return;

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
    return () => {
      clearTimeout(t);
      // Si el usuario navega antes de que arranque el tour, o entre
      // páginas con el tour activo, limpiamos el dialog residual del
      // DOM (TourGuide monta fuera de React, así que el desmonte del
      // componente no lo borra automáticamente). El próximo tour
      // arranca limpio sin colisión de IDs (#tg-dialog-title, etc).
      if (typeof document !== "undefined") {
        document.querySelectorAll(".tg-backdrop, .tg-dialog").forEach((el) => el.remove());
        document.body.classList.remove("tg-no-interaction");
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name]);
}
