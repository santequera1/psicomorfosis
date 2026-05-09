/**
 * Hook que registra "estoy editando" en una versión legal y devuelve
 * la lista de otros usuarios que están editando el mismo documento.
 *
 * Comportamiento:
 *   - Al montar (con versionId no nulo) hace heartbeat inmediato.
 *   - Repite el heartbeat cada 30s mientras el componente esté montado.
 *   - Cada heartbeat devuelve la lista actualizada de `activeEditors`
 *     (otros usuarios cuyo last_seen_at < 60s).
 *   - El backend deja de mostrar al usuario como activo a los 60s sin
 *     heartbeat — no necesitamos un endpoint de "leave" explícito.
 *
 * Si versionId es null/undefined el hook queda inerte (versiones
 * publicadas/archivadas no se trackean).
 */

import { useEffect, useState } from "react";
import { api } from "@/lib/api";

export interface ActiveEditor {
  userId: number;
  name: string;
  lastSeenAt: string;
}

const HEARTBEAT_MS = 30_000;

export function useLegalPresence(versionId: number | null | undefined) {
  const [activeEditors, setActiveEditors] = useState<ActiveEditor[]>([]);

  useEffect(() => {
    if (!versionId) {
      setActiveEditors([]);
      return;
    }
    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | null = null;

    async function tick() {
      try {
        const res = await api.legalAdminHeartbeat(versionId!);
        if (!cancelled) setActiveEditors(res.activeEditors);
      } catch {
        // El heartbeat puede fallar si la versión cambió de estado o
        // se borró. No es crítico — limpiamos la lista local y
        // dejamos que el componente padre detecte el cambio por sus
        // propias queries.
        if (!cancelled) setActiveEditors([]);
      }
    }

    // Primer heartbeat inmediato (no esperamos 30s para mostrar
    // presencia al recién llegado).
    tick();
    timer = setInterval(tick, HEARTBEAT_MS);

    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
    };
  }, [versionId]);

  return activeEditors;
}
