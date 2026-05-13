import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  Loader2, AlertCircle, ArrowLeft, ShieldCheck, FileText, Download, Pen,
  ChevronRight, FileCheck2,
} from "lucide-react";
import { api } from "@/lib/api";
import { PortalShell } from "@/components/portal/PortalShell";
import { DocumentEditor } from "@/components/documents/DocumentEditor";

export const Route = createFileRoute("/p_/documentos/$id")({
  head: () => ({ meta: [{ title: "Documento · Mi portal" }] }),
  component: PortalDocumentViewer,
});

/**
 * Visor read-only de un documento compartido con el paciente. Diferente a
 * `/p/firmar/$docId` que es el flujo de FIRMA con SignaturePad — acá el
 * paciente solo LEE (consentimientos ya firmados, informes, certificados…).
 *
 * Si el documento tiene una firma pendiente abierta, mostramos un CTA
 * "Firmar ahora" que lleva al flujo correcto. Si ya está firmado, mostramos
 * el badge de firmado y la fecha.
 *
 * Soporta los dos kinds:
 *   - kind='editor': renderiza body_json con DocumentEditor en modo no-editable.
 *   - kind='file':   embebe PDF en <iframe> o imagen en <img>, ambos con
 *                    URL que incluye ?t=<token> para que el browser pueda
 *                    pedirlos sin Authorization header.
 */
function PortalDocumentViewer() {
  const { id } = Route.useParams();
  const { data, isLoading, error } = useQuery({
    queryKey: ["portal-document", id],
    queryFn: () => api.portalDocument(id),
    retry: false,
  });

  if (isLoading) {
    return (
      <PortalShell>
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-ink-400" />
        </div>
      </PortalShell>
    );
  }

  if (error || !data) {
    return (
      <PortalShell>
        <div className="max-w-md mx-auto text-center py-20">
          <AlertCircle className="h-10 w-10 mx-auto text-ink-300 mb-3" />
          <h2 className="font-serif text-xl text-ink-900">Documento no disponible</h2>
          <p className="text-sm text-ink-500 mt-2">
            Este documento ya no está compartido contigo, o el enlace no es válido.
          </p>
          <Link
            to="/p/documentos"
            className="inline-flex items-center gap-1.5 mt-5 h-10 px-4 rounded-lg bg-brand-700 text-white text-sm font-medium hover:bg-brand-800"
          >
            <ArrowLeft className="h-4 w-4" /> Volver a mis documentos
          </Link>
        </div>
      </PortalShell>
    );
  }

  const { document: doc, clinic, pending_signature_request_id, variable_context } = data;
  const isSigned = !!doc.signed_at;
  const isFile = doc.kind === "file";
  const isPdf = doc.mime === "application/pdf";
  const isImage = doc.mime?.startsWith("image/") ?? false;
  const fileUrl = isFile ? api.portalDocumentFileUrl(doc.id) : null;
  const downloadUrl = isFile ? api.portalDocumentFileUrl(doc.id, { download: true }) : null;

  return (
    <PortalShell>
      <div className="max-w-3xl mx-auto">
        <Link
          to="/p/documentos"
          className="inline-flex items-center gap-1 text-sm text-ink-500 hover:text-ink-700 mb-4"
        >
          <ArrowLeft className="h-4 w-4" /> Volver a mis documentos
        </Link>

        <header className="mb-6">
          <h1 className="font-serif text-2xl sm:text-3xl text-ink-900">{doc.name}</h1>
          <p className="text-sm text-ink-500 mt-1">
            {doc.professional ? `Compartido por ${doc.professional}` : "Compartido por tu psicóloga"}
            {clinic.name ? ` · ${clinic.name}` : ""}
          </p>
          <div className="mt-3 flex items-center gap-2 flex-wrap">
            {isSigned ? (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-success-soft text-success text-xs font-medium">
                <FileCheck2 className="h-3.5 w-3.5" />
                Firmado el {new Date(doc.signed_at!).toLocaleDateString("es-CO", { day: "numeric", month: "long", year: "numeric" })}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-brand-50 text-brand-800 text-xs font-medium">
                <FileText className="h-3.5 w-3.5" /> Compartido contigo
              </span>
            )}
            {pending_signature_request_id && !isSigned && (
              <Link
                to="/p/firmar/$docId"
                params={{ docId: doc.id }}
                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-brand-700 text-white text-xs font-medium hover:bg-brand-800"
              >
                <Pen className="h-3.5 w-3.5" /> Firmar ahora <ChevronRight className="h-3 w-3" />
              </Link>
            )}
            {isFile && downloadUrl && (
              <a
                href={downloadUrl}
                download={doc.original_name ?? doc.name}
                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full border border-line-200 hover:border-brand-400 text-ink-700 text-xs font-medium"
              >
                <Download className="h-3.5 w-3.5" /> Descargar
              </a>
            )}
          </div>
        </header>

        {/* Contenido */}
        {isFile ? (
          <div className="rounded-xl border border-line-200 bg-surface p-3 sm:p-4 min-h-[60vh]">
            {isPdf && fileUrl ? (
              <iframe src={fileUrl} className="w-full h-[75vh] rounded-lg border border-line-100" title={doc.name} />
            ) : isImage && fileUrl ? (
              <img src={fileUrl} alt={doc.name} className="max-w-full mx-auto rounded-lg" />
            ) : (
              <div className="text-center py-16">
                <FileText className="h-10 w-10 mx-auto text-ink-300 mb-3" />
                <p className="text-sm text-ink-500">
                  Vista previa no disponible para este tipo de archivo.
                </p>
                {downloadUrl && (
                  <a
                    href={downloadUrl}
                    download={doc.original_name ?? doc.name}
                    className="inline-flex items-center gap-1.5 mt-4 h-9 px-4 rounded-md bg-brand-700 text-white text-xs font-medium hover:bg-brand-800"
                  >
                    <Download className="h-3.5 w-3.5" /> Descargar archivo
                  </a>
                )}
              </div>
            )}
          </div>
        ) : (
          <section className="rounded-xl border border-line-200 bg-surface overflow-hidden">
            <DocumentEditor
              initialDoc={doc.body_json ?? null}
              editable={false}
              variableContext={variable_context ?? null}
            />
          </section>
        )}

        <div className="mt-6 rounded-xl border border-line-200 bg-surface p-5 flex items-start gap-3">
          <ShieldCheck className="h-5 w-5 text-sage-500 shrink-0 mt-0.5" />
          <p className="text-xs text-ink-500 leading-relaxed">
            Este documento es de solo lectura.
            {isSigned
              ? " Tu firma electrónica fue registrada y se conserva según la Resolución 1995/1999."
              : pending_signature_request_id
                ? " Si necesitas firmarlo, usa el botón \"Firmar ahora\" arriba."
                : " Si necesitas una copia, descárgala o pídele una a tu psicóloga."}
          </p>
        </div>
      </div>
    </PortalShell>
  );
}
