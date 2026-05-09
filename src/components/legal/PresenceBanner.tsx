/**
 * Banner que avisa al asesor legal si otro asesor está editando el
 * mismo documento ahora, o si alguien lo modificó recientemente.
 *
 * Tres estados visuales:
 *   1. Editores activos (lastSeenAt < 60s atrás): banner amarillo
 *      con mensaje "X está editando ahora mismo. Tus cambios pueden
 *      pisar los suyos.".
 *   2. Edición reciente de OTRA persona (≤ 30 min): banner gris claro
 *      con "Última edición: María hace 12 min."
 *   3. Sin nada que mostrar: el banner no se renderiza.
 *
 * El usuario actual queda excluido del cálculo (el backend ya lo
 * filtra en activeEditors; aquí solo evitamos mostrar el banner gris
 * si el último editor es el propio usuario).
 */

import { Users, Clock } from "lucide-react";
import type { ActiveEditor } from "./useLegalPresence";
import { formatDateTimeCO, parseBackendDate } from "@/lib/utils";

interface Props {
  activeEditors: ActiveEditor[];
  lastModifiedBy: { id: number; name: string } | null;
  lastModifiedAt: string | null;
  currentUserId: number | undefined;
}

export function PresenceBanner({
  activeEditors, lastModifiedBy, lastModifiedAt, currentUserId,
}: Props) {
  // Caso 1: hay otros activos.
  if (activeEditors.length > 0) {
    const names = activeEditors.map((e) => e.name).join(", ");
    return (
      <div className="rounded-md bg-warning-soft border border-warning/30 px-3 py-2 text-xs text-ink-900 inline-flex items-start gap-2">
        <Users className="h-3.5 w-3.5 text-warning shrink-0 mt-0.5" />
        <div>
          <strong>{names}</strong> {activeEditors.length === 1 ? "está editando" : "están editando"} ahora mismo.
          Coordínate antes de seguir — tus cambios pueden pisar los suyos.
        </div>
      </div>
    );
  }

  // Caso 2: edición reciente (≤ 30 min) de OTRA persona.
  if (
    lastModifiedBy &&
    lastModifiedAt &&
    lastModifiedBy.id !== currentUserId
  ) {
    const d = parseBackendDate(lastModifiedAt);
    if (d) {
      const minutesAgo = Math.floor((Date.now() - d.getTime()) / 60_000);
      if (minutesAgo <= 30) {
        return (
          <div className="rounded-md bg-bg-100 border border-line-200 px-3 py-2 text-xs text-ink-700 inline-flex items-start gap-2">
            <Clock className="h-3.5 w-3.5 text-ink-400 shrink-0 mt-0.5" />
            <div>
              Última edición de <strong>{lastModifiedBy.name}</strong>{" "}
              {minutesAgo === 0 ? "hace unos segundos" : `hace ${minutesAgo} min`}.
              {" "}
              <span className="text-ink-500">
                ({formatDateTimeCO(lastModifiedAt, { hour: "2-digit", minute: "2-digit" })})
              </span>
            </div>
          </div>
        );
      }
    }
  }

  return null;
}
