import { useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, AlertCircle, ChevronLeft, ChevronRight, Loader2, Pause } from "lucide-react";
import { cn } from "@/lib/utils";

export interface ScaleOption {
  value: number;
  label: string;
}

export type ActivityQuestionType = "single_choice" | "yes_no" | "numeric" | "text";

export interface TestQuestion {
  id: string;
  text: string;
  reverse?: boolean;
  scale?: ScaleOption[]; // scale específica de la pregunta (AUDIT)
  /** Para tests "Actividad": tipo de widget para esta pregunta. Si está
   *  presente, ignora la escala global y renderiza el widget propio. */
  type?: ActivityQuestionType;
  options?: ScaleOption[];
  numeric_min?: number;
  numeric_max?: number;
  placeholder?: string;
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

/** Las respuestas pueden ser numéricas (Likert/V-F/numeric/single_choice/yes_no)
 *  o texto (text). El backend acepta ambos en el JSON de answers. */
export type AnswerValue = number | string;
export type AnswersMap = Record<string, AnswerValue>;

interface Props {
  definition: TestDefinition;
  /** Cuando se completa, recibe { answers }. El backend calcula score. */
  onSubmit: (answers: AnswersMap) => Promise<void> | void;
  /** Variante 'patient' = más cálida y un ítem por pantalla. 'staff' = todo en una página. */
  variant?: "patient" | "staff";
  initialAnswers?: AnswersMap;
  submitting?: boolean;
  onCancel?: () => void;
  /**
   * Cuando se provee, habilita el modo "pausa": las respuestas se autoguardan
   * con debounce y aparece un botón "Pausar y continuar después" que cierra
   * el runner sin enviar el test al backend para calcular score. Útil para
   * tests largos como MCMI-II (175 ítems).
   */
  onSaveProgress?: (answers: AnswersMap) => Promise<void> | void;
}

/**
 * Considera "respondida" una pregunta si tiene un valor no vacío. Para
 * preguntas de texto cuenta cualquier string no-blanco; para las demás,
 * cualquier valor distinto de null/undefined/"".
 */
function isAnswered(q: TestQuestion, v: AnswerValue | undefined): boolean {
  if (v === undefined || v === null) return false;
  if (typeof v === "string") return v.trim().length > 0;
  return Number.isFinite(v as number);
}

/**
 * Aplicador de tests psicométricos. Recibe la definición (preguntas + escala)
 * y devuelve el conjunto de respuestas. La validación y el cálculo del score
 * lo hace el backend para evitar inconsistencias.
 */
export function TestRunner({ definition, onSubmit, variant = "patient", initialAnswers, submitting, onCancel, onSaveProgress }: Props) {
  const [answers, setAnswers] = useState<AnswersMap>(initialAnswers ?? {});
  const [currentIdx, setCurrentIdx] = useState<number>(() => {
    if (initialAnswers && Object.keys(initialAnswers).length > 0) {
      for (let i = 0; i < definition.questions.length; i++) {
        if (!isAnswered(definition.questions[i], initialAnswers[definition.questions[i].id])) return i;
      }
      return definition.questions.length;
    }
    return -1;
  });

  const total = definition.questions.length;
  const answered = useMemo(
    () => definition.questions.filter((q) => isAnswered(q, answers[q.id])).length,
    [answers, definition.questions],
  );
  const progress = total > 0 ? (answered / total) * 100 : 0;

  // Autosave debounced 2s tras cada cambio.
  const lastSavedRef = useRef<string>("");
  const [savingProgress, setSavingProgress] = useState(false);
  useEffect(() => {
    if (!onSaveProgress) return;
    if (answered === 0) return;
    const snapshot = JSON.stringify(answers);
    if (snapshot === lastSavedRef.current) return;
    const t = setTimeout(async () => {
      setSavingProgress(true);
      try {
        await onSaveProgress(answers);
        lastSavedRef.current = snapshot;
      } finally {
        setSavingProgress(false);
      }
    }, 2000);
    return () => clearTimeout(t);
  }, [answers, answered, onSaveProgress]);

  function setAnswer(qId: string, v: AnswerValue) {
    setAnswers((prev) => ({ ...prev, [qId]: v }));
  }

  async function handleSubmit() {
    await onSubmit(answers);
  }

  async function handlePause() {
    if (!onSaveProgress) return;
    if (answered > 0) {
      setSavingProgress(true);
      try { await onSaveProgress(answers); } finally { setSavingProgress(false); }
    }
    onCancel?.();
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
        onPause={onSaveProgress ? handlePause : undefined}
        savingProgress={savingProgress}
      />
    );
  }

  return (
    <div className="max-w-xl mx-auto">
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
        const value = answers[q.id];
        // Para widgets con auto-advance (radio: choice/yes_no): pasamos un
        // callback que avanza al siguiente ítem ~200ms tras la selección.
        // Para widgets sin auto-advance (text/numeric): el usuario pulsa
        // "Siguiente" manualmente.
        function advance() {
          setTimeout(() => {
            if (currentIdx < total - 1) setCurrentIdx(currentIdx + 1);
            else setCurrentIdx(total);
          }, 200);
        }
        return (
          <div className="bg-surface rounded-2xl border border-line-200 shadow-soft p-6 sm:p-8">
            <p className="text-[11px] uppercase tracking-widest text-brand-700 font-semibold">Pregunta {currentIdx + 1}</p>
            <h2 className="font-serif text-xl sm:text-2xl text-ink-900 mt-2 leading-relaxed">{q.text}</h2>

            <div className="mt-6">
              <PatientWidget
                question={q}
                globalScale={definition.scale ?? []}
                value={value}
                onChange={(v) => setAnswer(q.id, v)}
                onAdvance={advance}
              />
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
                  if (!isAnswered(q, value)) return;
                  if (currentIdx < total - 1) setCurrentIdx(currentIdx + 1);
                  else setCurrentIdx(total);
                }}
                disabled={!isAnswered(q, value)}
                className="h-10 px-3 rounded-md text-brand-700 hover:bg-brand-50 disabled:text-ink-400 disabled:hover:bg-transparent text-sm inline-flex items-center gap-1.5 disabled:cursor-not-allowed"
              >
                {currentIdx === total - 1 ? "Revisar" : "Siguiente"} <ChevronRight className="h-4 w-4" />
              </button>
            </div>
            {onSaveProgress && (
              <div className="mt-4 pt-4 border-t border-line-100 flex items-center justify-between text-xs">
                <span className="text-ink-400 inline-flex items-center gap-1.5">
                  {savingProgress ? (
                    <><Loader2 className="h-3 w-3 animate-spin" /> Guardando progreso…</>
                  ) : (
                    "Tu progreso se guarda automáticamente."
                  )}
                </span>
                <button
                  type="button"
                  onClick={handlePause}
                  className="text-ink-700 hover:text-brand-700 inline-flex items-center gap-1.5 font-medium"
                >
                  <Pause className="h-3 w-3" /> Pausar y continuar después
                </button>
              </div>
            )}
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

// ─── Widgets de respuesta ───────────────────────────────────────────────────

/**
 * Renderiza el input apropiado para una pregunta según su tipo.
 *  - Si q.type está presente (Actividad), usa el widget específico:
 *      single_choice → radio con q.options
 *      yes_no       → radio con dos botones fijos Sí/No
 *      numeric      → input numérico
 *      text         → textarea
 *  - Si NO tiene type (legacy Likert/V-F/MCMI-II): usa scale propia o global.
 */
function PatientWidget({ question, globalScale, value, onChange, onAdvance }: {
  question: TestQuestion;
  globalScale: ScaleOption[];
  value: AnswerValue | undefined;
  onChange: (v: AnswerValue) => void;
  onAdvance: () => void;
}) {
  if (question.type === "text") {
    return (
      <textarea
        value={typeof value === "string" ? value : ""}
        onChange={(e) => onChange(e.target.value)}
        rows={5}
        placeholder={question.placeholder ?? "Escribe tu respuesta…"}
        className="w-full px-4 py-3 rounded-lg border-2 border-line-200 bg-bg text-base text-ink-900 focus:outline-none focus:border-brand-400 resize-none leading-relaxed"
      />
    );
  }
  if (question.type === "numeric") {
    const numV = typeof value === "number" ? value : (typeof value === "string" && value !== "" ? Number(value) : "");
    return (
      <div>
        <input
          type="number"
          value={numV === "" || Number.isNaN(numV) ? "" : numV}
          min={question.numeric_min}
          max={question.numeric_max}
          onChange={(e) => {
            if (e.target.value === "") onChange("");
            else onChange(Number(e.target.value));
          }}
          className="w-full h-12 px-4 rounded-lg border-2 border-line-200 bg-bg text-lg text-ink-900 focus:outline-none focus:border-brand-400 tabular"
        />
        {(question.numeric_min != null || question.numeric_max != null) && (
          <p className="text-xs text-ink-500 mt-1.5">
            Rango: {question.numeric_min ?? "—"} a {question.numeric_max ?? "—"}
          </p>
        )}
      </div>
    );
  }
  // Radio-based: yes_no, single_choice, o legacy con scale
  const opts: ScaleOption[] = question.type === "yes_no"
    ? [{ value: 1, label: "Sí" }, { value: 0, label: "No" }]
    : question.type === "single_choice"
      ? (question.options ?? [])
      : (question.scale ?? globalScale ?? []);
  return (
    <div className="space-y-2">
      {opts.map((opt, i) => {
        const isSelected = typeof value === "number" && value === opt.value;
        return (
          <button
            key={`${question.id}-${i}-${opt.value}`}
            type="button"
            onClick={() => { onChange(opt.value); onAdvance(); }}
            className={cn(
              "w-full text-left p-4 rounded-lg border-2 transition-all",
              isSelected ? "border-brand-700 bg-brand-50" : "border-line-200 hover:border-brand-400 hover:bg-bg-100/50"
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
  );
}

/** Variante staff del widget — más compacta, sin auto-advance. */
function StaffWidget({ question, globalScale, value, onChange }: {
  question: TestQuestion;
  globalScale: ScaleOption[];
  value: AnswerValue | undefined;
  onChange: (v: AnswerValue) => void;
}) {
  if (question.type === "text") {
    return (
      <textarea
        value={typeof value === "string" ? value : ""}
        onChange={(e) => onChange(e.target.value)}
        rows={3}
        placeholder={question.placeholder ?? "Respuesta del paciente"}
        className="w-full px-3 py-2 rounded-md border border-line-200 bg-bg text-sm text-ink-900 focus:outline-none focus:border-brand-400 resize-none"
      />
    );
  }
  if (question.type === "numeric") {
    const numV = typeof value === "number" ? value : (typeof value === "string" && value !== "" ? Number(value) : "");
    return (
      <input
        type="number"
        value={numV === "" || Number.isNaN(numV) ? "" : numV}
        min={question.numeric_min}
        max={question.numeric_max}
        onChange={(e) => onChange(e.target.value === "" ? "" : Number(e.target.value))}
        className="h-9 px-3 rounded-md border border-line-200 bg-bg text-sm text-ink-900 tabular focus:outline-none focus:border-brand-400 w-32"
      />
    );
  }
  const opts: ScaleOption[] = question.type === "yes_no"
    ? [{ value: 1, label: "Sí" }, { value: 0, label: "No" }]
    : question.type === "single_choice"
      ? (question.options ?? [])
      : (question.scale ?? globalScale ?? []);
  return (
    <div className="grid gap-1.5">
      {opts.map((opt, j) => {
        const isSelected = typeof value === "number" && value === opt.value;
        return (
          <label
            key={`${question.id}-${j}-${opt.value}`}
            className={cn(
              "flex items-center gap-2.5 px-3 py-2 rounded-md border cursor-pointer transition-colors",
              isSelected ? "border-brand-700 bg-brand-50" : "border-line-100 hover:border-brand-400"
            )}
          >
            <input
              type="radio"
              name={question.id}
              checked={isSelected}
              onChange={() => onChange(opt.value)}
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
  );
}

// ─── Variante STAFF: todas en una página ──────────────────────────────────
function StaffLayout({ definition, answers, setAnswer, answered, total, onSubmit, onCancel, submitting, onPause, savingProgress }: {
  definition: TestDefinition;
  answers: AnswersMap;
  setAnswer: (id: string, v: AnswerValue) => void;
  answered: number;
  total: number;
  onSubmit: () => void;
  onCancel?: () => void;
  submitting?: boolean;
  onPause?: () => void;
  savingProgress?: boolean;
}) {
  const globalScale = definition.scale ?? [];
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
        {definition.questions.map((q, i) => (
          <li key={q.id} className="rounded-xl border border-line-200 bg-surface p-4 sm:p-5">
            <div className="flex items-start gap-3 mb-3">
              <span className="font-serif text-xl text-brand-700 leading-none mt-1 tabular w-8 shrink-0">{i + 1}.</span>
              <p className="text-sm sm:text-base text-ink-900 leading-relaxed flex-1">{q.text}</p>
            </div>
            <div className="ml-11">
              <StaffWidget
                question={q}
                globalScale={globalScale}
                value={answers[q.id]}
                onChange={(v) => setAnswer(q.id, v)}
              />
            </div>
          </li>
        ))}
      </ol>

      <footer className="mt-6 sticky bottom-0 bg-bg/95 backdrop-blur py-4 -mx-4 px-4 border-t border-line-100 flex items-center justify-between gap-3 flex-wrap">
        {onCancel && (
          <button onClick={onCancel} className="h-10 px-3 text-sm text-ink-700 hover:text-ink-900">
            Cancelar
          </button>
        )}
        {onPause && (
          <button
            onClick={onPause}
            disabled={!!submitting}
            className="h-10 px-3 rounded-md border border-line-200 text-sm text-ink-700 hover:border-brand-400 inline-flex items-center gap-1.5 disabled:opacity-50"
            title="Guarda el progreso y cierra. Podrás retomar después."
          >
            <Pause className="h-3.5 w-3.5" /> Pausar
          </button>
        )}
        <span className="text-xs text-ink-500 tabular ml-auto inline-flex items-center gap-2">
          {savingProgress && <Loader2 className="h-3 w-3 animate-spin" />}
          {answered}/{total} respondidas
        </span>
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
