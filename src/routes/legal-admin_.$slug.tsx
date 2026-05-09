/**
 * /legal-admin/<slug> — editor de un documento legal.
 *
 * Vista en dos paneles:
 *   - Izquierda: editor TipTap del borrador activo (si no hay
 *     borrador, hay un botón para crearlo a partir de la última
 *     versión publicada).
 *   - Derecha: historial de versiones (publicada, archivadas,
 *     borrador). Click en una versión publicada/archivada abre
 *     vista previa solo lectura.
 *
 * Auto-guardado del borrador con debounce de 1.2s desde la última
 * tecla. La asesora ve un indicador "Guardado" / "Guardando…" en la
 * topbar para no quedar en duda sobre si su trabajo se persistió.
 *
 * Publicación: pide un resumen breve de cambios (el "summary_of_changes"
 * queda inmutable junto a la versión y aparece en el banner público
 * de la página).
 */

import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ArrowLeft, Loader2, FilePlus, Save, Send, Trash2, Eye, EyeOff,
  CheckCircle2, AlertCircle, X, Clock, Archive, FileSignature, History,
} from "lucide-react";
import { api, getStoredUser } from "@/lib/api";
import { cn } from "@/lib/utils";
import { LegalDocumentEditor, LegalDocumentView } from "@/components/legal/LegalDocumentEditor";
import { LegalAdminShell } from "./legal-admin";

export const Route = createFileRoute("/legal-admin_/$slug")({
  head: ({ params }) => ({ meta: [{ title: `Editar · ${params.slug} · Psicomorfosis` }] }),
  component: LegalDocumentEditPage,
});

function LegalDocumentEditPage() {
  const { slug } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [allowed, setAllowed] = useState(false);
  useEffect(() => {
    const u = getStoredUser();
    if (!u || !u.isLegalAdmin) {
      navigate({ to: "/" });
      return;
    }
    setAllowed(true);
  }, [navigate]);

  const { data: doc, isLoading: loadingDoc } = useQuery({
    queryKey: ["legal-doc", slug],
    queryFn: () => api.legalAdminGetDocument(slug),
    enabled: allowed,
  });

  // Estado del editor: la versión que se está editando (id) y su HTML.
  const [editingVersionId, setEditingVersionId] = useState<number | null>(null);
  const [editingHtml, setEditingHtml] = useState<string>("");
  const [previewVersionId, setPreviewVersionId] = useState<number | null>(null);
  const [publishOpen, setPublishOpen] = useState(false);

  // Cuando llega el doc, elegimos automáticamente:
  // - El draft pendiente si existe.
  // - Si no, no abrimos editor (el usuario hará click en "Crear borrador").
  useEffect(() => {
    if (!doc) return;
    const draft = doc.versions.find((v) => v.status === "draft");
    if (draft) setEditingVersionId(draft.id);
  }, [doc]);

  // Cargamos el HTML del editingVersionId (puede ser un draft que se acaba
  // de crear, o uno que ya existía).
  const { data: editingVersion, isLoading: loadingVersion } = useQuery({
    queryKey: ["legal-version", editingVersionId],
    queryFn: () => api.legalAdminGetVersion(editingVersionId!),
    enabled: editingVersionId != null,
  });
  useEffect(() => {
    if (editingVersion?.bodyHtml != null) setEditingHtml(editingVersion.bodyHtml);
  }, [editingVersion?.id]); // solo cuando cambia la versión, no en cada update

  // Auto-guardado debounced.
  const saveMut = useMutation({
    mutationFn: (input: { id: number; bodyHtml: string }) =>
      api.legalAdminUpdateVersion(input.id, { bodyHtml: input.bodyHtml }),
  });
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dirtyRef = useRef(false);

  function onChangeHtml(html: string) {
    setEditingHtml(html);
    if (!editingVersionId) return;
    dirtyRef.current = true;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      saveMut.mutate({ id: editingVersionId, bodyHtml: html }, {
        onSuccess: () => { dirtyRef.current = false; },
      });
    }, 1200);
  }

  // Crear draft (cuando no había).
  const createDraftMut = useMutation({
    mutationFn: () => api.legalAdminCreateDraft(slug),
    onSuccess: (resp) => {
      setEditingVersionId(resp.versionId);
      qc.invalidateQueries({ queryKey: ["legal-doc", slug] });
      toast.success("Borrador creado");
    },
  });

  // Publicar.
  const publishMut = useMutation({
    mutationFn: (input: { versionId: number; summary: string }) =>
      api.legalAdminUpdateVersion(input.versionId, { summaryOfChanges: input.summary })
        .then(() => api.legalAdminPublishVersion(input.versionId)),
    onSuccess: () => {
      setPublishOpen(false);
      setEditingVersionId(null);
      qc.invalidateQueries({ queryKey: ["legal-doc", slug] });
      qc.invalidateQueries({ queryKey: ["legal-admin-docs"] });
      toast.success("Publicado. La nueva versión ya es la vigente.");
    },
    onError: (e: any) => toast.error(e?.message ?? "No se pudo publicar"),
  });

  // Eliminar borrador.
  const deleteDraftMut = useMutation({
    mutationFn: (versionId: number) => api.legalAdminDeleteVersion(versionId),
    onSuccess: () => {
      setEditingVersionId(null);
      qc.invalidateQueries({ queryKey: ["legal-doc", slug] });
      toast.success("Borrador eliminado");
    },
  });

  if (!allowed || loadingDoc) {
    return (
      <LegalAdminShell title="Cargando…">
        <div className="flex items-center justify-center py-12 text-ink-400">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      </LegalAdminShell>
    );
  }
  if (!doc) {
    return (
      <LegalAdminShell title="Documento no encontrado">
        <div className="rounded-xl border border-line-200 bg-surface p-6 text-sm text-ink-500">
          No existe un documento con slug <code>{slug}</code>.
          <div className="mt-4">
            <Link to="/legal-admin" className="text-brand-700 underline">Volver al listado</Link>
          </div>
        </div>
      </LegalAdminShell>
    );
  }

  const draft = doc.versions.find((v) => v.status === "draft");
  const published = doc.versions.find((v) => v.status === "published");
  const previewVersion = previewVersionId
    ? doc.versions.find((v) => v.id === previewVersionId)
    : null;

  return (
    <LegalAdminShell
      title={doc.title}
      subtitle={doc.description ?? undefined}
    >
      <div className="mb-4 flex items-center gap-3">
        <Link to="/legal-admin" className="inline-flex items-center gap-1 text-sm text-ink-500 hover:text-ink-900">
          <ArrowLeft className="h-4 w-4" /> Volver
        </Link>
        <span className="text-ink-300">·</span>
        <SaveIndicator dirty={dirtyRef.current} pending={saveMut.isPending} hasDraft={!!editingVersionId} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6">
        {/* Editor */}
        <section>
          {!editingVersionId && !previewVersion && (
            <NoDraftState
              hasPublished={!!published}
              onCreate={() => createDraftMut.mutate()}
              creating={createDraftMut.isPending}
            />
          )}

          {editingVersionId && !previewVersion && (
            <>
              {loadingVersion ? (
                <div className="flex items-center justify-center py-12 text-ink-400">
                  <Loader2 className="h-5 w-5 animate-spin" />
                </div>
              ) : (
                <LegalDocumentEditor
                  initialHtml={editingHtml}
                  onChange={onChangeHtml}
                  editable
                />
              )}

              <div className="mt-4 flex flex-wrap items-center gap-2">
                <button
                  onClick={() => setPublishOpen(true)}
                  disabled={!editingVersionId || saveMut.isPending}
                  className="h-10 px-4 rounded-lg bg-brand-700 text-white text-sm font-medium hover:bg-brand-800 disabled:opacity-50 inline-flex items-center gap-2"
                >
                  <Send className="h-4 w-4" /> Publicar como versión vigente
                </button>
                {draft && (
                  <button
                    onClick={() => {
                      if (confirm("¿Descartar este borrador? La acción no se puede deshacer.")) {
                        deleteDraftMut.mutate(draft.id);
                      }
                    }}
                    className="h-10 px-3 rounded-lg text-sm text-error hover:bg-error-soft inline-flex items-center gap-2"
                  >
                    <Trash2 className="h-4 w-4" /> Descartar
                  </button>
                )}
              </div>
            </>
          )}

          {previewVersion && (
            <PreviewVersionView
              versionId={previewVersion.id}
              onClose={() => setPreviewVersionId(null)}
            />
          )}
        </section>

        {/* Panel lateral: historial */}
        <aside className="space-y-4">
          <VersionsHistory
            versions={doc.versions}
            editingVersionId={editingVersionId}
            previewVersionId={previewVersionId}
            onPreview={(id) => setPreviewVersionId(id === previewVersionId ? null : id)}
            onEditDraft={(id) => { setPreviewVersionId(null); setEditingVersionId(id); }}
          />
          <DocumentMeta doc={doc} />
        </aside>
      </div>

      {publishOpen && editingVersionId && (
        <PublishModal
          onClose={() => setPublishOpen(false)}
          publishing={publishMut.isPending}
          initialSummary={editingVersion?.summaryOfChanges ?? ""}
          onPublish={(summary) => publishMut.mutate({ versionId: editingVersionId, summary })}
        />
      )}
    </LegalAdminShell>
  );
}

function SaveIndicator({
  dirty, pending, hasDraft,
}: { dirty: boolean; pending: boolean; hasDraft: boolean }) {
  if (!hasDraft) {
    return <span className="text-xs text-ink-500 inline-flex items-center gap-1.5"><Eye className="h-3 w-3" /> Solo lectura — crea un borrador para editar</span>;
  }
  if (pending) {
    return <span className="text-xs text-ink-500 inline-flex items-center gap-1.5"><Loader2 className="h-3 w-3 animate-spin" /> Guardando…</span>;
  }
  if (dirty) {
    return <span className="text-xs text-warning inline-flex items-center gap-1.5"><AlertCircle className="h-3 w-3" /> Cambios sin guardar</span>;
  }
  return <span className="text-xs text-success inline-flex items-center gap-1.5"><CheckCircle2 className="h-3 w-3" /> Guardado</span>;
}

function NoDraftState({
  hasPublished, onCreate, creating,
}: { hasPublished: boolean; onCreate: () => void; creating: boolean }) {
  return (
    <div className="rounded-xl border border-dashed border-line-200 bg-bg-50 p-10 text-center">
      <div className="mx-auto h-12 w-12 rounded-full bg-brand-100 text-brand-700 flex items-center justify-center mb-4">
        <FilePlus className="h-6 w-6" />
      </div>
      <h3 className="font-serif text-lg text-ink-900">Sin borrador activo</h3>
      <p className="text-sm text-ink-500 mt-1.5 max-w-md mx-auto">
        {hasPublished
          ? "El borrador se creará a partir de la última versión publicada. Lo podrás editar y publicar cuando quieras."
          : "Aún no se ha publicado ninguna versión de este documento. Crea un borrador para empezar."}
      </p>
      <button
        onClick={onCreate}
        disabled={creating}
        className="mt-5 h-11 px-5 rounded-lg bg-brand-700 text-white text-sm font-medium hover:bg-brand-800 disabled:opacity-50 inline-flex items-center gap-2"
      >
        {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <FilePlus className="h-4 w-4" />}
        Crear borrador
      </button>
    </div>
  );
}

function PreviewVersionView({
  versionId, onClose,
}: { versionId: number; onClose: () => void }) {
  const { data: v, isLoading } = useQuery({
    queryKey: ["legal-version", versionId],
    queryFn: () => api.legalAdminGetVersion(versionId),
  });
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12 text-ink-400">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }
  if (!v) return null;
  const statusLabel = { draft: "Borrador", published: "Vigente", archived: "Archivada" }[v.status];
  return (
    <div className="rounded-xl border border-line-200 bg-surface overflow-hidden">
      <div className="border-b border-line-200 bg-bg-50 px-5 py-3 flex items-center justify-between gap-3">
        <div className="text-sm">
          <span className="font-medium text-ink-900">Vista previa · {v.versionLabel}</span>
          <span className="text-ink-500 ml-2 text-xs">{statusLabel}</span>
        </div>
        <button onClick={onClose} className="h-8 w-8 rounded-md text-ink-500 hover:bg-bg-100 inline-flex items-center justify-center" aria-label="Cerrar">
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="px-5 sm:px-7 py-2">
        <LegalDocumentView html={v.bodyHtml} />
      </div>
    </div>
  );
}

function VersionsHistory({
  versions, editingVersionId, previewVersionId, onPreview, onEditDraft,
}: {
  versions: Array<{ id: number; version_label: string; status: string; created_at: string; published_at: string | null; summary_of_changes: string | null; created_by_name: string | null; published_by_name: string | null }>;
  editingVersionId: number | null;
  previewVersionId: number | null;
  onPreview: (id: number) => void;
  onEditDraft: (id: number) => void;
}) {
  return (
    <div className="rounded-xl border border-line-200 bg-surface overflow-hidden">
      <div className="px-4 py-3 border-b border-line-200 flex items-center gap-2">
        <History className="h-4 w-4 text-ink-500" />
        <h3 className="text-sm font-medium text-ink-900">Historial</h3>
      </div>
      <ul className="divide-y divide-line-100">
        {versions.map((v) => {
          const isEditing = editingVersionId === v.id;
          const isPreviewing = previewVersionId === v.id;
          const Icon = v.status === "draft" ? Clock : v.status === "published" ? FileSignature : Archive;
          const tone = v.status === "draft"
            ? "bg-warning-soft text-warning"
            : v.status === "published"
              ? "bg-success-soft text-success"
              : "bg-bg-100 text-ink-500";
          return (
            <li key={v.id} className={cn("px-4 py-3", (isEditing || isPreviewing) && "bg-brand-50")}>
              <div className="flex items-start gap-2">
                <span className={cn("h-7 w-7 rounded-md flex items-center justify-center shrink-0", tone)}>
                  <Icon className="h-3.5 w-3.5" />
                </span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-ink-900 leading-tight">{v.version_label}</div>
                  <div className="text-[11px] text-ink-500 capitalize">
                    {v.status === "published" && v.published_at && `Publicada ${formatDateLong(v.published_at)}`}
                    {v.status === "draft" && `Borrador desde ${formatDateLong(v.created_at)}`}
                    {v.status === "archived" && v.published_at && `Vigente entre ${formatDateLong(v.created_at)} y archivada`}
                  </div>
                  {v.summary_of_changes && (
                    <div className="text-[11px] text-ink-500 mt-1 leading-snug">"{v.summary_of_changes}"</div>
                  )}
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {v.status === "draft" && !isEditing && (
                      <button onClick={() => onEditDraft(v.id)} className="text-[11px] text-brand-700 hover:underline">
                        Editar
                      </button>
                    )}
                    {v.status !== "draft" && (
                      <button onClick={() => onPreview(v.id)} className="text-[11px] text-brand-700 hover:underline inline-flex items-center gap-1">
                        {isPreviewing ? <><EyeOff className="h-3 w-3" /> Ocultar</> : <><Eye className="h-3 w-3" /> Ver</>}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function DocumentMeta({
  doc,
}: {
  doc: { title: string; slug: string; publicPath: string | null; requiresAcceptance: boolean; acceptanceAudience: string };
}) {
  return (
    <div className="rounded-xl border border-line-200 bg-bg-50 p-4 text-xs text-ink-700 space-y-1.5">
      <div><span className="text-ink-500">Slug:</span> <code className="text-ink-900">{doc.slug}</code></div>
      <div><span className="text-ink-500">URL pública:</span> {doc.publicPath ? <code className="text-ink-900">{doc.publicPath}</code> : "Solo interno"}</div>
      <div><span className="text-ink-500">Requiere aceptación:</span> {doc.requiresAcceptance ? `Sí (${doc.acceptanceAudience})` : "No"}</div>
    </div>
  );
}

function PublishModal({
  onClose, onPublish, publishing, initialSummary,
}: {
  onClose: () => void;
  onPublish: (summary: string) => void;
  publishing: boolean;
  initialSummary: string;
}) {
  const [summary, setSummary] = useState(initialSummary);
  const canSubmit = summary.trim().length >= 5 && !publishing;

  return (
    <div className="fixed inset-0 z-50 bg-ink-900/50 backdrop-blur-sm flex items-center justify-center px-4">
      <div className="w-full max-w-lg bg-surface rounded-xl border border-line-200 shadow-modal">
        <header className="px-5 py-4 border-b border-line-200 flex items-center gap-3">
          <div className="h-9 w-9 rounded-lg bg-brand-100 text-brand-700 flex items-center justify-center shrink-0">
            <Send className="h-5 w-5" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-serif text-lg text-ink-900">Publicar nueva versión</h3>
            <p className="text-xs text-ink-500">La versión vigente actual quedará archivada.</p>
          </div>
          <button onClick={onClose} className="h-8 w-8 rounded-md text-ink-500 hover:bg-bg-100 inline-flex items-center justify-center" aria-label="Cerrar">
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="px-5 py-4 space-y-3">
          <div className="rounded-md bg-warning-soft border border-warning/20 p-3 text-xs text-ink-900 leading-relaxed">
            Una vez publicada, esta versión no se podrá editar. Si necesitas
            cambiar algo, deberás crear una nueva versión.
          </div>
          <div>
            <label className="block text-xs font-medium text-ink-700 mb-1.5">
              Resumen de cambios <span className="text-ink-400 font-normal">(visible en el banner público)</span>
            </label>
            <textarea
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              autoFocus
              placeholder="Ej: Aclaramos cláusula octava sobre borrado de respaldos."
              rows={3}
              className="w-full rounded-lg border border-line-200 bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-brand-400"
            />
            <p className="text-[11px] text-ink-500 mt-1">Mínimo 5 caracteres. La asesora legal lo verá en el historial.</p>
          </div>
        </div>

        <footer className="px-5 py-4 border-t border-line-200 flex items-center justify-end gap-2">
          <button onClick={onClose} disabled={publishing} className="h-10 px-4 rounded-lg text-sm text-ink-700 hover:bg-bg-100 disabled:opacity-50">
            Cancelar
          </button>
          <button
            onClick={() => onPublish(summary.trim())}
            disabled={!canSubmit}
            className="h-10 px-4 rounded-lg bg-brand-700 text-white text-sm font-medium hover:bg-brand-800 disabled:opacity-50 inline-flex items-center gap-2"
          >
            {publishing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Publicar
          </button>
        </footer>
      </div>
    </div>
  );
}

function formatDateLong(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("es-CO", { day: "2-digit", month: "long", year: "numeric" });
}
