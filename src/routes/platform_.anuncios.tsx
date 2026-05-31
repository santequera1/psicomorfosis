import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Sparkles, Plus, Edit2, Trash2, Eye, EyeOff, X, Loader2, Bug, FileText,
  Megaphone, Users, ImagePlus,
} from "lucide-react";
import { AppShell } from "@/components/app/AppShell";
import { AppSelect } from "@/components/app/AppSelect";
import { ConfirmDialog } from "@/components/app/ConfirmDialog";
import { api, getStoredUser } from "@/lib/api";
import { cn } from "@/lib/utils";

/**
 * CRUD de anuncios in-app ('novedades'). Solo platform admin.
 * El listado público lo consumen los psicólogos vía /api/workspace/announcements.
 */
export const Route = createFileRoute("/platform_/anuncios")({
  head: () => ({ meta: [{ title: "Novedades · Plataforma" }] }),
  component: PlatformAnnouncementsPage,
});

type Category = "feature" | "fix" | "note";

interface FormState {
  id: number | null;
  title: string;
  body: string;
  category: Category;
  active: boolean;
  imageUrl: string | null;
}

const EMPTY_FORM: FormState = {
  id: null,
  title: "",
  body: "",
  category: "feature",
  active: true,
  imageUrl: null,
};

const CATEGORY_META: Record<Category, { label: string; icon: typeof Megaphone; bg: string; fg: string }> = {
  feature: { label: "Nuevo", icon: Megaphone, bg: "bg-brand-50 border-brand-200", fg: "text-brand-800" },
  fix: { label: "Mejora", icon: Bug, bg: "bg-amber-50 border-amber-200", fg: "text-amber-800" },
  note: { label: "Aviso", icon: FileText, bg: "bg-bg-100 border-line-200", fg: "text-ink-700" },
};

function PlatformAnnouncementsPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [ready, setReady] = useState(false);
  const [form, setForm] = useState<FormState | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ id: number; title: string } | null>(null);

  useEffect(() => {
    const u = getStoredUser();
    if (!u || !u.isPlatformAdmin) {
      navigate({ to: "/" });
      return;
    }
    setReady(true);
  }, [navigate]);

  const { data, isLoading } = useQuery({
    queryKey: ["platform-announcements"],
    queryFn: () => api.platformListAnnouncements(),
    enabled: ready,
  });

  const createMu = useMutation({
    mutationFn: (body: { title: string; body: string; category: Category; active: boolean }) =>
      api.platformCreateAnnouncement(body),
    onSuccess: () => {
      toast.success("Anuncio publicado");
      qc.invalidateQueries({ queryKey: ["platform-announcements"] });
      qc.invalidateQueries({ queryKey: ["announcements"] });
      setForm(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateMu = useMutation({
    mutationFn: ({ id, patch }: { id: number; patch: Partial<FormState> }) =>
      api.platformUpdateAnnouncement(id, patch as any),
    onSuccess: () => {
      toast.success("Anuncio actualizado");
      qc.invalidateQueries({ queryKey: ["platform-announcements"] });
      qc.invalidateQueries({ queryKey: ["announcements"] });
      setForm(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMu = useMutation({
    mutationFn: (id: number) => api.platformDeleteAnnouncement(id),
    onSuccess: () => {
      toast.success("Anuncio eliminado");
      qc.invalidateQueries({ queryKey: ["platform-announcements"] });
      qc.invalidateQueries({ queryKey: ["announcements"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function handleSubmit() {
    if (!form) return;
    if (form.title.trim().length < 3) return toast.error("Título mínimo 3 caracteres");
    if (form.body.trim().length < 5) return toast.error("Cuerpo mínimo 5 caracteres");
    const payload = {
      title: form.title.trim(),
      body: form.body.trim(),
      category: form.category,
      active: form.active,
      imageUrl: form.imageUrl,
    };
    if (form.id == null) createMu.mutate(payload);
    else updateMu.mutate({ id: form.id, patch: payload });
  }

  if (!ready) return null;

  const items = data?.items ?? [];

  return (
    <AppShell>
      <div className="space-y-6">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-sm text-ink-500 inline-flex items-center gap-1.5">
              <Megaphone className="h-3.5 w-3.5" /> Comunicación con usuarios
            </p>
            <h1 className="font-serif text-2xl md:text-[32px] leading-tight text-ink-900 mt-1">
              Novedades
            </h1>
            <p className="text-xs text-ink-500 mt-1">
              Lo que publiques aquí aparece como modal y badge a todos los psicólogos staff la próxima vez que abran la app.
            </p>
          </div>
          <button
            onClick={() => setForm({ ...EMPTY_FORM })}
            className="h-10 px-4 rounded-lg bg-brand-700 text-white text-sm font-medium hover:bg-brand-800 inline-flex items-center gap-2"
          >
            <Plus className="h-4 w-4" /> Nuevo anuncio
          </button>
        </header>

        {isLoading ? (
          <div className="py-12 text-center text-sm text-ink-500">
            <Loader2 className="h-5 w-5 animate-spin mx-auto" />
          </div>
        ) : items.length === 0 ? (
          <div className="py-16 text-center rounded-xl border border-dashed border-line-200 bg-bg-50/40">
            <Sparkles className="h-6 w-6 text-ink-300 mx-auto" />
            <p className="mt-3 text-sm text-ink-500">Aún no has publicado ningún anuncio.</p>
            <button
              onClick={() => setForm({ ...EMPTY_FORM })}
              className="mt-4 h-9 px-3 rounded-md border border-line-200 text-sm text-ink-700 hover:border-brand-400"
            >
              Crear el primero
            </button>
          </div>
        ) : (
          <ul className="rounded-xl border border-line-200 bg-surface divide-y divide-line-100 overflow-hidden">
            {items.map((it) => (
              <AnnouncementRow
                key={it.id}
                item={it}
                onEdit={() => setForm({
                  id: it.id,
                  title: it.title,
                  body: it.body,
                  category: it.category,
                  active: it.active,
                  imageUrl: it.imageUrl,
                })}
                onToggleActive={() =>
                  updateMu.mutate({ id: it.id, patch: { active: !it.active } })
                }
                onDelete={() => setDeleteTarget({ id: it.id, title: it.title })}
              />
            ))}
          </ul>
        )}

        {form && (
          <AnnouncementFormModal
            form={form}
            setForm={setForm}
            onClose={() => setForm(null)}
            onSubmit={handleSubmit}
            saving={createMu.isPending || updateMu.isPending}
          />
        )}

        {deleteTarget && (
          <ConfirmDialog
            title={`Eliminar "${deleteTarget.title}"`}
            message="Esto borra el anuncio y todas las marcas de leído de los usuarios. Si solo quieres ocultarlo conservando estadísticas, mejor usa el botón 'Desactivar' (el ojo)."
            confirmLabel="Eliminar"
            danger
            onConfirm={() => {
              deleteMu.mutate(deleteTarget.id);
              setDeleteTarget(null);
            }}
            onCancel={() => setDeleteTarget(null)}
          />
        )}
      </div>
    </AppShell>
  );
}

function AnnouncementRow({
  item, onEdit, onToggleActive, onDelete,
}: {
  item: {
    id: number; title: string; body: string; category: Category;
    active: boolean; publishedAt: string; readCount: number;
  };
  onEdit: () => void;
  onToggleActive: () => void;
  onDelete: () => void;
}) {
  const meta = CATEGORY_META[item.category];
  const Icon = meta.icon;
  // Mobile: 2 filas — fila 1: icono + texto, fila 2: acciones full-width.
  // sm+: layout horizontal con acciones a la derecha.
  return (
    <li className="px-4 sm:px-5 py-4 flex flex-col sm:flex-row sm:items-start gap-3 sm:gap-4">
      <div className="flex items-start gap-3 sm:gap-4 flex-1 min-w-0">
      <span className={cn(
        "h-9 w-9 rounded-lg border inline-flex items-center justify-center shrink-0",
        meta.bg, meta.fg,
      )}>
        <Icon className="h-4 w-4" />
      </span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <h3 className={cn("font-serif text-base text-ink-900", !item.active && "opacity-50")}>
            {item.title}
          </h3>
          {!item.active && (
            <span className="text-[10px] uppercase tracking-wider text-ink-500 bg-bg-100 px-1.5 py-0.5 rounded">
              Inactivo
            </span>
          )}
        </div>
        <p className={cn("mt-1 text-sm text-ink-500 line-clamp-2 leading-relaxed", !item.active && "opacity-60")}>
          {item.body}
        </p>
        <div className="mt-2 flex items-center gap-3 text-[11px] text-ink-400">
          <span>{meta.label}</span>
          <span className="text-ink-300">·</span>
          <span>{formatDate(item.publishedAt)}</span>
          <span className="text-ink-300">·</span>
          <span className="inline-flex items-center gap-1">
            <Users className="h-3 w-3" />
            {item.readCount} leyeron
          </span>
        </div>
      </div>
      </div>
      <div className="shrink-0 flex items-center justify-end gap-1">
        <button
          onClick={onToggleActive}
          title={item.active ? "Desactivar (lo ocultas sin perder estadísticas)" : "Reactivar"}
          className="h-8 w-8 rounded-md text-ink-500 hover:bg-bg-100 hover:text-ink-900 inline-flex items-center justify-center"
        >
          {item.active ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
        </button>
        <button
          onClick={onEdit}
          title="Editar"
          className="h-8 w-8 rounded-md text-ink-500 hover:bg-bg-100 hover:text-ink-900 inline-flex items-center justify-center"
        >
          <Edit2 className="h-4 w-4" />
        </button>
        <button
          onClick={onDelete}
          title="Eliminar"
          className="h-8 w-8 rounded-md text-ink-500 hover:bg-risk-high/10 hover:text-risk-high inline-flex items-center justify-center"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    </li>
  );
}

function AnnouncementFormModal({
  form, setForm, onClose, onSubmit, saving,
}: {
  form: FormState;
  setForm: (f: FormState) => void;
  onClose: () => void;
  onSubmit: () => void;
  saving: boolean;
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const isEditing = form.id != null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-ink-900/40 backdrop-blur-sm pt-16 p-4 overflow-y-auto">
      <div className="w-full max-w-xl rounded-2xl bg-surface shadow-modal overflow-hidden">
        <header className="px-5 py-4 border-b border-line-100 flex items-start justify-between">
          <div>
            <p className="text-[11px] uppercase tracking-widest text-brand-700 font-medium">
              {isEditing ? "Editar anuncio" : "Nuevo anuncio"}
            </p>
            <h3 className="font-serif text-xl text-ink-900 mt-0.5">
              {isEditing ? "Cambia el contenido o estado" : "Publicar una novedad a todos los staff"}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="h-9 w-9 rounded-md border border-line-200 text-ink-500 hover:border-brand-400 flex items-center justify-center"
            aria-label="Cerrar"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <form
          onSubmit={(e) => { e.preventDefault(); onSubmit(); }}
          className="px-5 py-5 space-y-4"
        >
          <label className="block">
            <span className="text-[11px] uppercase tracking-wider text-ink-500 font-medium">Título</span>
            <input
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              maxLength={200}
              placeholder="Ej. Dictado por voz disponible"
              className="mt-1 w-full h-10 px-3 rounded-md border border-line-200 bg-surface text-sm outline-none focus:border-brand-700"
              autoFocus
            />
          </label>
          <label className="block">
            <span className="text-[11px] uppercase tracking-wider text-ink-500 font-medium">Cuerpo</span>
            <textarea
              value={form.body}
              onChange={(e) => setForm({ ...form, body: e.target.value })}
              rows={6}
              maxLength={4000}
              placeholder="Explica qué cambió y cómo usarlo. Sin markdown — texto plano con saltos de línea respetados."
              className="mt-1 w-full px-3 py-2 rounded-md border border-line-200 bg-surface text-sm outline-none focus:border-brand-700"
            />
            <span className="block text-[11px] text-ink-400 mt-1 text-right tabular">
              {form.body.length} / 4000
            </span>
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-[11px] uppercase tracking-wider text-ink-500 font-medium">Categoría</span>
              <AppSelect
                value={form.category}
                onChange={(v) => setForm({ ...form, category: v as Category })}
                options={[
                  { value: "feature", label: "Nuevo (verde)" },
                  { value: "fix", label: "Mejora (ámbar)" },
                  { value: "note", label: "Aviso (gris)" },
                ]}
                className="mt-1 w-full"
              />
            </label>
            <label className="flex items-center gap-2 self-end h-10 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={form.active}
                onChange={(e) => setForm({ ...form, active: e.target.checked })}
                className="sr-only peer"
              />
              <span className="h-[18px] w-[18px] rounded-[5px] border border-line-200 bg-surface flex items-center justify-center peer-checked:bg-brand-700 peer-checked:border-brand-700">
                {form.active && <span className="h-2 w-2 rounded-sm bg-white" />}
              </span>
              <span className="text-sm text-ink-700">
                Publicar activo {form.active ? "(visible)" : "(oculto)"}
              </span>
            </label>
          </div>

          <ImageField
            url={form.imageUrl}
            onChange={(url) => setForm({ ...form, imageUrl: url })}
          />

          <div className="pt-2 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="h-9 px-3 rounded-md border border-line-200 text-sm text-ink-700 hover:border-brand-400 disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="h-9 px-4 rounded-md bg-brand-700 text-white text-sm font-medium hover:bg-brand-800 disabled:opacity-60 inline-flex items-center gap-2"
            >
              {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {isEditing ? "Guardar cambios" : "Publicar"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/**
 * Subida de imagen opcional para el anuncio. Si ya hay una, muestra
 * preview con botón quitar. Si no, botón para elegir archivo. Sube al
 * backend que retorna la URL pública (no la commiteamos al anuncio
 * hasta que el admin haga "Guardar" — antes solo persiste en el form).
 */
function ImageField({ url, onChange }: { url: string | null; onChange: (url: string | null) => void }) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);

  async function handleFile(file: File) {
    setUploading(true);
    try {
      const res = await api.platformUploadAnnouncementImage(file);
      onChange(res.url);
    } catch (e: any) {
      toast.error(e?.message ?? "No se pudo subir la imagen");
    } finally {
      setUploading(false);
    }
  }

  return (
    <label className="block">
      <span className="text-[11px] uppercase tracking-wider text-ink-500 font-medium">
        Imagen (opcional) <span className="text-ink-400 normal-case tracking-normal">— captura de pantalla mostrando la feature</span>
      </span>
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void handleFile(f);
          e.target.value = "";
        }}
      />
      {url ? (
        <div className="mt-1 relative rounded-lg border border-line-200 overflow-hidden bg-bg-50">
          <img src={url} alt="Preview" className="w-full max-h-64 object-contain" />
          <div className="absolute top-2 right-2 flex items-center gap-1">
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={uploading}
              className="h-8 px-2.5 rounded-md bg-surface/95 backdrop-blur border border-line-200 text-xs text-ink-700 hover:border-brand-400 disabled:opacity-50"
            >
              Cambiar
            </button>
            <button
              type="button"
              onClick={() => onChange(null)}
              disabled={uploading}
              className="h-8 w-8 rounded-md bg-surface/95 backdrop-blur border border-line-200 text-ink-700 hover:border-risk-high hover:text-risk-high flex items-center justify-center disabled:opacity-50"
              title="Quitar imagen"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="mt-1 w-full h-24 rounded-lg border border-dashed border-line-200 bg-bg-50/40 hover:bg-bg-100 hover:border-brand-400 text-ink-500 inline-flex items-center justify-center gap-2 text-sm transition-colors disabled:opacity-50"
        >
          {uploading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" /> Subiendo…
            </>
          ) : (
            <>
              <ImagePlus className="h-4 w-4" /> Agregar imagen (PNG, JPG, WebP — máx 5MB)
            </>
          )}
        </button>
      )}
    </label>
  );
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso.includes("T") ? iso : iso.replace(" ", "T") + "Z");
    return new Intl.DateTimeFormat("es-CO", {
      day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
    }).format(d);
  } catch {
    return iso;
  }
}
