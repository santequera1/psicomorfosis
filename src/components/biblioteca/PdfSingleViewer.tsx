import { useCallback, useEffect, useRef, useState } from "react";
import { usePDFSlick } from "@pdfslick/react";
import {
  ChevronLeft, ChevronRight, ZoomIn, ZoomOut, Maximize2,
  Loader2, AlertCircle, Search, RotateCw, Presentation,
  BookOpen, Columns, FileText, X,
} from "lucide-react";
import "@pdfslick/react/dist/pdf_viewer.css";
import { ensurePdfSlickSetup } from "@/lib/pdfslick-setup";
import { cn } from "@/lib/utils";

/**
 * Viewer single-PDF integrado con el tema de la app. Usado desde
 * /documentos/$id para PDFs sin patient_id (los que sí tienen paciente
 * redirigen a /pacientes/$id/biblioteca con sidebar de todos sus PDFs).
 *
 * Mismas features que la biblioteca multi: paginación, zoom, búsqueda
 * en texto, rotación, spread, presentación, thumbnails. Sin sidebar de
 * docs porque acá es single.
 */

ensurePdfSlickSetup();

type Props = {
  url: string;
  name?: string;
  minHeight?: string;
};

export default function PdfSingleViewer({ url, name, minHeight = "80vh" }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [thumbsOpen, setThumbsOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Zoom inicial: 85% en desktop, page-fit en mobile (consistente con
  // la biblioteca multi).
  const initialScale = typeof window !== "undefined"
    && window.matchMedia("(min-width: 1024px)").matches
    ? "0.85"
    : "page-fit";

  const {
    isDocumentLoaded, viewerRef, thumbsRef, store, usePDFSlickStore,
    PDFSlickViewer, PDFSlickThumbnails, error,
  } = usePDFSlick(url, {
    scaleValue: initialScale,
    singlePageViewer: false,
    removePageBorders: false,
  });

  const pageNumber = usePDFSlickStore((s) => s.pageNumber);
  const numPages = usePDFSlickStore((s) => s.numPages);
  const scale = usePDFSlickStore((s) => s.scale);
  const spreadMode = usePDFSlickStore((s) => s.spreadMode);

  const goPrev = useCallback(() => {
    const ps = store.getState();
    if (ps.pdfSlick && ps.pageNumber > 1) ps.pdfSlick.gotoPage(ps.pageNumber - 1);
  }, [store]);
  const goNext = useCallback(() => {
    const ps = store.getState();
    if (ps.pdfSlick && ps.pageNumber < ps.numPages) ps.pdfSlick.gotoPage(ps.pageNumber + 1);
  }, [store]);
  const zoomIn = useCallback(() => store.getState().pdfSlick?.increaseScale(), [store]);
  const zoomOut = useCallback(() => store.getState().pdfSlick?.decreaseScale(), [store]);
  const fitPage = useCallback(() => {
    const ps = store.getState();
    if (ps.pdfSlick) ps.pdfSlick.currentScaleValue = "page-fit";
  }, [store]);
  const gotoPage = useCallback((n: number) => store.getState().pdfSlick?.gotoPage(n), [store]);
  const rotate = useCallback(() => {
    const ps = store.getState();
    if (ps.pdfSlick) {
      const next = (ps.pagesRotation + 90) % 360;
      ps.pdfSlick.setRotation(next);
    }
  }, [store]);
  const cycleSpread = useCallback(() => {
    const ps = store.getState();
    if (!ps.pdfSlick) return;
    const next = (spreadMode + 1) % 3;
    ps.pdfSlick.setSpreadMode(next);
  }, [store, spreadMode]);

  const runSearch = useCallback((term: string, direction: "forward" | "backward" = "forward") => {
    const ps = store.getState();
    const pdfSlick = ps.pdfSlick;
    if (!pdfSlick) return;
    const eb = (pdfSlick as unknown as { eventBus?: { dispatch: (name: string, args: object) => void } }).eventBus;
    if (!eb) return;
    eb.dispatch("find", {
      type: "",
      query: term,
      caseSensitive: false,
      highlightAll: true,
      findPrevious: direction === "backward",
    });
  }, [store]);

  const searchTimer = useRef<number | null>(null);
  useEffect(() => {
    if (!searchOpen) return;
    if (searchTimer.current) window.clearTimeout(searchTimer.current);
    searchTimer.current = window.setTimeout(() => runSearch(searchTerm), 250);
    return () => {
      if (searchTimer.current) window.clearTimeout(searchTimer.current);
    };
  }, [searchTerm, searchOpen, runSearch]);

  useEffect(() => {
    if (!searchOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setSearchOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [searchOpen]);

  const togglePresent = useCallback(() => {
    if (!document.fullscreenElement) {
      containerRef.current?.requestFullscreen?.().catch(() => {});
    } else {
      document.exitFullscreen?.();
    }
  }, []);
  useEffect(() => {
    const onChange = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  return (
    <div
      ref={containerRef}
      className={cn(
        "rounded-lg border border-line-100 bg-surface overflow-hidden flex flex-col",
        isFullscreen && "rounded-none border-0",
      )}
      style={{ minHeight }}
    >
      {/* Toolbar */}
      <div className="border-b border-line-100 shrink-0">
        <div className="h-11 px-2 sm:px-3 flex items-center gap-1 sm:gap-2 flex-nowrap overflow-x-auto">
          {isDocumentLoaded && (
            <>
              <div className="flex items-center gap-0.5 shrink-0">
                <button type="button" onClick={goPrev} disabled={pageNumber <= 1}
                  className="h-7 w-7 rounded-md text-ink-700 hover:bg-bg-50 disabled:opacity-40 inline-flex items-center justify-center"
                  title="Página anterior">
                  <ChevronLeft className="h-3.5 w-3.5" />
                </button>
                <span className="text-xs text-ink-700 tabular px-1 whitespace-nowrap">
                  {pageNumber}/{numPages}
                </span>
                <button type="button" onClick={goNext} disabled={pageNumber >= numPages}
                  className="h-7 w-7 rounded-md text-ink-700 hover:bg-bg-50 disabled:opacity-40 inline-flex items-center justify-center"
                  title="Página siguiente">
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>

              <div className="hidden sm:flex items-center gap-0.5 border-l border-line-200 pl-2 shrink-0">
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

              <div className="flex items-center gap-0.5 border-l border-line-200 pl-1 sm:pl-2 shrink-0 ml-auto">
                <button type="button" onClick={() => setSearchOpen((v) => !v)}
                  className={cn(
                    "h-7 w-7 rounded-md inline-flex items-center justify-center",
                    searchOpen ? "bg-brand-50 text-brand-800" : "text-ink-700 hover:bg-bg-50",
                  )}
                  title="Buscar en el documento">
                  <Search className="h-3.5 w-3.5" />
                </button>
                <button type="button" onClick={rotate}
                  className="h-7 w-7 rounded-md text-ink-700 hover:bg-bg-50 inline-flex items-center justify-center"
                  title="Rotar 90°">
                  <RotateCw className="h-3.5 w-3.5" />
                </button>
                <button type="button" onClick={cycleSpread}
                  className={cn(
                    "h-7 w-7 rounded-md inline-flex items-center justify-center",
                    spreadMode !== 0 ? "bg-brand-50 text-brand-800" : "text-ink-700 hover:bg-bg-50",
                  )}
                  title={spreadMode === 0 ? "Vista de 2 páginas" : "Cambiar disposición"}>
                  {spreadMode === 0 ? <BookOpen className="h-3.5 w-3.5" /> : <Columns className="h-3.5 w-3.5" />}
                </button>
                <button type="button" onClick={togglePresent}
                  className="h-7 w-7 rounded-md text-ink-700 hover:bg-bg-50 inline-flex items-center justify-center"
                  title={isFullscreen ? "Salir de pantalla completa" : "Modo presentación"}>
                  <Presentation className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setThumbsOpen((v) => !v)}
                  className={cn(
                    "h-7 w-7 rounded-md inline-flex items-center justify-center",
                    thumbsOpen ? "bg-brand-50 text-brand-800" : "text-ink-700 hover:bg-bg-50",
                  )}
                  title="Miniaturas de páginas"
                >
                  <FileText className="h-3.5 w-3.5" />
                </button>
              </div>
            </>
          )}
        </div>

        {searchOpen && (
          <div className="px-2 sm:px-3 py-2 border-t border-line-100 bg-bg-50 flex items-center gap-2">
            <Search className="h-3.5 w-3.5 text-ink-400 shrink-0" />
            <input
              autoFocus
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar en el documento…"
              className="flex-1 h-8 px-2 rounded-md border border-line-200 bg-surface text-xs text-ink-900 outline-none focus:border-brand-400"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  runSearch(searchTerm, e.shiftKey ? "backward" : "forward");
                }
              }}
            />
            <button
              type="button"
              onClick={() => runSearch(searchTerm, "backward")}
              className="h-7 w-7 rounded-md text-ink-700 hover:bg-surface inline-flex items-center justify-center"
              title="Anterior (Shift+Enter)"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => runSearch(searchTerm, "forward")}
              className="h-7 w-7 rounded-md text-ink-700 hover:bg-surface inline-flex items-center justify-center"
              title="Siguiente (Enter)"
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => { setSearchOpen(false); setSearchTerm(""); }}
              className="h-7 w-7 rounded-md text-ink-700 hover:bg-surface inline-flex items-center justify-center"
              title="Cerrar (Esc)"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </div>

      {/* Viewer area */}
      <div className="flex-1 flex min-h-0">
        {thumbsOpen && isDocumentLoaded && (
          <div className="hidden sm:block w-32 shrink-0 border-r border-line-100 bg-bg-50 overflow-y-auto p-2">
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
                {name && <p className="text-xs text-ink-400 mt-2">{name}</p>}
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
