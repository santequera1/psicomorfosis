import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ChevronLeft, Save, AlertCircle, Loader2, Trash2, Sparkles, Info, Eye, EyeOff, Plus,
} from "lucide-react";
import { AppShell } from "@/components/app/AppShell";
import { DocumentEditor } from "@/components/documents/DocumentEditor";
import { VARIABLES } from "@/components/documents/VariableSuggest";
import type { VariableContextValue } from "@/components/documents/VariableNode";
import { api, type TipTapDoc, type TemplateCategory } from "@/lib/api";

export const Route = createFileRoute("/documentos_/plantilla/$id")({
  head: ({ params }) => ({ meta: [{ title: `Plantilla ${params.id} — Psicomorfosis` }] }),
  component: TemplateEditPage,
});

function TemplateEditPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const { data: tpl, isLoading, error } = useQuery({
    queryKey: ["document-template", id],
    queryFn: () => api.getDocumentTemplate(Number(id)),
  });

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<TemplateCategory>("otro");
  const [body, setBody] = useState<TipTapDoc | null>(null);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [saving, setSaving] = useState(false);
  const [previewMode, setPreviewMode] = useState(false);

  // Contexto de muestra para la vista previa: arma { paciente: { nombre: "Andrés…" }, ... }
  // a partir de los `example` de cada variable. El editor ya sabe resolver
  // VariableNode contra este shape (ver VariableNode.tsx → resolveVariable).
  const previewContext = useMemo<VariableContextValue>(() => {
    const ctx: VariableContextValue = {};
    for (const v of VARIABLES) {
      const [group, field] = v.key.split(".");
      if (!field) continue;
      (ctx[group] ??= {})[field] = v.example;
    }
    return ctx;
  }, []);

  useEffect(() => {
    if (tpl) {
      setName(tpl.name);
      setDescription(tpl.description ?? "");
      setCategory(tpl.category);
      setBody(tpl.body_json);
    }
  }, [tpl?.id]);

  const isSystem = tpl?.scope === "system";

  // Autosave debounced (solo si NO es del sistema)
  useEffect(() => {
    if (!tpl || isSystem || body === null) return;
    const t = setTimeout(async () => {
      setSaving(true);
      try {
        await api.updateDocumentTemplate(tpl.id, { name, description, category, body_json: body });
        setSavedAt(new Date());
        qc.invalidateQueries({ queryKey: ["document-templates"] });
      } catch (e: any) {
        toast.error(e.message ?? "Error al guardar");
      } finally {
        setSaving(false);
      }
    }, 1500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [body, name, description, category]);

  const deleteMu = useMutation({
    mutationFn: () => api.deleteDocumentTemplate(tpl!.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["document-templates"] });
      toast.success("Plantilla eliminada");
      navigate({ to: "/documentos" });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading) return <AppShell><div className="flex items-center justify-center min-h-[60vh] text-ink-500"><Loader2 className="h-5 w-5 animate-spin" /></div></AppShell>;
  if (error || !tpl) return <AppShell><div className="text-center py-20"><AlertCircle className="h-8 w-8 mx-auto text-ink-400 mb-2" /><p className="text-ink-500">Plantilla no encontrada.</p></div></AppShell>;

  return (
    <AppShell>
      <div className="max-w-6xl mx-auto">
        <header className="psm-no-print sticky top-0 z-10 -mx-4 sm:mx-0 px-4 sm:px-0 py-3 bg-bg/95 backdrop-blur border-b border-line-100 mb-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-3 min-w-0 flex-1">
              <Link to="/documentos" className="h-9 w-9 rounded-md hover:bg-bg-100 flex items-center justify-center text-ink-500 shrink-0" aria-label="Volver">
                <ChevronLeft className="h-5 w-5" />
              </Link>
              <div className="min-w-0">
                <p className="text-[11px] uppercase tracking-widest text-brand-700 font-medium inline-flex items-center gap-1">
                  <Sparkles className="h-3 w-3" /> Plantilla
                  <span className="text-ink-400 normal-case tracking-normal">·</span>
                  <span className="text-ink-500 normal-case tracking-normal">
                    {tpl.scope === "system" ? "Del sistema (solo lectura)" : tpl.scope === "personal" ? "Personal" : "Workspace"}
                  </span>
                </p>
                {isSystem ? (
                  <h1 className="font-serif text-lg sm:text-xl text-ink-900 truncate">{tpl.name}</h1>
                ) : (
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="font-serif text-lg sm:text-xl bg-transparent border-b border-transparent hover:border-line-200 focus:border-brand-400 outline-none w-full max-w-xl"
                  />
                )}
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {!isSystem && (
                <span className="text-xs text-ink-500 inline-flex items-center gap-1.5">
                  {saving ? (<><Loader2 className="h-3 w-3 animate-spin" /> Guardando…</>) :
                   savedAt ? (<><Save className="h-3 w-3 text-sage-500" /> Guardado {savedAt.toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" })}</>) :
                   <span className="text-ink-400">Sin cambios</span>}
                </span>
              )}
              {!isSystem && (
                <button
                  onClick={() => { if (confirm(`¿Eliminar la plantilla "${tpl.name}"?`)) deleteMu.mutate(); }}
                  className="h-9 w-9 rounded-md border border-line-200 hover:border-rose-400 text-ink-500 hover:text-rose-700 flex items-center justify-center"
                  title="Eliminar plantilla"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>

          <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-2">
            <div className="sm:col-span-2">
              <label className="block text-[11px] uppercase tracking-wider text-ink-500 mb-1">Descripción</label>
              <input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                disabled={isSystem}
                placeholder="Cuándo usar esta plantilla…"
                className="w-full h-9 px-2 rounded border border-line-200 bg-bg text-sm focus:outline-none focus:border-brand-400 disabled:opacity-60"
              />
            </div>
            <div>
              <label className="block text-[11px] uppercase tracking-wider text-ink-500 mb-1">Categoría</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as TemplateCategory)}
                disabled={isSystem}
                className="w-full h-9 px-2 rounded border border-line-200 bg-bg text-sm focus:outline-none focus:border-brand-400 disabled:opacity-60"
              >
                <option value="consentimiento">Consentimiento</option>
                <option value="informe">Informe</option>
                <option value="contrato">Contrato</option>
                <option value="certificado">Certificado</option>
                <option value="remision">Remisión</option>
                <option value="otro">Otro</option>
              </select>
            </div>
          </div>

          {isSystem && (
            <div className="mt-3 rounded-md border border-amber-300/50 bg-amber-50/40 p-2.5 text-xs text-ink-700 flex items-start gap-2">
              <Info className="h-4 w-4 text-amber-700 shrink-0 mt-0.5" />
              <span>
                Esta plantilla es del sistema y no se puede modificar directamente.
                Volvé al listado y usa el ícono de lápiz para crear una <strong>copia editable</strong> en tu workspace.
              </span>
            </div>
          )}
          {tpl.legal_disclaimer && (
            <div className="mt-2 text-[11px] text-amber-700">⚠️ {tpl.legal_disclaimer}</div>
          )}
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-5 items-start">
          <div className="min-w-0">
            <DocumentEditor
              initialDoc={body}
              editable={!isSystem}
              placeholder="Escribe la plantilla… usa / para bloques o {{ para insertar variables"
              onChange={(d) => setBody(d)}
              variableContext={previewMode ? previewContext : null}
              onUploadImage={async (file) => {
                const asset = await api.uploadDocumentAsset(file);
                return asset.public_url.startsWith("http") ? asset.public_url : `${window.location.origin}${asset.public_url}`;
              }}
              onUploadAttachment={async (file) => {
                const asset = await api.uploadDocumentAsset(file);
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

          <VariablesPanel
            previewMode={previewMode}
            onTogglePreview={() => setPreviewMode((v) => !v)}
            disabled={isSystem}
          />
        </div>
      </div>
    </AppShell>
  );
}

/** Panel lateral del editor de plantillas: variables agrupadas + toggle de vista previa. */
function VariablesPanel({ previewMode, onTogglePreview, disabled }: { previewMode: boolean; onTogglePreview: () => void; disabled: boolean }) {
  // Agrupar las variables del catálogo por su `group` (Paciente/Profesional/etc).
  const grouped = useMemo(() => {
    const map: Record<string, typeof VARIABLES> = {};
    for (const v of VARIABLES) (map[v.group] ??= []).push(v);
    return map;
  }, []);

  function insertVariable(key: string) {
    if (disabled) return;
    window.dispatchEvent(new CustomEvent("psm:editor:insert-variable", { detail: { key } }));
  }

  return (
    <aside className="hidden lg:block lg:sticky lg:top-32 h-fit">
      <div className="rounded-xl border border-line-200 bg-surface overflow-hidden">
        <div className="p-3 border-b border-line-100 flex items-center justify-between gap-2">
          <div>
            <p className="text-[10px] uppercase tracking-[0.08em] text-brand-700 font-medium">Variables</p>
            <p className="text-[11px] text-ink-500 mt-0.5">Click para insertar en el cursor</p>
          </div>
          <button
            type="button"
            onClick={onTogglePreview}
            title={previewMode ? "Volver a ver los placeholders {{...}}" : "Ver cómo quedaría con datos de ejemplo"}
            className={
              "h-8 px-2.5 rounded-md text-[11px] font-medium inline-flex items-center gap-1.5 transition-colors " +
              (previewMode ? "bg-brand-700 text-white hover:bg-brand-800" : "border border-line-200 text-ink-700 hover:border-brand-400")
            }
          >
            {previewMode ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
            {previewMode ? "Ocultar" : "Vista previa"}
          </button>
        </div>

        <div className="max-h-[60vh] overflow-y-auto">
          {Object.entries(grouped).map(([group, vars]) => (
            <div key={group} className="border-b border-line-100 last:border-b-0">
              <div className="px-3 pt-2.5 pb-1 text-[10px] uppercase tracking-[0.08em] text-ink-500 font-medium">{group}</div>
              <ul className="pb-1.5">
                {vars.map((v) => (
                  <li key={v.key}>
                    <button
                      type="button"
                      onClick={() => insertVariable(v.key)}
                      disabled={disabled}
                      title={`Insertar {{${v.key}}}`}
                      className="group w-full flex items-start gap-2 px-3 py-1.5 text-left hover:bg-bg-100 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <Plus className="h-3 w-3 text-ink-400 group-hover:text-brand-700 mt-1 shrink-0" />
                      <span className="flex-1 min-w-0">
                        <span className="block text-[12px] text-ink-900 font-medium truncate">{v.label}</span>
                        <span className="block text-[10px] text-ink-500 truncate font-mono">{`{{${v.key}}}`}</span>
                      </span>
                      <span className="text-[10px] text-ink-400 truncate max-w-24 mt-1 hidden xl:inline">{v.example}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="p-3 border-t border-line-100 bg-bg-100/40 text-[11px] text-ink-500 leading-relaxed">
          {previewMode ? (
            <span>Vista previa <strong className="text-brand-700">activa</strong>: las variables muestran datos de ejemplo. Lo guardado es la plantilla original.</span>
          ) : (
            <span>También podés escribir <code className="text-brand-700">{"{{"}</code> dentro del editor para abrir el autocompletado.</span>
          )}
        </div>
      </div>
    </aside>
  );
}
