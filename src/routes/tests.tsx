import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AppShell } from "@/components/app/AppShell";
import { KpiCard } from "@/components/app/KpiCard";
import { TestRunner } from "@/components/tests/TestRunner";
import { ApplicationDetailModal, MillonResultView } from "@/components/tests/ApplicationDetailModal";
import { FormBuilderModal } from "@/components/tests/FormBuilderModal";
import { RequestTestModal } from "@/components/tests/RequestTestModal";
import { api, type ApiPatient, type PsychTest, type TestApplication } from "@/lib/api";
import {
  Brain, CheckCircle2, Clock, Send, Search, X, ChevronRight,
  Loader2, AlertOctagon, ShieldAlert, UserPlus, Plus, FileText,
  Trash2, MessageSquarePlus, Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/tests")({
  head: () => ({ meta: [{ title: "Tests psicométricos · Psicomorfosis" }] }),
  component: TestsPage,
});

const LEVEL_STYLE: Record<string, { bg: string; text: string }> = {
  none:     { bg: "bg-success-soft", text: "text-success" },
  low:      { bg: "bg-success-soft", text: "text-success" },
  moderate: { bg: "bg-warning-soft", text: "text-risk-moderate" },
  high:     { bg: "bg-error-soft",   text: "text-risk-high" },
  critical: { bg: "bg-error-soft",   text: "text-risk-critical" },
};

const STATUS_STYLE: Record<string, { bg: string; text: string; label: string; icon: React.ComponentType<{ className?: string }> }> = {
  pendiente:  { bg: "bg-warning-soft", text: "text-risk-moderate", label: "Pendiente", icon: Clock },
  en_curso:   { bg: "bg-brand-50",     text: "text-brand-800",     label: "En curso",  icon: Send },
  completado: { bg: "bg-success-soft", text: "text-success",       label: "Completado", icon: CheckCircle2 },
};

function TestsPage() {
  const qc = useQueryClient();
  const [query, setQuery] = useState("");
  const [activeTest, setActiveTest] = useState<PsychTest | null>(null);
  const [applyContext, setApplyContext] = useState<{ test: PsychTest; patientId?: string; patientName?: string } | null>(null);
  const [assignContext, setAssignContext] = useState<PsychTest | null>(null);
  const [detailApp, setDetailApp] = useState<TestApplication | null>(null);
  const [builderOpen, setBuilderOpen] = useState(false);
  const [requestOpen, setRequestOpen] = useState(false);

  const { data: catalog = [], isLoading: catalogLoading } = useQuery({
    queryKey: ["test-catalog"],
    queryFn: () => api.listTestCatalog(),
  });
  const { data: applications = [], isLoading: appsLoading } = useQuery({
    queryKey: ["test-applications"],
    queryFn: () => api.listTestApplications(),
  });
  const { data: patients = [] } = useQuery({
    queryKey: ["patients"],
    queryFn: () => api.listPatients(),
  });

  const filteredCatalog = useMemo(() => {
    if (!query.trim()) return catalog;
    const q = query.toLowerCase();
    return catalog.filter((t) =>
      t.code.toLowerCase().includes(q) ||
      t.name.toLowerCase().includes(q) ||
      t.category.toLowerCase().includes(q)
    );
  }, [catalog, query]);

  const officialTests = useMemo(() => filteredCatalog.filter((t) => !t.isCustom), [filteredCatalog]);
  const customForms   = useMemo(() => filteredCatalog.filter((t) =>  t.isCustom), [filteredCatalog]);

  const deleteFormMu = useMutation({
    mutationFn: (id: string) => api.deleteTestForm(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["test-catalog"] });
      toast.success("Test eliminado");
    },
    onError: (e: Error) => toast.error(e.message ?? "No se pudo eliminar"),
  });

  const kpis = useMemo(() => ({
    total: applications.length,
    pending: applications.filter((a) => a.status === "pendiente").length,
    completed: applications.filter((a) => a.status === "completado").length,
    critical: applications.filter((a) => a.alerts_json?.critical_response).length,
  }), [applications]);

  return (
    <AppShell>
      <div className="space-y-6">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.14em] text-brand-700 font-semibold">Evaluación clínica</p>
            <h1 className="font-serif text-2xl md:text-[32px] leading-tight text-ink-900 mt-1">Tests psicométricos</h1>
            <p className="text-sm text-ink-500 mt-1">
              Instrumentos clínicos oficiales + tus formularios personalizados.
            </p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={() => setRequestOpen(true)}
              className="h-10 px-3 rounded-lg border border-line-200 bg-surface text-ink-700 text-sm hover:border-brand-400 inline-flex items-center gap-1.5"
              title="Solicitar al equipo Psicomorfosis un test clínico complejo"
            >
              <MessageSquarePlus className="h-4 w-4" /> Solicitar test
            </button>
            <button
              onClick={() => setBuilderOpen(true)}
              className="h-10 px-3 rounded-lg bg-brand-700 text-white text-sm font-medium hover:bg-brand-800 inline-flex items-center gap-1.5"
            >
              <Plus className="h-4 w-4" /> Crear test
            </button>
          </div>
        </header>

        <section className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
          <KpiCard label="Total aplicados" value={String(kpis.total)} hint="histórico" icon={<Brain className="h-4 w-4" />} delta={{ neutral: true, value: "" }} />
          <KpiCard label="Pendientes" value={String(kpis.pending)} hint="por contestar" icon={<Clock className="h-4 w-4" />} delta={{ neutral: true, value: "" }} />
          <KpiCard label="Completados" value={String(kpis.completed)} hint="con resultado" icon={<CheckCircle2 className="h-4 w-4" />} delta={{ neutral: true, value: "" }} />
          <KpiCard label="Alertas críticas" value={String(kpis.critical)} emphasis={kpis.critical > 0 ? "risk" : "default"} hint="requieren seguimiento" icon={<ShieldAlert className="h-4 w-4" />} delta={{ neutral: true, value: "" }} />
        </section>

        <section className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          {/* Catálogo */}
          <div className="lg:col-span-2 rounded-xl border border-line-200 bg-surface">
            <div className="p-4 border-b border-line-100">
              <div className="flex items-center gap-2 h-10 px-3 rounded-md border border-line-200 bg-bg-100/40">
                <Search className="h-4 w-4 text-ink-400 shrink-0" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Buscar por nombre, código o categoría…"
                  className="flex-1 bg-transparent text-sm text-ink-900 placeholder:text-ink-400 outline-none min-w-0"
                />
              </div>
            </div>
            {catalogLoading ? (
              <div className="p-10 text-center text-sm text-ink-500"><Loader2 className="h-4 w-4 animate-spin inline mr-2" /> Cargando…</div>
            ) : (
              <div>
                {/* Sección 1: instrumentos clínicos oficiales */}
                <CatalogSectionHeader
                  icon={<ShieldAlert className="h-3.5 w-3.5" />}
                  title="Instrumentos clínicos"
                  subtitle={`${officialTests.length} oficiales · validados clínicamente`}
                />
                {officialTests.length === 0 ? (
                  <div className="px-5 py-6 text-center text-xs text-ink-500">Sin coincidencias.</div>
                ) : (
                  <ul className="divide-y divide-line-100">
                    {officialTests.map((t) => (
                      <CatalogRow
                        key={t.id}
                        test={t}
                        onApply={() => setApplyContext({ test: t })}
                        onAssign={() => setAssignContext(t)}
                        onView={() => setActiveTest(t)}
                      />
                    ))}
                  </ul>
                )}

                {/* Sección 2: formularios del consultorio */}
                <CatalogSectionHeader
                  icon={<Sparkles className="h-3.5 w-3.5" />}
                  title="Mis tests"
                  subtitle={
                    customForms.length === 0
                      ? "Crea tu primer test personalizado de tamizaje o autoevaluación"
                      : `${customForms.length} ${customForms.length === 1 ? "test creado" : "tests creados"} por ti`
                  }
                />
                {customForms.length === 0 ? (
                  <div className="px-5 py-8 text-center">
                    <p className="text-sm text-ink-500">Aún no has creado ningún test.</p>
                    <button
                      onClick={() => setBuilderOpen(true)}
                      className="mt-3 h-9 px-3 rounded-md border border-line-200 text-xs text-ink-700 hover:border-brand-400 inline-flex items-center gap-1.5"
                    >
                      <Plus className="h-3.5 w-3.5" /> Crear test
                    </button>
                  </div>
                ) : (
                  <ul className="divide-y divide-line-100">
                    {customForms.map((t) => (
                      <CatalogRow
                        key={t.id}
                        test={t}
                        onApply={() => setApplyContext({ test: t })}
                        onAssign={() => setAssignContext(t)}
                        onView={() => setActiveTest(t)}
                        onDelete={() => {
                          if (confirm(`¿Eliminar el test "${t.name}"? Las aplicaciones ya hechas se conservan.`)) {
                            deleteFormMu.mutate(t.id);
                          }
                        }}
                      />
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>

          {/* Sidebar: aplicaciones recientes */}
          <aside className="rounded-xl border border-line-200 bg-surface">
            <div className="p-4 border-b border-line-100">
              <h2 className="font-serif text-lg text-ink-900">Aplicaciones recientes</h2>
              <p className="text-xs text-ink-500 mt-0.5">Últimas {Math.min(applications.length, 10)} aplicaciones del workspace</p>
            </div>
            {appsLoading ? (
              <div className="p-6 text-center text-sm text-ink-500"><Loader2 className="h-4 w-4 animate-spin inline" /></div>
            ) : applications.length === 0 ? (
              <div className="p-6 text-center text-sm text-ink-500">Aún no hay aplicaciones.</div>
            ) : (
              <ul className="divide-y divide-line-100 max-h-96 overflow-y-auto">
                {applications.slice(0, 20).map((a) => (
                  <ApplicationRow key={a.id} app={a} onOpen={() => setDetailApp(a)} />
                ))}
              </ul>
            )}
          </aside>
        </section>
      </div>

      {/* Modal: detalle del test (read-only) */}
      {activeTest && (
        <TestDetailModal
          test={activeTest}
          onClose={() => setActiveTest(null)}
          onApply={() => { setActiveTest(null); setApplyContext({ test: activeTest }); }}
          onAssign={() => { setActiveTest(null); setAssignContext(activeTest); }}
        />
      )}

      {/* Modal: aplicar test (TestRunner staff) */}
      {applyContext && (
        <ApplyTestModal
          test={applyContext.test}
          patients={patients}
          presetPatientId={applyContext.patientId}
          onClose={() => setApplyContext(null)}
        />
      )}

      {/* Modal: asignar al paciente */}
      {assignContext && (
        <AssignTestModal
          test={assignContext}
          patients={patients}
          onClose={() => setAssignContext(null)}
        />
      )}

      {/* Modal: detalle de aplicación completada (al click en una row) */}
      {detailApp && (
        <ApplicationDetailModal app={detailApp} onClose={() => setDetailApp(null)} />
      )}

      {/* Modal: crear formulario personalizado */}
      {builderOpen && <FormBuilderModal onClose={() => setBuilderOpen(false)} />}

      {/* Modal: solicitar test al equipo Psicomorfosis */}
      {requestOpen && <RequestTestModal onClose={() => setRequestOpen(false)} />}
    </AppShell>
  );
}

function CatalogSectionHeader({ icon, title, subtitle }: {
  icon: React.ReactNode; title: string; subtitle: string;
}) {
  return (
    <div className="px-5 py-3 bg-bg-100/40 border-y border-line-100 first:border-t-0 flex items-center gap-2">
      <span className="h-6 w-6 rounded-md bg-brand-50 text-brand-700 inline-flex items-center justify-center shrink-0">
        {icon}
      </span>
      <div className="min-w-0">
        <p className="text-[11px] uppercase tracking-widest text-brand-700 font-semibold">{title}</p>
        <p className="text-[11px] text-ink-500 truncate">{subtitle}</p>
      </div>
    </div>
  );
}

// ─── Componentes ───────────────────────────────────────────────────────────

function CatalogRow({ test, onApply, onAssign, onView, onDelete }: {
  test: PsychTest;
  onApply: () => void;
  onAssign: () => void;
  onView: () => void;
  onDelete?: () => void;
}) {
  const ready = !!test.definition?.questions?.length;
  const isCustom = !!test.isCustom;
  return (
    <li className="px-5 py-4 hover:bg-brand-50/40 transition-colors group">
      <div className="flex items-start gap-3">
        <div className={cn(
          "h-10 w-10 rounded-lg flex items-center justify-center shrink-0",
          isCustom ? "bg-brand-50 text-brand-700" : "bg-lavender-100 text-lavender-500"
        )}>
          {isCustom ? <FileText className="h-5 w-5" /> : <Brain className="h-5 w-5" />}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-baseline gap-2">
            <span className="font-serif text-base text-ink-900">{test.code}</span>
            <span className="text-xs text-ink-500">{test.shortName}</span>
            <span className="text-[10px] uppercase tracking-widest px-2 py-0.5 rounded-full bg-bg-100 text-ink-500 font-medium">{test.category}</span>
            {isCustom && (
              <span className="text-[10px] uppercase tracking-widest px-2 py-0.5 rounded-full bg-brand-50 text-brand-800 font-medium border border-brand-100">
                Mío
              </span>
            )}
          </div>
          <p className="text-xs text-ink-700 mt-1 line-clamp-2">{test.description}</p>
          <p className="text-[11px] text-ink-500 mt-1">{test.items} ítems · ~{test.minutes} min · {test.ageRange}</p>
        </div>
        <div className="flex flex-col gap-1.5 shrink-0">
          {ready ? (
            <>
              <button onClick={onApply} className="h-8 px-3 rounded-md bg-brand-700 text-white text-xs font-medium hover:bg-brand-800 inline-flex items-center gap-1.5">
                <Send className="h-3.5 w-3.5" /> Aplicar ahora
              </button>
              <button onClick={onAssign} className="h-8 px-3 rounded-md border border-line-200 text-xs text-ink-700 hover:border-brand-400 inline-flex items-center gap-1.5">
                <UserPlus className="h-3.5 w-3.5" /> Asignar
              </button>
              {onDelete && (
                <button
                  onClick={onDelete}
                  className="h-8 px-3 rounded-md border border-line-200 text-xs text-ink-500 hover:border-rose-400 hover:text-rose-700 inline-flex items-center gap-1.5"
                  title="Eliminar formulario"
                >
                  <Trash2 className="h-3.5 w-3.5" /> Eliminar
                </button>
              )}
            </>
          ) : (
            <button onClick={onView} className="h-8 px-3 rounded-md border border-line-200 text-xs text-ink-500 inline-flex items-center gap-1.5">
              Ver detalle
            </button>
          )}
        </div>
      </div>
    </li>
  );
}

function ApplicationRow({ app, onOpen }: { app: TestApplication; onOpen: () => void }) {
  const status = STATUS_STYLE[app.status] ?? STATUS_STYLE.pendiente;
  const StatusIcon = status.icon;
  const level = app.level && LEVEL_STYLE[app.level];
  const dateStr = app.completed_at
    ? new Date(app.completed_at).toLocaleDateString("es-CO", { day: "numeric", month: "short" })
    : app.assigned_at
      ? `asignado ${new Date(app.assigned_at).toLocaleDateString("es-CO", { day: "numeric", month: "short" })}`
      : app.date ?? "";
  const isMillon = app.alerts_json?.meta?.type === "millon";
  return (
    <li>
      <button
        onClick={onOpen}
        disabled={app.status !== "completado"}
        className="w-full text-left px-4 py-3 hover:bg-bg-100/30 transition-colors disabled:hover:bg-transparent disabled:cursor-default"
      >
        <div className="flex items-start gap-3">
          <span className={cn("inline-flex items-center gap-1 text-[10px] uppercase tracking-widest px-2 py-1 rounded-full font-medium shrink-0", status.bg, status.text)}>
            <StatusIcon className="h-3 w-3" /> {status.label}
          </span>
        </div>
        <div className="mt-1.5">
          <p className="text-sm font-medium text-ink-900">{app.test_code} · <span className="text-ink-700 font-normal">{app.patient_name}</span></p>
          <div className="flex items-center gap-2 mt-0.5 text-[11px] text-ink-500 flex-wrap">
            <span>{dateStr}</span>
            {app.status === "en_curso" && app.total_items != null && (
              <>
                <span className="text-ink-300">·</span>
                <span className="tabular text-brand-800 font-medium">{app.answered_items ?? 0}/{app.total_items} respondidas</span>
              </>
            )}
            {app.status === "completado" && (
              isMillon ? (
                <>
                  <span className="text-ink-300">·</span>
                  <span className="px-1.5 py-0.5 rounded text-[10px] bg-brand-50 text-brand-800 font-medium">Ver detalle por escala →</span>
                </>
              ) : (app.score != null && (
                <>
                  <span className="text-ink-300">·</span>
                  <span className="tabular">Score {app.score}</span>
                  {level && (
                    <span className={cn("px-1.5 py-0.5 rounded text-[10px]", level.bg, level.text)}>{app.interpretation}</span>
                  )}
                </>
              ))
            )}
            {app.applied_by === "paciente" && app.status === "completado" && (
              <span className="text-[10px] text-brand-700">· auto-aplicado</span>
            )}
          </div>
          {app.alerts_json?.critical_response && (
            <div className="mt-1.5 inline-flex items-center gap-1 text-[10px] text-risk-critical bg-error-soft px-2 py-0.5 rounded-full">
              <AlertOctagon className="h-3 w-3" /> Respuesta crítica
            </div>
          )}
        </div>
      </button>
    </li>
  );
}

// ─── Modal: detalle del test ──────────────────────────────────────────────
function TestDetailModal({ test, onClose, onApply, onAssign }: { test: PsychTest; onClose: () => void; onApply: () => void; onAssign: () => void }) {
  const ready = !!test.definition?.questions?.length;
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-ink-900/40 backdrop-blur-sm p-0 sm:p-4" onClick={onClose}>
      <div className="w-full sm:max-w-2xl bg-surface rounded-t-2xl sm:rounded-2xl shadow-modal max-h-[92vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <header className="px-5 py-4 border-b border-line-100 flex items-start justify-between">
          <div className="min-w-0">
            <p className="text-[11px] uppercase tracking-widest text-brand-700 font-medium">{test.category}</p>
            <h3 className="font-serif text-xl text-ink-900 mt-0.5">{test.code} — {test.name}</h3>
            <p className="text-xs text-ink-500 mt-1">{test.items} ítems · ~{test.minutes} min · {test.ageRange}</p>
          </div>
          <button onClick={onClose} className="h-9 w-9 rounded-md border border-line-200 flex items-center justify-center text-ink-500 hover:border-brand-400">
            <X className="h-4 w-4" />
          </button>
        </header>
        <div className="p-5 space-y-4">
          <p className="text-sm text-ink-700">{test.description}</p>
          {test.scoring && test.scoring.length > 0 && (
            <div>
              <p className="text-[11px] uppercase tracking-widest text-ink-500 mb-2 font-medium">Niveles de severidad</p>
              <div className="space-y-1.5">
                {test.scoring.map((r, i) => {
                  const style = LEVEL_STYLE[r.level] ?? LEVEL_STYLE.none;
                  return (
                    <div key={i} className={cn("flex items-center justify-between px-3 py-2 rounded-md", style.bg)}>
                      <span className={cn("text-sm font-medium", style.text)}>{r.label}</span>
                      <span className="text-xs text-ink-500 tabular">{r.min}–{r.max}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
        <footer className="px-5 py-4 border-t border-line-100 flex flex-wrap justify-end gap-2">
          {ready ? (
            <>
              <button onClick={onAssign} className="h-10 px-4 rounded-lg border border-line-200 text-sm text-ink-700 hover:border-brand-400 inline-flex items-center gap-2">
                <UserPlus className="h-4 w-4" /> Asignar al paciente
              </button>
              <button onClick={onApply} className="h-10 px-4 rounded-lg bg-brand-700 text-white text-sm font-medium hover:bg-brand-800 inline-flex items-center gap-2">
                <Send className="h-4 w-4" /> Aplicar ahora
              </button>
            </>
          ) : (
            <p className="text-xs text-ink-500">Este test aún no tiene definición interactiva.</p>
          )}
        </footer>
      </div>
    </div>
  );
}

// ─── Modal: aplicar test (en sesión) ──────────────────────────────────────
function ApplyTestModal({ test, patients, presetPatientId, onClose }: { test: PsychTest; patients: ApiPatient[]; presetPatientId?: string; onClose: () => void }) {
  const qc = useQueryClient();
  const [patientId, setPatientId] = useState(presetPatientId ?? "");
  const [step, setStep] = useState<"pick" | "run" | "result">("pick");
  const [result, setResult] = useState<TestApplication | null>(null);

  const submitMu = useMutation({
    mutationFn: async (answers: Record<string, number>) => {
      const p = patients.find((x) => x.id === patientId);
      const created = await api.createTestApplication({
        test_id: test.id,
        patient_id: patientId || undefined,
        patient_name: p?.name,
        answers,
        applied_by: "profesional",
      });
      return created;
    },
    onSuccess: (app) => {
      qc.invalidateQueries({ queryKey: ["test-applications"] });
      setResult(app);
      setStep("result");
      toast.success("Test aplicado y guardado");
    },
    onError: (e: Error) => toast.error(e.message ?? "Error al guardar"),
  });

  if (step === "pick") {
    return (
      <Modal onClose={onClose} title={`Aplicar ${test.code}`}>
        <div className="p-5 space-y-4">
          <p className="text-sm text-ink-500">Selecciona el paciente al que vas a aplicar el test en esta sesión.</p>
          <select
            value={patientId}
            onChange={(e) => setPatientId(e.target.value)}
            autoFocus
            className="w-full h-11 px-3 rounded-md border border-line-200 bg-bg text-sm text-ink-900 focus:outline-none focus:border-brand-400"
          >
            <option value="">— Selecciona paciente —</option>
            {patients.map((p) => <option key={p.id} value={p.id}>{p.preferredName ?? p.name} ({p.id})</option>)}
          </select>
          <button
            onClick={() => setStep("run")}
            disabled={!patientId}
            className="w-full h-11 rounded-lg bg-brand-700 text-white text-sm font-medium hover:bg-brand-800 disabled:opacity-50 inline-flex items-center justify-center gap-2"
          >
            Comenzar test <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </Modal>
    );
  }

  if (step === "run" && test.definition) {
    return (
      <Modal onClose={onClose} title={`${test.code} · ${patients.find((p) => p.id === patientId)?.name ?? ""}`} wide>
        <div className="p-5">
          <TestRunner
            definition={{ ...test.definition, code: test.code, name: test.name }}
            variant="staff"
            onSubmit={async (answers) => { await submitMu.mutateAsync(answers); }}
            submitting={submitMu.isPending}
            onCancel={onClose}
          />
        </div>
      </Modal>
    );
  }

  if (step === "result" && result) {
    const lvl = result.level && LEVEL_STYLE[result.level];
    const isMillon = result.alerts_json?.meta?.type === "millon";
    return (
      <Modal onClose={onClose} title="Resultado" wide={isMillon}>
        {isMillon ? (
          <MillonResultView result={result} onClose={onClose} />
        ) : (
          <div className="p-6 text-center">
            <div className="h-16 w-16 mx-auto rounded-full bg-sage-200/40 flex items-center justify-center mb-4">
              <CheckCircle2 className="h-7 w-7 text-sage-700" />
            </div>
            <p className="text-[11px] uppercase tracking-widest text-ink-500 font-medium">{result.test_code}</p>
            <h3 className="font-serif text-3xl text-ink-900 mt-1">Score {result.score}</h3>
            {lvl && (
              <span className={cn("inline-block mt-3 text-sm font-medium px-3 py-1 rounded-full", lvl.bg, lvl.text)}>
                {result.interpretation}
              </span>
            )}
            {result.alerts_json?.critical_response && (
              <div className="mt-4 rounded-lg border border-rose-300/50 bg-rose-500/5 p-3 text-sm text-rose-700 inline-flex items-start gap-2 text-left">
                <AlertOctagon className="h-4 w-4 shrink-0 mt-0.5" />
                <span>El paciente marcó una respuesta clínicamente significativa. Activa el protocolo de evaluación de riesgo.</span>
              </div>
            )}
            <button onClick={onClose} className="mt-6 h-10 px-5 rounded-md bg-brand-700 text-white text-sm font-medium hover:bg-brand-800">
              Cerrar
            </button>
          </div>
        )}
      </Modal>
    );
  }

  return null;
}

// ─── Modal: asignar al paciente ───────────────────────────────────────────
function AssignTestModal({ test, patients, onClose }: { test: PsychTest; patients: ApiPatient[]; onClose: () => void }) {
  const qc = useQueryClient();
  const [patientId, setPatientId] = useState("");

  const assignMu = useMutation({
    mutationFn: () => api.assignTestToPatient({ test_id: test.id, patient_id: patientId }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["test-applications"] });
      toast.success(`${test.code} asignado al paciente. Aparecerá en su portal.`);
      onClose();
    },
    onError: (e: Error) => toast.error(e.message ?? "Error al asignar"),
  });

  return (
    <Modal onClose={onClose} title={`Asignar ${test.code} al paciente`}>
      <div className="p-5 space-y-4">
        <p className="text-sm text-ink-500">El paciente verá este test en su portal y podrá contestarlo cuando le sea cómodo. Recibirás los resultados al instante con alerta si hay respuestas críticas.</p>
        <select
          value={patientId}
          onChange={(e) => setPatientId(e.target.value)}
          autoFocus
          className="w-full h-11 px-3 rounded-md border border-line-200 bg-bg text-sm text-ink-900 focus:outline-none focus:border-brand-400"
        >
          <option value="">— Selecciona paciente —</option>
          {patients.map((p) => <option key={p.id} value={p.id}>{p.preferredName ?? p.name} ({p.id})</option>)}
        </select>
        <p className="text-xs text-ink-500">⚠️ El paciente debe tener cuenta activa en el portal para acceder al test. Invítalo desde su ficha si aún no la tiene.</p>
        <button
          onClick={() => assignMu.mutate()}
          disabled={!patientId || assignMu.isPending}
          className="w-full h-11 rounded-lg bg-brand-700 text-white text-sm font-medium hover:bg-brand-800 disabled:opacity-50 inline-flex items-center justify-center gap-2"
        >
          {assignMu.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
          Asignar para autoaplicación
        </button>
      </div>
    </Modal>
  );
}

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

