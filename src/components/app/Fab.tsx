import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Plus, X, Calendar, UserPlus, FilePen } from "lucide-react";
import { NewAppointmentModal } from "@/components/app/NewAppointmentModal";
import { NewPatientModal } from "@/components/app/NewPatientModal";
import { NewNoteShortcutModal } from "@/components/app/NewNoteShortcutModal";

type Action = "appointment" | "patient" | "note";

/**
 * FAB global de acción rápida. Vive dentro de AppShell, así que aparece en
 * todas las rutas autenticadas. Tres atajos: nueva cita, nuevo paciente y
 * nueva nota — los modales son los mismos que abren los botones contextuales
 * de cada página, lo que mantiene una sola fuente de verdad para esos flujos.
 */
export function Fab() {
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

  return (
    <>
      <div ref={containerRef} className="fixed bottom-5 right-5 z-40 flex flex-col items-end gap-2 print:hidden">
        {menuOpen && (
          <div className="flex flex-col items-end gap-2 mb-1">
            <FabItem icon={Calendar} label="Nueva cita" onClick={() => pick("appointment")} />
            <FabItem icon={UserPlus} label="Nuevo paciente" onClick={() => pick("patient")} />
            <FabItem icon={FilePen} label="Nueva nota" onClick={() => pick("note")} />
          </div>
        )}
        <button
          onClick={() => setMenuOpen((v) => !v)}
          aria-label={menuOpen ? "Cerrar acciones" : "Abrir acciones"}
          aria-expanded={menuOpen}
          className="h-14 w-14 rounded-full bg-brand-700 text-white shadow-lg hover:bg-brand-800 hover:shadow-xl active:scale-95 transition-all flex items-center justify-center"
        >
          {menuOpen ? <X className="h-5 w-5" /> : <Plus className="h-5 w-5" />}
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
    </>
  );
}

function FabItem({ icon: Icon, label, onClick }: { icon: React.ComponentType<{ className?: string }>; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="group flex items-center gap-3 pl-3 pr-4 h-11 rounded-full bg-surface border border-line-200 shadow-md text-sm text-ink-900 hover:border-brand-400 hover:bg-brand-50/40 transition-colors"
    >
      <span className="h-7 w-7 rounded-full bg-brand-50 text-brand-800 flex items-center justify-center shrink-0 group-hover:bg-brand-100">
        <Icon className="h-3.5 w-3.5" />
      </span>
      <span className="font-medium whitespace-nowrap">{label}</span>
    </button>
  );
}
