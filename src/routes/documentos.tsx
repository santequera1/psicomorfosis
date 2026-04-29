import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { AppShell } from "@/components/app/AppShell";
import { KpiCard } from "@/components/app/KpiCard";
import {
  api, type PsmDocument, type DocumentTemplate, type ApiPatient, type DocumentType,
} from "@/lib/api";
import {
  FileText, FileSignature, FilePlus, Upload, Download, Search,
  FileCheck2, FileClock, FileWarning, FileArchive, ArrowRight, ShieldCheck,
  MoreHorizontal, X, Eye, Loader2, Trash2, Archive, FilePen, Sparkles,
  ScrollText, ClipboardList, ChevronRight, Pencil, Copy,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ViewToggle, usePersistedViewMode, type ViewMode } from "@/components/app/ViewToggle";
import { PatientFolder, GenericFolder } from "@/components/app/PatientFolder";
import { PatientPicker } from "@/components/app/PatientPicker";
import { useWorkspace } from "@/lib/workspace";

export const Route = createFileRoute("/documentos")({
  head: () => ({ meta: [{ title: "Documentos · Psicomorfosis" }] }),
  validateSearch: (search): { paciente?: string } => {
    const v = search.paciente;
    return typeof v === "string" && v.length > 0 ? { paciente: v } : {};
  },
  component: DocumentosPage,
});

const TYPE_LABEL: Record<string, string> = {
  consentimiento: "Consentimiento",
  informe: "Informe",
  certificado: "Certificado",
  remision: "Remisión",
  contrato: "Contrato",
  evolucion: "Evolución",
  otro: "Otro",
  imagen: "Imagen",
};

const TYPE_ICON: Record<string, React.ComponentType<{ className?: string }>> = {
  consentimiento: ShieldCheck,
  informe: FileText,
  certificado: FileCheck2,
  remision: ArrowRight,
  contrato: ScrollText,
  evolucion: ClipboardList,
  otro: FileText,
  imagen: FileText,
};

const STATUS_STYLE: Record<string, { bg: string; text: string; label: string; Icon: React.ComponentType<{ className?: string }> }> = {
  borrador:        { bg: "bg-bg-100",       text: "text-ink-500",        label: "Borrador",        Icon: FilePen },
  pendiente_firma: { bg: "bg-warning-soft", text: "text-risk-moderate",  label: "Pendiente firma", Icon: FileClock },
  firmado:         { bg: "bg-success-soft", text: "text-success",        label: "Firmado",         Icon: FileCheck2 },
};

function DocumentosPage() {
  const search = Route.useSearch();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [query, setQuery] = useState("");
  const [type, setType] = useState<string>("todos");
  const [status, setStatus] = useState<string>("todos");
  const [newOpen, setNewOpen] = useState(false);
  const [menuId, setMenuId] = useState<string | null>(null);
  const [duplicating, setDuplicating] = useState<PsmDocument | null>(null);
  const [viewMode, setViewMode] = usePersistedViewMode("psm.docs.view", "folders");
  // Carpeta abierta (en modo carpetas): patient_id o "_general" para sin paciente
  const [openFolder, setOpenFolder] = useState<string | null>(null);

  const filterPatient = search.paciente ?? null;

  const { data: docs = [], isLoading } = useQuery({
    queryKey: ["documents", { paciente: filterPatient }],
    queryFn: () => api.listDocuments(filterPatient ? { patient_id: filterPatient } : {}),
  });

  const { data: templates = [] } = useQuery({
    queryKey: ["document-templates"],
    queryFn: () => api.listDocumentTemplates(),
  });

  const { data: patient } = useQuery({
    queryKey: ["patient", filterPatient],
    queryFn: () => filterPatient ? api.getPatient(filterPatient) : null,
    enabled: !!filterPatient,
  });

  const kpis = useMemo(() => ({
    total: docs.length,
    pendingSign: docs.filter((d) => d.status === "pendiente_firma").length,
    signed: docs.filter((d) => d.status === "firmado").length,
    drafts: docs.filter((d) => d.status === "borrador").length,
  }), [docs]);

  const filtered = useMemo(() => docs.filter((d) => {
    if (type !== "todos" && d.type !== type) return false;
    if (status !== "todos" && d.status !== status) return false;
    if (query.trim()) {
      const q = query.toLowerCase();
      if (!d.name.toLowerCase().includes(q) && !(d.patient_name ?? "").toLowerCase().includes(q)) return false;
    }
    return true;
  }), [docs, query, type, status]);

  const archiveMu = useMutation({
    mutationFn: (id: string) => api.archiveDocument(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["documents"] }); toast.success("Archivado"); },
  });
  const deleteMu = useMutation({
    mutationFn: (id: string) => api.deleteDocument(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["documents"] }); toast.success("Eliminado"); },
  });

  // Patients para los selectores (modal de duplicar + folders)
  const { data: patientsAll = [] } = useQuery({
    queryKey: ["patients"],
    queryFn: () => api.listPatients(),
  });
  const { data: workspaceData } = useWorkspace();
  const professionalsList = workspaceData?.professionals ?? [];

  // Agrupado por paciente para vista carpetas. Documentos sin patient_id caen
  // en la carpeta especial "_general".
  const folders = useMemo(() => {
    const groups = new Map<string, { id: string; name: string; preferredName?: string; photoUrl?: string | null; docs: PsmDocument[] }>();
    for (const d of filtered) {
      const key = d.patient_id ?? "_general";
      if (!groups.has(key)) {
        const p = key === "_general" ? null : patientsAll.find((x) => x.id === key);
        groups.set(key, {
          id: key,
          name: p?.name ?? d.patient_name ?? "Sin paciente vinculado",
          preferredName: p?.preferredName,
          photoUrl: (p as any)?.photo_url ?? null,
          docs: [],
        });
      }
      groups.get(key)!.docs.push(d);
    }
    return Array.from(groups.values()).sort((a, b) => {
      if (a.id === "_general") return 1;
      if (b.id === "_general") return -1;
      return a.name.localeCompare(b.name);
    });
  }, [filtered, patientsAll]);

  const openFolderData = openFolder ? folders.find((f) => f.id === openFolder) : null;
  const docsToShow = viewMode === "folders" && openFolderData ? openFolderData.docs : filtered;

  return (
    <AppShell>
      <div className="space-y-6 sm:space-y-8">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm text-ink-500">
              {filterPatient ? <>
                Documentos del paciente
                {patient && <span className="text-ink-700"> · {patient.preferredName ?? patient.name}</span>}
              </> : "Biblioteca documental"}
            </p>
            <h1 className="font-serif text-2xl md:text-[32px] leading-tight text-ink-900 mt-1">
              {filterPatient ? "Documentos del paciente" : "Documentos clínicos"}
            </h1>
            {filterPatient && (
              <Link to="/documentos" search={{ paciente: undefined }}
                className="inline-flex items-center gap-1 text-xs text-brand-700 hover:underline mt-1">
                <X className="h-3 w-3" /> Quitar filtro de paciente
              </Link>
            )}
          </div>
          <div className="flex gap-2 w-full sm:w-auto">
            <button
              onClick={() => setNewOpen(true)}
              className="flex-1 sm:flex-none h-10 px-4 rounded-lg bg-brand-700 text-white text-sm font-medium hover:bg-brand-800 inline-flex items-center justify-center gap-2"
            >
              <FilePlus className="h-4 w-4" /> Nuevo documento
            </button>
          </div>
        </header>

        <section className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
          <KpiCard label="Total" value={String(kpis.total)} hint="en biblioteca" icon={<FileText className="h-4 w-4" />} delta={{ neutral: true, value: "" }} />
          <KpiCard label="Pendientes firma" value={String(kpis.pendingSign)} emphasis={kpis.pendingSign > 0 ? "risk" : "default"} hint="acción" icon={<FileClock className="h-4 w-4" />} delta={{ neutral: true, value: "" }} />
          <KpiCard label="Firmados" value={String(kpis.signed)} hint="cerrados" icon={<FileCheck2 className="h-4 w-4" />} delta={{ neutral: true, value: "" }} />
          <KpiCard label="Borradores" value={String(kpis.drafts)} hint="sin firmar" icon={<FileWarning className="h-4 w-4" />} delta={{ neutral: true, value: "" }} />
        </section>

        <section className="grid grid-cols-1 xl:grid-cols-3 gap-4 sm:gap-5">
          <div className="xl:col-span-2 rounded-xl border border-line-200 bg-surface">
            <div className="p-3 sm:p-4 border-b border-line-100 space-y-2">
              <div className="flex items-center gap-2 h-10 px-3 rounded-md border border-line-200 bg-bg-100/40">
                <Search className="h-4 w-4 text-ink-400 shrink-0" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Buscar por nombre o paciente…"
                  className="flex-1 bg-transparent text-sm text-ink-900 placeholder:text-ink-400 outline-none min-w-0"
                />
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <select value={type} onChange={(e) => setType(e.target.value)}
                  className="h-10 px-3 rounded-md border border-line-200 bg-surface text-xs text-ink-700 outline-none hover:border-brand-400 min-w-0 flex-1">
                  <option value="todos">Todos los tipos</option>
                  {Object.keys(TYPE_LABEL).map((k) => <option key={k} value={k}>{TYPE_LABEL[k]}</option>)}
                </select>
                <select value={status} onChange={(e) => setStatus(e.target.value)}
                  className="h-10 px-3 rounded-md border border-line-200 bg-surface text-xs text-ink-700 outline-none hover:border-brand-400 min-w-0 flex-1">
                  <option value="todos">Todos los estados</option>
                  {Object.keys(STATUS_STYLE).map((k) => <option key={k} value={k}>{STATUS_STYLE[k].label}</option>)}
                </select>
                <ViewToggle value={viewMode} onChange={(v) => { setViewMode(v); setOpenFolder(null); }} />
              </div>
              {viewMode === "folders" && openFolderData && (
                <div className="flex items-center gap-2 text-xs text-ink-500 pt-1">
                  <button onClick={() => setOpenFolder(null)} className="text-brand-700 hover:underline inline-flex items-center gap-1">
                    <ChevronRight className="h-3 w-3 rotate-180" /> Carpetas
                  </button>
                  <span className="text-ink-300">/</span>
                  <span className="text-ink-900 font-medium truncate">{openFolderData.name}</span>
                </div>
              )}
            </div>

            {isLoading ? (
              <div className="p-10 text-center text-sm text-ink-500"><Loader2 className="h-4 w-4 animate-spin inline mr-2" /> Cargando…</div>
            ) : filtered.length === 0 ? (
              <div className="p-10 text-center text-sm text-ink-500">
                {docs.length === 0 ? "Aún no hay documentos. Click en \"Nuevo documento\" para crear el primero." : "Sin documentos que coincidan con los filtros."}
              </div>
            ) : viewMode === "folders" && !openFolderData ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 p-4">
                {folders.map((f) => f.id === "_general" ? (
                  <GenericFolder key={f.id} name={f.name} count={f.docs.length} onClick={() => setOpenFolder(f.id)} toneIdx={5} />
                ) : (
                  <PatientFolder
                    key={f.id}
                    name={f.name}
                    preferredName={f.preferredName}
                    photoUrl={f.photoUrl}
                    count={f.docs.length}
                    onClick={() => setOpenFolder(f.id)}
                  />
                ))}
              </div>
            ) : viewMode === "cards" ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 sm:p-4">
                {docsToShow.map((d) => (
                  <DocCard
                    key={d.id}
                    doc={d}
                    onArchive={() => archiveMu.mutate(d.id)}
                    onDelete={() => { if (confirm(`¿Eliminar "${d.name}" definitivamente?`)) deleteMu.mutate(d.id); }}
                    onDuplicate={() => setDuplicating(d)}
                  />
                ))}
              </div>
            ) : (
              <ul className="divide-y divide-line-100">
                {docsToShow.map((d) => (
                  <DocRow
                    key={d.id}
                    doc={d}
                    menuOpen={menuId === d.id}
                    onMenuToggle={() => setMenuId(menuId === d.id ? null : d.id)}
                    onCloseMenu={() => setMenuId(null)}
                    onArchive={() => archiveMu.mutate(d.id)}
                    onDelete={() => { if (confirm(`¿Eliminar "${d.name}" definitivamente?`)) deleteMu.mutate(d.id); }}
                    onDuplicate={() => setDuplicating(d)}
                  />
                ))}
              </ul>
            )}
          </div>

          <aside className="space-y-5">
            <div className="rounded-xl border border-line-200 bg-surface p-5">
              <div className="flex items-center justify-between mb-1">
                <h3 className="font-serif text-lg text-ink-900">Plantillas</h3>
                <Sparkles className="h-4 w-4 text-brand-700" />
              </div>
              <p className="text-xs text-ink-500">Variables se rellenan automáticamente con los datos del paciente. Personaliza las del sistema o sube las tuyas en Word.</p>
              <ul className="mt-4 space-y-2">
                {templates.slice(0, 6).map((t) => (
                  <li key={t.id}>
                    <TemplateRow
                      template={t}
                      onUse={() => createFromTemplate(navigate, qc, t, filterPatient, patient ?? null)}
                      onEdit={async () => {
                        // Si es del sistema, clonar primero al workspace y abrir el clon en editor
                        if (t.scope === "system") {
                          try {
                            const cloned = await api.cloneDocumentTemplate(t.id);
                            qc.invalidateQueries({ queryKey: ["document-templates"] });
                            navigate({ to: "/documentos/plantilla/$id", params: { id: String(cloned.id) } });
                          } catch (e: any) { toast.error(e.message); }
                        } else {
                          navigate({ to: "/documentos/plantilla/$id", params: { id: String(t.id) } });
                        }
                      }}
                    />
                  </li>
                ))}
              </ul>
              <div className="mt-3 flex flex-col gap-2">
                <button
                  onClick={() => setNewOpen(true)}
                  className="w-full text-xs text-brand-700 hover:underline text-center"
                >
                  Ver todas las plantillas →
                </button>
                <UploadTemplateButton onUploaded={() => qc.invalidateQueries({ queryKey: ["document-templates"] })} />
              </div>
            </div>

            <div className="rounded-xl border border-brand-700/20 bg-brand-50/40 p-5">
              <div className="flex items-center gap-2 mb-2">
                <ShieldCheck className="h-4 w-4 text-brand-700" />
                <h3 className="font-serif text-base text-ink-900">Firma y registro</h3>
              </div>
              <p className="text-xs text-ink-700">Los documentos firmados quedan inmodificables y vinculados al paciente conforme a Resolución 1995/1999.</p>
            </div>
          </aside>
        </section>
      </div>

      {newOpen && (
        <NewDocumentModal
          onClose={() => setNewOpen(false)}
          templates={templates}
          presetPatientId={filterPatient ?? undefined}
          presetPatient={patient ?? null}
        />
      )}
      {duplicating && (
        <DuplicateDocumentModal
          doc={duplicating}
          patients={patientsAll}
          professionals={professionalsList.map((p) => ({ id: p.id, name: p.name }))}
          onClose={() => setDuplicating(null)}
        />
      )}
    </AppShell>
  );
}

// ─── Fila de documento con menú "···" ──────────────────────────────────────
/** Descarga el PDF generado server-side (kind=editor) o el archivo subido (kind=file). */
async function downloadDocument(doc: PsmDocument) {
  try {
    if (doc.kind === "file") {
      // Para archivos subidos hay un endpoint propio que ya forza download.
      window.location.href = api.documentFileUrl(doc.id, { download: true });
      return;
    }
    const blob = await api.downloadDocumentPdf(doc.id);
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = (doc.name || "documento").replace(/[^\w\s-]/g, "").trim().replace(/\s+/g, "_") + ".pdf";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast.success("PDF descargado");
  } catch (e: any) {
    toast.error("No se pudo descargar: " + (e?.message ?? e));
  }
}

function DocRow({ doc, menuOpen, onMenuToggle, onCloseMenu, onArchive, onDelete, onDuplicate }: {
  doc: PsmDocument;
  menuOpen: boolean;
  onMenuToggle: () => void;
  onCloseMenu: () => void;
  onArchive: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
}) {
  const s = STATUS_STYLE[doc.status ?? "borrador"] ?? STATUS_STYLE.borrador;
  const TIcon = TYPE_ICON[doc.type] ?? FileText;
  const isFile = doc.kind === "file";
  const [downloading, setDownloading] = useState(false);

  async function handleDownload(e: React.MouseEvent) {
    e.stopPropagation();
    e.preventDefault();
    setDownloading(true);
    try { await downloadDocument(doc); } finally { setDownloading(false); }
  }

  useEffect(() => {
    if (!menuOpen) return;
    const close = () => onCloseMenu();
    setTimeout(() => document.addEventListener("click", close, { once: true }), 0);
    return () => document.removeEventListener("click", close);
  }, [menuOpen, onCloseMenu]);

  return (
    <li className="px-3 sm:px-5 py-3 sm:py-4 hover:bg-brand-50/40 transition-colors group">
      <div className="flex items-start gap-3 sm:gap-4">
        <Link to="/documentos/$id" params={{ id: doc.id }} className="contents">
          <div className="h-9 w-9 sm:h-10 sm:w-10 rounded-lg bg-brand-50 text-brand-800 flex items-center justify-center shrink-0">
            <TIcon className="h-4 w-4" />
          </div>
          <div className="flex-1 min-w-0 cursor-pointer">
            <div className="flex items-start sm:items-center gap-1.5 flex-col sm:flex-row sm:flex-wrap">
              <div className="text-sm font-medium text-ink-900 line-clamp-2 sm:truncate">{doc.name}</div>
              <span className={cn("inline-flex items-center gap-1 text-[10px] uppercase tracking-[0.06em] px-2 py-0.5 rounded-full font-medium shrink-0", s.bg, s.text)}>
                <s.Icon className="h-3 w-3" /> {s.label}
              </span>
              <span className="inline-flex items-center text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-bg-100 text-ink-500 shrink-0">
                {isFile ? "📎 Archivo" : "✍ Editor"}
              </span>
            </div>
            <div className="text-[11px] sm:text-xs text-ink-500 mt-1 flex items-center gap-x-2 sm:gap-x-3 gap-y-0.5 flex-wrap">
              <span>{TYPE_LABEL[doc.type] ?? doc.type}</span>
              {doc.patient_name && <><span className="text-ink-300">·</span><span className="truncate max-w-40">{doc.patient_name}</span></>}
              <span className="text-ink-300">·</span>
              <span className="tabular">{formatRelative(doc.updated_at)}</span>
              {doc.size_kb != null && <><span className="text-ink-300 hidden sm:inline">·</span><span className="tabular hidden sm:inline">{doc.size_kb} KB</span></>}
              <span className="text-ink-300 hidden md:inline">·</span>
              <span className="hidden md:inline truncate max-w-35">{doc.professional}</span>
            </div>
          </div>
        </Link>
        <div className="flex items-center gap-1 shrink-0 sm:opacity-0 sm:group-hover:opacity-100 sm:transition-opacity">
          <Link to="/documentos/$id" params={{ id: doc.id }}
            className="h-8 w-8 rounded-md border border-line-200 text-ink-500 hover:border-brand-400 flex items-center justify-center" title="Ver">
            <Eye className="h-3.5 w-3.5" />
          </Link>
          <button
            onClick={handleDownload}
            disabled={downloading}
            className="h-8 w-8 rounded-md border border-line-200 text-ink-500 hover:border-brand-400 flex items-center justify-center disabled:opacity-50"
            title={isFile ? "Descargar archivo" : "Descargar como PDF"}
          >
            {downloading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
          </button>
          <div className="relative">
            <button
              onClick={(e) => { e.stopPropagation(); e.preventDefault(); onMenuToggle(); }}
              className="h-8 w-8 rounded-md text-ink-500 hover:bg-bg-100 flex items-center justify-center" title="Más">
              <MoreHorizontal className="h-4 w-4" />
            </button>
            {menuOpen && (
              <div className="absolute right-0 top-full mt-1 w-52 rounded-lg border border-line-200 bg-surface shadow-card py-1 z-30"
                onClick={(e) => e.stopPropagation()}>
                <Link to="/documentos/$id" params={{ id: doc.id }}
                  className="w-full text-left px-3 py-2 text-sm text-ink-700 hover:bg-bg-100 inline-flex items-center gap-2">
                  <Pencil className="h-4 w-4" /> Abrir
                </Link>
                {!isFile && (
                  <button onClick={(e) => { e.stopPropagation(); onCloseMenu(); onDuplicate(); }}
                    className="w-full text-left px-3 py-2 text-sm text-ink-700 hover:bg-bg-100 inline-flex items-center gap-2">
                    <Copy className="h-4 w-4" /> Duplicar y reasignar
                  </button>
                )}
                <button onClick={onArchive}
                  className="w-full text-left px-3 py-2 text-sm text-ink-700 hover:bg-bg-100 inline-flex items-center gap-2">
                  <Archive className="h-4 w-4" /> Archivar
                </button>
                <button onClick={onDelete}
                  className="w-full text-left px-3 py-2 text-sm text-rose-700 hover:bg-rose-500/10 inline-flex items-center gap-2">
                  <Trash2 className="h-4 w-4" /> Eliminar
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </li>
  );
}

// ─── Tarjeta de documento (vista cards) ────────────────────────────────────
function DocCard({ doc, onArchive, onDelete, onDuplicate }: {
  doc: PsmDocument;
  onArchive: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
}) {
  const s = STATUS_STYLE[doc.status ?? "borrador"] ?? STATUS_STYLE.borrador;
  const TIcon = TYPE_ICON[doc.type] ?? FileText;
  const isFile = doc.kind === "file";
  const [downloading, setDownloading] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (!menuOpen) return;
    const close = () => setMenuOpen(false);
    setTimeout(() => document.addEventListener("click", close, { once: true }), 0);
    return () => document.removeEventListener("click", close);
  }, [menuOpen]);

  async function handleDownload(e: React.MouseEvent) {
    e.stopPropagation();
    e.preventDefault();
    setDownloading(true);
    try { await downloadDocument(doc); } finally { setDownloading(false); }
  }

  return (
    <div className="rounded-xl border border-line-200 bg-surface p-4 hover:border-brand-400/60 hover:shadow-sm transition-all relative group">
      <Link to="/documentos/$id" params={{ id: doc.id }} className="block">
        <div className="flex items-start gap-3">
          <div className="h-11 w-11 rounded-xl bg-brand-50 text-brand-800 flex items-center justify-center shrink-0">
            <TIcon className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium text-ink-900 line-clamp-2">{doc.name}</div>
            <div className="text-[11px] text-ink-500 mt-0.5">{TYPE_LABEL[doc.type] ?? doc.type}</div>
          </div>
        </div>
        <div className="mt-3 flex items-center gap-1.5 flex-wrap">
          <span className={cn("inline-flex items-center gap-1 text-[10px] uppercase tracking-[0.06em] px-2 py-0.5 rounded-full font-medium", s.bg, s.text)}>
            <s.Icon className="h-3 w-3" /> {s.label}
          </span>
          <span className="inline-flex items-center text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-bg-100 text-ink-500">
            {isFile ? "📎 Archivo" : "✍ Editor"}
          </span>
        </div>
        <div className="mt-3 pt-3 border-t border-line-100 text-[11px] text-ink-500 flex items-center justify-between gap-2">
          <span className="truncate">{doc.patient_name ?? "Sin paciente"}</span>
          <span className="tabular shrink-0">{formatRelative(doc.updated_at)}</span>
        </div>
      </Link>
      <div className="absolute top-2 right-2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          onClick={handleDownload}
          disabled={downloading}
          className="h-7 w-7 rounded-md bg-surface border border-line-200 text-ink-500 hover:border-brand-400 flex items-center justify-center disabled:opacity-50"
          title={isFile ? "Descargar archivo" : "Descargar PDF"}
        >
          {downloading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Download className="h-3 w-3" />}
        </button>
        <div className="relative">
          <button
            onClick={(e) => { e.stopPropagation(); e.preventDefault(); setMenuOpen((o) => !o); }}
            className="h-7 w-7 rounded-md bg-surface border border-line-200 text-ink-500 hover:border-brand-400 flex items-center justify-center"
            title="Más"
          >
            <MoreHorizontal className="h-3.5 w-3.5" />
          </button>
          {menuOpen && (
            <div className="absolute right-0 top-full mt-1 w-52 rounded-lg border border-line-200 bg-surface shadow-card py-1 z-30"
              onClick={(e) => e.stopPropagation()}>
              {!isFile && (
                <button onClick={() => { setMenuOpen(false); onDuplicate(); }}
                  className="w-full text-left px-3 py-2 text-sm text-ink-700 hover:bg-bg-100 inline-flex items-center gap-2">
                  <Copy className="h-4 w-4" /> Duplicar y reasignar
                </button>
              )}
              <button onClick={() => { setMenuOpen(false); onArchive(); }}
                className="w-full text-left px-3 py-2 text-sm text-ink-700 hover:bg-bg-100 inline-flex items-center gap-2">
                <Archive className="h-4 w-4" /> Archivar
              </button>
              <button onClick={() => { setMenuOpen(false); onDelete(); }}
                className="w-full text-left px-3 py-2 text-sm text-rose-700 hover:bg-rose-500/10 inline-flex items-center gap-2">
                <Trash2 className="h-4 w-4" /> Eliminar
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Modal "Duplicar y reasignar" ──────────────────────────────────────────
function DuplicateDocumentModal({ doc, patients, professionals, onClose }: {
  doc: PsmDocument;
  patients: ApiPatient[];
  professionals: { id: number; name: string }[];
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [name, setName] = useState(`${doc.name} (copia)`);
  const [patientId, setPatientId] = useState(doc.patient_id ?? "");
  const [professional, setProfessional] = useState(doc.professional ?? "");

  const dupMu = useMutation({
    mutationFn: () => api.duplicateDocument(doc.id, {
      name,
      patient_id: patientId || null,
      professional: professional || null,
    }),
    onSuccess: (created) => {
      qc.invalidateQueries({ queryKey: ["documents"] });
      toast.success("Documento duplicado");
      onClose();
      navigate({ to: "/documentos/$id", params: { id: created.id } });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-ink-900/40 backdrop-blur-sm pt-16 p-4 overflow-y-auto" onClick={onClose}>
      <form
        onSubmit={(e) => { e.preventDefault(); dupMu.mutate(); }}
        className="w-full max-w-md rounded-2xl bg-surface shadow-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="px-5 py-4 border-b border-line-100 flex items-start justify-between">
          <div>
            <p className="text-[11px] uppercase tracking-widest text-brand-700 font-medium">Documentos</p>
            <h3 className="font-serif text-xl text-ink-900 mt-0.5">Duplicar y reasignar</h3>
            <p className="text-xs text-ink-500 mt-1">Crea una copia del cuerpo. El nuevo doc empieza como borrador, sin firma.</p>
          </div>
          <button type="button" onClick={onClose} className="h-9 w-9 rounded-md border border-line-200 text-ink-500 hover:border-brand-400 flex items-center justify-center">
            <X className="h-4 w-4" />
          </button>
        </header>
        <div className="p-5 space-y-3">
          <Field label="Nombre del nuevo documento" required>
            <input value={name} onChange={(e) => setName(e.target.value)} required
              className="mt-1 w-full h-10 px-3 rounded-md border border-line-200 bg-surface text-sm outline-none focus:border-brand-700" />
          </Field>
          <Field label="Paciente">
            <PatientPicker
              value={patientId || null}
              onChange={(id) => setPatientId(id ?? "")}
              patients={patients}
              allowEmpty
            />
          </Field>
          {professionals.length > 1 && (
            <Field label="Profesional">
              <select value={professional} onChange={(e) => setProfessional(e.target.value)}
                className="mt-1 w-full h-10 px-3 rounded-md border border-line-200 bg-surface text-sm outline-none hover:border-brand-400">
                {professionals.map((p) => (
                  <option key={p.id} value={p.name}>{p.name}</option>
                ))}
              </select>
            </Field>
          )}
        </div>
        <footer className="p-4 border-t border-line-100 bg-bg-100/30 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="h-9 px-3 rounded-md border border-line-200 text-sm text-ink-700 hover:border-brand-400">Cancelar</button>
          <button type="submit" disabled={dupMu.isPending || !name.trim()}
            className="h-9 px-4 rounded-md bg-brand-700 text-primary-foreground text-sm font-medium hover:bg-brand-800 disabled:opacity-60 inline-flex items-center gap-2">
            {dupMu.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Duplicar
          </button>
        </footer>
      </form>
    </div>
  );
}

// ─── Modal "Nuevo documento" con 3 opciones ────────────────────────────────
type ModalTab = "plantilla" | "blanco" | "subir";

function NewDocumentModal({
  onClose, templates, presetPatientId, presetPatient,
}: {
  onClose: () => void;
  templates: DocumentTemplate[];
  presetPatientId?: string;
  presetPatient: ApiPatient | null;
}) {
  const [tab, setTab] = useState<ModalTab>(presetPatientId ? "plantilla" : "plantilla");
  const navigate = useNavigate();
  const qc = useQueryClient();

  const { data: patients = [] } = useQuery({
    queryKey: ["patients"],
    queryFn: () => api.listPatients(),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-ink-900/50 backdrop-blur-sm p-0 sm:p-4" onClick={onClose}>
      <div className="w-full sm:max-w-3xl bg-surface rounded-t-2xl sm:rounded-2xl shadow-modal max-h-[92vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <header className="sticky top-0 bg-surface border-b border-line-100 px-5 py-4 flex items-start justify-between">
          <div>
            <p className="text-[11px] uppercase tracking-widest text-brand-700 font-medium">Documentos</p>
            <h3 className="font-serif text-xl text-ink-900 mt-0.5">Nuevo documento</h3>
            <p className="text-xs text-ink-500 mt-1">Crea un documento desde plantilla, en blanco, o sube un archivo existente.</p>
          </div>
          <button onClick={onClose} className="h-9 w-9 rounded-md border border-line-200 flex items-center justify-center text-ink-500 hover:border-brand-400">
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="px-5 pt-4">
          <div className="flex gap-1 border-b border-line-100">
            <TabBtn active={tab === "plantilla"} onClick={() => setTab("plantilla")}>Desde plantilla</TabBtn>
            <TabBtn active={tab === "blanco"} onClick={() => setTab("blanco")}>En blanco</TabBtn>
            <TabBtn active={tab === "subir"} onClick={() => setTab("subir")}>Subir archivo</TabBtn>
          </div>
        </div>

        <div className="p-5">
          {tab === "plantilla" && (
            <TemplateGrid
              templates={templates}
              patients={patients}
              presetPatientId={presetPatientId}
              presetPatient={presetPatient}
              onCreated={() => { qc.invalidateQueries({ queryKey: ["documents"] }); onClose(); }}
              navigate={navigate}
            />
          )}
          {tab === "blanco" && (
            <BlankDocForm
              patients={patients}
              presetPatientId={presetPatientId}
              presetPatient={presetPatient}
              onCreated={() => { qc.invalidateQueries({ queryKey: ["documents"] }); onClose(); }}
              navigate={navigate}
            />
          )}
          {tab === "subir" && (
            <UploadForm
              patients={patients}
              presetPatientId={presetPatientId}
              presetPatient={presetPatient}
              onUploaded={() => { qc.invalidateQueries({ queryKey: ["documents"] }); onClose(); }}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function TabBtn({ active, children, onClick }: { active: boolean; children: React.ReactNode; onClick: () => void }) {
  return (
    <button onClick={onClick} className={cn(
      "px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px",
      active ? "border-brand-700 text-brand-700" : "border-transparent text-ink-500 hover:text-ink-700"
    )}>
      {children}
    </button>
  );
}

// ─── Crear desde plantilla ──────────────────────────────────────────────────
function TemplateGrid({
  templates, patients, presetPatientId, presetPatient, onCreated, navigate,
}: {
  templates: DocumentTemplate[];
  patients: ApiPatient[];
  presetPatientId?: string;
  presetPatient: ApiPatient | null;
  onCreated: () => void;
  navigate: ReturnType<typeof useNavigate>;
}) {
  const [patientId, setPatientId] = useState<string>(presetPatientId ?? "");
  const [creating, setCreating] = useState<number | null>(null);
  const [deleting, setDeleting] = useState<number | null>(null);
  const qc = useQueryClient();

  async function pick(t: DocumentTemplate) {
    setCreating(t.id);
    try {
      const p = patients.find((x) => x.id === patientId);
      const created = await api.createDocument({
        name: t.name + (p ? ` · ${p.preferredName ?? p.name}` : ""),
        type: t.category,
        template_id: t.id,
        patient_id: patientId || null,
        patient_name: p?.name ?? null,
      });
      onCreated();
      navigate({ to: "/documentos/$id", params: { id: created.id } });
    } catch (e: any) {
      toast.error(e.message ?? "Error al crear");
    } finally {
      setCreating(null);
    }
  }

  async function removeTemplate(t: DocumentTemplate, e: React.MouseEvent) {
    e.stopPropagation();
    if (!confirm(`¿Eliminar la plantilla "${t.name}"? Esta acción no se puede deshacer.`)) return;
    setDeleting(t.id);
    try {
      await api.deleteDocumentTemplate(t.id);
      qc.invalidateQueries({ queryKey: ["document-templates"] });
      toast.success("Plantilla eliminada");
    } catch (err: any) {
      toast.error(err.message ?? "No se pudo eliminar");
    } finally {
      setDeleting(null);
    }
  }

  return (
    <div className="space-y-4">
      <PatientSelect patients={patients} value={patientId} onChange={setPatientId} preset={presetPatient} />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {templates.map((t) => {
          const TIcon = TYPE_ICON[t.category] ?? FileText;
          const canDelete = t.scope !== "system";
          return (
            <div
              key={t.id}
              className="relative text-left p-3 rounded-lg border border-line-200 hover:border-brand-400 hover:bg-brand-50/40 transition-colors group"
            >
              <button
                onClick={() => pick(t)}
                disabled={creating !== null}
                className="text-left w-full disabled:opacity-50"
              >
                <div className="flex items-start gap-3 pr-7">
                  <div className="h-9 w-9 rounded-md bg-lavender-100 text-lavender-500 flex items-center justify-center shrink-0">
                    <TIcon className="h-4 w-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-ink-900 line-clamp-2">{t.name}</div>
                    <div className="text-[11px] text-ink-500 mt-0.5 line-clamp-2">{t.description}</div>
                    <div className="text-[10px] text-ink-400 mt-1 inline-flex items-center gap-1.5">
                      <span className={cn(
                        "inline-block px-1.5 py-0.5 rounded font-medium",
                        t.scope === "system" ? "bg-bg-100 text-ink-500" : "bg-brand-50 text-brand-700"
                      )}>
                        {t.scope === "system" ? "Sistema" : t.scope === "personal" ? "Personal" : "Workspace"}
                      </span>
                      <span>· {t.uses_count} usos</span>
                    </div>
                    {t.legal_disclaimer && (
                      <div className="text-[10px] text-amber-700 mt-1">⚠️ Borrador · revisar con asesoría legal</div>
                    )}
                  </div>
                  {creating === t.id ? <Loader2 className="h-4 w-4 animate-spin text-brand-700 shrink-0 mt-1" /> : <ChevronRight className="h-4 w-4 text-ink-400 group-hover:text-brand-700 shrink-0 mt-1" />}
                </div>
              </button>
              {canDelete && (
                <button
                  onClick={(e) => removeTemplate(t, e)}
                  disabled={deleting === t.id}
                  title="Eliminar plantilla"
                  className="absolute top-2 right-2 h-6 w-6 rounded text-ink-400 hover:bg-rose-500/10 hover:text-rose-700 inline-flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity disabled:opacity-50"
                >
                  {deleting === t.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Documento en blanco ────────────────────────────────────────────────────
function BlankDocForm({
  patients, presetPatientId, presetPatient, onCreated, navigate,
}: {
  patients: ApiPatient[];
  presetPatientId?: string;
  presetPatient: ApiPatient | null;
  onCreated: () => void;
  navigate: ReturnType<typeof useNavigate>;
}) {
  const [name, setName] = useState("");
  const [type, setType] = useState<DocumentType>("informe");
  const [patientId, setPatientId] = useState(presetPatientId ?? "");
  const [creating, setCreating] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return toast.error("Pon un nombre");
    setCreating(true);
    try {
      const p = patients.find((x) => x.id === patientId);
      const created = await api.createDocument({
        name: name.trim(),
        type,
        patient_id: patientId || null,
        patient_name: p?.name ?? null,
      });
      onCreated();
      navigate({ to: "/documentos/$id", params: { id: created.id } });
    } catch (e: any) {
      toast.error(e.message ?? "Error al crear");
    } finally {
      setCreating(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <Field label="Nombre del documento" required>
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Ej: Evolución del 26 de abril"
          className="w-full h-10 px-3 rounded-md border border-line-200 bg-bg text-sm focus:outline-none focus:border-brand-400"
        />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Tipo">
          <select value={type} onChange={(e) => setType(e.target.value as DocumentType)}
            className="w-full h-10 px-3 rounded-md border border-line-200 bg-bg text-sm">
            {Object.keys(TYPE_LABEL).filter(k => k !== "imagen").map((k) => <option key={k} value={k}>{TYPE_LABEL[k]}</option>)}
          </select>
        </Field>
        <PatientSelect patients={patients} value={patientId} onChange={setPatientId} preset={presetPatient} compact />
      </div>
      <button type="submit" disabled={creating}
        className="w-full h-10 px-4 rounded-md bg-brand-700 text-white text-sm font-medium hover:bg-brand-800 inline-flex items-center justify-center gap-2 disabled:opacity-50">
        {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <FilePlus className="h-4 w-4" />}
        Crear y abrir editor
      </button>
    </form>
  );
}

// ─── Subir archivo ─────────────────────────────────────────────────────────
function UploadForm({
  patients, presetPatientId, presetPatient, onUploaded,
}: {
  patients: ApiPatient[];
  presetPatientId?: string;
  presetPatient: ApiPatient | null;
  onUploaded: () => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState("");
  const [type, setType] = useState<DocumentType>("otro");
  const [patientId, setPatientId] = useState(presetPatientId ?? "");
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function chooseFile(f: File) {
    setFile(f);
    if (!name) setName(f.name.replace(/\.[^.]+$/, ""));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return toast.error("Selecciona un archivo");
    setUploading(true);
    try {
      const p = patients.find((x) => x.id === patientId);
      await api.uploadDocument(file, {
        name: name.trim() || file.name,
        type,
        patient_id: patientId || null,
        patient_name: p?.name ?? null,
      });
      toast.success("Archivo subido");
      onUploaded();
    } catch (e: any) {
      toast.error(e.message ?? "Error al subir");
    } finally {
      setUploading(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault(); setDragOver(false);
          const f = e.dataTransfer.files?.[0];
          if (f) chooseFile(f);
        }}
        onClick={() => inputRef.current?.click()}
        className={cn(
          "border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors",
          dragOver ? "border-brand-700 bg-brand-50" : "border-line-200 hover:border-brand-400 hover:bg-bg-100/50"
        )}
      >
        <Upload className="h-8 w-8 mx-auto text-ink-400 mb-2" />
        {file ? (
          <>
            <p className="text-sm font-medium text-ink-900">{file.name}</p>
            <p className="text-xs text-ink-500 mt-1">{Math.round(file.size / 1024)} KB · click para cambiar</p>
          </>
        ) : (
          <>
            <p className="text-sm font-medium text-ink-900">Arrastra un archivo o click para elegir</p>
            <p className="text-xs text-ink-500 mt-1">PDF, DOCX, JPG, PNG, TXT · máx 25 MB</p>
          </>
        )}
        <input
          ref={inputRef}
          type="file"
          accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.webp,.gif,.txt,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,image/*,text/plain"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) chooseFile(f);
          }}
        />
      </div>

      <Field label="Nombre del documento">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Nombre legible (sin extensión)"
          className="w-full h-10 px-3 rounded-md border border-line-200 bg-bg text-sm focus:outline-none focus:border-brand-400"
        />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Tipo">
          <select value={type} onChange={(e) => setType(e.target.value as DocumentType)}
            className="w-full h-10 px-3 rounded-md border border-line-200 bg-bg text-sm">
            {Object.keys(TYPE_LABEL).map((k) => <option key={k} value={k}>{TYPE_LABEL[k]}</option>)}
          </select>
        </Field>
        <PatientSelect patients={patients} value={patientId} onChange={setPatientId} preset={presetPatient} compact />
      </div>
      <button type="submit" disabled={!file || uploading}
        className="w-full h-10 px-4 rounded-md bg-brand-700 text-white text-sm font-medium hover:bg-brand-800 inline-flex items-center justify-center gap-2 disabled:opacity-50">
        {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
        Subir
      </button>
    </form>
  );
}

// ─── Helpers UI ─────────────────────────────────────────────────────────────
function PatientSelect({
  patients, value, onChange, preset, compact,
}: {
  patients: ApiPatient[];
  value: string;
  onChange: (v: string) => void;
  preset: ApiPatient | null;
  compact?: boolean;
}) {
  return (
    <Field label={compact ? "Paciente" : "Paciente relacionado"}>
      {preset ? (
        <div className="h-10 px-3 rounded-md border border-line-200 bg-brand-50 text-sm flex items-center gap-2">
          <span className="text-ink-900 truncate">{preset.preferredName ?? preset.name}</span>
          <span className="text-xs text-ink-500">· {preset.id}</span>
        </div>
      ) : (
        <PatientPicker
          value={value || null}
          onChange={(id) => onChange(id ?? "")}
          patients={patients}
          allowEmpty
        />
      )}
    </Field>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-ink-700 mb-1.5">
        {label}{required && <span className="text-rose-700"> *</span>}
      </span>
      {children}
    </label>
  );
}

function TemplateRow({ template, onUse, onEdit }: { template: DocumentTemplate; onUse: () => void; onEdit: () => void }) {
  const TIcon = TYPE_ICON[template.category] ?? FileText;
  return (
    <div className="flex items-center gap-2 p-3 rounded-lg border border-line-200 hover:border-brand-400 hover:bg-brand-50/40 transition-colors group">
      <div className="h-8 w-8 rounded-md bg-lavender-100 text-lavender-500 flex items-center justify-center shrink-0">
        <TIcon className="h-4 w-4" />
      </div>
      <button onClick={onUse} className="flex-1 min-w-0 text-left">
        <div className="text-sm text-ink-900 truncate">{template.name}</div>
        <div className="text-[11px] text-ink-500">
          {template.uses_count} usos · {template.scope === "system" ? "Sistema" : template.scope === "personal" ? "Personal" : "Personalizada"}
        </div>
      </button>
      <button
        onClick={onEdit}
        title={template.scope === "system" ? "Personalizar (crea una copia editable)" : "Editar plantilla"}
        className="h-7 w-7 rounded-md text-ink-500 hover:bg-bg-100 hover:text-brand-700 flex items-center justify-center shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
      >
        <Pencil className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

function UploadTemplateButton({ onUploaded }: { onUploaded: () => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  async function handleFile(file: File) {
    if (!/\.docx$/i.test(file.name)) {
      toast.error("Solo se permiten archivos .docx (Microsoft Word)");
      return;
    }
    setUploading(true);
    try {
      await api.uploadTemplateDocx(file, { name: file.name.replace(/\.[^.]+$/, ""), category: "otro" });
      toast.success("Plantilla creada desde Word");
      onUploaded();
    } catch (e: any) {
      toast.error(e.message ?? "No se pudo crear la plantilla");
    } finally {
      setUploading(false);
    }
  }

  return (
    <>
      <button
        onClick={() => inputRef.current?.click()}
        disabled={uploading}
        className="w-full h-9 px-3 rounded-md border border-dashed border-line-200 text-xs text-ink-700 hover:border-brand-400 hover:bg-brand-50/40 inline-flex items-center justify-center gap-2 disabled:opacity-50"
      >
        {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
        Subir plantilla desde Word
      </button>
      <input
        ref={inputRef}
        type="file"
        accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) handleFile(f);
        }}
      />
    </>
  );
}

function formatRelative(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffH = diffMs / (1000 * 60 * 60);
  if (diffH < 1) return "hace unos minutos";
  if (diffH < 24) return `hace ${Math.round(diffH)}h`;
  const diffD = Math.round(diffH / 24);
  if (diffD < 7) return `hace ${diffD}d`;
  return d.toLocaleDateString("es-CO", { day: "numeric", month: "short", year: "numeric" });
}

// Helper: crear desde plantilla y navegar — usado tanto desde la lista como desde el modal
async function createFromTemplate(
  navigate: ReturnType<typeof useNavigate>,
  qc: ReturnType<typeof useQueryClient>,
  t: DocumentTemplate,
  patientId: string | null,
  patient: ApiPatient | null,
) {
  if (!patientId) {
    toast.message("Selecciona un paciente primero o usa el botón \"Nuevo documento\"");
    return;
  }
  try {
    const created = await api.createDocument({
      name: t.name + (patient ? ` · ${patient.preferredName ?? patient.name}` : ""),
      type: t.category,
      template_id: t.id,
      patient_id: patientId,
      patient_name: patient?.name ?? null,
    });
    qc.invalidateQueries({ queryKey: ["documents"] });
    navigate({ to: "/documentos/$id", params: { id: created.id } });
  } catch (e: any) {
    toast.error(e.message ?? "Error al crear");
  }
}
