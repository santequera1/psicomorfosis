import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  ChevronLeft, FileSignature, Printer, Archive, Trash2, AlertCircle, Loader2,
  Check, Lock, User, FileText,
} from "lucide-react";
import { AppShell } from "@/components/app/AppShell";
import { DocumentEditor } from "@/components/documents/DocumentEditor";
import { api, type PsmDocument, type TipTapDoc } from "@/lib/api";
import { useWorkspace } from "@/lib/workspace";

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

  // ─── Local state del editor ─────────────────────────────────────────────
  const [body, setBody] = useState<TipTapDoc | null>(null);
  const [text, setText] = useState<string>("");
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [saving, setSaving] = useState(false);

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
                onClick={() => window.print()}
                className="h-9 px-3 rounded-md text-sm border border-line-200 hover:border-brand-400 inline-flex items-center gap-2 text-ink-700"
              >
                <Printer className="h-4 w-4" /> <span className="hidden sm:inline">Imprimir / PDF</span>
              </button>
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
              <ActionsMenu onArchive={() => archiveMu.mutate()} onDelete={() => { if (confirm("¿Eliminar definitivamente?")) deleteMu.mutate(); }} />
            </div>
          </div>
          {isLocked && (
            <div className="mt-2 flex items-center gap-2 text-xs text-ink-500">
              <Lock className="h-3.5 w-3.5 text-sage-500" />
              <span>Firmado el {formatDateTime(doc.signed_at!)}. Documento inmodificable según Resolución 1995/1999.</span>
            </div>
          )}
          {doc.patient_name && (
            <div className="mt-2 flex items-center gap-2 text-xs text-ink-500">
              <User className="h-3.5 w-3.5" />
              <Link to="/pacientes/$id" params={{ id: doc.patient_id! }} className="hover:text-brand-700">
                {doc.patient_name} <span className="text-ink-400">· {doc.patient_id}</span>
              </Link>
            </div>
          )}
        </header>

        {/* Print header (solo visible al imprimir) */}
        <div className="psm-print-only mb-6 pb-4 border-b border-line-200">
          <h1 className="font-serif text-xl text-ink-900 m-0">{workspace?.name ?? "Psicomorfosis"}</h1>
          <p className="text-xs text-ink-500 m-0">{doc.professional} · {formatDateTime(doc.updated_at)}</p>
          <p className="text-xs text-ink-500 m-0 mt-1"><strong>{doc.name}</strong>{doc.patient_name ? ` · Paciente: ${doc.patient_name} (${doc.patient_id})` : ""}</p>
        </div>

        <DocumentEditor
          initialDoc={doc.body_json ?? null}
          editable={!isLocked}
          onChange={(d, t) => { setBody(d); setText(t); }}
          onUploadImage={async (file) => {
            // Las imágenes inline necesitan URL sin token (img tags no envían
            // Authorization). El backend devuelve public_url para mime image/*
            // sirviéndolo desde /uploads/ con filename random unguessable.
            const meta = { name: file.name, type: "imagen", patient_id: doc.patient_id ?? undefined };
            const uploaded = await api.uploadDocument(file, meta);
            const publicUrl = uploaded.public_url;
            if (!publicUrl) throw new Error("No se pudo obtener URL pública para la imagen");
            // Construir URL absoluta para que funcione tanto en dev como en SSR
            return publicUrl.startsWith("http") ? publicUrl : `${window.location.origin}${publicUrl}`;
          }}
        />
      </div>
    </AppShell>
  );
}

// ─── File viewer (kind='file') ──────────────────────────────────────────────
function FileViewerPage({ doc, onArchive, onDelete }: { doc: PsmDocument; onArchive: () => void; onDelete: () => void }) {
  // Con token en query no hace falta blob: iframe e img cargan directo.
  const fileUrl = api.documentFileUrl(doc.id);
  const downloadUrl = api.documentFileUrl(doc.id, { download: true });
  const isPdf = doc.mime === "application/pdf";
  const isImage = doc.mime?.startsWith("image/");

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

function ActionsMenu({ onArchive, onDelete }: { onArchive: () => void; onDelete: () => void }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    setTimeout(() => document.addEventListener("click", close, { once: true }), 0);
    return () => document.removeEventListener("click", close);
  }, [open]);
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="h-9 w-9 rounded-md border border-line-200 hover:border-brand-400 flex items-center justify-center text-ink-700"
        aria-label="Más acciones"
      >
        <span className="font-bold text-base leading-none">···</span>
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 w-48 rounded-lg border border-line-200 bg-surface shadow-card py-1 z-20">
          <button onClick={onArchive} className="w-full text-left px-3 py-2 text-sm text-ink-700 hover:bg-bg-100 inline-flex items-center gap-2">
            <Archive className="h-4 w-4" /> Archivar
          </button>
          <button onClick={onDelete} className="w-full text-left px-3 py-2 text-sm text-rose-700 hover:bg-rose-500/10 inline-flex items-center gap-2">
            <Trash2 className="h-4 w-4" /> Eliminar
          </button>
        </div>
      )}
    </div>
  );
}

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("es-CO", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}
