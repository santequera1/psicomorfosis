import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Plus, Calendar, UserPlus, FilePen, Receipt, Settings } from "lucide-react";
import { cn } from "@/lib/utils";
import { NewAppointmentModal } from "@/components/app/NewAppointmentModal";
import { NewPatientModal } from "@/components/app/NewPatientModal";
import { NewNoteShortcutModal } from "@/components/app/NewNoteShortcutModal";
import { ReceiptFormModal } from "@/routes/facturacion";

type Action = "appointment" | "patient" | "note" | "receipt";

// Número de WhatsApp del soporte directo (Stiven). Formato sin "+" para
// la URL wa.me que es el estándar de WhatsApp Click-to-Chat. Si en algún
// momento se necesita rotar, cambiar solo acá.
const SUPPORT_WHATSAPP = "573026444564";

/**
 * Icono inline de WhatsApp. lucide-react no incluye logos de marcas
 * (por política, solo iconos genéricos), así que usamos el SVG oficial
 * para que la pieza sea reconocible al instante por las psicólogas.
 * `fill="currentColor"` hereda el color del contenedor (text-brand-800
 * en el FabItem) para mantener consistencia visual con los otros items.
 */
function WhatsAppIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.245 2.248 3.481 5.236 3.48 8.414-.003 6.557-5.338 11.892-11.893 11.892-1.99-.001-3.951-.5-5.688-1.448l-6.305 1.654zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884-.001 2.225.651 3.891 1.746 5.634l-.999 3.648 3.742-.981zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.5-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413z"/>
    </svg>
  );
}

/**
 * FAB global de acción rápida. Vive dentro de AppShell, así que aparece en
 * todas las rutas autenticadas. Atajos a las acciones más comunes (nueva
 * cita, paciente, nota, recibo) + atajos a Configuración y Soporte directo
 * por WhatsApp. Los modales son los mismos que abren los botones
 * contextuales de cada página, lo que mantiene una sola fuente de verdad
 * para esos flujos.
 */
export function Fab() {
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const [active, setActive] = useState<Action | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // El menú se cierra al hacer clic afuera o presionar Esc.
  useEffect(() => {
    if (!menuOpen) return;
    function onClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setMenuOpen(false);
    }
    window.addEventListener("mousedown", onClick);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onClick);
      window.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  // Patients se carga lazy; solo cuando se abre el modal de cita lo necesita
  // realmente. Lo dejamos siempre activo porque el query ya lo cachean otras
  // páginas y casi siempre está caliente.
  const { data: patients = [] } = useQuery({
    queryKey: ["patients"],
    queryFn: () => api.listPatients(),
    enabled: active === "appointment",
  });

  function pick(a: Action) {
    setMenuOpen(false);
    setActive(a);
  }

  // Portal al body para evitar que un stacking context aislado del
  // <main> (que tiene `animate-in fade-in slide-in-from-bottom-2` →
  // crea su propio contexto vía transform/opacity) atrape el FAB y lo
  // ponga visualmente encima de modales con z-50 que viven dentro
  // del main. Con portal al body, FAB y modales comparten el contexto
  // raíz y los z-index se respetan: modal z-50 > FAB z-40.
  if (typeof document === "undefined") return null;
  return createPortal(
    <>
      {/* El contenedor solo ocupa el tamaño del botón circular. Los items
          quedan posicionados absolutamente arriba para no reservar espacio
          ni capturar hover cuando el menú está cerrado. */}
      <div ref={containerRef} className="fixed bottom-5 right-5 z-40 h-14 w-14 print:hidden">
        <div
          aria-hidden={!menuOpen}
          className={cn(
            "absolute bottom-full right-0 mb-2 flex flex-col items-end gap-2 transition-all duration-200 ease-out",
            menuOpen ? "opacity-100 translate-y-0 pointer-events-auto" : "opacity-0 translate-y-3 pointer-events-none"
          )}
        >
          {/* Orden top→bottom (stagger más alto = primero en el DOM = entra
              al final): Soporte directo y Configuración arriba, separadas
              visualmente de las acciones de creación. Soporte va al tope
              porque es un caso "necesito ayuda" — quiero que se vea claro
              y separado del resto. */}
          <FabItem
            icon={WhatsAppIcon}
            label="Soporte directo"
            onClick={() => {
              setMenuOpen(false);
              // wa.me abre la app de WhatsApp en mobile o WhatsApp Web en
              // desktop. _blank evita perder la sesión actual de la app.
              window.open(`https://wa.me/${SUPPORT_WHATSAPP}`, "_blank", "noopener,noreferrer");
            }}
            stagger={5}
            open={menuOpen}
          />
          <FabItem icon={Settings} label="Configuración" onClick={() => { setMenuOpen(false); navigate({ to: "/configuracion" }); }} stagger={4} open={menuOpen} />
          <FabItem icon={Calendar} label="Nueva cita" onClick={() => pick("appointment")} stagger={3} open={menuOpen} />
          <FabItem icon={UserPlus} label="Nuevo paciente" onClick={() => pick("patient")} stagger={2} open={menuOpen} />
          <FabItem icon={FilePen} label="Nueva nota" onClick={() => pick("note")} stagger={1} open={menuOpen} />
          <FabItem icon={Receipt} label="Nuevo recibo" onClick={() => pick("receipt")} stagger={0} open={menuOpen} />
        </div>
        <button
          onClick={() => setMenuOpen((v) => !v)}
          aria-label={menuOpen ? "Cerrar acciones" : "Abrir acciones"}
          aria-expanded={menuOpen}
          data-tour="fab-button"
          className="h-14 w-14 rounded-full bg-brand-700 text-white shadow-lg hover:bg-brand-800 hover:shadow-xl active:scale-95 transition-all duration-200 flex items-center justify-center"
        >
          <Plus className={cn("h-5 w-5 transition-transform duration-200", menuOpen && "rotate-45")} />
        </button>
      </div>

      {active === "appointment" && (
        <NewAppointmentModal patients={patients} onClose={() => setActive(null)} />
      )}
      {active === "patient" && (
        <NewPatientModal onClose={() => setActive(null)} />
      )}
      {active === "note" && (
        <NewNoteShortcutModal onClose={() => setActive(null)} />
      )}
      {active === "receipt" && (
        <ReceiptFormModal mode="create" onClose={() => setActive(null)} />
      )}
    </>,
    document.body,
  );
}

function FabItem({ icon: Icon, label, onClick, stagger = 0, open = true }: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  onClick: () => void;
  stagger?: number;
  open?: boolean;
}) {
  // Stagger: cada item entra 40ms después del anterior. Al cerrar, todos
  // salen al mismo tiempo (más natural visualmente).
  const delay = open ? `${stagger * 40}ms` : "0ms";
  return (
    <button
      onClick={onClick}
      style={{ transitionDelay: delay }}
      className="group flex items-center gap-3 pl-3 pr-4 h-11 rounded-full bg-surface border border-line-200 shadow-md text-sm text-ink-900 hover:border-brand-400 hover:bg-brand-50/40 transition-all duration-150"
    >
      <span className="h-7 w-7 rounded-full bg-brand-50 text-brand-800 flex items-center justify-center shrink-0 group-hover:bg-brand-100 transition-colors">
        <Icon className="h-3.5 w-3.5" />
      </span>
      <span className="font-medium whitespace-nowrap">{label}</span>
    </button>
  );
}
