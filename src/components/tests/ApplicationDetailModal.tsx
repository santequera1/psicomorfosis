import { useState } from "react";
import { toast } from "sonner";
import { AlertOctagon, Download, Loader2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { api, type TestApplication } from "@/lib/api";

const LEVEL_STYLE: Record<string, { bg: string; text: string }> = {
  none:     { bg: "bg-success-soft", text: "text-success" },
  low:      { bg: "bg-success-soft", text: "text-success" },
  moderate: { bg: "bg-warning-soft", text: "text-risk-moderate" },
  high:     { bg: "bg-error-soft",   text: "text-risk-high" },
  critical: { bg: "bg-error-soft",   text: "text-risk-critical" },
};

// MCMI-II: catálogo de 26 escalas con nombres clínicos y agrupación por
// categoría. `max` es el peso teórico máximo de cada escala — usado para los
// badges relativos bajo/medio/alto. NO sustituye la conversión a Tasa Base
// (BR) del Excel oficial — son rangos relativos internos.
// X queda con max=null porque su fórmula no es lineal.
type MillonScaleGroup = "validity" | "personality" | "severe_personality" | "clinical" | "severe_clinical";

const MILLON_SCALES: Array<{ code: string; name: string; group: MillonScaleGroup; max: number | null }> = [
  { code: "V",  name: "Validez",                       group: "validity",           max: 4 },
  { code: "X",  name: "Sinceridad",                    group: "validity",           max: null },
  { code: "Y",  name: "Deseabilidad",                  group: "validity",           max: 23 },
  { code: "Z",  name: "Devaluación",                   group: "validity",           max: 46 },
  { code: "1",  name: "Esquizoide",                    group: "personality",        max: 58 },
  { code: "2",  name: "Fóbico (Evitativo)",            group: "personality",        max: 73 },
  { code: "3",  name: "Dependiente",                   group: "personality",        max: 62 },
  { code: "4",  name: "Histriónico",                   group: "personality",        max: 69 },
  { code: "5",  name: "Narcisista",                    group: "personality",        max: 85 },
  { code: "6A", name: "Antisocial",                    group: "personality",        max: 86 },
  { code: "6B", name: "Sádico (Agresivo)",             group: "personality",        max: 81 },
  { code: "7",  name: "Compulsivo",                    group: "personality",        max: 68 },
  { code: "8A", name: "Pasivo-Agresivo (Negativista)", group: "personality",        max: 78 },
  { code: "8B", name: "Autodestructivo",               group: "personality",        max: 71 },
  { code: "S",  name: "Esquizotípico",                 group: "severe_personality", max: 79 },
  { code: "C",  name: "Límite (Borderline)",           group: "severe_personality", max: 103 },
  { code: "P",  name: "Paranoide",                     group: "severe_personality", max: 74 },
  { code: "A",  name: "Ansiedad",                      group: "clinical",           max: 43 },
  { code: "H",  name: "Histeriforme (Somatoforme)",    group: "clinical",           max: 49 },
  { code: "N",  name: "Bipolar (Hipomanía)",           group: "clinical",           max: 57 },
  { code: "D",  name: "Distimia",                      group: "clinical",           max: 69 },
  { code: "B",  name: "Dependencia de alcohol",        group: "clinical",           max: 65 },
  { code: "T",  name: "Dependencia de drogas",         group: "clinical",           max: 90 },
  { code: "SS", name: "Pensamiento psicótico",         group: "severe_clinical",    max: 58 },
  { code: "CC", name: "Depresión mayor",               group: "severe_clinical",    max: 55 },
  { code: "PP", name: "Trastorno delirante",           group: "severe_clinical",    max: 38 },
];

const MILLON_GROUP_LABELS: Record<MillonScaleGroup, string> = {
  validity: "Escalas de validez",
  personality: "Patrones básicos de personalidad",
  severe_personality: "Patología severa de personalidad",
  clinical: "Síndromes clínicos",
  severe_clinical: "Síndromes severos",
};

// Umbrales: <33% bajo, 33-66% medio, ≥66% alto. Lectura rápida — no es BR.
function millonRelativeLevel(raw: number | null | undefined, max: number | null): "bajo" | "medio" | "alto" | null {
  if (raw == null || max == null || max === 0) return null;
  const pct = raw / max;
  if (pct < 0.33) return "bajo";
  if (pct < 0.66) return "medio";
  return "alto";
}

const MILLON_LEVEL_STYLE: Record<"bajo" | "medio" | "alto", { bg: string; text: string; label: string }> = {
  bajo:  { bg: "bg-bg-100",       text: "text-ink-500",        label: "Bajo" },
  medio: { bg: "bg-warning-soft", text: "text-risk-moderate",  label: "Medio" },
  alto:  { bg: "bg-error-soft",   text: "text-risk-high",      label: "Alto" },
};

function Modal({ children, title, onClose, wide }: { children: React.ReactNode; title: string; onClose: () => void; wide?: boolean }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-ink-900/40 backdrop-blur-sm p-0 sm:p-4" onClick={onClose}>
      <div className={cn(
        "w-full bg-surface rounded-t-2xl sm:rounded-2xl shadow-modal max-h-[92vh] overflow-y-auto",
        wide ? "sm:max-w-3xl" : "sm:max-w-md"
      )} onClick={(e) => e.stopPropagation()}>
        <header className="sticky top-0 bg-surface px-5 py-4 border-b border-line-100 flex items-start justify-between z-10">
          <h3 className="font-serif text-lg text-ink-900">{title}</h3>
          <button onClick={onClose} className="h-9 w-9 rounded-md border border-line-200 flex items-center justify-center text-ink-500 hover:border-brand-400">
            <X className="h-4 w-4" />
          </button>
        </header>
        {children}
      </div>
    </div>
  );
}

/** Vista de resultado para MCMI-II — perfil agrupado por categorías clínicas. */
export function MillonResultView({ result, onClose }: { result: TestApplication; onClose: () => void }) {
  const raw = (result.alerts_json?.scales_raw ?? {}) as Record<string, number | null | undefined>;
  const validityWarning = result.alerts_json?.meta?.validity_warning;
  const [exporting, setExporting] = useState(false);

  const groups: Record<MillonScaleGroup, typeof MILLON_SCALES> = {
    validity: [], personality: [], severe_personality: [], clinical: [], severe_clinical: [],
  };
  for (const sc of MILLON_SCALES) groups[sc.group].push(sc);

  async function downloadCsv() {
    setExporting(true);
    try {
      const blob = await api.exportTestApplicationCsv(result.id);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${result.test_code}_${(result.patient_name ?? "paciente").replace(/\s+/g, "_")}.csv`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
      toast.success("CSV descargado");
    } catch (e: any) {
      toast.error(e?.message ?? "No se pudo exportar");
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="p-5 sm:p-6">
      <div className="mb-5">
        <p className="text-[11px] uppercase tracking-widest text-ink-500 font-medium">{result.test_code} · {result.patient_name}</p>
        <h3 className="font-serif text-2xl text-ink-900 mt-1">Perfil por escala</h3>
        <p className="text-xs text-ink-500 mt-1.5">
          Estos resultados son puntuaciones brutas. La interpretación clínica debe realizarse con las tablas oficiales del MCMI-II.
        </p>
      </div>

      {validityWarning && (
        <div className="mb-4 rounded-lg border border-amber-300/50 bg-amber-50 p-3 text-sm text-amber-800 flex items-start gap-2">
          <AlertOctagon className="h-4 w-4 shrink-0 mt-0.5" />
          <span>{validityWarning}</span>
        </div>
      )}

      <div className="space-y-5 max-h-[60vh] overflow-y-auto pr-1">
        {(Object.keys(groups) as MillonScaleGroup[]).map((g) => (
          <div key={g}>
            <div className="text-[11px] uppercase tracking-[0.08em] text-brand-700 font-semibold mb-2 pb-1 border-b border-line-100">
              {MILLON_GROUP_LABELS[g]}
            </div>
            <ul className="rounded-lg border border-line-200 divide-y divide-line-100 bg-surface overflow-hidden">
              {groups[g].map((sc) => {
                const v = raw[sc.code];
                const lvl = millonRelativeLevel(v as number | null, sc.max);
                const lvlStyle = lvl ? MILLON_LEVEL_STYLE[lvl] : null;
                const isXNotCalc = sc.code === "X";
                return (
                  <li key={sc.code} className="px-3 py-2.5 flex items-center justify-between gap-3">
                    <div className="min-w-0 flex items-center gap-3">
                      <span className="text-[11px] font-mono text-ink-500 w-8 shrink-0 tabular">{sc.code}</span>
                      <span className="text-sm text-ink-900 truncate">{sc.name}</span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {isXNotCalc ? (
                        <span className="text-xs text-ink-400 italic">No calculado</span>
                      ) : (
                        <>
                          <span className="tabular text-sm font-medium text-ink-900">{v ?? "—"}</span>
                          {lvlStyle && (
                            <span className={cn("text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded font-medium", lvlStyle.bg, lvlStyle.text)}>
                              {lvlStyle.label}
                            </span>
                          )}
                        </>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>

      <div className="mt-5 rounded-lg bg-bg-100/50 border border-line-100 p-3 text-xs text-ink-500 leading-relaxed">
        <strong className="text-ink-700">Nota:</strong> los rangos <em>bajo / medio / alto</em> son una lectura rápida basada en el porcentaje de la puntuación máxima posible de cada escala — <strong>no son la Tasa Base (BR)</strong>. Para la interpretación clínica final, exporta las respuestas y úsalas en el Excel oficial del MCMI-II ajustado por sexo del paciente.
      </div>

      <div className="mt-5 flex justify-between gap-3 flex-wrap">
        <button
          onClick={downloadCsv}
          disabled={exporting}
          title="CSV con las 175 respuestas (1=V, 2=F, 0=Sin respuesta) listo para pegar en el Excel oficial."
          className="h-10 px-4 rounded-md border border-line-200 text-sm text-ink-700 hover:border-brand-400 inline-flex items-center gap-2 disabled:opacity-60"
        >
          {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
          Exportar respuestas (CSV)
        </button>
        <button onClick={onClose} className="h-10 px-5 rounded-md bg-brand-700 text-white text-sm font-medium hover:bg-brand-800">
          Cerrar
        </button>
      </div>
    </div>
  );
}

/**
 * Vista de resultados para tests cualitativos (formularios "Selección
 * personalizada"). Muestra cada pregunta junto con la respuesta del
 * paciente — sin puntaje, sin nivel. La interpretación queda al psicólogo.
 *
 * Lee del snapshot guardado en alerts_json.meta.answers_snapshot, que es
 * estable aunque después se edite el test (las preguntas/etiquetas
 * originales se conservan para esa aplicación específica).
 */
export function QualitativeResultView({ result, onClose }: { result: TestApplication; onClose: () => void }) {
  const snap = result.alerts_json?.meta?.answers_snapshot ?? [];
  return (
    <div className="p-5 sm:p-6">
      <div className="mb-5">
        <p className="text-[11px] uppercase tracking-widest text-ink-500 font-medium">{result.test_code} · {result.patient_name}</p>
        <h3 className="font-serif text-2xl text-ink-900 mt-1">Respuestas del paciente</h3>
        <p className="text-xs text-ink-500 mt-1.5">
          Test cualitativo — sin puntaje automático. Las respuestas se muestran tal cual fueron marcadas para tu interpretación clínica.
        </p>
      </div>

      {snap.length === 0 ? (
        <div className="rounded-lg border border-dashed border-line-200 p-8 text-center text-sm text-ink-500">
          No hay respuestas registradas.
        </div>
      ) : (
        <ol className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
          {snap.map((s, i) => (
            <li key={s.id} className="rounded-lg border border-line-200 bg-surface p-3">
              <div className="flex items-start gap-3">
                <span className="text-[11px] tabular text-ink-500 shrink-0 mt-0.5 w-6">{i + 1}.</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-ink-900 leading-snug">{s.text}</p>
                  <div className="mt-2">
                    {s.label != null ? (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium bg-brand-50 text-brand-800 border border-brand-100">
                        {s.label}
                      </span>
                    ) : (
                      <span className="text-xs text-ink-400 italic">Sin respuesta</span>
                    )}
                  </div>
                </div>
              </div>
            </li>
          ))}
        </ol>
      )}

      <div className="mt-5 flex justify-end">
        <button onClick={onClose} className="h-10 px-5 rounded-md bg-brand-700 text-white text-sm font-medium hover:bg-brand-800">
          Cerrar
        </button>
      </div>
    </div>
  );
}

/**
 * Modal de detalle al abrir una aplicación completada desde una lista.
 * Tres vistas según el tipo:
 *   - Millon (multi-escala con badges).
 *   - Cualitativo (lista de respuestas sin puntaje).
 *   - Estándar (score + interpretación + alerta crítica si aplica).
 */
export function ApplicationDetailModal({ app, onClose }: { app: TestApplication; onClose: () => void }) {
  const metaType = app.alerts_json?.meta?.type;
  const isMillon = metaType === "millon";
  const isQualitative = metaType === "qualitative";
  const lvl = app.level && LEVEL_STYLE[app.level];
  return (
    <Modal onClose={onClose} title={`${app.test_code} · ${app.patient_name ?? ""}`} wide={isMillon || isQualitative}>
      {isMillon ? (
        <MillonResultView result={app} onClose={onClose} />
      ) : isQualitative ? (
        <QualitativeResultView result={app} onClose={onClose} />
      ) : (
        <div className="p-6 text-center">
          <p className="text-[11px] uppercase tracking-widest text-ink-500 font-medium">{app.test_code}</p>
          <h3 className="font-serif text-3xl text-ink-900 mt-1">Score {app.score ?? "—"}</h3>
          {lvl && app.interpretation && (
            <span className={cn("inline-block mt-3 text-sm font-medium px-3 py-1 rounded-full", lvl.bg, lvl.text)}>
              {app.interpretation}
            </span>
          )}
          {app.alerts_json?.critical_response && (
            <div className="mt-4 rounded-lg border border-rose-300/50 bg-rose-500/5 p-3 text-sm text-rose-700 inline-flex items-start gap-2 text-left">
              <AlertOctagon className="h-4 w-4 shrink-0 mt-0.5" />
              <span>El paciente marcó una respuesta clínicamente significativa. Activa el protocolo de evaluación de riesgo.</span>
            </div>
          )}
          <p className="text-xs text-ink-500 mt-4">
            Completado el {app.completed_at ? new Date(app.completed_at).toLocaleString("es-CO") : "—"}
            {app.applied_by === "paciente" && " · auto-aplicado"}
          </p>
          <button onClick={onClose} className="mt-6 h-10 px-5 rounded-md bg-brand-700 text-white text-sm font-medium hover:bg-brand-800">
            Cerrar
          </button>
        </div>
      )}
    </Modal>
  );
}
