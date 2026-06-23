import { useCallback } from "react";
import { useNavigate } from "@tanstack/react-router";
import { api } from "@/lib/api";
import { ArrowRight, FileText, User as UserIcon } from "lucide-react";
import { LauraStreamModal } from "./LauraStreamModal";

/**
 * Modal de briefing previo a una sesión clínica (Fase 2.4).
 * Dispara stream contra /api/laura/briefing y renderiza la síntesis
 * en markdown. Al final ofrece quick actions: tomar nota o abrir ficha.
 */
type Props = {
  appointmentId: number;
  patientId: string;
  patientName: string;
  onClose: () => void;
};

export function LauraBriefingModal({ appointmentId, patientId, patientName, onClose }: Props) {
  const navigate = useNavigate();

  // start function — useCallback para que el useEffect del modal no se
  // re-dispare si el padre re-renderiza.
  const start = useCallback(
    (onEvent: Parameters<typeof api.lauraBriefingStream>[1], signal: AbortSignal) =>
      api.lauraBriefingStream(appointmentId, onEvent, signal),
    [appointmentId],
  );

  return (
    <LauraStreamModal
      kind="Briefing con Laura"
      title={patientName}
      start={start}
      onClose={onClose}
      footer={() => (
        <>
          <button
            type="button"
            onClick={() => navigate({ to: "/historia", search: { id: patientId } as never })}
            className="h-9 px-3 rounded-lg border border-line-200 text-xs text-ink-800 hover:bg-bg-50 inline-flex items-center gap-1.5"
          >
            <FileText className="h-3.5 w-3.5" />
            Tomar nota
          </button>
          <button
            type="button"
            onClick={() => navigate({ to: "/pacientes/$id", params: { id: patientId } })}
            className="h-9 px-3 rounded-lg bg-brand-700 text-white text-xs font-medium hover:bg-brand-800 inline-flex items-center gap-1.5"
          >
            <UserIcon className="h-3.5 w-3.5" />
            Abrir ficha
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </>
      )}
    />
  );
}
