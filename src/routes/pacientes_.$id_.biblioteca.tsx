import { createFileRoute, Link, useParams, useNavigate } from "@tanstack/react-router";
import { lazy, Suspense } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Loader2 } from "lucide-react";
import { AppShell } from "@/components/app/AppShell";
import { api } from "@/lib/api";
import { displayPatientName } from "@/lib/utils";
import type { DocRow } from "@/components/biblioteca/PdfLibraryViewer";

/**
 * Vista fullscreen "Biblioteca de PDFs" del paciente.
 *
 * El componente pesado (PdfLibraryViewer + PDF.js + worker, ~1.5MB)
 * se carga con React.lazy + Suspense. Eso mantiene el bundle inicial
 * intacto — solo paga el costo quien entra a esta ruta.
 */
const PdfLibraryViewer = lazy(() => import("@/components/biblioteca/PdfLibraryViewer"));

export const Route = createFileRoute("/pacientes_/$id_/biblioteca")({
  head: ({ params }: { params: { id: string } }) => ({
    meta: [{ title: `Biblioteca · ${params.id} · Psicomorfosis` }],
  }),
  // ?doc=<id> permite deep-link a un PDF específico desde la lista de
  // documentos del paciente. Si no viene, la biblioteca abre el primer
  // PDF disponible automáticamente.
  validateSearch: (s): { doc?: string } => {
    const v = (s as { doc?: unknown }).doc;
    return typeof v === "string" && v.length > 0 ? { doc: v } : {};
  },
  component: BibliotecaPage,
});

function BibliotecaPage() {
  const { id } = useParams({ from: "/pacientes_/$id_/biblioteca" });
  const search = Route.useSearch();
  const navigate = useNavigate();

  const { data: patient, isLoading: loadingPatient } = useQuery({
    queryKey: ["patient", id],
    queryFn: () => api.getPatient(id),
  });
  const { data: docs = [], isLoading: loadingDocs } = useQuery({
    queryKey: ["documents", { patient_id: id }],
    queryFn: () => api.listDocuments({ patient_id: id }),
  });

  if (loadingPatient || loadingDocs) {
    return (
      <AppShell>
        <div className="flex items-center justify-center h-[60vh] text-ink-500">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      </AppShell>
    );
  }
  if (!patient) {
    return (
      <AppShell>
        <div className="p-6 text-center text-sm text-ink-500">
          Paciente no encontrado.
          <Link to="/pacientes" className="block mt-2 text-brand-700">Volver a pacientes</Link>
        </div>
      </AppShell>
    );
  }

  const patientName = displayPatientName(patient);

  return (
    <AppShell>
      <div className="space-y-4">
        {/* Header compacto: navegación + título */}
        <header className="px-4 sm:px-6 pt-6 flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => navigate({ to: "/pacientes/$id", params: { id } })}
              className="h-9 w-9 rounded-md border border-line-200 text-ink-500 hover:border-brand-400 inline-flex items-center justify-center"
              aria-label="Volver al paciente"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
            <div className="min-w-0">
              <p className="text-[11px] uppercase tracking-widest text-brand-800 font-medium">
                Biblioteca documental
              </p>
              <h1 className="font-serif text-lg sm:text-xl text-ink-900 truncate">
                {patientName}
              </h1>
            </div>
          </div>
          <p className="text-xs text-ink-500">
            {docs.length} documento{docs.length === 1 ? "" : "s"} en total
          </p>
        </header>

        <Suspense
          fallback={
            <div className="flex flex-col items-center justify-center h-[60vh] text-ink-500 gap-2">
              <Loader2 className="h-5 w-5 animate-spin" />
              <p className="text-xs">Cargando viewer de PDFs…</p>
            </div>
          }
        >
          <PdfLibraryViewer
            docs={docs as unknown as DocRow[]}
            patientName={patientName}
            initialDocId={search.doc ?? null}
          />
        </Suspense>
      </div>
    </AppShell>
  );
}
