import { useCallback } from "react";
import { api } from "@/lib/api";
import { LauraStreamModal } from "./LauraStreamModal";

/**
 * Modal de análisis de progreso del paciente (Fase 3.2).
 * Stream contra /api/laura/progress que genera una síntesis
 * DESCRIPTIVA (nunca diagnóstica) de la evolución de los últimos
 * N meses con base en las notas de sesión y tests registrados.
 */
type Props = {
  patientId: string;
  patientName: string;
  months?: number;
  onClose: () => void;
};

export function LauraProgressModal({ patientId, patientName, months, onClose }: Props) {
  const start = useCallback(
    (onEvent: Parameters<typeof api.lauraProgressStream>[1], signal: AbortSignal) =>
      api.lauraProgressStream(patientId, onEvent, { months, signal }),
    [patientId, months],
  );

  return (
    <LauraStreamModal
      kind={`Análisis de progreso · últimos ${months ?? 6} meses`}
      title={patientName}
      start={start}
      onClose={onClose}
      footer={
        <button
          type="button"
          onClick={onClose}
          className="h-9 px-3 rounded-lg border border-line-200 text-xs text-ink-700 hover:bg-bg-50"
        >
          Cerrar
        </button>
      }
    />
  );
}
