import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { FileText, Loader2, FileCheck2, FileClock, ShieldCheck, Pen, ChevronRight, AlertCircle, RefreshCw } from "lucide-react";
import { PortalShell } from "@/components/portal/PortalShell";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/p_/documentos")({
  head: () => ({ meta: [{ title: "Mis documentos · Mi portal" }] }),
  component: PortalDocuments,
});

function PortalDocuments() {
  const { data: docs = [], isLoading, isError, refetch } = useQuery({
    queryKey: ["portal-documents"],
    queryFn: () => api.portalDocuments(),
  });

  return (
    <PortalShell>
      <header className="mb-8">
        <p className="text-xs uppercase tracking-widest text-brand-700 font-semibold">Tu archivo</p>
        <h1 className="font-serif text-3xl text-ink-900 mt-1">Mis documentos</h1>
        <p className="text-sm text-ink-500 mt-2 max-w-xl">
          Aquí encuentras los documentos que tu psicóloga ha compartido contigo: consentimientos, certificados, informes.
        </p>
      </header>

      {isLoading && (
        <div className="text-center py-10 text-ink-500"><Loader2 className="h-5 w-5 mx-auto animate-spin" /></div>
      )}

      {isError && (
        <div className="rounded-2xl border border-rose-500/20 bg-rose-50/40 p-8 text-center">
          <AlertCircle className="h-8 w-8 mx-auto text-rose-600 mb-3" />
          <p className="text-sm text-ink-900 font-medium">No pudimos cargar tus documentos</p>
          <p className="text-xs text-ink-500 mt-1 mb-4">Verifica tu conexión e inténtalo de nuevo.</p>
          <button
            onClick={() => refetch()}
            className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg bg-brand-700 text-white text-sm font-medium hover:bg-brand-800"
          >
            <RefreshCw className="h-3.5 w-3.5" /> Reintentar
          </button>
        </div>
      )}

      {!isLoading && !isError && docs.length === 0 && (
        <div className="rounded-2xl border border-dashed border-line-200 bg-surface p-12 text-center">
          <FileText className="h-8 w-8 mx-auto text-ink-300 mb-3" />
          <p className="text-sm text-ink-500">Aún no tienes documentos compartidos.</p>
        </div>
      )}

      {docs.length > 0 && (
        <ul className="space-y-2">
          {docs.map((d) => {
            const isSigned = d.status === "firmado" || !!d.signed_at;
            const canSign = !!d.pending_signature_request_id;
            const Icon = isSigned ? FileCheck2 : canSign ? FileClock : FileText;
            // No mostramos el status interno "borrador" al paciente: él no
            // sabe (ni le importa) si la psicóloga está editando todavía.
            // Para él, el doc o está firmado, o tiene firma pendiente, o
            // simplemente está disponible para leer.
            const label = isSigned ? "Firmado" : canSign ? "Por firmar" : "Compartido";
            return (
              <li key={d.id} className="rounded-xl border border-line-200 bg-surface hover:shadow-soft transition-shadow overflow-hidden">
                <Link
                  to="/p/documentos/$id"
                  params={{ id: String(d.id) }}
                  className="flex items-start gap-4 p-4 sm:p-5"
                >
                  <div className={cn(
                    "h-11 w-11 rounded-lg flex items-center justify-center shrink-0",
                    isSigned ? "bg-success-soft text-success"
                      : canSign ? "bg-warning-soft text-risk-moderate"
                      : "bg-brand-50 text-brand-700"
                  )}>
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-medium text-ink-900">{d.name}</h3>
                    <p className="text-xs text-ink-500 mt-0.5">
                      {d.professional ?? "Tu psicóloga"} · {new Date(d.updated_at).toLocaleDateString("es-CO", { day: "numeric", month: "long", year: "numeric" })}
                    </p>
                    <span className={cn(
                      "inline-block mt-2 text-[10px] uppercase tracking-widest px-2 py-0.5 rounded-full font-medium",
                      isSigned ? "bg-sage-200/40 text-sage-700"
                        : canSign ? "bg-warning-soft text-risk-moderate"
                        : "bg-brand-50 text-brand-800"
                    )}>
                      {label}
                    </span>
                  </div>
                  <ChevronRight className="h-5 w-5 text-ink-400 shrink-0 mt-1" />
                </Link>
                {canSign && (
                  <div className="px-4 sm:px-5 pb-4 sm:pb-5 -mt-2">
                    <Link
                      to="/p/firmar/$docId"
                      params={{ docId: String(d.id) }}
                      className="inline-flex items-center gap-2 h-10 px-4 rounded-lg bg-brand-700 text-white text-sm font-medium hover:bg-brand-800"
                    >
                      <Pen className="h-3.5 w-3.5" /> Firmar ahora <ChevronRight className="h-3.5 w-3.5" />
                    </Link>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <div className="mt-8 rounded-xl border border-line-200 bg-surface p-5 flex items-start gap-3">
        <ShieldCheck className="h-5 w-5 text-sage-500 shrink-0 mt-0.5" />
        <p className="text-xs text-ink-500 leading-relaxed">
          Los documentos firmados son inmodificables y se conservan según la Resolución 1995/1999.
          Tu firma electrónica desde el portal tiene la misma validez legal que la del enlace por correo.
        </p>
      </div>
    </PortalShell>
  );
}
