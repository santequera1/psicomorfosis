import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, AlertCircle, ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export interface ScaleOption {
  value: number;
  label: string;
}

export interface TestQuestion {
  id: string;
  text: string;
  reverse?: boolean;
  scale?: ScaleOption[]; // scale específica de la pregunta (AUDIT)
}

export interface TestDefinition {
  code: string;
  name?: string;
  short_name?: string;
  shortName?: string;
  description?: string;
  instructions?: string;
  scale?: ScaleOption[] | null;
  questions: TestQuestion[];
  alerts?: { critical_question_id?: string; critical_threshold?: number } | null;
}

interface Props {
  definition: TestDefinition;
  /** Cuando se completa, recibe { answers }. El backend calcula score. */
  onSubmit: (answers: Record<string, number>) => Promise<void> | void;
  /** Variante 'patient' = más cálida y un ítem por pantalla. 'staff' = todo en una página. */
  variant?: "patient" | "staff";
  initialAnswers?: Record<string, number>;
  submitting?: boolean;
  onCancel?: () => void;
}

/**
 * Aplicador de tests psicométricos. Recibe la definición (preguntas + escala)
 * y devuelve el conjunto de respuestas. La validación y el cálculo del score
 * lo hace el backend para evitar inconsistencias.
 *
 * variant:
 *  - "patient": una pregunta a la vez con barra de progreso. Más amable
 *    para móvil. Empieza con instrucciones; termina con confirmación visual.
 *  - "staff": todas las preguntas en una página. Más rápido para aplicar
 *    en sesión.
 */
export function TestRunner({ definition, onSubmit, variant = "patient", initialAnswers, submitting, onCancel }: Props) {
  const [answers, setAnswers] = useState<Record<string, number>>(initialAnswers ?? {});
  const [currentIdx, setCurrentIdx] = useState<number>(initialAnswers ? definition.questions.length : -1);
  // -1 = pantalla de instrucciones, 0..N-1 = preguntas, N = confirmación

  const total = definition.questions.length;
  const answered = useMemo(() => definition.questions.filter((q) => answers[q.id] != null).length, [answers, definition.questions]);
  const progress = total > 0 ? (answered / total) * 100 : 0;

  function setAnswer(qId: string, v: number) {
    setAnswers((prev) => ({ ...prev, [qId]: v }));
  }

  async function handleSubmit() {
    await onSubmit(answers);
  }

  if (variant === "staff") {
    return (
      <StaffLayout
        definition={definition}
        answers={answers}
        setAnswer={setAnswer}
        answered={answered}
        total={total}
        onSubmit={handleSubmit}
        onCancel={onCancel}
        submitting={submitting}
      />
    );
  }

  // ─── Variante PATIENT ─────────────────────────────────────────────────────
  return (
    <div className="max-w-xl mx-auto">
      {/* Barra de progreso */}
      {currentIdx >= 0 && currentIdx < total && (
        <div className="mb-6">
          <div className="flex items-center justify-between text-xs text-ink-500 mb-2">
            <span>Pregunta {currentIdx + 1} de {total}</span>
            <span className="tabular">{Math.round(progress)}%</span>
          </div>
          <div className="h-1.5 rounded-full bg-bg-100 overflow-hidden">
            <div className="h-full rounded-full bg-brand-700 transition-all duration-300" style={{ width: `${progress}%` }} />
          </div>
        </div>
      )}

      {currentIdx === -1 && (
        <div className="text-center py-6 sm:py-10">
          <div className="h-14 w-14 mx-auto rounded-full bg-brand-50 flex items-center justify-center mb-4 border-2 border-brand-100">
            <span className="font-serif text-lg text-brand-700">{definition.code}</span>
          </div>
          <h1 className="font-serif text-2xl sm:text-3xl text-ink-900 leading-tight">
            {definition.name ?? definition.code}
          </h1>
          {definition.description && (
            <p className="text-sm text-ink-500 mt-2 max-w-md mx-auto leading-relaxed">{definition.description}</p>
          )}
          {definition.instructions && (
            <div className="mt-6 rounded-xl border border-line-200 bg-surface p-5 text-left">
              <p className="text-[11px] uppercase tracking-widest text-brand-700 font-semibold mb-2">Instrucciones</p>
              <p className="text-sm text-ink-700 leading-relaxed">{definition.instructions}</p>
            </div>
          )}
          <p className="text-xs text-ink-500 mt-4">
            Tendrás {total} {total === 1 ? "pregunta" : "preguntas"}. No hay respuestas correctas o incorrectas — sé honesto(a).
          </p>
          <button
            onClick={() => setCurrentIdx(0)}
            className="mt-6 h-11 px-6 rounded-lg bg-brand-700 text-white text-sm font-medium hover:bg-brand-800 inline-flex items-center gap-2"
          >
            Comenzar test <ChevronRight className="h-4 w-4" />
          </button>
          {onCancel && (
            <button onClick={onCancel} className="block mx-auto mt-3 text-xs text-ink-500 hover:text-ink-700">
              Volver
            </button>
          )}
        </div>
      )}

      {currentIdx >= 0 && currentIdx < total && (() => {
        const q = definition.questions[currentIdx];
        const scale = q.scale ?? definition.scale ?? [];
        const value = answers[q.id];
        return (
          <div className="bg-surface rounded-2xl border border-line-200 shadow-soft p-6 sm:p-8">
            <p className="text-[11px] uppercase tracking-widest text-brand-700 font-semibold">Pregunta {currentIdx + 1}</p>
            <h2 className="font-serif text-xl sm:text-2xl text-ink-900 mt-2 leading-relaxed">{q.text}</h2>

            <div className="mt-6 space-y-2">
              {scale.map((opt, i) => {
                const isSelected = value === opt.value;
                return (
                  <button
                    key={`${q.id}-${i}-${opt.value}`}
                    type="button"
                    onClick={() => {
                      setAnswer(q.id, opt.value);
                      // Avanzar automáticamente tras seleccionar
                      setTimeout(() => {
                        if (currentIdx < total - 1) setCurrentIdx(currentIdx + 1);
                        else setCurrentIdx(total);
                      }, 200);
                    }}
                    className={cn(
                      "w-full text-left p-4 rounded-lg border-2 transition-all",
                      isSelected
                        ? "border-brand-700 bg-brand-50"
                        : "border-line-200 hover:border-brand-400 hover:bg-bg-100/50"
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <div className={cn(
                        "h-5 w-5 rounded-full border-2 flex items-center justify-center shrink-0",
                        isSelected ? "border-brand-700 bg-brand-700" : "border-line-200"
                      )}>
                        {isSelected && <CheckCircle2 className="h-3.5 w-3.5 text-white" />}
                      </div>
                      <span className="text-sm sm:text-base text-ink-900">{opt.label}</span>
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="mt-6 flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => currentIdx === 0 ? setCurrentIdx(-1) : setCurrentIdx(currentIdx - 1)}
                className="h-10 px-3 rounded-md text-ink-700 hover:bg-bg-100 text-sm inline-flex items-center gap-1.5"
              >
                <ChevronLeft className="h-4 w-4" /> Atrás
              </button>
              <span className="text-xs text-ink-400">{answered}/{total} respondidas</span>
              <button
                type="button"
                onClick={() => {
                  if (value == null) return;
                  if (currentIdx < total - 1) setCurrentIdx(currentIdx + 1);
                  else setCurrentIdx(total);
                }}
                disabled={value == null}
                className="h-10 px-3 rounded-md text-brand-700 hover:bg-brand-50 disabled:text-ink-400 disabled:hover:bg-transparent text-sm inline-flex items-center gap-1.5 disabled:cursor-not-allowed"
              >
                {currentIdx === total - 1 ? "Revisar" : "Siguiente"} <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        );
      })()}

      {currentIdx === total && (
        <div className="bg-surface rounded-2xl border border-line-200 shadow-soft p-6 sm:p-8 text-center">
          <div className="h-14 w-14 mx-auto rounded-full bg-sage-200/40 flex items-center justify-center mb-4">
            <CheckCircle2 className="h-7 w-7 text-sage-700" />
          </div>
          <h2 className="font-serif text-2xl text-ink-900">¿Listo para enviar?</h2>
          <p className="text-sm text-ink-500 mt-2">
            Respondiste las {total} preguntas. Tu psicóloga revisará el resultado en su próxima sesión contigo.
          </p>
          {answered < total && (
            <div className="mt-4 rounded-lg border border-amber-300/50 bg-amber-50 p-3 text-xs text-amber-800 inline-flex items-center gap-2">
              <AlertCircle className="h-4 w-4" />
              Faltan {total - answered} preguntas — vuelve atrás para completarlas.
            </div>
          )}
          <div className="mt-6 flex items-center justify-center gap-3">
            <button
              onClick={() => setCurrentIdx(0)}
              className="h-11 px-4 rounded-lg border border-line-200 text-sm text-ink-700 hover:border-brand-400"
            >
              Revisar respuestas
            </button>
            <button
              onClick={handleSubmit}
              disabled={submitting || answered < total}
              className="h-11 px-6 rounded-lg bg-brand-700 text-white text-sm font-medium hover:bg-brand-800 disabled:opacity-50 inline-flex items-center gap-2"
            >
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
              Enviar respuestas
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Variante STAFF: todas en una página ──────────────────────────────────
function StaffLayout({ definition, answers, setAnswer, answered, total, onSubmit, onCancel, submitting }: {
  definition: TestDefinition;
  answers: Record<string, number>;
  setAnswer: (id: string, v: number) => void;
  answered: number;
  total: number;
  onSubmit: () => void;
  onCancel?: () => void;
  submitting?: boolean;
}) {
  return (
    <div className="max-w-3xl mx-auto">
      <header className="mb-6">
        <p className="text-[11px] uppercase tracking-widest text-brand-700 font-semibold">{definition.code}</p>
        <h2 className="font-serif text-2xl text-ink-900">{definition.name ?? definition.code}</h2>
        {definition.instructions && (
          <p className="text-sm text-ink-500 mt-2 leading-relaxed">{definition.instructions}</p>
        )}
        <div className="mt-4 flex items-center gap-3">
          <div className="flex-1 h-1.5 rounded-full bg-bg-100 overflow-hidden">
            <div className="h-full rounded-full bg-brand-700" style={{ width: `${(answered / total) * 100}%` }} />
          </div>
          <span className="text-xs text-ink-500 tabular shrink-0">{answered}/{total}</span>
        </div>
      </header>

      <ol className="space-y-3">
        {definition.questions.map((q, i) => {
          const scale = q.scale ?? definition.scale ?? [];
          const value = answers[q.id];
          return (
            <li key={q.id} className="rounded-xl border border-line-200 bg-surface p-4 sm:p-5">
              <div className="flex items-start gap-3 mb-3">
                <span className="font-serif text-xl text-brand-700 leading-none mt-1 tabular w-8 shrink-0">{i + 1}.</span>
                <p className="text-sm sm:text-base text-ink-900 leading-relaxed flex-1">{q.text}</p>
              </div>
              <div className="grid gap-1.5 ml-11">
                {scale.map((opt, j) => {
                  const isSelected = value === opt.value;
                  return (
                    <label
                      key={`${q.id}-${j}-${opt.value}`}
                      className={cn(
                        "flex items-center gap-2.5 px-3 py-2 rounded-md border cursor-pointer transition-colors",
                        isSelected
                          ? "border-brand-700 bg-brand-50"
                          : "border-line-100 hover:border-brand-400"
                      )}
                    >
                      <input
                        type="radio"
                        name={q.id}
                        checked={isSelected}
                        onChange={() => setAnswer(q.id, opt.value)}
                        className="sr-only"
                      />
                      <div className={cn(
                        "h-4 w-4 rounded-full border-2 shrink-0",
                        isSelected ? "border-brand-700 bg-brand-700" : "border-line-200"
                      )}>
                        {isSelected && <span className="block h-1.5 w-1.5 rounded-full bg-white m-0.5" />}
                      </div>
                      <span className="text-sm text-ink-900">{opt.label}</span>
                    </label>
                  );
                })}
              </div>
            </li>
          );
        })}
      </ol>

      <footer className="mt-6 sticky bottom-0 bg-bg/95 backdrop-blur py-4 -mx-4 px-4 border-t border-line-100 flex items-center justify-between gap-3">
        {onCancel && (
          <button onClick={onCancel} className="h-10 px-3 text-sm text-ink-700 hover:text-ink-900">
            Cancelar
          </button>
        )}
        <span className="text-xs text-ink-500 tabular ml-auto">{answered}/{total} respondidas</span>
        <button
          onClick={onSubmit}
          disabled={submitting || answered < total}
          className="h-10 px-5 rounded-md bg-brand-700 text-white text-sm font-medium hover:bg-brand-800 disabled:opacity-50 inline-flex items-center gap-2"
        >
          {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
          {submitting ? "Guardando…" : "Calcular y guardar"}
        </button>
      </footer>
    </div>
  );
}
