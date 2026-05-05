import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Brain, CheckCircle2, Clock, Loader2, ChevronLeft, AlertCircle } from "lucide-react";
import { PortalShell } from "@/components/portal/PortalShell";
import { TestRunner } from "@/components/tests/TestRunner";
import { api, type TestApplication, type PsychTestDefinition } from "@/lib/api";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/p_/tests")({
  head: () => ({ meta: [{ title: "Mis tests · Mi portal" }] }),
  component: PortalTestsPage,
});

type AppWithDef = TestApplication & { definition: PsychTestDefinition | null };

function PortalTestsPage() {
  const qc = useQueryClient();
  const [active, setActive] = useState<AppWithDef | null>(null);
  const [result, setResult] = useState<{ score: number; level: string; label: string; has_critical_response: boolean; testCode: string } | null>(null);

  const { data: tests = [], isLoading } = useQuery({
    queryKey: ["portal-tests"],
    queryFn: () => api.portalTests(),
  });

  const submitMu = useMutation({
    mutationFn: (params: { id: string; answers: Record<string, number> }) =>
      api.portalSubmitTest(params.id, params.answers),
    onSuccess: (res, params) => {
      qc.invalidateQueries({ queryKey: ["portal-tests"] });
      const test = tests.find((t) => t.id === params.id);
      setResult({ ...res, testCode: test?.test_code ?? "" });
      setActive(null);
    },
    onError: (e: Error) => toast.error(e.message ?? "Error al enviar"),
  });

  // Tests pendientes (sin empezar) y en curso (con respuestas parciales) van
  // ambos en "Por completar". Solo cambia el botón: "Comenzar" vs "Continuar".
  const todo = tests.filter((t) => t.status === "pendiente" || t.status === "en_curso");
  const completed = tests.filter((t) => t.status === "completado");

  // Vista del aplicador
  if (active && active.definition) {
    return (
      <div className="min-h-screen bg-bg">
        <header className="sticky top-0 bg-surface border-b border-line-100 z-30">
          <div className="max-w-3xl mx-auto px-4 sm:px-6 h-14 flex items-center gap-3">
            <button
              onClick={() => { if (confirm("¿Salir del test? Perderás las respuestas que no hayas enviado.")) setActive(null); }}
              className="h-9 w-9 rounded-md hover:bg-bg-100 inline-flex items-center justify-center text-ink-500"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <div className="min-w-0">
              <p className="text-[11px] uppercase tracking-widest text-brand-700 font-semibold">Test psicométrico</p>
              <h1 className="font-serif text-base text-ink-900 leading-tight truncate">{active.test_name}</h1>
            </div>
          </div>
        </header>
        <main className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
          <TestRunner
            definition={{ ...active.definition, code: active.test_code, name: active.test_name }}
            variant="patient"
            initialAnswers={active.answers_json ?? undefined}
            onSubmit={async (answers) => { await submitMu.mutateAsync({ id: active.id, answers }); }}
            onSaveProgress={async (answers) => {
              await api.portalSaveTestProgress(active.id, answers);
              qc.invalidateQueries({ queryKey: ["portal-tests"] });
            }}
            submitting={submitMu.isPending}
            onCancel={() => setActive(null)}
          />
        </main>
      </div>
    );
  }

  // Vista de resultado
  if (result) {
    return (
      <PortalShell>
        <div className="max-w-md mx-auto text-center py-10">
          <div className="h-20 w-20 mx-auto rounded-full bg-sage-200/40 flex items-center justify-center mb-5">
            <CheckCircle2 className="h-10 w-10 text-sage-700" />
          </div>
          <h1 className="font-serif text-3xl text-ink-900">¡Listo!</h1>
          <p className="text-base text-ink-500 mt-2">
            Has completado {result.testCode}. Tu psicóloga revisará tu resultado.
          </p>

          {result.has_critical_response && (
            <div className="mt-6 rounded-xl border border-rose-300/50 bg-rose-500/5 p-5 text-left">
              <div className="flex items-start gap-3">
                <AlertCircle className="h-5 w-5 text-rose-700 shrink-0 mt-0.5" />
                <div>
                  <h3 className="font-medium text-rose-700">Si te sientes en riesgo, busca ayuda ahora</h3>
                  <p className="text-sm text-ink-700 mt-1 leading-relaxed">
                    Notamos que marcaste pensamientos importantes. Tu psicóloga ya fue notificada.
                    Si estás pasando por una crisis, no esperes:
                  </p>
                  <ul className="mt-2 space-y-1 text-sm text-ink-900">
                    <li>📞 <strong>Línea 106 Bogotá</strong> (24/7)</li>
                    <li>📞 <strong>123 Emergencias</strong></li>
                    <li>📞 <strong>192 MinSalud</strong></li>
                  </ul>
                </div>
              </div>
            </div>
          )}

          <button
            onClick={() => setResult(null)}
            className="mt-6 h-11 px-6 rounded-lg bg-brand-700 text-white text-sm font-medium hover:bg-brand-800"
          >
            Volver a mis tests
          </button>
        </div>
      </PortalShell>
    );
  }

  return (
    <PortalShell>
      <header className="mb-8">
        <p className="text-xs uppercase tracking-widest text-brand-700 font-semibold">Evaluaciones</p>
        <h1 className="font-serif text-3xl text-ink-900 mt-1">Mis tests</h1>
        <p className="text-sm text-ink-500 mt-2 max-w-xl">
          Tu psicóloga te ha asignado estos tests para conocerte mejor. Tómate tu tiempo, sé honesto(a) — esto es para ti.
        </p>
      </header>

      {isLoading && <Loader2 className="h-5 w-5 mx-auto animate-spin text-ink-400" />}

      {!isLoading && tests.length === 0 && (
        <div className="rounded-2xl border border-dashed border-line-200 bg-surface p-12 text-center">
          <Brain className="h-8 w-8 mx-auto text-ink-300 mb-3" />
          <p className="text-sm text-ink-500">Aún no tienes tests asignados.</p>
          <p className="text-xs text-ink-400 mt-1">Tu psicóloga te avisará cuando tengas alguno.</p>
        </div>
      )}

      {todo.length > 0 && (
        <section className="mb-8">
          <h2 className="font-serif text-lg text-ink-900 mb-3">Por completar ({todo.length})</h2>
          <ul className="space-y-3">
            {todo.map((t) => {
              const totalItems = t.total_items ?? t.definition?.questions.length ?? 0;
              const answered = t.answered_items ?? 0;
              const inProgress = t.status === "en_curso" && answered > 0;
              const pct = totalItems > 0 ? Math.round((answered / totalItems) * 100) : 0;
              return (
                <li key={t.id} className="rounded-xl border border-line-200 bg-surface p-5 hover:shadow-soft transition-shadow">
                  <div className="flex items-start gap-4">
                    <div className="h-12 w-12 rounded-lg bg-brand-50 text-brand-700 flex items-center justify-center shrink-0">
                      <Brain className="h-5 w-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-[11px] uppercase tracking-widest text-brand-700 font-semibold">{t.test_code}</p>
                        {inProgress && (
                          <span className="text-[10px] uppercase tracking-widest px-2 py-0.5 rounded-full bg-warning-soft text-risk-moderate font-medium">
                            En progreso
                          </span>
                        )}
                      </div>
                      <h3 className="font-medium text-ink-900 mt-0.5">{t.test_name}</h3>
                      {t.definition && !inProgress && (
                        <p className="text-xs text-ink-500 mt-1">
                          {totalItems} preguntas · ~{Math.max(3, Math.round(totalItems * 0.5))} min
                        </p>
                      )}
                      {inProgress && (
                        <div className="mt-2">
                          <div className="flex items-center justify-between text-[11px] text-ink-500 mb-1">
                            <span>{answered} de {totalItems} respondidas</span>
                            <span className="tabular">{pct}%</span>
                          </div>
                          <div className="h-1.5 rounded-full bg-bg-100 overflow-hidden">
                            <div className="h-full rounded-full bg-brand-700 transition-all" style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                      )}
                      <p className="text-[11px] text-ink-500 mt-1">
                        <Clock className="inline h-3 w-3 mr-1" />
                        Asignado {t.assigned_at ? new Date(t.assigned_at).toLocaleDateString("es-CO", { day: "numeric", month: "long" }) : "recientemente"}
                      </p>
                    </div>
                    {t.definition ? (
                      <button
                        onClick={() => setActive(t)}
                        className="h-10 px-4 rounded-md bg-brand-700 text-white text-sm font-medium hover:bg-brand-800 shrink-0"
                      >
                        {inProgress ? "Continuar" : "Comenzar"}
                      </button>
                    ) : (
                      <span className="text-xs text-ink-500 shrink-0">No disponible</span>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {completed.length > 0 && (
        <section>
          <h2 className="font-serif text-lg text-ink-900 mb-3">Completados ({completed.length})</h2>
          <ul className="space-y-2">
            {completed.map((t) => (
              <li key={t.id} className="rounded-xl border border-line-100 bg-bg-100 p-4 flex items-center gap-3">
                <CheckCircle2 className="h-5 w-5 text-sage-700 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-ink-900">{t.test_code} · {t.test_name}</p>
                  <p className="text-xs text-ink-500">
                    Completado {t.completed_at ? new Date(t.completed_at).toLocaleDateString("es-CO", { day: "numeric", month: "long" }) : ""}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="mt-8 rounded-xl border border-line-200 bg-surface p-5">
        <p className="text-xs text-ink-500 leading-relaxed">
          Estos cuestionarios son herramientas de tamizaje, no diagnóstico. Los resultados los discutirás
          con tu psicóloga en sesión. Tus respuestas son confidenciales y solo las verá ella.
        </p>
      </div>
    </PortalShell>
  );
}
