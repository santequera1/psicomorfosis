import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePDFSlick } from "@pdfslick/react";
import {
  FileText, FileEdit, ChevronLeft, ChevronRight, Search, Download,
  ZoomIn, ZoomOut, Maximize2, Loader2, AlertCircle, ChevronsRight,
  Menu as MenuIcon, X, RotateCw, Presentation, BookOpen, Columns,
} from "lucide-react";
import "@pdfslick/react/dist/pdf_viewer.css";
import { ensurePdfSlickSetup } from "@/lib/pdfslick-setup";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

/**
 * Biblioteca multi-PDF. Carga PDF.js + worker (~1.5MB) por lo que el
 * caller la importa con React.lazy() para mantener el bundle inicial.
 *
 * Layout responsive:
 *   Desktop (lg+): 3 columnas [ sidebar docs | viewer | thumbnails pags ]
 *   Mobile:        sidebar y thumbnails como overlays con backdrop. El
 *                  viewer ocupa toda la pantalla.
 *
 * Acepta:
 *   - PDFs reales (kind=file, mime=application/pdf)
 *   - Documentos del editor (kind=editor) — se renderizan como PDF
 *     mediante el endpoint /api/documents/:id/pdf (generado on-the-fly
 *     server-side). Solo lectura desde acá; el icono indica que para
 *     editarlos hay que ir a /documentos/:id.
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
  /** Si viene, se preselecciona ese doc al cargar (PDF o editor). */
  initialDocId?: string | null;
};

/** ¿Se puede mostrar en la biblioteca? PDFs reales o editor docs (renderizados a PDF). */
function isViewable(d: DocRow): boolean {
  if (d.mime === "application/pdf") return true;
  if (d.kind === "file" && /\.pdf$/i.test(d.name ?? "")) return true;
  if (d.kind === "editor") return true; // se renderiza vía /pdf endpoint
  return false;
}

function isEditor(d: DocRow): boolean {
  return d.kind === "editor";
}

export default function PdfLibraryViewer({ docs, patientName, initialDocId }: Props) {
  // Lista filtrada de documentos viewables (PDFs + editor docs).
  const viewableDocs = useMemo(() => docs.filter(isViewable), [docs]);

  const initialId = useMemo(() => {
    if (initialDocId && viewableDocs.some((d) => d.id === initialDocId)) return initialDocId;
    return viewableDocs[0]?.id ?? null;
  }, [initialDocId, viewableDocs]);

  const [selectedId, setSelectedId] = useState<string | null>(initialId);

  // sidebar default: abierta en desktop, cerrada en mobile (para no
  // tapar el viewer al cargar). Detectamos viewport en mount con
  // window.matchMedia — si SSR llega antes, default a true.
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [thumbsOpen, setThumbsOpen] = useState(false);
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (typeof window === "undefined") return;
    const isDesktop = window.matchMedia("(min-width: 1024px)").matches;
    setSidebarOpen(isDesktop);
  }, []);

  useEffect(() => {
    if (!selectedId && viewableDocs.length > 0) setSelectedId(viewableDocs[0].id);
  }, [viewableDocs, selectedId]);

  // Al seleccionar un doc en mobile, cerrar la sidebar para liberar el viewer.
  function selectDoc(id: string) {
    setSelectedId(id);
    if (typeof window !== "undefined") {
      const isMobile = !window.matchMedia("(min-width: 1024px)").matches;
      if (isMobile) setSidebarOpen(false);
    }
  }

  const selectedDoc = viewableDocs.find((d) => d.id === selectedId) ?? null;

  const filteredDocs = useMemo(() => {
    if (!search.trim()) return viewableDocs;
    const q = search.toLowerCase();
    return viewableDocs.filter((d) =>
      d.name.toLowerCase().includes(q) ||
      (d.professional ?? "").toLowerCase().includes(q),
    );
  }, [viewableDocs, search]);

  if (viewableDocs.length === 0) {
    return <EmptyState patientName={patientName} totalDocs={docs.length} />;
  }

  return (
    <div className="relative flex h-[calc(100vh-9rem)] gap-3 px-2 sm:px-6 pb-4">
      {/* Backdrop mobile cuando sidebar está abierta. Click cierra. */}
      {sidebarOpen && (
        <div
          className="lg:hidden fixed inset-0 z-20 bg-ink-900/40 backdrop-blur-sm"
          onClick={() => setSidebarOpen(false)}
          aria-hidden
        />
      )}

      {/* SIDEBAR — lista de docs */}
      <aside
        className={cn(
          "rounded-xl border border-line-200 bg-surface overflow-hidden flex flex-col transition-transform",
          // Mobile: overlay fijo
          "fixed inset-y-4 left-2 z-30 w-72 max-w-[85vw] shadow-2xl",
          sidebarOpen ? "translate-x-0" : "-translate-x-[120%]",
          // Desktop: posición normal en el flex, sin overlay
          "lg:relative lg:inset-auto lg:left-auto lg:translate-x-0 lg:shadow-none lg:z-auto lg:transition-all",
          sidebarOpen ? "lg:w-80" : "lg:w-0 lg:border-0",
        )}
      >
        <div className="p-3 border-b border-line-100 flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-ink-400 pointer-events-none" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={`Buscar entre ${viewableDocs.length} doc${viewableDocs.length === 1 ? "" : "s"}…`}
              className="w-full h-9 pl-8 pr-2 rounded-md border border-line-200 bg-bg text-xs text-ink-900 outline-none focus:border-brand-400"
            />
          </div>
          {/* Cerrar sidebar — solo en mobile */}
          <button
            type="button"
            onClick={() => setSidebarOpen(false)}
            className="lg:hidden h-8 w-8 rounded-md text-ink-500 hover:bg-bg-50 inline-flex items-center justify-center"
            aria-label="Cerrar lista"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <ul className="flex-1 overflow-y-auto p-2 space-y-1">
          {filteredDocs.map((d) => {
            const editor = isEditor(d);
            return (
              <li key={d.id}>
                <button
                  type="button"
                  onClick={() => selectDoc(d.id)}
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
                    {editor ? <FileEdit className="h-3.5 w-3.5" /> : <FileText className="h-3.5 w-3.5" />}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-ink-900 truncate" title={d.name}>
                      {d.name}
                    </p>
                    <p className="text-[10px] text-ink-500 mt-0.5 truncate">
                      {humanDate(d.created_at)}
                      {d.status === "firmado" && " · Firmado"}
                      {editor && " · Editor"}
                    </p>
                  </div>
                </button>
              </li>
            );
          })}
          {filteredDocs.length === 0 && (
            <li className="text-xs text-ink-500 text-center py-8">
              Sin coincidencias.
            </li>
          )}
        </ul>
      </aside>

      {/* CENTRO — Viewer */}
      <div className="flex-1 min-w-0 rounded-xl border border-line-200 bg-surface overflow-hidden flex flex-col">
        {selectedDoc ? (
          <ViewerPanel
            key={selectedDoc.id}
            doc={selectedDoc}
            onToggleSidebar={() => setSidebarOpen((v) => !v)}
            sidebarOpen={sidebarOpen}
            onToggleThumbs={() => setThumbsOpen((v) => !v)}
            thumbsOpen={thumbsOpen}
          />
        ) : (
          <div className="flex-1 flex items-center justify-center text-sm text-ink-500">
            Selecciona un documento
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Sub-componente que monta usePDFSlick. Necesita estar separado porque
 * cada cambio de doc requiere un mount nuevo (key={doc.id}). Maneja:
 *   - Carga de PDFs físicos vía URL
 *   - Carga de docs del editor vía fetch /pdf → ArrayBuffer
 *   - Toolbar con: navegación, zoom, búsqueda, rotación, spread,
 *     thumbnails, presentación, descarga
 *   - Modo presentación (fullscreen API + auto-hide chrome)
 */
function ViewerPanel({
  doc, onToggleSidebar, sidebarOpen, onToggleThumbs, thumbsOpen,
}: {
  doc: DocRow;
  onToggleSidebar: () => void;
  sidebarOpen: boolean;
  onToggleThumbs: () => void;
  thumbsOpen: boolean;
}) {
  const editorMode = isEditor(doc);

  // Source: URL para PDFs físicos, ArrayBuffer para editor docs.
  // El hook acepta ambos. Mientras carga el editor doc, pasamos
  // undefined y mostramos loader.
  const fileUrl = !editorMode ? api.documentFileUrl(doc.id, { withToken: true }) : null;
  const [editorBuffer, setEditorBuffer] = useState<ArrayBuffer | null>(null);
  const [editorError, setEditorError] = useState<string | null>(null);

  useEffect(() => {
    if (!editorMode) return;
    let cancelled = false;
    setEditorBuffer(null);
    setEditorError(null);
    api.downloadDocumentPdf(doc.id)
      .then(async (blob) => {
        if (cancelled) return;
        const buf = await blob.arrayBuffer();
        if (!cancelled) setEditorBuffer(buf);
      })
      .catch((err: Error) => {
        if (!cancelled) setEditorError(err.message ?? "No se pudo generar el PDF del documento");
      });
    return () => { cancelled = true; };
  }, [doc.id, editorMode]);

  const source = editorMode ? (editorBuffer ?? undefined) : fileUrl ?? undefined;

  // Zoom inicial: 85% en desktop (Nathaly pidió ese default — page-fit
  // dejaba el PDF muy chico en monitores grandes); page-fit en mobile
  // para que se vea entero sin scroll horizontal.
  const initialScale = typeof window !== "undefined"
    && window.matchMedia("(min-width: 1024px)").matches
    ? "0.85"
    : "page-fit";

  const {
    isDocumentLoaded, viewerRef, thumbsRef, store, usePDFSlickStore,
    PDFSlickViewer, PDFSlickThumbnails, error,
  } = usePDFSlick(source, {
    scaleValue: initialScale,
    singlePageViewer: false,
    removePageBorders: false,
  });

  const pageNumber = usePDFSlickStore((s) => s.pageNumber);
  const numPages = usePDFSlickStore((s) => s.numPages);
  const scale = usePDFSlickStore((s) => s.scale);
  const spreadMode = usePDFSlickStore((s) => s.spreadMode);

  // ─── Acciones ──────────────────────────────────────────────────────
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

  // Rotación: 0 → 90 → 180 → 270 → 0
  const rotate = useCallback(() => {
    const ps = store.getState();
    if (ps.pdfSlick) {
      const next = (ps.pagesRotation + 90) % 360;
      ps.pdfSlick.setRotation(next);
    }
  }, [store]);

  // Spread mode: 0=none, 1=odd-start, 2=even-start. Ciclamos none→odd→even→none.
  const cycleSpread = useCallback(() => {
    const ps = store.getState();
    if (!ps.pdfSlick) return;
    const next = (spreadMode + 1) % 3;
    ps.pdfSlick.setSpreadMode(next);
  }, [store, spreadMode]);

  // ─── Búsqueda en el texto ──────────────────────────────────────────
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");

  const runSearch = useCallback((term: string, direction: "forward" | "backward" = "forward") => {
    const ps = store.getState();
    const pdfSlick = ps.pdfSlick;
    if (!pdfSlick) return;
    // PDFSlick expone find vía eventBus. La firma es coherente con pdf.js:
    //   { type, query, caseSensitive, highlightAll, findPrevious }
    // type "" dispara nueva búsqueda; "again" reusa la query para next/prev.
    const eb = (pdfSlick as unknown as { eventBus?: { dispatch: (name: string, args: object) => void } }).eventBus;
    if (!eb) return;
    eb.dispatch("find", {
      type: term ? "" : "",
      query: term,
      caseSensitive: false,
      highlightAll: true,
      findPrevious: direction === "backward",
    });
  }, [store]);

  // Cada cambio en searchTerm dispara una búsqueda nueva (debounced 250ms).
  const searchTimer = useRef<number | null>(null);
  useEffect(() => {
    if (!searchOpen) return;
    if (searchTimer.current) window.clearTimeout(searchTimer.current);
    searchTimer.current = window.setTimeout(() => runSearch(searchTerm), 250);
    return () => {
      if (searchTimer.current) window.clearTimeout(searchTimer.current);
    };
  }, [searchTerm, searchOpen, runSearch]);

  // Cerrar búsqueda con Esc
  useEffect(() => {
    if (!searchOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSearchOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [searchOpen]);

  // ─── Modo presentación ────────────────────────────────────────────
  const containerRef = useRef<HTMLDivElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const togglePresent = useCallback(() => {
    if (!document.fullscreenElement) {
      containerRef.current?.requestFullscreen?.().catch(() => {
        // Algunos browsers requieren gesto reciente. Si falla, no-op.
      });
    } else {
      document.exitFullscreen?.();
    }
  }, []);
  useEffect(() => {
    const onChange = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  const downloadUrl = editorMode
    ? null // editor doc no tiene archivo directo; el botón llama al fetch
    : api.documentFileUrl(doc.id, { download: true, withToken: true });

  return (
    <div ref={containerRef} className={cn("flex flex-col flex-1 min-h-0 bg-surface", isFullscreen && "bg-ink-900")}>
      {/* Toolbar */}
      <div className="border-b border-line-100 shrink-0">
        <div className="h-12 px-2 sm:px-3 flex items-center gap-1 sm:gap-2 flex-nowrap overflow-x-auto">
          {/* Toggle sidebar */}
          <button
            type="button"
            onClick={onToggleSidebar}
            className="h-8 w-8 rounded-md text-ink-500 hover:bg-bg-50 inline-flex items-center justify-center shrink-0"
            title={sidebarOpen ? "Ocultar lista" : "Mostrar lista"}
            aria-label="Toggle sidebar"
          >
            <MenuIcon className="lg:hidden h-4 w-4" />
            <ChevronsRight className={cn("hidden lg:block h-4 w-4 transition-transform", sidebarOpen && "rotate-180")} />
          </button>

          {/* Título — se trunca con elipsis cuando no cabe */}
          <div className="text-xs text-ink-900 truncate flex-1 min-w-0 font-medium hidden sm:block" title={doc.name}>
            {doc.name}
          </div>

          {isDocumentLoaded && (
            <>
              {/* Paginación */}
              <div className="flex items-center gap-0.5 border-l border-line-200 pl-1 sm:pl-2 shrink-0">
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

              {/* Zoom — oculto en pantallas muy chicas */}
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

              {/* Acciones extras */}
              <div className="flex items-center gap-0.5 border-l border-line-200 pl-1 sm:pl-2 shrink-0">
                <button type="button" onClick={() => setSearchOpen((v) => !v)}
                  className={cn(
                    "h-7 w-7 rounded-md inline-flex items-center justify-center",
                    searchOpen ? "bg-brand-50 text-brand-800" : "text-ink-700 hover:bg-bg-50",
                  )}
                  title="Buscar en el documento (Ctrl+F)">
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
                  title={spreadMode === 0 ? "Vista de 2 páginas" : spreadMode === 1 ? "Vista par-impar" : "Vista de 1 página"}>
                  {spreadMode === 0 ? <BookOpen className="h-3.5 w-3.5" /> : <Columns className="h-3.5 w-3.5" />}
                </button>
                <button type="button" onClick={togglePresent}
                  className="h-7 w-7 rounded-md text-ink-700 hover:bg-bg-50 inline-flex items-center justify-center"
                  title={isFullscreen ? "Salir de pantalla completa" : "Modo presentación"}>
                  <Presentation className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => onToggleThumbs()}
                  className={cn(
                    "h-7 w-7 rounded-md inline-flex items-center justify-center",
                    thumbsOpen ? "bg-brand-50 text-brand-800" : "text-ink-700 hover:bg-bg-50",
                  )}
                  title="Miniaturas de páginas"
                >
                  <FileText className="h-3.5 w-3.5" />
                </button>
                {downloadUrl ? (
                  <a
                    href={downloadUrl}
                    className="h-7 w-7 rounded-md text-ink-700 hover:bg-bg-50 inline-flex items-center justify-center"
                    title="Descargar PDF"
                  >
                    <Download className="h-3.5 w-3.5" />
                  </a>
                ) : (
                  <DownloadEditorButton docId={doc.id} docName={doc.name} />
                )}
              </div>
            </>
          )}
        </div>

        {/* Barra de búsqueda (debajo de la toolbar cuando está abierta) */}
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
              title="Anterior coincidencia (Shift+Enter)"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => runSearch(searchTerm, "forward")}
              className="h-7 w-7 rounded-md text-ink-700 hover:bg-surface inline-flex items-center justify-center"
              title="Siguiente coincidencia (Enter)"
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
        {/* Thumbnails de páginas del PDF actual */}
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

        {/* PDF render */}
        <div className="flex-1 min-w-0 relative bg-bg-50">
          {editorError ? (
            <div className="absolute inset-0 flex items-center justify-center p-6">
              <div className="text-center max-w-md">
                <AlertCircle className="h-8 w-8 text-rose-600 mx-auto mb-2" />
                <p className="text-sm text-ink-900 font-medium">No se pudo generar el PDF del documento</p>
                <p className="text-xs text-ink-500 mt-1">{editorError}</p>
              </div>
            </div>
          ) : error ? (
            <div className="absolute inset-0 flex items-center justify-center p-6">
              <div className="text-center max-w-md">
                <AlertCircle className="h-8 w-8 text-rose-600 mx-auto mb-2" />
                <p className="text-sm text-ink-900 font-medium">No se pudo cargar el PDF</p>
                <p className="text-xs text-ink-500 mt-1">{String((error as { message?: string }).message ?? error)}</p>
              </div>
            </div>
          ) : !isDocumentLoaded ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-ink-500">
              <Loader2 className="h-5 w-5 animate-spin" />
              {editorMode && !editorBuffer && (
                <p className="text-xs">Generando PDF del documento…</p>
              )}
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

/** Botón de descarga para docs del editor (necesita fetch + saveAs). */
function DownloadEditorButton({ docId, docName }: { docId: string; docName: string }) {
  const [loading, setLoading] = useState(false);
  const onClick = async () => {
    if (loading) return;
    setLoading(true);
    try {
      const blob = await api.downloadDocumentPdf(docId);
      const a = document.createElement("a");
      const url = URL.createObjectURL(blob);
      a.href = url;
      a.download = `${docName.replace(/[^\w\s-]/g, "").trim().replace(/\s+/g, "_") || "documento"}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } finally {
      setLoading(false);
    }
  };
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={loading}
      className="h-7 w-7 rounded-md text-ink-700 hover:bg-bg-50 disabled:opacity-60 inline-flex items-center justify-center"
      title="Descargar PDF"
    >
      {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
    </button>
  );
}

function EmptyState({ patientName, totalDocs }: { patientName: string; totalDocs: number }) {
  return (
    <div className="px-4 sm:px-6 pb-6">
      <div className="rounded-xl border border-dashed border-line-200 p-10 text-center">
        <FileText className="h-8 w-8 text-ink-400 mx-auto mb-3" />
        <h3 className="font-serif text-lg text-ink-900">Sin documentos para mostrar</h3>
        <p className="text-sm text-ink-500 mt-1 max-w-md mx-auto leading-relaxed">
          {patientName} tiene {totalDocs} documento{totalDocs === 1 ? "" : "s"} en total, pero
          ninguno es visualizable acá (PDFs o documentos del editor). Los demás (DOCX,
          imágenes, etc.) se ven desde la lista de documentos.
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
