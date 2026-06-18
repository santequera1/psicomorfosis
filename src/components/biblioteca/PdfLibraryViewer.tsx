import { useEffect, useMemo, useState } from "react";
import { usePDFSlick } from "@pdfslick/react";
import {
  FileText, ChevronLeft, ChevronRight, Search, Download, ZoomIn, ZoomOut,
  Maximize2, Loader2, AlertCircle, ChevronsRight,
} from "lucide-react";
import "@pdfslick/react/dist/pdf_viewer.css";
import { ensurePdfSlickSetup } from "@/lib/pdfslick-setup";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

/**
 * Pieza pesada de la biblioteca multi-PDF. Carga PDF.js + worker (~1.5MB),
 * por eso está aislada en su propio módulo para que la ruta padre la
 * cargue con React.lazy() y NO infle el bundle inicial.
 *
 * Layout 3 columnas (desktop):
 *   [ Sidebar docs ] [ Viewer + toolbar ] [ Thumbnails de páginas ]
 *
 * Mobile colapsa a la columna central; sidebar y thumbnails se acceden
 * con botones.
 */

ensurePdfSlickSetup();

export type DocRow = {
  id: string;
  name: string;
  mime: string | null;
  size_bytes?: number | null;
  status?: string | null;
  professional?: string | null;
  created_at?: string | null;
  signed_at?: string | null;
  kind?: string | null;
};

type Props = {
  docs: DocRow[];
  patientName: string;
  /** Si viene, se preselecciona ese PDF al cargar (ignorado si no es PDF). */
  initialDocId?: string | null;
};

export default function PdfLibraryViewer({ docs, patientName, initialDocId }: Props) {
  // Filtra solo los PDFs reales. Documentos del editor (kind=editor) sin
  // archivo físico no aplican; los que sean .docx/img tampoco.
  const pdfDocs = useMemo(
    () => docs.filter((d) =>
      d.mime === "application/pdf" ||
      (d.kind === "file" && /\.pdf$/i.test(d.name)),
    ),
    [docs],
  );

  // Preselección: si viene un initialDocId Y es PDF, usarlo; si no, el
  // primer PDF de la lista. Esto permite deep-link desde la ficha del
  // paciente (?doc=<id>) sin perder el comportamiento default.
  const initialId = useMemo(() => {
    if (initialDocId && pdfDocs.some((d) => d.id === initialDocId)) return initialDocId;
    return pdfDocs[0]?.id ?? null;
  }, [initialDocId, pdfDocs]);
  const [selectedId, setSelectedId] = useState<string | null>(initialId);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [thumbsOpen, setThumbsOpen] = useState(false);
  const [search, setSearch] = useState("");

  // Si el primer render fue antes de que cargaran los docs, sincronizamos.
  useEffect(() => {
    if (!selectedId && pdfDocs.length > 0) setSelectedId(pdfDocs[0].id);
  }, [pdfDocs, selectedId]);

  const selectedDoc = pdfDocs.find((d) => d.id === selectedId) ?? null;
  const fileUrl = selectedDoc ? api.documentFileUrl(selectedDoc.id, { withToken: true }) : null;

  const filteredDocs = useMemo(() => {
    if (!search.trim()) return pdfDocs;
    const q = search.toLowerCase();
    return pdfDocs.filter((d) =>
      d.name.toLowerCase().includes(q) ||
      (d.professional ?? "").toLowerCase().includes(q),
    );
  }, [pdfDocs, search]);

  if (pdfDocs.length === 0) {
    return <EmptyState patientName={patientName} totalDocs={docs.length} />;
  }

  return (
    <div className="flex h-[calc(100vh-9rem)] gap-3 px-4 sm:px-6 pb-4">
      {/* SIDEBAR — lista de PDFs */}
      <aside
        className={cn(
          "shrink-0 transition-all rounded-xl border border-line-200 bg-surface overflow-hidden flex flex-col",
          sidebarOpen ? "w-80" : "w-0 border-0",
        )}
      >
        <div className="p-3 border-b border-line-100">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-ink-400 pointer-events-none" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={`Buscar entre ${pdfDocs.length} PDFs…`}
              className="w-full h-9 pl-8 pr-2 rounded-md border border-line-200 bg-bg text-xs text-ink-900 outline-none focus:border-brand-400"
            />
          </div>
        </div>
        <ul className="flex-1 overflow-y-auto p-2 space-y-1">
          {filteredDocs.map((d) => (
            <li key={d.id}>
              <button
                type="button"
                onClick={() => setSelectedId(d.id)}
                className={cn(
                  "w-full text-left p-2.5 rounded-lg flex items-start gap-2.5 transition-colors",
                  selectedId === d.id
                    ? "bg-brand-50 border border-brand-200/70"
                    : "border border-transparent hover:bg-bg-50",
                )}
              >
                <span className={cn(
                  "h-8 w-8 rounded-md inline-flex items-center justify-center shrink-0",
                  selectedId === d.id ? "bg-brand-100 text-brand-800" : "bg-bg-100 text-ink-500",
                )}>
                  <FileText className="h-3.5 w-3.5" />
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-ink-900 truncate" title={d.name}>
                    {d.name}
                  </p>
                  <p className="text-[10px] text-ink-500 mt-0.5 truncate">
                    {humanDate(d.created_at)}
                    {d.status === "firmado" && " · Firmado"}
                  </p>
                </div>
              </button>
            </li>
          ))}
          {filteredDocs.length === 0 && (
            <li className="text-xs text-ink-500 text-center py-8">
              Sin coincidencias.
            </li>
          )}
        </ul>
      </aside>

      {/* CENTRO — Viewer */}
      <div className="flex-1 min-w-0 rounded-xl border border-line-200 bg-surface overflow-hidden flex flex-col">
        {selectedDoc && fileUrl ? (
          <ViewerPanel
            key={selectedDoc.id}
            url={fileUrl}
            doc={selectedDoc}
            onToggleSidebar={() => setSidebarOpen((v) => !v)}
            sidebarOpen={sidebarOpen}
            onToggleThumbs={() => setThumbsOpen((v) => !v)}
            thumbsOpen={thumbsOpen}
          />
        ) : (
          <div className="flex-1 flex items-center justify-center text-sm text-ink-500">
            Selecciona un PDF de la lista
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Sub-componente que monta usePDFSlick con la URL específica. Necesita
 * estar separado porque cada cambio de PDF requiere un mount nuevo —
 * usePDFSlick no soporta cambiar la URL después del mount inicial.
 * Por eso el `key={doc.id}` arriba: cuando cambias de PDF, React
 * desmonta y vuelve a montar este componente con la URL nueva.
 */
function ViewerPanel({
  url, doc, onToggleSidebar, sidebarOpen, onToggleThumbs, thumbsOpen,
}: {
  url: string;
  doc: DocRow;
  onToggleSidebar: () => void;
  sidebarOpen: boolean;
  onToggleThumbs: () => void;
  thumbsOpen: boolean;
}) {
  const {
    isDocumentLoaded, viewerRef, thumbsRef, store, usePDFSlickStore,
    PDFSlickViewer, PDFSlickThumbnails, error,
  } = usePDFSlick(url, {
    scaleValue: "page-fit",
    singlePageViewer: false,
    removePageBorders: false,
  });

  const pageNumber = usePDFSlickStore((s) => s.pageNumber);
  const numPages = usePDFSlickStore((s) => s.numPages);
  const scale = usePDFSlickStore((s) => s.scale);

  // El state expone valores observables; las acciones (paginar, zoom)
  // se invocan sobre la instancia PDFSlick guardada en `pdfSlick`.
  // Acceder vía store.getState().pdfSlick para tomar la última versión
  // sin re-renderizar el componente al cambiar.
  function goPrev() {
    const ps = store.getState();
    if (ps.pdfSlick && ps.pageNumber > 1) ps.pdfSlick.gotoPage(ps.pageNumber - 1);
  }
  function goNext() {
    const ps = store.getState();
    if (ps.pdfSlick && ps.pageNumber < ps.numPages) ps.pdfSlick.gotoPage(ps.pageNumber + 1);
  }
  function zoomIn() {
    const ps = store.getState();
    if (ps.pdfSlick) ps.pdfSlick.increaseScale();
  }
  function zoomOut() {
    const ps = store.getState();
    if (ps.pdfSlick) ps.pdfSlick.decreaseScale();
  }
  function fitPage() {
    const ps = store.getState();
    if (ps.pdfSlick) ps.pdfSlick.currentScaleValue = "page-fit";
  }
  function gotoPage(n: number) {
    const ps = store.getState();
    if (ps.pdfSlick) ps.pdfSlick.gotoPage(n);
  }

  return (
    <>
      {/* Toolbar */}
      <div className="h-12 px-3 border-b border-line-100 flex items-center gap-2 flex-wrap">
        <button
          type="button"
          onClick={onToggleSidebar}
          className="h-8 w-8 rounded-md text-ink-500 hover:bg-bg-50 inline-flex items-center justify-center"
          title={sidebarOpen ? "Ocultar lista" : "Mostrar lista"}
          aria-label="Toggle sidebar"
        >
          <ChevronsRight className={cn("h-4 w-4 transition-transform", sidebarOpen && "rotate-180")} />
        </button>
        <div className="text-xs text-ink-900 truncate flex-1 min-w-0 font-medium" title={doc.name}>
          {doc.name}
        </div>

        {isDocumentLoaded && (
          <>
            <div className="flex items-center gap-1 border-l border-line-200 pl-2">
              <button type="button" onClick={goPrev} disabled={pageNumber <= 1}
                className="h-7 w-7 rounded-md text-ink-700 hover:bg-bg-50 disabled:opacity-40 inline-flex items-center justify-center"
                title="Página anterior">
                <ChevronLeft className="h-3.5 w-3.5" />
              </button>
              <span className="text-xs text-ink-700 tabular px-1">
                {pageNumber}/{numPages}
              </span>
              <button type="button" onClick={goNext} disabled={pageNumber >= numPages}
                className="h-7 w-7 rounded-md text-ink-700 hover:bg-bg-50 disabled:opacity-40 inline-flex items-center justify-center"
                title="Página siguiente">
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>

            <div className="flex items-center gap-1 border-l border-line-200 pl-2">
              <button type="button" onClick={zoomOut}
                className="h-7 w-7 rounded-md text-ink-700 hover:bg-bg-50 inline-flex items-center justify-center"
                title="Reducir zoom">
                <ZoomOut className="h-3.5 w-3.5" />
              </button>
              <span className="text-xs text-ink-700 tabular px-1 w-12 text-center">
                {Math.round(scale * 100)}%
              </span>
              <button type="button" onClick={zoomIn}
                className="h-7 w-7 rounded-md text-ink-700 hover:bg-bg-50 inline-flex items-center justify-center"
                title="Aumentar zoom">
                <ZoomIn className="h-3.5 w-3.5" />
              </button>
              <button type="button" onClick={fitPage}
                className="h-7 w-7 rounded-md text-ink-700 hover:bg-bg-50 inline-flex items-center justify-center"
                title="Ajustar a página">
                <Maximize2 className="h-3.5 w-3.5" />
              </button>
            </div>
          </>
        )}

        <div className="flex items-center gap-1 border-l border-line-200 pl-2">
          <button
            type="button"
            onClick={onToggleThumbs}
            className={cn(
              "h-7 px-2 rounded-md text-xs inline-flex items-center gap-1 transition-colors",
              thumbsOpen
                ? "bg-brand-50 text-brand-800 border border-brand-200/70"
                : "text-ink-700 hover:bg-bg-50",
            )}
            title="Miniaturas de páginas"
          >
            Páginas
          </button>
          <a
            href={api.documentFileUrl(doc.id, { download: true, withToken: true })}
            className="h-7 px-2 rounded-md text-xs text-ink-700 hover:bg-bg-50 inline-flex items-center gap-1"
            title="Descargar PDF"
          >
            <Download className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Descargar</span>
          </a>
        </div>
      </div>

      {/* Viewer area */}
      <div className="flex-1 flex min-h-0">
        {/* Thumbnails de páginas del PDF actual */}
        {thumbsOpen && isDocumentLoaded && (
          <div className="w-32 shrink-0 border-r border-line-100 bg-bg-50 overflow-y-auto p-2">
            <PDFSlickThumbnails
              thumbsRef={thumbsRef}
              usePDFSlickStore={usePDFSlickStore}
              className="space-y-1.5"
            >
              {({ pageNumber: pn, src, width, height, loaded }) => (
                <button
                  type="button"
                  onClick={() => gotoPage(pn)}
                  className={cn(
                    "w-full rounded border-2 transition-colors flex flex-col items-center p-1",
                    pn === pageNumber
                      ? "border-brand-700 bg-brand-50"
                      : "border-transparent hover:border-line-200",
                  )}
                >
                  <div
                    className="bg-white shadow-sm flex items-center justify-center overflow-hidden"
                    style={{ width: width / 2, height: height / 2 }}
                  >
                    {loaded && src ? (
                      <img src={src} alt={`Página ${pn}`} className="w-full h-full object-contain" />
                    ) : (
                      <Loader2 className="h-3 w-3 animate-spin text-ink-400" />
                    )}
                  </div>
                  <span className="text-[10px] text-ink-500 mt-1">{pn}</span>
                </button>
              )}
            </PDFSlickThumbnails>
          </div>
        )}

        {/* PDF render */}
        <div className="flex-1 min-w-0 relative bg-bg-50">
          {error ? (
            <div className="absolute inset-0 flex items-center justify-center p-6">
              <div className="text-center max-w-md">
                <AlertCircle className="h-8 w-8 text-rose-600 mx-auto mb-2" />
                <p className="text-sm text-ink-900 font-medium">No se pudo cargar el PDF</p>
                <p className="text-xs text-ink-500 mt-1">{String((error as { message?: string }).message ?? error)}</p>
              </div>
            </div>
          ) : !isDocumentLoaded ? (
            <div className="absolute inset-0 flex items-center justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-ink-400" />
            </div>
          ) : null}
          <PDFSlickViewer
            viewerRef={viewerRef}
            usePDFSlickStore={usePDFSlickStore}
            className="absolute inset-0"
          />
        </div>
      </div>
    </>
  );
}

function EmptyState({ patientName, totalDocs }: { patientName: string; totalDocs: number }) {
  return (
    <div className="px-4 sm:px-6 pb-6">
      <div className="rounded-xl border border-dashed border-line-200 p-10 text-center">
        <FileText className="h-8 w-8 text-ink-400 mx-auto mb-3" />
        <h3 className="font-serif text-lg text-ink-900">Sin PDFs para mostrar</h3>
        <p className="text-sm text-ink-500 mt-1 max-w-md mx-auto leading-relaxed">
          {patientName} tiene {totalDocs} documento{totalDocs === 1 ? "" : "s"} en total, pero
          ninguno es un PDF. La biblioteca multi-PDF solo muestra archivos PDF —
          los demás (Word, imágenes, documentos del editor) se ven con su viewer
          habitual desde la lista de documentos.
        </p>
      </div>
    </div>
  );
}

function humanDate(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleDateString("es-CO", { day: "numeric", month: "short", year: "numeric" });
}
