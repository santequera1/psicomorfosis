/**
 * Gestor de diagnósticos clínicos estructurados de un paciente.
 *
 * Vive dentro del bloque "Impresión diagnóstica" de la historia clínica
 * (kind="cie11"), reemplazando lo que antes era un textarea libre. La
 * estructura final del bloque es:
 *
 *   ┌─ Impresión diagnóstica
 *   │  [Chips de dx asignados: ⭐ Principal · Código · Nombre · ×]
 *   │  [+ Agregar diagnóstico]
 *   │  ─────────
 *   │  Formulación clínica (textarea libre del bloque cie11)
 *   └─
 *
 * Búsqueda híbrida en el modal de agregar:
 *   1. Filtra primero el catálogo curado local (~32 dx, instantáneo).
 *   2. Si la psicóloga no encuentra lo que busca, botón "Buscar más en
 *      CIE-11 (OMS)" dispara consulta live a la API de la OMS.
 *   3. Si todo lo demás falla, puede agregar como texto libre
 *      (system="Otro" + nombre y código que ella escriba).
 *
 * Multi-diagnóstico con uno marcable como "principal" (máx 1 activo
 * por paciente; el backend valida la regla).
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Plus, Star, X, Search, Globe, Loader2, ChevronDown, Check, Sparkles,
} from "lucide-react";
import {
  api,
  type ClinicalDiagnosis,
  type DiagnosticSystem,
  type DiagnosisCatalog,
  type DiagnosisCatalogEntry,
  DIAGNOSTIC_SYSTEMS,
} from "@/lib/api";
import { cn } from "@/lib/utils";

// ─── Componente principal ────────────────────────────────────────────

export function DiagnosisManager({ patientId }: { patientId: string }) {
  const qc = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [editingNoteFor, setEditingNoteFor] = useState<ClinicalDiagnosis | null>(null);

  const { data: diagnoses = [], isLoading } = useQuery({
    queryKey: ["diagnoses", patientId],
    queryFn: () => api.listPatientDiagnoses(patientId),
  });

  const archiveMu = useMutation({
    mutationFn: (id: number) => api.archiveDiagnosis(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["diagnoses", patientId] });
      toast.success("Diagnóstico archivado");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const togglePrimaryMu = useMutation({
    mutationFn: ({ id, isPrimary }: { id: number; isPrimary: boolean }) =>
      api.updateDiagnosis(id, { isPrimary }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["diagnoses", patientId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] uppercase tracking-widest text-ink-500 font-medium">
          Diagnósticos asignados
        </span>
        {diagnoses.length > 0 && (
          <span className="text-[10px] text-ink-400 tabular">
            {diagnoses.length} {diagnoses.length === 1 ? "registrado" : "registrados"}
          </span>
        )}
      </div>

      {isLoading ? (
        <div className="text-xs text-ink-400 italic">Cargando…</div>
      ) : diagnoses.length === 0 ? (
        <div className="rounded-md border border-dashed border-line-200 bg-bg-50/60 px-3 py-3 text-xs text-ink-500 italic">
          Aún sin diagnósticos. Usa "+ Agregar diagnóstico" para elegir del
          catálogo, buscar en CIE-11 de la OMS o agregar texto libre.
        </div>
      ) : (
        <ul className="space-y-2">
          {diagnoses.map((d) => (
            <DiagnosisChip
              key={d.id}
              dx={d}
              onArchive={() => archiveMu.mutate(d.id)}
              onTogglePrimary={() => togglePrimaryMu.mutate({ id: d.id, isPrimary: !d.isPrimary })}
              onEditNote={() => setEditingNoteFor(d)}
            />
          ))}
        </ul>
      )}

      <button
        type="button"
        onClick={() => setAdding(true)}
        className="h-8 px-3 rounded-md border border-line-200 bg-surface text-xs text-ink-700 hover:border-brand-400 hover:bg-brand-50/40 inline-flex items-center gap-1.5"
      >
        <Plus className="h-3.5 w-3.5" /> Agregar diagnóstico
      </button>

      {adding && (
        <AddDiagnosisModal
          patientId={patientId}
          onClose={() => setAdding(false)}
          onAdded={() => {
            qc.invalidateQueries({ queryKey: ["diagnoses", patientId] });
            setAdding(false);
          }}
        />
      )}

      {editingNoteFor && (
        <EditNoteModal
          dx={editingNoteFor}
          onClose={() => setEditingNoteFor(null)}
          onSaved={() => {
            qc.invalidateQueries({ queryKey: ["diagnoses", patientId] });
            setEditingNoteFor(null);
          }}
        />
      )}
    </div>
  );
}

// ─── Chip de un diagnóstico ──────────────────────────────────────────

function DiagnosisChip({
  dx, onArchive, onTogglePrimary, onEditNote,
}: {
  dx: ClinicalDiagnosis;
  onArchive: () => void;
  onTogglePrimary: () => void;
  onEditNote: () => void;
}) {
  return (
    <li className="rounded-lg border border-line-200 bg-surface px-3 py-2.5 hover:border-brand-400/50 transition-colors">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <button
              type="button"
              onClick={onTogglePrimary}
              title={dx.isPrimary ? "Quitar como principal" : "Marcar como principal"}
              className={cn(
                "shrink-0 inline-flex items-center justify-center h-5 w-5 rounded-md transition-colors",
                dx.isPrimary
                  ? "text-warning bg-warning-soft hover:bg-warning-soft/70"
                  : "text-ink-400 hover:text-warning hover:bg-warning-soft/40",
              )}
            >
              <Star className={cn("h-3.5 w-3.5", dx.isPrimary && "fill-current")} />
            </button>
            <code className="text-xs text-brand-800 font-medium tabular">{dx.code}</code>
            <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-bg-100 text-ink-500">
              {dx.system}
            </span>
            {dx.isPrimary && (
              <span className="text-[10px] uppercase tracking-widest text-warning font-medium">
                Principal
              </span>
            )}
          </div>
          <div className="text-sm text-ink-900 mt-1">{dx.name}</div>
          {dx.note && (
            <div className="text-[11px] text-ink-500 mt-1 italic line-clamp-2">"{dx.note}"</div>
          )}
          <button
            type="button"
            onClick={onEditNote}
            className="text-[11px] text-brand-700 hover:underline mt-1"
          >
            {dx.note ? "Editar nota" : "Agregar nota"}
          </button>
        </div>
        <button
          type="button"
          onClick={onArchive}
          title="Archivar este diagnóstico"
          className="h-7 w-7 rounded-md text-ink-400 hover:text-rose-700 hover:bg-rose-50 inline-flex items-center justify-center shrink-0"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </li>
  );
}

// ─── Modal: Agregar diagnóstico ──────────────────────────────────────

function AddDiagnosisModal({
  patientId, onClose, onAdded,
}: {
  patientId: string;
  onClose: () => void;
  onAdded: () => void;
}) {
  const [system, setSystem] = useState<DiagnosticSystem>("CIE-11");
  const [query, setQuery] = useState("");
  const [selectedEntry, setSelectedEntry] = useState<DiagnosisCatalogEntry | null>(null);
  // Para "agregar como texto libre": code y name que la psicóloga escribe.
  const [freeCode, setFreeCode] = useState("");
  const [freeName, setFreeName] = useState("");
  const [isPrimary, setIsPrimary] = useState(false);
  const [note, setNote] = useState("");
  const [showOmsResults, setShowOmsResults] = useState(false);
  const [omsResults, setOmsResults] = useState<Array<{ code: string; name: string; chapter?: string }>>([]);
  const [omsSearching, setOmsSearching] = useState(false);
  const [omsError, setOmsError] = useState<string | null>(null);

  // ESC cierra
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Carga del catálogo curado según el sistema elegido.
  const { data: catalog } = useQuery({
    queryKey: ["diagnosis-catalog", system],
    queryFn: () => api.getDiagnosisCatalog(system),
    enabled: system !== "Otro",
    staleTime: 5 * 60_000, // 5min — el catálogo cambia con deploy, no con uso
  });

  // Filtrado local del catálogo. Match contra name, code y keywords.
  const filteredCatalog = useMemo(() => {
    if (!catalog?.entries) return [];
    const q = query.trim().toLowerCase();
    if (!q) {
      // Sin query, agrupamos por categoría para que la psicóloga vea
      // todo el catálogo de un vistazo. Se renderiza con headers.
      return catalog.entries;
    }
    return catalog.entries.filter((e) => {
      if (e.name.toLowerCase().includes(q)) return true;
      if ((e.code ?? "").toLowerCase().includes(q)) return true;
      if (e.keywords?.some((k) => k.toLowerCase().includes(q))) return true;
      return false;
    });
  }, [catalog, query]);

  // Agrupar por categoría para mostrar headers.
  const groupedCatalog = useMemo(() => {
    const map = new Map<string, DiagnosisCatalogEntry[]>();
    for (const e of filteredCatalog) {
      if (!map.has(e.category)) map.set(e.category, []);
      map.get(e.category)!.push(e);
    }
    return map;
  }, [filteredCatalog]);

  async function buscarEnOms() {
    if (query.trim().length < 2) {
      toast.error("Escribe al menos 2 caracteres para buscar en OMS");
      return;
    }
    setOmsSearching(true);
    setOmsError(null);
    try {
      const { results } = await api.searchIcd11(query, 10);
      setOmsResults(results);
      setShowOmsResults(true);
      if (results.length === 0) {
        toast.message("Sin resultados en CIE-11 OMS. Puedes agregar como texto libre.");
      }
    } catch (err: any) {
      // 503 = endpoint sin credenciales configuradas. 502 = OMS no
      // disponible. En cualquier caso, mostramos mensaje y permitimos
      // continuar con catálogo local o texto libre.
      const msg = String(err?.message ?? err);
      setOmsError(msg.includes("503") ? "Búsqueda OMS no configurada." : "OMS no disponible en este momento.");
    } finally {
      setOmsSearching(false);
    }
  }

  const addMu = useMutation({
    mutationFn: () => {
      const payload = selectedEntry
        ? {
            code: selectedEntry.code ?? "",
            system,
            name: selectedEntry.name,
            catalogId: selectedEntry.id,
            isPrimary,
            note: note.trim() || null,
          }
        : {
            code: freeCode.trim(),
            system,
            name: freeName.trim(),
            catalogId: null,
            isPrimary,
            note: note.trim() || null,
          };
      return api.addPatientDiagnosis(patientId, payload);
    },
    onSuccess: () => {
      toast.success("Diagnóstico agregado");
      onAdded();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const canSubmit = selectedEntry
    ? !!selectedEntry.code
    : freeCode.trim().length > 0 && freeName.trim().length > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-ink-900/50 backdrop-blur-sm p-0 sm:p-4">
      <div className="w-full sm:max-w-xl bg-surface rounded-t-2xl sm:rounded-xl border border-line-200 shadow-modal max-h-[92vh] overflow-y-auto">
        <header className="px-5 py-4 border-b border-line-100 flex items-start justify-between gap-3 sticky top-0 bg-surface z-10">
          <div>
            <h3 className="font-serif text-lg text-ink-900">Agregar diagnóstico</h3>
            <p className="text-[11px] text-ink-500 mt-0.5">
              Busca en el catálogo, en CIE-11 OMS, o agrega texto libre.
            </p>
          </div>
          <button type="button" onClick={onClose} className="h-8 w-8 rounded-md hover:bg-bg-100 flex items-center justify-center text-ink-500 shrink-0">
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="p-5 space-y-4">
          {/* Selector de sistema */}
          <div>
            <label className="text-[11px] uppercase tracking-widest text-ink-500 font-medium block mb-1.5">
              Sistema
            </label>
            <SystemPicker value={system} onChange={(s) => {
              setSystem(s);
              setSelectedEntry(null);
              setShowOmsResults(false);
              setOmsResults([]);
            }} />
          </div>

          {/* Buscador */}
          {system !== "Otro" && (
            <div>
              <div className="relative">
                <Search className="h-4 w-4 text-ink-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={query}
                  onChange={(e) => { setQuery(e.target.value); setSelectedEntry(null); }}
                  placeholder="Buscar por código o descripción…"
                  className="w-full h-10 pl-9 pr-3 rounded-md border border-line-200 bg-surface text-sm text-ink-900 outline-none focus:border-brand-700"
                  autoFocus
                />
              </div>

              {/* Lista del catálogo local */}
              <div className="mt-3 max-h-64 overflow-y-auto rounded-md border border-line-100 bg-bg-50/40">
                {filteredCatalog.length === 0 ? (
                  <div className="px-3 py-6 text-xs text-ink-500 text-center italic">
                    Sin resultados en el catálogo local.
                  </div>
                ) : (
                  Array.from(groupedCatalog.entries()).map(([cat, items]) => (
                    <div key={cat}>
                      <div className="px-3 pt-2 pb-1 text-[10px] uppercase tracking-widest text-ink-400 font-semibold sticky top-0 bg-bg-50/95 backdrop-blur">
                        {cat}
                      </div>
                      {items.map((e) => (
                        <button
                          key={e.id}
                          type="button"
                          onClick={() => setSelectedEntry(e)}
                          className={cn(
                            "w-full px-3 py-1.5 text-left flex items-center gap-2 hover:bg-brand-50/50 border-l-2 border-transparent",
                            selectedEntry?.id === e.id && "bg-brand-50/80 border-brand-700",
                          )}
                        >
                          <code className="text-[11px] text-brand-800 font-medium tabular shrink-0 min-w-15">
                            {e.code}
                          </code>
                          <span className="text-xs text-ink-900 truncate flex-1">{e.name}</span>
                          {selectedEntry?.id === e.id && (
                            <Check className="h-3.5 w-3.5 text-brand-700 shrink-0" />
                          )}
                        </button>
                      ))}
                    </div>
                  ))
                )}
              </div>

              {/* Buscar en OMS */}
              {system === "CIE-11" && (
                <div className="mt-2">
                  <button
                    type="button"
                    onClick={buscarEnOms}
                    disabled={omsSearching || query.trim().length < 2}
                    className="text-xs text-brand-700 hover:underline inline-flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {omsSearching
                      ? <><Loader2 className="h-3 w-3 animate-spin" /> Buscando…</>
                      : <><Globe className="h-3 w-3" /> Buscar más en CIE-11 (OMS)</>}
                  </button>
                  {omsError && (
                    <div className="mt-1 text-[11px] text-risk-moderate">
                      {omsError} Puedes seguir con el catálogo local o agregar como texto libre.
                    </div>
                  )}
                </div>
              )}

              {/* Resultados de OMS */}
              {showOmsResults && omsResults.length > 0 && (
                <div className="mt-3 rounded-md border border-info/20 bg-info-soft/40">
                  <div className="px-3 pt-2 pb-1 text-[10px] uppercase tracking-widest text-info font-semibold flex items-center gap-1">
                    <Sparkles className="h-3 w-3" /> Resultados CIE-11 OMS
                  </div>
                  {omsResults.map((r) => {
                    const entry: DiagnosisCatalogEntry = {
                      id: `oms-${r.code}`,
                      category: "OMS",
                      name: r.name,
                      code: r.code,
                      keywords: [],
                    };
                    const isSel = selectedEntry?.id === entry.id;
                    return (
                      <button
                        key={r.code}
                        type="button"
                        onClick={() => setSelectedEntry(entry)}
                        className={cn(
                          "w-full px-3 py-1.5 text-left flex items-center gap-2 hover:bg-info-soft border-l-2 border-transparent",
                          isSel && "bg-info-soft border-info",
                        )}
                      >
                        <code className="text-[11px] text-info font-medium tabular shrink-0 min-w-15">
                          {r.code}
                        </code>
                        <span className="text-xs text-ink-900 truncate flex-1">{r.name}</span>
                        {isSel && <Check className="h-3.5 w-3.5 text-info shrink-0" />}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Modo "texto libre" — siempre disponible para system=Otro,
              o como fallback cuando no se encuentra en catálogo/OMS. */}
          <div className={cn(
            "rounded-md border bg-bg-50/60 p-3 space-y-2.5",
            system === "Otro" ? "border-line-200" : "border-line-100 border-dashed",
          )}>
            <div className="text-[11px] uppercase tracking-widest text-ink-500 font-medium">
              {system === "Otro" ? "Diagnóstico (texto libre)" : "¿No encuentras el dx? Agrégalo libre"}
            </div>
            <div className="grid grid-cols-3 gap-2">
              <input
                value={freeCode}
                onChange={(e) => { setFreeCode(e.target.value); setSelectedEntry(null); }}
                placeholder="Código"
                className="col-span-1 h-9 px-2 rounded-md border border-line-200 bg-surface text-xs tabular outline-none focus:border-brand-700"
              />
              <input
                value={freeName}
                onChange={(e) => { setFreeName(e.target.value); setSelectedEntry(null); }}
                placeholder="Nombre del diagnóstico"
                className="col-span-2 h-9 px-2 rounded-md border border-line-200 bg-surface text-xs outline-none focus:border-brand-700"
              />
            </div>
          </div>

          {/* Opciones del nuevo dx */}
          <div className="space-y-2.5">
            <label className="flex items-start gap-2.5 text-xs text-ink-700 cursor-pointer">
              <input
                type="checkbox"
                checked={isPrimary}
                onChange={(e) => setIsPrimary(e.target.checked)}
                className="mt-0.5"
              />
              <div className="flex-1 min-w-0">
                <div className="font-medium text-ink-900">Marcar como diagnóstico principal</div>
                <div className="text-ink-500 mt-0.5">
                  Si ya hay otro principal, se cambia por este (máx 1 activo).
                </div>
              </div>
            </label>

            <div>
              <label className="text-[11px] uppercase tracking-widest text-ink-500 font-medium block mb-1.5">
                Nota (opcional)
              </label>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={2}
                placeholder="Detalles específicos de este diagnóstico para este paciente…"
                className="w-full px-3 py-2 rounded-md border border-line-200 bg-surface text-xs text-ink-900 outline-none focus:border-brand-700 resize-none"
              />
            </div>
          </div>
        </div>

        {/* Footer sticky con fondo OPACO (no /30) para que el contenido
            del modal no se transparente debajo de los botones al scrollear
            en mobile. Shadow superior para reforzar la separación visual. */}
        <footer className="px-5 py-3 border-t border-line-200 bg-surface flex items-center justify-end gap-2 sticky bottom-0 shadow-[0_-4px_6px_-2px_rgba(0,0,0,0.04)]">
          <button type="button" onClick={onClose} className="h-10 px-4 rounded-lg text-sm text-ink-700 hover:bg-bg-100">
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => addMu.mutate()}
            disabled={!canSubmit || addMu.isPending}
            className="h-10 px-4 rounded-lg bg-brand-700 text-white text-sm font-medium hover:bg-brand-800 disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-2"
          >
            {addMu.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            <Plus className="h-4 w-4" /> Agregar
          </button>
        </footer>
      </div>
    </div>
  );
}

// ─── Modal: editar nota de un dx existente ───────────────────────────

function EditNoteModal({
  dx, onClose, onSaved,
}: {
  dx: ClinicalDiagnosis;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [note, setNote] = useState(dx.note ?? "");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const mu = useMutation({
    mutationFn: () => api.updateDiagnosis(dx.id, { note: note.trim() || null }),
    onSuccess: () => {
      toast.success("Nota actualizada");
      onSaved();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-ink-900/50 backdrop-blur-sm p-0 sm:p-4">
      <div className="w-full sm:max-w-md bg-surface rounded-t-2xl sm:rounded-xl border border-line-200 shadow-modal">
        <header className="px-5 py-4 border-b border-line-100 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="font-serif text-lg text-ink-900">Nota del diagnóstico</h3>
            <div className="text-[11px] text-ink-500 mt-0.5 flex items-center gap-1.5 truncate">
              <code className="text-brand-800 tabular">{dx.code}</code>
              <span className="truncate">{dx.name}</span>
            </div>
          </div>
          <button type="button" onClick={onClose} className="h-8 w-8 rounded-md hover:bg-bg-100 flex items-center justify-center text-ink-500 shrink-0">
            <X className="h-4 w-4" />
          </button>
        </header>
        <div className="p-5">
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={4}
            autoFocus
            placeholder="Detalles específicos de este diagnóstico para este paciente…"
            className="w-full px-3 py-2 rounded-md border border-line-200 bg-surface text-sm text-ink-900 outline-none focus:border-brand-700 resize-none"
          />
        </div>
        <footer className="px-5 py-3 border-t border-line-100 bg-bg-100/30 flex items-center justify-end gap-2">
          <button type="button" onClick={onClose} className="h-10 px-4 rounded-lg text-sm text-ink-700 hover:bg-bg-100">
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => mu.mutate()}
            disabled={mu.isPending}
            className="h-10 px-4 rounded-lg bg-brand-700 text-white text-sm font-medium hover:bg-brand-800 disabled:opacity-50 inline-flex items-center gap-2"
          >
            {mu.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            Guardar nota
          </button>
        </footer>
      </div>
    </div>
  );
}

// ─── Dropdown custom de sistema (reusa la idea del que tenía historia.tsx) ──

function SystemPicker({
  value, onChange,
}: {
  value: DiagnosticSystem;
  onChange: (v: DiagnosticSystem) => void;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") setOpen(false); }
    window.addEventListener("mousedown", onClick);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onClick);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={containerRef} className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "h-9 pl-3 pr-2 rounded-md border border-line-200 bg-surface text-sm text-ink-900 inline-flex items-center gap-2 hover:border-brand-400 min-w-40",
          open && "border-brand-700",
        )}
      >
        <span className="tabular flex-1 text-left">{value}</span>
        <ChevronDown className={cn("h-4 w-4 text-ink-400 transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div className="absolute left-0 top-full mt-1 z-30 min-w-50 rounded-lg border border-line-200 bg-surface shadow-modal py-1">
          {DIAGNOSTIC_SYSTEMS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => { onChange(s); setOpen(false); }}
              className={cn(
                "w-full px-3 py-2 text-sm text-left flex items-center justify-between gap-3 hover:bg-bg-100",
                value === s ? "text-ink-900 font-medium" : "text-ink-700",
              )}
            >
              <span>
                {s}
                <span className="text-[10px] text-ink-400 ml-2">
                  {s === "CIE-11" && "OMS"}
                  {s === "DSM-5-TR" && "APA"}
                  {s === "Otro" && "texto libre"}
                </span>
              </span>
              {value === s && <Check className="h-3.5 w-3.5 text-brand-700 shrink-0" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
