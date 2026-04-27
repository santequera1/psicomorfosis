import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { FileText, Loader2, FileCheck2, FileClock, ShieldCheck } from "lucide-react";
import { PortalShell } from "@/components/portal/PortalShell";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/p_/documentos")({
  head: () => ({ meta: [{ title: "Mis documentos · Mi portal" }] }),
  component: PortalDocuments,
});

function PortalDocuments() {
  const { data: docs = [], isLoading } = useQuery({
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

      {isLoading && <Loader2 className="h-5 w-5 mx-auto animate-spin text-ink-400" />}

      {!isLoading && docs.length === 0 && (
        <div className="rounded-2xl border border-dashed border-line-200 bg-surface p-12 text-center">
          <FileText className="h-8 w-8 mx-auto text-ink-300 mb-3" />
          <p className="text-sm text-ink-500">Aún no tienes documentos compartidos.</p>
        </div>
      )}

      {docs.length > 0 && (
        <ul className="space-y-2">
          {docs.map((d) => {
            const isSigned = d.status === "firmado";
            const Icon = isSigned ? FileCheck2 : FileClock;
            return (
              <li key={d.id} className="rounded-xl border border-line-200 bg-surface p-4 sm:p-5 hover:shadow-soft transition-shadow">
                <div className="flex items-start gap-4">
                  <div className={cn(
                    "h-11 w-11 rounded-lg flex items-center justify-center shrink-0",
                    isSigned ? "bg-success-soft text-success" : "bg-warning-soft text-risk-moderate"
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
                      isSigned ? "bg-sage-200/40 text-sage-700" : "bg-warning-soft text-risk-moderate"
                    )}>
                      {isSigned ? "Firmado" : d.status === "pendiente_firma" ? "Por firmar" : "Borrador"}
                    </span>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <div className="mt-8 rounded-xl border border-line-200 bg-surface p-5 flex items-start gap-3">
        <ShieldCheck className="h-5 w-5 text-sage-500 shrink-0 mt-0.5" />
        <p className="text-xs text-ink-500 leading-relaxed">
          Los documentos firmados son inmodificables y se conservan según la Resolución 1995/1999.
          Próximamente podrás firmar documentos directamente desde aquí.
        </p>
      </div>
    </PortalShell>
  );
}
