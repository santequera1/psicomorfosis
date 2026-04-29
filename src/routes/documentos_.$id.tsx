import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import {
  ChevronLeft, FileSignature, Archive, Trash2, AlertCircle, Loader2,
  Check, Lock, User, FileText, Send, MessageCircle, Copy, Download,
} from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { whatsappUrl } from "@/lib/display";
import { AppShell } from "@/components/app/AppShell";
import { DocumentEditor } from "@/components/documents/DocumentEditor";
import { api, type PsmDocument, type TipTapDoc, type ApiPatient } from "@/lib/api";
import { useWorkspace } from "@/lib/workspace";
import { PatientPicker } from "@/components/app/PatientPicker";

export const Route = createFileRoute("/documentos_/$id")({
  head: ({ params }) => ({ meta: [{ title: `Documento ${params.id} — Psicomorfosis` }] }),
  component: DocumentDetailPage,
});

function DocumentDetailPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const { data: doc, isLoading, error } = useQuery({
    queryKey: ["document", id],
    queryFn: () => api.getDocument(id),
  });
  const { data: workspace } = useWorkspace();

  // Contexto de variables: paciente vinculado al doc + profesional + clínica + fecha.
  // Se refetchea cuando cambia el patient_id (vincular/desvincular paciente).
  const { data: variableContext } = useQuery({
    queryKey: ["document-variables", id, doc?.patient_id ?? null],
    queryFn: () => api.getDocumentVariables(id),
    enabled: !!doc,
  });

  // ─── Local state del editor ─────────────────────────────────────────────
  const [body, setBody] = useState<TipTapDoc | null>(null);
  const [signRequestOpen, setSignRequestOpen] = useState(false);
  const [text, setText] = useState<string>("");
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [saving, setSaving] = useState(false);
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const editorContainerRef = useRef<HTMLDivElement>(null);

  // Cargar body cuando llega la data
  useEffect(() => {
    if (doc?.body_json) setBody(doc.body_json);
  }, [doc?.id]);

  const isEditor = doc?.kind === "editor";
  const isFile = doc?.kind === "file";
  const isLocked = !!doc?.signed_at;

  // ─── Autosave debounced ─────────────────────────────────────────────────
  useEffect(() => {
    if (!doc || isLocked || body === null) return;
    if (JSON.stringify(body) === JSON.stringify(doc.body_json)) return;
    const t = setTimeout(async () => {
      setSaving(true);
      try {
        await api.updateDocument(doc.id, { body_json: body });
        setSavedAt(new Date());
        // No invalidamos `["document", id]` para no perder el cursor del editor.
        qc.invalidateQueries({ queryKey: ["documents"] });
      } catch (e: any) {
        toast.error(e.message ?? "Error al guardar");
      } finally {
        setSaving(false);
      }
    }, 1500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [body]);

  // ─── Mutaciones ─────────────────────────────────────────────────────────
  const renameMu = useMutation({
    mutationFn: (name: string) => api.updateDocument(id, { name }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["document", id] });
      qc.invalidateQueries({ queryKey: ["documents"] });
      toast.success("Renombrado");
    },
  });
  const signMu = useMutation({
    mutationFn: () => api.signDocument(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["document", id] });
      qc.invalidateQueries({ queryKey: ["documents"] });
      toast.success("Documento firmado");
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const archiveMu = useMutation({
    mutationFn: () => api.archiveDocument(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["documents"] });
      toast.success("Archivado");
      navigate({ to: "/documentos" });
    },
  });
  const deleteMu = useMutation({
    mutationFn: () => api.deleteDocument(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["documents"] });
      toast.success("Eliminado");
      navigate({ to: "/documentos" });
    },
  });
  const duplicateMu = useMutation({
    mutationFn: () => api.duplicateDocument(id, {}),
    onSuccess: (created) => {
      qc.invalidateQueries({ queryKey: ["documents"] });
      toast.success("Duplicado");
      navigate({ to: "/documentos/$id", params: { id: created.id } });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Descarga el PDF generado server-side (pdfmake). Texto seleccionable,
  // mismo render en cualquier dispositivo, no congela el navegador.
  async function downloadPdf() {
    if (!doc) return;
    setDownloadingPdf(true);
    try {
      // Si hay autosave pendiente, esperarlo antes de pedir el PDF — para que
      // el server lea el body actualizado, no la versión vieja.
      if (saving) await new Promise((r) => setTimeout(r, 1800));
      const blob = await api.downloadDocumentPdf(doc.id);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = sanitizeFilename(doc.name) + ".pdf";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast.success("PDF descargado");
    } catch (e: any) {
      toast.error("No se pudo generar el PDF: " + (e?.message ?? e));
    } finally {
      setDownloadingPdf(false);
    }
  }

  // ─── Estados de carga / error ────────────────────────────────────────────
  if (isLoading) {
    return <AppShell><div className="flex items-center justify-center min-h-[60vh] text-ink-500"><Loader2 className="h-5 w-5 animate-spin" /></div></AppShell>;
  }
  if (error || !doc) {
    return <AppShell><div className="text-center py-20"><AlertCircle className="h-8 w-8 mx-auto text-ink-400 mb-2" /><p className="text-ink-500">Documento no encontrado.</p></div></AppShell>;
  }

  // Si es archivo subido, mostramos el viewer en una página dedicada
  if (isFile) return <FileViewerPage doc={doc} onArchive={() => archiveMu.mutate()} onDelete={() => deleteMu.mutate()} />;

  // Editor in-app
  return (
    <AppShell>
      <div className="max-w-4xl mx-auto">
        {/* Header sticky con metadata + acciones */}
        <header className="psm-no-print sticky top-0 z-10 -mx-4 sm:mx-0 px-4 sm:px-0 py-3 bg-bg/95 backdrop-blur border-b border-line-100 mb-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-3 min-w-0 flex-1">
              <Link to="/documentos" className="h-9 w-9 rounded-md hover:bg-bg-100 flex items-center justify-center text-ink-500 shrink-0" aria-label="Volver">
                <ChevronLeft className="h-5 w-5" />
              </Link>
              <DocumentTitle doc={doc} editable={!isLocked} onRename={(name) => renameMu.mutate(name)} />
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <SaveStatus saving={saving} savedAt={savedAt} locked={isLocked} />
              <button
                type="button"
                onClick={downloadPdf}
                disabled={downloadingPdf}
                className="h-9 px-3 rounded-md text-sm border border-line-200 hover:border-brand-400 inline-flex items-center gap-2 text-ink-700 disabled:opacity-60"
                title="Descargar el documento como PDF"
              >
                {downloadingPdf ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                <span className="hidden sm:inline">{downloadingPdf ? "Generando…" : "Descargar PDF"}</span>
              </button>
              {!isLocked && doc.patient_id && (
                <button
                  type="button"
                  onClick={() => setSignRequestOpen(true)}
                  className="h-9 px-3 rounded-md text-sm border border-line-200 hover:border-brand-400 inline-flex items-center gap-2 text-ink-700"
                  title="Generar enlace para que el paciente firme desde su celular"
                >
                  <Send className="h-4 w-4" /> <span className="hidden sm:inline">Pedir firma del paciente</span>
                </button>
              )}
              {!isLocked && (
                <button
                  type="button"
                  onClick={() => {
                    if (confirm("Una vez firmado, este documento queda inmodificable. ¿Continuar?")) {
                      signMu.mutate();
                    }
                  }}
                  disabled={signMu.isPending}
                  className="h-9 px-3 rounded-md text-sm bg-brand-700 text-white hover:bg-brand-700/90 inline-flex items-center gap-2 disabled:opacity-50"
                >
                  <FileSignature className="h-4 w-4" /> <span className="hidden sm:inline">Firmar</span>
                </button>
              )}
              <ActionsMenu
                locked={isLocked}
                onDuplicate={() => duplicateMu.mutate()}
                onArchive={() => archiveMu.mutate()}
                onDelete={() => { if (confirm("¿Eliminar definitivamente?")) deleteMu.mutate(); }}
              />
            </div>
          </div>
          {isLocked && (
            <div className="mt-2 flex items-center gap-2 text-xs text-ink-500">
              <Lock className="h-3.5 w-3.5 text-sage-500" />
              <span>Firmado el {formatDateTime(doc.signed_at!)}. Documento inmodificable según Resolución 1995/1999.</span>
            </div>
          )}
          <PatientLinkRow doc={doc} disabled={isLocked} />
        </header>

        {/* Print header (solo visible al imprimir) */}
        <div className="psm-print-only mb-6 pb-4 border-b border-line-200">
          <h1 className="font-serif text-xl text-ink-900 m-0">{workspace?.name ?? "Psicomorfosis"}</h1>
          <p className="text-xs text-ink-500 m-0">{doc.professional} · {formatDateTime(doc.updated_at)}</p>
          <p className="text-xs text-ink-500 m-0 mt-1"><strong>{doc.name}</strong>{doc.patient_name ? ` · Paciente: ${doc.patient_name} (${doc.patient_id})` : ""}</p>
        </div>

        <div ref={editorContainerRef}>
        <DocumentEditor
          initialDoc={doc.body_json ?? null}
          editable={!isLocked}
          variableContext={variableContext ?? null}
          onChange={(d, t) => { setBody(d); setText(t); }}
          onUploadImage={async (file) => {
            // Las imágenes inline van a una tabla aparte (document_assets) — NO
            // contaminan la lista de Documentos. Se sirven via /api/uploads/...
            // como static (sin token, filename unguessable).
            const asset = await api.uploadDocumentAsset(file, doc.id);
            return asset.public_url.startsWith("http") ? asset.public_url : `${window.location.origin}${asset.public_url}`;
          }}
          onUploadAttachment={async (file) => {
            const asset = await api.uploadDocumentAsset(file, doc.id);
            const absoluteUrl = asset.public_url.startsWith("http") ? asset.public_url : `${window.location.origin}${asset.public_url}`;
            return {
              url: absoluteUrl,
              name: file.name,
              mime: file.type || asset.mime,
              sizeBytes: file.size,
            };
          }}
        />
        </div>
      </div>
      {signRequestOpen && (
        <SignRequestModal doc={doc} onClose={() => setSignRequestOpen(false)} />
      )}
    </AppShell>
  );
}

// ─── Modal: Solicitar firma del paciente ───────────────────────────────────
function SignRequestModal({ doc, onClose }: { doc: PsmDocument; onClose: () => void }) {
  const [data, setData] = useState<{ token: string; url: string; expires_at: string; days_valid: number; whatsapp_text: string; patient_phone: string | null } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    api.createSignRequest(doc.id)
      .then((res) => { if (active) setData(res); })
      .catch((e: any) => { if (active) setError(e?.message ?? "Error"); });
    return () => { active = false; };
  }, [doc.id]);

  function copy(text: string, label: string) {
    navigator.clipboard?.writeText(text).then(
      () => toast.success(`${label} copiado`),
      () => toast.error("No se pudo copiar")
    );
  }

  const wa = data ? whatsappUrl(data.patient_phone, data.whatsapp_text) : null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-ink-900/50 backdrop-blur-sm p-0 sm:p-4" onClick={onClose}>
      <div className="w-full sm:max-w-lg bg-surface rounded-t-2xl sm:rounded-2xl shadow-modal max-h-[92vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <header className="px-5 py-4 border-b border-line-100 flex items-start justify-between">
          <div>
            <p className="text-[11px] uppercase tracking-widest text-brand-700 font-medium">Firma del paciente</p>
            <h3 className="font-serif text-xl text-ink-900 mt-0.5">Pedir firma a {doc.patient_name?.split(" ")[0] ?? "paciente"}</h3>
            <p className="text-xs text-ink-500 mt-1">Se genera un enlace único. El paciente lo abre, lee el documento y firma desde su celular o computador. La firma queda con sello de tiempo, IP y hash SHA-256.</p>
          </div>
          <button onClick={onClose} className="h-9 w-9 rounded-md border border-line-200 flex items-center justify-center text-ink-500 hover:border-brand-400">
            <span className="text-base leading-none">×</span>
          </button>
        </header>

        <div className="p-5">
          {error && <div className="rounded-lg border border-rose-300/50 bg-rose-500/5 p-3 text-xs text-rose-700">{error}</div>}
          {!data && !error && <div className="text-center py-8 text-ink-500"><Loader2 className="h-5 w-5 mx-auto mb-2 animate-spin" /> Generando enlace…</div>}
          {data && (
            <div className="space-y-4">
              <div className="rounded-xl border border-line-200 bg-bg-100 p-4 flex flex-col items-center gap-2">
                <QRCodeSVG value={data.url} size={180} marginSize={2} />
                <p className="text-[11px] text-ink-500">Escanea con la cámara</p>
              </div>
              <div>
                <label className="block text-[11px] uppercase tracking-wider text-ink-500 mb-1">Enlace de firma</label>
                <div className="flex gap-2">
                  <input readOnly value={data.url} onClick={(e) => (e.target as HTMLInputElement).select()}
                    className="flex-1 h-10 px-3 rounded-md border border-line-200 bg-bg text-xs text-ink-900 font-mono" />
                  <button onClick={() => copy(data.url, "Enlace")} className="h-10 px-3 rounded-md bg-brand-700 text-white text-xs font-medium hover:bg-brand-800 inline-flex items-center gap-1.5">
                    <Copy className="h-3.5 w-3.5" /> Copiar
                  </button>
                </div>
                <p className="text-[11px] text-ink-500 mt-1">Válido por {data.days_valid} días — expira el {new Date(data.expires_at).toLocaleString("es-CO", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}.</p>
              </div>
              <div>
                <label className="block text-[11px] uppercase tracking-wider text-ink-500 mb-1">Mensaje sugerido</label>
                <textarea readOnly value={data.whatsapp_text}
                  className="w-full h-32 px-3 py-2 rounded-md border border-line-200 bg-bg text-xs text-ink-700 font-mono resize-none" />
                <div className="mt-2 flex gap-2">
                  <button onClick={() => copy(data.whatsapp_text, "Mensaje")} className="flex-1 h-10 px-3 rounded-md border border-line-200 text-xs text-ink-700 hover:border-brand-400">
                    Copiar mensaje
                  </button>
                  {wa && (
                    <a href={wa} target="_blank" rel="noopener noreferrer"
                      className="flex-1 h-10 px-3 rounded-md bg-sage-500 text-white text-xs font-medium hover:bg-sage-700 inline-flex items-center justify-center gap-1.5">
                      <MessageCircle className="h-3.5 w-3.5" /> Abrir WhatsApp
                    </a>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        <footer className="px-5 py-4 border-t border-line-100 flex justify-end">
          <button onClick={onClose} className="h-10 px-4 rounded-lg border border-line-200 text-sm text-ink-700 hover:border-brand-400">Cerrar</button>
        </footer>
      </div>
    </div>
  );
}

// ─── File viewer (kind='file') ──────────────────────────────────────────────
function FileViewerPage({ doc, onArchive, onDelete }: { doc: PsmDocument; onArchive: () => void; onDelete: () => void }) {
  // Con token en query no hace falta blob: iframe e img cargan directo.
  const fileUrl = api.documentFileUrl(doc.id);
  const downloadUrl = api.documentFileUrl(doc.id, { download: true });
  const isPdf = doc.mime === "application/pdf" || /\.pdf$/i.test(doc.original_name ?? "");
  const isImage = doc.mime?.startsWith("image/");
  const isDocLegacy = /\.doc$/i.test(doc.original_name ?? "") &&
    !/\.docx$/i.test(doc.original_name ?? "");

  const ext = doc.original_name?.split(".").pop() ?? "bin";
  const safeName = (doc.name || "documento").replace(/[^\w\-. ]/g, "_");

  return (
    <AppShell>
      <div className="max-w-5xl mx-auto">
        <header className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <Link to="/documentos" className="h-9 w-9 rounded-md hover:bg-bg-100 flex items-center justify-center text-ink-500 shrink-0" aria-label="Volver">
              <ChevronLeft className="h-5 w-5" />
            </Link>
            <div className="min-w-0">
              <h1 className="font-serif text-lg sm:text-xl text-ink-900 truncate">{doc.name}</h1>
              <p className="text-xs text-ink-500 truncate">{doc.original_name} · {Math.round((doc.size_bytes ?? 0) / 1024)} KB · {doc.mime}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <a href={downloadUrl} download={`${safeName}.${ext}`}
              className="h-9 px-3 rounded-md text-sm border border-line-200 hover:border-brand-400 inline-flex items-center gap-2 text-ink-700">
              <FileText className="h-4 w-4" /> Descargar
            </a>
            <ActionsMenu onArchive={onArchive} onDelete={() => { if (confirm("¿Eliminar definitivamente el archivo?")) onDelete(); }} />
          </div>
        </header>
        <div className="rounded-xl bg-surface border border-line-200 p-4 min-h-[60vh]">
          {isPdf ? (
            <iframe src={fileUrl} className="w-full h-[80vh] rounded-lg border border-line-100" title={doc.name} />
          ) : isImage ? (
            <img src={fileUrl} alt={doc.name} className="max-w-full mx-auto rounded-lg" />
          ) : isDocLegacy ? (
            <div className="text-center py-16 max-w-md mx-auto">
              <FileText className="h-10 w-10 mx-auto text-ink-300 mb-3" />
              <p className="text-ink-700 font-medium">Word formato antiguo (.doc)</p>
              <p className="text-ink-500 text-sm mt-2">
                Para ver y editar este archivo dentro de Psicomorfosis, ábrelo en Word
                y guárdalo como <strong>.docx</strong> (Archivo → Guardar como → Documento de Word).
                Luego súbelo de nuevo y se abrirá en el editor inline.
              </p>
              <p className="text-ink-400 text-xs mt-3">
                Mientras tanto, puedes descargarlo y abrirlo en tu equipo.
              </p>
            </div>
          ) : (
            <div className="text-center py-20">
              <FileText className="h-10 w-10 mx-auto text-ink-300 mb-3" />
              <p className="text-ink-500">Vista previa no disponible para este tipo de archivo.</p>
              <p className="text-ink-400 text-xs mt-1">Usa el botón "Descargar" para abrirlo en tu equipo.</p>
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}

// ─── UI helpers ─────────────────────────────────────────────────────────────
function DocumentTitle({ doc, editable, onRename }: { doc: PsmDocument; editable: boolean; onRename: (n: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(doc.name);

  useEffect(() => setValue(doc.name), [doc.name]);

  if (!editable || !editing) {
    return (
      <h1
        className="font-serif text-lg sm:text-xl text-ink-900 truncate flex-1 min-w-0 cursor-pointer"
        onClick={() => editable && setEditing(true)}
        title={editable ? "Click para renombrar" : ""}
      >
        {doc.name}
      </h1>
    );
  }
  return (
    <input
      autoFocus
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => {
        setEditing(false);
        if (value.trim() && value !== doc.name) onRename(value.trim());
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        if (e.key === "Escape") { setEditing(false); setValue(doc.name); }
      }}
      className="font-serif text-lg sm:text-xl flex-1 min-w-0 bg-transparent border-b border-brand-400 outline-none px-1"
    />
  );
}

function SaveStatus({ saving, savedAt, locked }: { saving: boolean; savedAt: Date | null; locked: boolean }) {
  if (locked) return null;
  return (
    <span className="text-xs text-ink-500 inline-flex items-center gap-1.5 mr-1">
      {saving ? (
        <><Loader2 className="h-3 w-3 animate-spin" /> Guardando…</>
      ) : savedAt ? (
        <><Check className="h-3 w-3 text-sage-500" /> Guardado {savedAt.toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" })}</>
      ) : (
        <span className="text-ink-400">Listo para editar</span>
      )}
    </span>
  );
}

function ActionsMenu({ onDuplicate, onArchive, onDelete, locked }: {
  onDuplicate?: () => void;
  onArchive: () => void;
  onDelete: () => void;
  locked?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null);

  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    setTimeout(() => document.addEventListener("click", close, { once: true }), 0);
    return () => document.removeEventListener("click", close);
  }, [open]);

  // Posicionar contra el viewport. El menú se renderiza en document.body via
  // portal para escapar de cualquier ancestor con `transform` (TipTap aplica
  // transform al editor, lo cual rompe los `position: fixed` descendientes
  // y hacía que en mobile el menú apareciera "flotando" en medio de la hoja).
  useEffect(() => {
    if (open && btnRef.current) {
      const r = btnRef.current.getBoundingClientRect();
      const top = r.bottom + 6;
      const right = window.innerWidth - r.right;
      setPos({ top, right: Math.max(8, right) });
    }
  }, [open]);

  const menu = open && pos ? (
    <div
      className="fixed w-52 rounded-lg border border-line-200 bg-surface shadow-modal py-1 z-1000"
      style={{ top: pos.top, right: pos.right }}
      onClick={(e) => e.stopPropagation()}
    >
      {onDuplicate && !locked && (
        <button onClick={onDuplicate} className="w-full text-left px-3 py-2 text-sm text-ink-700 hover:bg-bg-100 inline-flex items-center gap-2">
          <Copy className="h-4 w-4" /> Duplicar y reasignar
        </button>
      )}
      <button onClick={onArchive} className="w-full text-left px-3 py-2 text-sm text-ink-700 hover:bg-bg-100 inline-flex items-center gap-2">
        <Archive className="h-4 w-4" /> Archivar
      </button>
      <button onClick={onDelete} className="w-full text-left px-3 py-2 text-sm text-rose-700 hover:bg-rose-500/10 inline-flex items-center gap-2">
        <Trash2 className="h-4 w-4" /> Eliminar
      </button>
    </div>
  ) : null;

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="h-9 w-9 rounded-md border border-line-200 hover:border-brand-400 flex items-center justify-center text-ink-700"
        aria-label="Más acciones"
      >
        <span className="font-bold text-base leading-none">···</span>
      </button>
      {/* Portal a body para escapar el contexto transform de TipTap. */}
      {typeof document !== "undefined" && menu ? createPortal(menu, document.body) : null}
    </>
  );
}

/** Fila para vincular o cambiar el paciente del documento desde el editor. */
function PatientLinkRow({ doc, disabled }: { doc: PsmDocument; disabled?: boolean }) {
  const qc = useQueryClient();
  const [picking, setPicking] = useState(false);

  const { data: patients = [] } = useQuery({
    queryKey: ["patients"],
    queryFn: () => api.listPatients(),
  });

  const setPatientMu = useMutation({
    mutationFn: async (patient: ApiPatient | null) => {
      return api.updateDocument(doc.id, {
        patient_id: patient?.id ?? null,
        patient_name: patient?.name ?? null,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["document", doc.id] });
      qc.invalidateQueries({ queryKey: ["documents"] });
      setPicking(false);
      toast.success(doc.patient_id ? "Paciente actualizado" : "Paciente vinculado");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!doc.patient_name && !picking) {
    return (
      <div className="mt-2 flex items-center gap-2 text-xs text-ink-500 flex-wrap">
        <User className="h-3.5 w-3.5" />
        <span className="text-ink-400">Sin paciente vinculado</span>
        {!disabled && (
          <button
            onClick={() => setPicking(true)}
            className="text-brand-700 hover:underline"
          >
            Enlazar paciente
          </button>
        )}
      </div>
    );
  }

  if (picking) {
    return (
      <div className="mt-2 flex items-center gap-2 flex-wrap">
        <div className="flex-1 min-w-60 max-w-md">
          <PatientPicker
            value={doc.patient_id ?? null}
            patients={patients}
            autoFocus
            compact
            onChange={(id) => {
              const p = id ? patients.find((x) => x.id === id) ?? null : null;
              setPatientMu.mutate(p);
            }}
          />
        </div>
        <button onClick={() => setPicking(false)} className="text-xs text-ink-500 hover:text-ink-700">
          Cancelar
        </button>
      </div>
    );
  }

  return (
    <div className="mt-2 flex items-center gap-2 text-xs text-ink-500 flex-wrap">
      <User className="h-3.5 w-3.5" />
      <Link to="/pacientes/$id" params={{ id: doc.patient_id! }} className="hover:text-brand-700">
        {doc.patient_name} <span className="text-ink-400">· {doc.patient_id}</span>
      </Link>
      {!disabled && (
        <button
          onClick={() => setPicking(true)}
          className="text-ink-400 hover:text-brand-700"
          title="Cambiar o quitar paciente"
        >
          (cambiar)
        </button>
      )}
    </div>
  );
}

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("es-CO", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function sanitizeFilename(name: string): string {
  return name
    .normalize("NFD").replace(/[̀-ͯ]/g, "") // sin acentos
    .replace(/[^a-zA-Z0-9-_ ]/g, "")
    .trim()
    .replace(/\s+/g, "_")
    .slice(0, 80) || "documento";
}
