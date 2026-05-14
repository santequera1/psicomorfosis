/**
 * Gate bloqueante: si el usuario autenticado tiene documentos legales
 * pendientes de aceptar (porque el asesor publicó una nueva versión),
 * mostramos un modal modal-no-cerrable hasta que los acepte uno a uno.
 *
 * Reglas:
 *   - El asesor legal queda **excluida** del gate (es ella quien
 *     edita los documentos; sería absurdo bloquearla con su propio
 *     trabajo en draft o publicación reciente).
 *   - El platform admin sí pasa por el gate igual que cualquier staff
 *     — debe aceptar la política, dado que la opera y representa.
 *   - Cada aceptación se persiste vía /api/legal/me/accept con IP y
 *     user-agent (audit log SIC).
 *   - Mientras haya pendientes, no se puede cerrar el modal ni cancelar.
 *     Solo "Cerrar sesión" si quiere salir sin aceptar.
 */

import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, ShieldCheck, LogOut, AlertTriangle } from "lucide-react";
import { api, logoutEverywhere, getStoredUser } from "@/lib/api";
import { LegalDocumentView } from "./LegalDocumentEditor";

export function PendingLegalGate() {
  const user = getStoredUser();
  const enabled = !!user && !user.isLegalAdmin;

  const { data, isLoading } = useQuery({
    queryKey: ["legal-pending", user?.id],
    queryFn: () => api.legalMyPending(),
    enabled,
    // No refetch en focus — sería raro: aparece y desaparece el modal.
    refetchOnWindowFocus: false,
    staleTime: 60_000,
  });

  const pending = useMemo(() => data?.pending ?? [], [data]);
  if (!enabled || isLoading || pending.length === 0) return null;

  return <BlockingModal pending={pending} />;
}

function BlockingModal({
  pending,
}: {
  pending: NonNullable<Awaited<ReturnType<typeof api.legalMyPending>>>["pending"];
}) {
  const qc = useQueryClient();
  const [idx, setIdx] = useState(0);
  const [scrolledToEnd, setScrolledToEnd] = useState(false);
  const current = pending[idx];

  const acceptMut = useMutation({
    mutationFn: (versionId: number) => api.legalAccept(versionId),
    onSuccess: () => {
      // Avanzar al siguiente documento; si era el último, refrescar
      // para que el query devuelva [] y el gate desaparezca.
      if (idx + 1 >= pending.length) {
        qc.invalidateQueries({ queryKey: ["legal-pending"] });
      } else {
        setIdx((i) => i + 1);
        setScrolledToEnd(false);
      }
    },
  });

  // Cuando el usuario hace scroll completo en el iframe del documento,
  // habilitamos el botón "Acepto". Es una práctica común en términos
  // legales (Apple, Google) para forzar al menos un repaso visual.
  function onScroll(e: React.UIEvent<HTMLDivElement>) {
    const el = e.currentTarget;
    const reachedEnd = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
    if (reachedEnd) setScrolledToEnd(true);
  }

  if (!current) return null;
  const total = pending.length;

  return (
    <div className="fixed inset-0 z-[200] bg-ink-900/70 backdrop-blur flex items-center justify-center px-4">
      <div className="w-full max-w-3xl max-h-[92vh] bg-surface rounded-xl border border-line-200 shadow-modal flex flex-col">
        {/* Header */}
        <header className="px-6 py-4 border-b border-line-200 flex items-start gap-3 shrink-0">
          <div className="h-10 w-10 rounded-lg bg-brand-100 text-brand-700 flex items-center justify-center shrink-0">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-xs uppercase tracking-widest text-brand-700 font-semibold">
              Aceptación legal requerida
            </div>
            <h2 className="font-serif text-xl text-ink-900 leading-tight mt-0.5">{current.title}</h2>
            <div className="text-xs text-ink-500 mt-1.5 flex flex-wrap items-center gap-2">
              <span>Versión {current.versionLabel}</span>
              <span>·</span>
              <span>Vigente desde {formatDate(current.publishedAt)}</span>
              {total > 1 && (
                <>
                  <span>·</span>
                  <span>Documento {idx + 1} de {total}</span>
                </>
              )}
            </div>
            {current.summaryOfChanges && (
              <div className="mt-3 rounded-md bg-info-soft border border-info/20 px-3 py-2 text-xs text-info inline-flex items-start gap-2">
                <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                <span><strong>Qué cambió:</strong> {current.summaryOfChanges}</span>
              </div>
            )}
          </div>
        </header>

        {/* Body con scroll */}
        <div
          className="flex-1 overflow-y-auto px-6 py-4 bg-bg-50"
          onScroll={onScroll}
        >
          <div className="bg-surface rounded-lg border border-line-200 px-5 sm:px-7 py-1">
            <LegalDocumentView html={current.bodyHtml} />
          </div>
          {!scrolledToEnd && (
            <p className="text-center text-xs text-ink-500 mt-3 italic">
              Desplázate hasta el final del documento para habilitar el botón "Acepto".
            </p>
          )}
        </div>

        {/* Footer con CTA */}
        <footer className="px-6 py-4 border-t border-line-200 flex flex-wrap items-center gap-3 shrink-0">
          <button
            onClick={() => {
              void logoutEverywhere();
              window.location.replace("/login");
            }}
            className="h-10 px-3 rounded-lg text-xs text-ink-500 hover:bg-bg-100 inline-flex items-center gap-1.5"
          >
            <LogOut className="h-3.5 w-3.5" />
            Cerrar sesión sin aceptar
          </button>
          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={() => acceptMut.mutate(current.versionId)}
              disabled={!scrolledToEnd || acceptMut.isPending}
              className="h-11 px-5 rounded-lg bg-brand-700 text-white text-sm font-medium hover:bg-brand-800 disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-2"
            >
              {acceptMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
              {idx + 1 < total ? "Acepto y continuar" : "Acepto y entrar a la plataforma"}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("es-CO", {
    day: "2-digit", month: "long", year: "numeric",
  });
}
