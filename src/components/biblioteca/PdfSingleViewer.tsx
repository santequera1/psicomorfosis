import { useState } from "react";
import { usePDFSlick } from "@pdfslick/react";
import {
  ChevronLeft, ChevronRight, ZoomIn, ZoomOut, Maximize2,
  Loader2, AlertCircle,
} from "lucide-react";
import "@pdfslick/react/dist/pdf_viewer.css";
import { ensurePdfSlickSetup } from "@/lib/pdfslick-setup";
import { cn } from "@/lib/utils";

/**
 * Viewer single-PDF integrado con el tema de la app. Usado desde
 * /documentos/$id como reemplazo del iframe del browser cuando el doc
 * es PDF. Mismo motor que la biblioteca multi-PDF (PDFSlick + PDF.js
 * worker) — solo cambia que acá no hay sidebar de docs.
 *
 * Lazy-loaded por el caller (React.lazy + Suspense) para no inflar el
 * bundle inicial.
 */

ensurePdfSlickSetup();

type Props = {
  url: string;
  /** Solo para alt/title. */
  name?: string;
  /** Altura mínima del área de render. Default 80vh. */
  minHeight?: string;
};

export default function PdfSingleViewer({ url, name, minHeight = "80vh" }: Props) {
  const [thumbsOpen, setThumbsOpen] = useState(false);

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
    <div
      className="rounded-lg border border-line-100 bg-surface overflow-hidden flex flex-col"
      style={{ minHeight }}
    >
      {/* Toolbar */}
      <div className="h-11 px-3 border-b border-line-100 flex items-center gap-2 flex-wrap shrink-0">
        {isDocumentLoaded && (
          <>
            <div className="flex items-center gap-1">
              <button type="button" onClick={goPrev} disabled={pageNumber <= 1}
                className="h-7 w-7 rounded-md text-ink-700 hover:bg-bg-50 disabled:opacity-40 inline-flex items-center justify-center"
                title="Página anterior" aria-label="Anterior">
                <ChevronLeft className="h-3.5 w-3.5" />
              </button>
              <span className="text-xs text-ink-700 tabular px-1">
                {pageNumber}/{numPages}
              </span>
              <button type="button" onClick={goNext} disabled={pageNumber >= numPages}
                className="h-7 w-7 rounded-md text-ink-700 hover:bg-bg-50 disabled:opacity-40 inline-flex items-center justify-center"
                title="Página siguiente" aria-label="Siguiente">
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>

            <div className="flex items-center gap-1 border-l border-line-200 pl-2">
              <button type="button" onClick={zoomOut}
                className="h-7 w-7 rounded-md text-ink-700 hover:bg-bg-50 inline-flex items-center justify-center"
                title="Reducir zoom" aria-label="Reducir zoom">
                <ZoomOut className="h-3.5 w-3.5" />
              </button>
              <span className="text-xs text-ink-700 tabular px-1 w-12 text-center">
                {Math.round(scale * 100)}%
              </span>
              <button type="button" onClick={zoomIn}
                className="h-7 w-7 rounded-md text-ink-700 hover:bg-bg-50 inline-flex items-center justify-center"
                title="Aumentar zoom" aria-label="Aumentar zoom">
                <ZoomIn className="h-3.5 w-3.5" />
              </button>
              <button type="button" onClick={fitPage}
                className="h-7 w-7 rounded-md text-ink-700 hover:bg-bg-50 inline-flex items-center justify-center"
                title="Ajustar a página" aria-label="Ajustar a página">
                <Maximize2 className="h-3.5 w-3.5" />
              </button>
            </div>

            <div className="flex items-center gap-1 border-l border-line-200 pl-2 ml-auto">
              <button
                type="button"
                onClick={() => setThumbsOpen((v) => !v)}
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
            </div>
          </>
        )}
      </div>

      {/* Viewer area */}
      <div className="flex-1 flex min-h-0">
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

        <div className="flex-1 min-w-0 relative bg-bg-50">
          {error ? (
            <div className="absolute inset-0 flex items-center justify-center p-6">
              <div className="text-center max-w-md">
                <AlertCircle className="h-8 w-8 text-rose-600 mx-auto mb-2" />
                <p className="text-sm text-ink-900 font-medium">No se pudo cargar el PDF</p>
                <p className="text-xs text-ink-500 mt-1">
                  {String((error as { message?: string }).message ?? error)}
                </p>
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
    </div>
  );
}
