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
 * tecla. El asesor ve un indicador "Guardado" / "Guardando…" en la
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
  Loader2, Send, Trash2, Eye, EyeOff,
  CheckCircle2, AlertCircle, X, Clock, Archive, FileSignature, History,
  ExternalLink, ClipboardCheck, RotateCcw,
} from "lucide-react";
import { ConfirmDialog } from "@/components/app/ConfirmDialog";
import { api, getStoredUser } from "@/lib/api";
import { cn } from "@/lib/utils";
import { LegalDocumentEditor, LegalDocumentView } from "@/components/legal/LegalDocumentEditor";
import { LegalAdminShell } from "./legal-admin";
import { useLegalPresence } from "@/components/legal/useLegalPresence";
import { PresenceBanner } from "@/components/legal/PresenceBanner";

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
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  // Versión específica del historial que se quiere eliminar (null = nada).
  // Guardamos el objeto para mostrar info útil en el ConfirmDialog
  // (label, status). El borrado real sale por deleteVersionMut.
  const [confirmDeleteVersion, setConfirmDeleteVersion] = useState<
    { id: number; version_label: string; status: string } | null
  >(null);

  // Auto-cargar al entrar:
  //   - Si hay borrador pendiente → editarlo.
  //   - Si no, lo creamos automáticamente. Sin paso intermedio: la
  //     asesor viene a editar, no a configurar estados — el botón
  //     "Crear borrador" era fricción innecesaria.
  // Idempotente: solo dispara la mutación una vez (creatingRef).
  const creatingRef = useRef(false);
  useEffect(() => {
    if (!doc) return;
    const draft = doc.versions.find((v) => v.status === "draft");
    if (draft) {
      setEditingVersionId(draft.id);
      creatingRef.current = false;
      return;
    }
    if (!editingVersionId && !creatingRef.current) {
      creatingRef.current = true;
      api.legalAdminCreateDraft(slug)
        .then((resp) => {
          setEditingVersionId(resp.versionId);
          qc.invalidateQueries({ queryKey: ["legal-doc", slug] });
        })
        .catch(() => { creatingRef.current = false; });
    }
  }, [doc, slug, qc, editingVersionId]);

  // Cargamos el HTML del editingVersionId (puede ser un draft que se acaba
  // de crear, o uno que ya existía).
  //
  // staleTime: 0 + refetchOnMount: 'always' es CRÍTICO aquí. Sin esto,
  // cuando el asesor salía del editor y volvía, React Query devolvía
  // el body cacheado de la primera carga (sin sus ediciones recientes
  // del auto-save), así que el editor mostraba "la plantilla inicial".
  // Forzamos un refetch al montar para que siempre traiga el HTML más
  // reciente persistido en DB.
  const { data: editingVersion, isLoading: loadingVersion } = useQuery({
    queryKey: ["legal-version", editingVersionId],
    queryFn: () => api.legalAdminGetVersion(editingVersionId!),
    enabled: editingVersionId != null,
    staleTime: 0,
    refetchOnMount: "always",
  });
  // Sincroniza el HTML del editor con la versión cargada solo cuando
  // cambia el id de la versión (cargar otra) o cuando es la primera vez
  // que cargamos el body (id no había sido sincronizado todavía). NO
  // sincroniza en cada refetch porque el editor podría tener cambios más
  // nuevos que aún no llegaron al servidor — sobrescribirlos perdería
  // teclas del usuario.
  const lastSyncedVersionRef = useRef<number | null>(null);
  useEffect(() => {
    if (editingVersion?.bodyHtml == null || editingVersion.id == null) return;
    if (lastSyncedVersionRef.current === editingVersion.id) return;
    setEditingHtml(editingVersion.bodyHtml);
    lastSyncedVersionRef.current = editingVersion.id;
  }, [editingVersion?.id, editingVersion?.bodyHtml]);

  // Auto-guardado debounced.
  const saveMut = useMutation({
    mutationFn: (input: { id: number; bodyHtml: string }) =>
      api.legalAdminUpdateVersion(input.id, { bodyHtml: input.bodyHtml }),
  });
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dirtyRef = useRef(false);
  // Bandera para suprimir auto-saves después de publicar / eliminar el draft.
  // Si el último change quedó pendiente con debounce y entre tanto la versión
  // pasó a 'published', el PATCH llegaría tarde y el backend devolvería 400
  // ("Solo se pueden editar borradores"). Cuando bloqueamos esta bandera, el
  // timer pendiente queda inerte hasta que se cargue una nueva versión draft.
  const blockAutosaveRef = useRef(false);

  function onChangeHtml(html: string) {
    setEditingHtml(html);
    if (!editingVersionId || blockAutosaveRef.current) return;
    dirtyRef.current = true;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      // Doble check al disparar — el bloqueo puede haberse activado
      // entre el setTimeout y su ejecución (publicación inmediata).
      if (blockAutosaveRef.current) return;
      const id = editingVersionId;
      saveMut.mutate({ id, bodyHtml: html }, {
        onSuccess: () => {
          dirtyRef.current = false;
          // Sincroniza el cache de la query con el HTML que acabamos de
          // persistir, así si el asesor sale y vuelve a entrar el editor
          // no carga datos viejos del cache. setQueryData es más barato
          // que invalidate porque evita el round-trip extra.
          qc.setQueryData(["legal-version", id], (prev: any) =>
            prev ? { ...prev, bodyHtml: html } : prev
          );
        },
      });
    }, 1200);
  }

  // Publicar.
  //
  // UX clave: el asesor piensa en "edita y publica". El versionado interno
  // (draft → published → archivada) existe por auditoría SIC, pero NO debe
  // forzarla a hacer pasos manuales. Por eso, en una sola transacción de
  // mutation hacemos:
  //   1) UPDATE summary del draft actual
  //   2) POST publish → archiva la anterior y publica esta
  //   3) POST draft → crea el siguiente borrador clonando la recién
  //      publicada, listo para que el asesor siga editando sin paso
  //      intermedio "esta versión ya no se puede editar".
  //
  // Antes el frontend ponía editingVersionId=null y dependía del useEffect
  // para crear el nuevo draft. Eso generaba una ventana de tiempo donde el
  // doc cacheado todavía mostraba la versión recién publicada como draft;
  // el useEffect la elegía y los siguientes edits / publicaciones daban
  // 400 "Solo se pueden editar borradores". Ahora saltamos directo al
  // nuevo id sin pasar por null.
  const publishMut = useMutation({
    mutationFn: async (input: { versionId: number; summary: string }) => {
      // Cancela debounce + bloquea futuros auto-saves de esta versión.
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
      blockAutosaveRef.current = true;
      await api.legalAdminUpdateVersion(input.versionId, { summaryOfChanges: input.summary });
      await api.legalAdminPublishVersion(input.versionId);
      // Crea (o reutiliza) el draft siguiente. El backend garantiza
      // idempotencia: si ya existiera un draft, devuelve ese.
      const next = await api.legalAdminCreateDraft(slug);
      return { nextDraftId: next.versionId };
    },
    onSuccess: (resp) => {
      setPublishOpen(false);
      // Saltamos directo al nuevo draft. NO pasamos por null para evitar
      // que el useEffect resincronice contra estado cacheado.
      setEditingVersionId(resp.nextDraftId);
      // Forzamos refetch del documento + del endpoint público para que la
      // página /privacidad o /terminos refleje el cambio sin esperar caché.
      qc.invalidateQueries({ queryKey: ["legal-doc", slug] });
      qc.invalidateQueries({ queryKey: ["legal-admin-docs"] });
      qc.invalidateQueries({ queryKey: ["legal-public", slug] });
      // Toast con CTA opcional para verificar al instante. Solo se muestra
      // si el documento es público (tiene publicPath); para acuerdos
      // internos no aplica abrir página pública.
      if (doc?.publicPath) {
        toast.success("Publicado. La nueva versión ya es la vigente.", {
          action: {
            label: "Ver página",
            onClick: () => window.open(doc.publicPath!, "_blank", "noopener,noreferrer"),
          },
          duration: 8000,
        });
      } else {
        toast.success("Publicado. La nueva versión ya es la vigente.");
      }
      blockAutosaveRef.current = false;
    },
    onError: (e: any) => {
      blockAutosaveRef.current = false;
      toast.error(e?.message ?? "No se pudo publicar");
    },
  });

  // Eliminar borrador.
  const deleteDraftMut = useMutation({
    mutationFn: (versionId: number) => {
      // Mismo patrón de protección que en publishMut: cancelamos el
      // auto-save pendiente para que no intente actualizar una versión
      // que ya borramos (devolvería 404 en el backend).
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
      blockAutosaveRef.current = true;
      return api.legalAdminDeleteVersion(versionId);
    },
    onSuccess: () => {
      setEditingVersionId(null);
      qc.invalidateQueries({ queryKey: ["legal-doc", slug] });
      toast.success("Borrador eliminado");
      blockAutosaveRef.current = false;
    },
    onError: () => { blockAutosaveRef.current = false; },
  });

  // Borrar una versión específica del historial (cualquier estado:
  // draft, published o archived). El backend hace cleanup en cascada
  // de las aceptaciones de esa versión. Distinto de deleteDraftMut
  // porque no toca editingVersionId — se asume que el asesor no
  // está borrando la versión que está editando ahora.
  const deleteVersionMut = useMutation({
    mutationFn: (versionId: number) => api.legalAdminDeleteVersion(versionId),
    onSuccess: (resp) => {
      qc.invalidateQueries({ queryKey: ["legal-doc", slug] });
      qc.invalidateQueries({ queryKey: ["legal-public", slug] });
      qc.invalidateQueries({ queryKey: ["legal-admin-docs"] });
      const acc = resp.acceptancesRemoved;
      toast.success(
        acc > 0
          ? `Versión eliminada (${acc} aceptación${acc === 1 ? "" : "es"} también borrada${acc === 1 ? "" : "s"}).`
          : "Versión eliminada."
      );
    },
    onError: (e: any) => toast.error(e?.message ?? "No se pudo eliminar la versión."),
  });

  // Restablecer a plantilla inicial. Operación destructiva: borra todas
  // las versiones y aceptaciones del documento. Útil para empezar de cero
  // durante pruebas, o si los cambios acumulados ya no aportan.
  const resetMut = useMutation({
    mutationFn: () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
      blockAutosaveRef.current = true;
      return api.legalAdminResetDocument(slug);
    },
    onSuccess: (resp) => {
      // Saltamos directo al nuevo draft v1 con el body del seed.
      setEditingVersionId(resp.versionId);
      // El editingHtml local podría tener contenido viejo: forzamos a
      // que el useEffect resincronice con la nueva versión leyendo
      // bodyHtml desde el query.
      setEditingHtml("");
      lastSyncedVersionRef.current = null;
      qc.invalidateQueries({ queryKey: ["legal-doc", slug] });
      qc.invalidateQueries({ queryKey: ["legal-admin-docs"] });
      qc.invalidateQueries({ queryKey: ["legal-public", slug] });
      toast.success("Documento restablecido a la plantilla inicial.");
      blockAutosaveRef.current = false;
    },
    onError: (e: any) => {
      blockAutosaveRef.current = false;
      toast.error(e?.message ?? "No se pudo restablecer.");
    },
  });

  // Presencia: heartbeat cada 30s mientras se está editando un draft.
  // Devuelve la lista de OTROS legal_admins activos en este mismo
  // versionId. Se usa para pintar el PresenceBanner. No corre cuando
  // editingVersionId es null (no hay nada que editar).
  const activeEditors = useLegalPresence(editingVersionId);
  // Datos del usuario actual para el banner (no mostrar "última edición:
  // tú mismo"). getStoredUser ya está importado al inicio del archivo.
  const currentUser = getStoredUser();

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
      fullWidth
      backTo="/legal-admin"
      backLabel="Documentos"
    >
      <div className="mb-4 flex flex-col gap-2">
        <div className="flex items-center gap-3">
          <SaveIndicator dirty={dirtyRef.current} pending={saveMut.isPending} hasDraft={!!editingVersionId} />
        </div>
        {/* Banner de presencia: visible solo si hay otros editando o
            edición reciente de otra persona en los últimos 30 min. */}
        {editingVersionId && (
          <PresenceBanner
            activeEditors={activeEditors}
            lastModifiedBy={editingVersion?.lastModifiedBy ?? null}
            lastModifiedAt={editingVersion?.lastModifiedAt ?? null}
            currentUserId={currentUser?.id}
          />
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6">
        {/* Editor */}
        <section>
          {!editingVersionId && !previewVersion && (
            <div className="flex flex-col items-center justify-center py-20 text-ink-400 gap-3">
              <Loader2 className="h-5 w-5 animate-spin" />
              <span className="text-sm">Preparando borrador…</span>
            </div>
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
                  <Send className="h-4 w-4" /> Publicar cambios
                </button>
                {draft && (
                  <button
                    onClick={() => setConfirmDiscard(true)}
                    className="h-10 px-3 rounded-lg text-sm text-ink-700 hover:bg-bg-100 inline-flex items-center gap-2"
                    title="Descartar los cambios del borrador actual y volver a la última versión publicada"
                  >
                    <Trash2 className="h-4 w-4" /> Descartar cambios
                  </button>
                )}
                {/* Reset a plantilla inicial: empuja al margen para que sea
                    claro que es una acción destructiva, separada del flujo
                    normal de publicación. */}
                <button
                  onClick={() => setConfirmReset(true)}
                  className="ml-auto h-10 px-3 rounded-lg text-sm text-error hover:bg-error-soft inline-flex items-center gap-2"
                  title="Borrar todo el contenido editado y volver a la plantilla original del catálogo"
                >
                  <RotateCcw className="h-4 w-4" /> Restablecer a plantilla inicial
                </button>
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
            onDelete={(v) => setConfirmDeleteVersion(v)}
          />
          <DocumentMeta
            doc={doc}
            acceptancesCount={doc.acceptancesCount}
            hasPublished={!!published}
          />
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

      {confirmDiscard && draft && (
        <ConfirmDialog
          title="Descartar cambios"
          message="Vas a perder todo lo que has escrito desde la última vez que publicaste. La página pública no cambia. ¿Confirmas?"
          confirmLabel="Sí, descartar"
          cancelLabel="Seguir editando"
          danger
          onCancel={() => setConfirmDiscard(false)}
          onConfirm={() => {
            setConfirmDiscard(false);
            deleteDraftMut.mutate(draft.id);
          }}
        />
      )}

      {confirmReset && (
        <ConfirmDialog
          title="Restablecer a plantilla inicial"
          message={`Esto borra TODO el contenido y el historial de "${doc.title}" — versión publicada, archivadas y aceptaciones — y deja el documento como la plantilla original del sistema. La acción no se puede deshacer.`}
          confirmLabel="Sí, restablecer"
          cancelLabel="Cancelar"
          danger
          onCancel={() => setConfirmReset(false)}
          onConfirm={() => {
            setConfirmReset(false);
            resetMut.mutate();
          }}
        />
      )}

      {confirmDeleteVersion && (
        <ConfirmDialog
          title={`Eliminar versión ${confirmDeleteVersion.version_label}`}
          message={
            confirmDeleteVersion.status === "published"
              ? "Esta es la versión vigente. Si la eliminas, la página pública volverá a la versión archivada anterior (si existe), o quedará sin contenido publicado. Las aceptaciones registradas para esta versión también se eliminarán."
              : confirmDeleteVersion.status === "archived"
                ? "Las aceptaciones de los usuarios que vieron esta versión también se eliminarán de la base de datos. La acción no se puede deshacer."
                : "El borrador y todo lo que has escrito en él se eliminarán. La acción no se puede deshacer."
          }
          confirmLabel="Sí, eliminar"
          cancelLabel="Cancelar"
          danger
          onCancel={() => setConfirmDeleteVersion(null)}
          onConfirm={() => {
            const id = confirmDeleteVersion.id;
            setConfirmDeleteVersion(null);
            deleteVersionMut.mutate(id);
          }}
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
  versions, editingVersionId, previewVersionId, onPreview, onEditDraft, onDelete,
}: {
  versions: Array<{ id: number; version_label: string; status: string; created_at: string; published_at: string | null; summary_of_changes: string | null; created_by_name: string | null; published_by_name: string | null }>;
  editingVersionId: number | null;
  previewVersionId: number | null;
  onPreview: (id: number) => void;
  onEditDraft: (id: number) => void;
  onDelete: (v: { id: number; version_label: string; status: string }) => void;
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
                  <div className="mt-1.5 flex flex-wrap gap-2 items-center">
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
                    {/* Eliminar: cualquier versión que no sea la que se está
                        editando ahora mismo. Borrar la activa rompería el
                        editor; el asesor puede usar "Descartar cambios"
                        para esa. */}
                    {!isEditing && (
                      <button
                        onClick={() => onDelete(v)}
                        className="text-[11px] text-error hover:underline inline-flex items-center gap-1 ml-auto"
                        title="Eliminar esta versión"
                      >
                        <Trash2 className="h-3 w-3" /> Eliminar
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
  doc, acceptancesCount, hasPublished,
}: {
  doc: { title: string; slug: string; publicPath: string | null; requiresAcceptance: boolean; acceptanceAudience: string };
  acceptancesCount: number;
  hasPublished: boolean;
}) {
  return (
    <div className="space-y-3">
      {/* Atajos */}
      {(doc.publicPath || acceptancesCount > 0) && (
        <div className="rounded-xl border border-line-200 bg-surface overflow-hidden">
          {doc.publicPath && (
            <a
              href={doc.publicPath}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 px-4 py-3 text-sm hover:bg-bg-50 transition-colors"
              title={hasPublished ? "Abre la versión vigente en una pestaña nueva" : "Aún no hay versión publicada"}
            >
              <div className="h-8 w-8 rounded-md bg-info-soft text-info flex items-center justify-center shrink-0">
                <ExternalLink className="h-4 w-4" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-ink-900 font-medium leading-tight">Ver página publicada</div>
                <div className="text-[11px] text-ink-500 truncate">
                  {hasPublished ? doc.publicPath : "Aún no se publica"}
                </div>
              </div>
            </a>
          )}
          {acceptancesCount > 0 && (
            <Link
              to="/legal-admin/aceptaciones"
              search={{ slug: doc.slug } as never}
              className="flex items-center gap-3 px-4 py-3 text-sm hover:bg-bg-50 transition-colors border-t border-line-100"
            >
              <div className="h-8 w-8 rounded-md bg-success-soft text-success flex items-center justify-center shrink-0">
                <ClipboardCheck className="h-4 w-4" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-ink-900 font-medium leading-tight">
                  {acceptancesCount} aceptación{acceptancesCount === 1 ? "" : "es"}
                </div>
                <div className="text-[11px] text-ink-500">Ver quiénes y cuándo aceptaron</div>
              </div>
            </Link>
          )}
        </div>
      )}

      {/* Metadatos técnicos */}
      <div className="rounded-xl border border-line-200 bg-bg-50 p-4 text-xs text-ink-700 space-y-1.5">
        <div><span className="text-ink-500">Slug:</span> <code className="text-ink-900">{doc.slug}</code></div>
        <div><span className="text-ink-500">URL pública:</span> {doc.publicPath ? <code className="text-ink-900">{doc.publicPath}</code> : "Solo interno"}</div>
        <div><span className="text-ink-500">Requiere aceptación:</span> {doc.requiresAcceptance ? `Sí (${audienceLabelShort(doc.acceptanceAudience)})` : "No (implícita por uso)"}</div>
      </div>
    </div>
  );
}

function audienceLabelShort(a: string) {
  if (a === "staff") return "psicólogos";
  if (a === "patient") return "pacientes";
  if (a === "both") return "ambos";
  return "ninguno";
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
  // El resumen es opcional. Antes exigíamos mínimo 5 chars, pero la
  // asesor muchas veces solo quiere corregir un typo y no necesita
  // describirlo. Si lo deja vacío, no aparece la línea "Cambios respecto
  // a la versión anterior" en la página pública.
  const canSubmit = !publishing;

  return (
    <div className="fixed inset-0 z-50 bg-ink-900/50 backdrop-blur-sm flex items-center justify-center px-4">
      <div className="w-full max-w-lg bg-surface rounded-xl border border-line-200 shadow-modal overflow-hidden">
        <header className="px-5 py-4 border-b border-line-200 flex items-center gap-3">
          <div className="h-9 w-9 rounded-lg bg-brand-100 text-brand-700 flex items-center justify-center shrink-0">
            <Send className="h-5 w-5" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-serif text-lg text-ink-900">Publicar cambios</h3>
            <p className="text-xs text-ink-500">El contenido nuevo entrará vigente de inmediato.</p>
          </div>
          <button onClick={onClose} className="h-8 w-8 rounded-md text-ink-500 hover:bg-bg-100 inline-flex items-center justify-center" aria-label="Cerrar">
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="px-5 py-4 space-y-3">
          <p className="text-sm text-ink-700 leading-relaxed">
            Tu nuevo contenido reemplazará al que está publicado actualmente.
            Después podrás seguir editando y publicar otra vez cuando quieras.
          </p>
          <div>
            <label className="block text-xs font-medium text-ink-700 mb-1.5">
              Resumen breve de los cambios <span className="text-ink-400 font-normal">(opcional, queda en el historial)</span>
            </label>
            <textarea
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              autoFocus
              placeholder="Ej: corregí ortografía en el punto 3."
              rows={2}
              className="w-full rounded-lg border border-line-200 bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-brand-400"
            />
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
