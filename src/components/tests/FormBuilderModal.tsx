import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  X, Plus, Trash2, ArrowLeft, ArrowRight, GripVertical, Loader2,
  CheckSquare, Sliders, Info, ListChecks, Hash, Type as TypeIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  api,
  type CreateFormBody, type PsychTestRange, type PsychTestQuestion,
  type ActivityQuestionType,
} from "@/lib/api";

/**
 * Builder de tests del consultorio. Tres tipos:
 *   - V/F: 2 opciones fijas (1/0). Score = suma de Verdaderos.
 *   - Likert: 3-7 niveles entre dos extremos. Score = suma.
 *   - Actividad: cada pregunta lleva su propio widget (single_choice,
 *     yes_no, numeric, text). Sin score automático — la interpretación
 *     queda al psicólogo.
 *
 * El TestRunner detecta `question.type` en runtime y renderiza el widget
 * correspondiente. Para Likert/V-F las preguntas no llevan `type` y caen
 * por la rama legacy basada en `definition.scale`.
 */

type ResponseType = "vf" | "likert" | "activity";
type Severity = "none" | "low" | "moderate" | "high" | "critical";
type Step = "meta" | "scale" | "questions" | "ranges" | "review";

const SCORED_TYPES: ResponseType[] = ["vf", "likert"];
function isScored(t: ResponseType) { return SCORED_TYPES.includes(t); }

const SEVERITY_OPTIONS: Array<{ value: Severity; label: string; class: string }> = [
  { value: "none",     label: "Sin riesgo",  class: "bg-success-soft text-success" },
  { value: "low",      label: "Leve",        class: "bg-success-soft text-success" },
  { value: "moderate", label: "Moderado",    class: "bg-warning-soft text-risk-moderate" },
  { value: "high",     label: "Alto",        class: "bg-error-soft text-risk-high" },
  { value: "critical", label: "Crítico",     class: "bg-error-soft text-risk-critical" },
];

const STEPS: Array<{ id: Step; label: string }> = [
  { id: "meta",      label: "Información" },
  { id: "scale",     label: "Tipo de respuesta" },
  { id: "questions", label: "Preguntas" },
  { id: "ranges",    label: "Severidad" },
  { id: "review",    label: "Revisión" },
];

const ACTIVITY_TYPE_LABELS: Record<ActivityQuestionType, string> = {
  single_choice: "Opción múltiple",
  yes_no: "Sí / No",
  numeric: "Escala numérica",
  text: "Texto abierto",
};

interface QuestionDraft {
  id: string;
  text: string;
  reverse: boolean;
  // Sólo para "activity":
  type?: ActivityQuestionType;
  options?: Array<{ value: number; label: string }>;
  numericMin?: number;
  numericMax?: number;
  placeholder?: string;
}
interface RangeDraft { id: string; min: number; max: number; label: string; level: Severity }

export function FormBuilderModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();

  // Step 1: meta
  const [name, setName] = useState("");
  const [shortName, setShortName] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("Tamizaje");
  const [ageRange, setAgeRange] = useState("18+");
  const [minutes, setMinutes] = useState(5);
  const [instructions, setInstructions] = useState("");

  // Step 2: tipo de respuesta
  const [responseType, setResponseType] = useState<ResponseType>("likert");
  const [likertPoints, setLikertPoints] = useState(5);
  const [likertLabels, setLikertLabels] = useState<string[]>([
    "Nunca", "Casi nunca", "A veces", "Casi siempre", "Siempre",
  ]);

  // Step 3: preguntas
  const [questions, setQuestions] = useState<QuestionDraft[]>([
    { id: "q1", text: "", reverse: false, type: "single_choice", options: [{ value: 0, label: "" }, { value: 1, label: "" }] },
  ]);

  // Step 4: rangos (solo aplica a tipos puntuables)
  const [ranges, setRanges] = useState<RangeDraft[]>([]);

  // Cuando el psicólogo cambia entre tipos, ajustamos el shape de las
  // preguntas para no quedar con campos huérfanos. Activity → cada pregunta
  // arranca como single_choice. Scored ← se quitan los campos de activity.
  function switchResponseType(next: ResponseType) {
    setResponseType(next);
    if (next === "activity") {
      setQuestions((prev) => prev.map((q) => ({
        ...q,
        reverse: false,
        type: q.type ?? "single_choice",
        options: q.type === "single_choice" || q.type == null
          ? (q.options && q.options.length >= 2 ? q.options : [{ value: 0, label: "" }, { value: 1, label: "" }])
          : q.options,
      })));
    } else {
      setQuestions((prev) => prev.map((q) => {
        const { type, options, numericMin, numericMax, placeholder, ...rest } = q;
        void type; void options; void numericMin; void numericMax; void placeholder;
        return { ...rest, reverse: rest.reverse ?? false };
      }));
    }
  }

  const [step, setStep] = useState<Step>("meta");
  const visibleSteps = useMemo<Array<{ id: Step; label: string }>>(
    () => isScored(responseType) ? STEPS : STEPS.filter((s) => s.id !== "ranges"),
    [responseType],
  );
  const stepIdx = visibleSteps.findIndex((s) => s.id === step);

  // Escala efectiva: sólo aplica a tipos puntuables. Activity la deja vacía
  // porque cada pregunta tiene sus propias opciones.
  const scale = useMemo(() => {
    if (responseType === "vf") {
      return [
        { value: 1, label: "Verdadero" },
        { value: 0, label: "Falso" },
      ];
    }
    if (responseType === "likert") {
      return likertLabels.slice(0, likertPoints).map((label, i) => ({
        value: i,
        label: label.trim() || `Opción ${i + 1}`,
      }));
    }
    return [];
  }, [responseType, likertPoints, likertLabels]);

  const maxScore = useMemo(() => {
    if (!isScored(responseType)) return 0;
    const high = scale.reduce((m, o) => Math.max(m, o.value), 0);
    return high * questions.length;
  }, [scale, questions.length, responseType]);

  function ensureRanges() {
    if (ranges.length > 0) return;
    const third = Math.floor(maxScore / 3);
    const twoThird = Math.floor((maxScore * 2) / 3);
    setRanges([
      { id: "r1", min: 0,        max: Math.max(0, third - 1),       label: "Bajo",     level: "low" },
      { id: "r2", min: third,    max: Math.max(third, twoThird - 1), label: "Moderado", level: "moderate" },
      { id: "r3", min: twoThird, max: maxScore,                     label: "Alto",     level: "high" },
    ]);
  }

  function nextStep() {
    if (step === "questions" && isScored(responseType)) ensureRanges();
    const next = visibleSteps[stepIdx + 1];
    if (next) setStep(next.id);
  }
  function prevStep() {
    const prev = visibleSteps[stepIdx - 1];
    if (prev) setStep(prev.id);
  }

  function validateMeta(): string | null {
    if (!name.trim()) return "El nombre es obligatorio";
    return null;
  }
  function validateScale(): string | null {
    if (responseType === "likert") {
      if (likertPoints < 3 || likertPoints > 7) return "Likert debe tener entre 3 y 7 puntos";
      const labels = likertLabels.slice(0, likertPoints);
      if (labels.some((l) => !l.trim())) return "Todas las opciones de Likert necesitan etiqueta";
    }
    return null;
  }
  function validateQuestions(): string | null {
    if (questions.length === 0) return "Agrega al menos una pregunta";
    for (const q of questions) {
      if (!q.text.trim()) return "Hay preguntas sin texto";
      if (responseType === "activity") {
        if (!q.type) return `Pregunta "${q.text}": elige un tipo de respuesta`;
        if (q.type === "single_choice") {
          const opts = q.options ?? [];
          if (opts.length < 2) return `Pregunta "${q.text}": opción múltiple necesita al menos 2 opciones`;
          if (opts.some((o) => !o.label.trim())) return `Pregunta "${q.text}": hay opciones sin etiqueta`;
        }
        if (q.type === "numeric") {
          if (q.numericMin != null && q.numericMax != null && q.numericMin > q.numericMax) {
            return `Pregunta "${q.text}": el mínimo no puede ser mayor que el máximo`;
          }
        }
      }
    }
    return null;
  }
  function validateRanges(): string | null {
    if (ranges.length === 0) return "Define al menos un rango";
    const sorted = [...ranges].sort((a, b) => a.min - b.min);
    for (const r of sorted) {
      if (!r.label.trim()) return "Hay rangos sin etiqueta";
      if (r.min > r.max) return `Rango "${r.label || "?"}": el mínimo no puede ser mayor que el máximo`;
      if (r.min < 0 || r.max > maxScore) return `Rangos fuera del puntaje posible (0-${maxScore})`;
    }
    return null;
  }

  function tryNext() {
    let err: string | null = null;
    if (step === "meta") err = validateMeta();
    else if (step === "scale") err = validateScale();
    else if (step === "questions") err = validateQuestions();
    else if (step === "ranges" && isScored(responseType)) err = validateRanges();
    if (err) { toast.error(err); return; }
    nextStep();
  }

  const createMu = useMutation({
    mutationFn: (body: CreateFormBody) => api.createTestForm(body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["test-catalog"] });
      toast.success("Test creado");
      onClose();
    },
    onError: (e: Error) => toast.error(e.message ?? "Error al crear el test"),
  });

  function handleSave() {
    const err = validateMeta() ?? validateScale() ?? validateQuestions()
      ?? (isScored(responseType) ? validateRanges() : null);
    if (err) { toast.error(err); return; }
    const isActivity = responseType === "activity";
    const scored = isScored(responseType);

    const builtQuestions: PsychTestQuestion[] = questions.map((q, i) => {
      const baseId = q.id || `q${i + 1}`;
      const text = q.text.trim();
      if (isActivity) {
        const out: PsychTestQuestion = { id: baseId, text, type: q.type! };
        if (q.type === "single_choice") {
          out.options = (q.options ?? []).map((o, j) => ({
            value: j, // siempre 0..N-1, ignoramos el value editado
            label: o.label.trim(),
          }));
        }
        if (q.type === "numeric") {
          if (q.numericMin != null) out.numeric_min = q.numericMin;
          if (q.numericMax != null) out.numeric_max = q.numericMax;
        }
        if (q.type === "text" && q.placeholder) out.placeholder = q.placeholder.trim();
        return out;
      }
      return {
        id: baseId,
        text,
        ...(scored && q.reverse ? { reverse: true } : {}),
      };
    });

    const body: CreateFormBody = {
      name: name.trim(),
      short_name: shortName.trim() || undefined,
      description: description.trim() || undefined,
      category: category.trim() || undefined,
      age_range: ageRange.trim() || undefined,
      minutes,
      definition: {
        instructions: instructions.trim() || undefined,
        scale,
        questions: builtQuestions,
        scoring: scored
          ? { type: questions.some((q) => q.reverse) ? "sum_reversed" : "sum" }
          : { type: "activity" as const },
        ranges: scored
          ? ranges
              .sort((a, b) => a.min - b.min)
              .map<PsychTestRange>((r) => ({ min: r.min, max: r.max, label: r.label.trim(), level: r.level }))
          : [],
      },
    };
    createMu.mutate(body);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-ink-900/40 backdrop-blur-sm p-0 sm:p-4" onClick={onClose}>
      <div
        className="w-full sm:max-w-3xl bg-surface rounded-t-2xl sm:rounded-2xl shadow-modal max-h-[92vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="px-5 py-4 border-b border-line-100 flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] uppercase tracking-widest text-brand-700 font-medium">Test personalizado</p>
            <h3 className="font-serif text-xl text-ink-900 mt-0.5">Crear test</h3>
            <p className="text-xs text-ink-500 mt-1">
              Cuestionarios cortos para tamizaje, autoevaluación o anamnesis. No reemplaza un instrumento clínico validado.
            </p>
          </div>
          <button onClick={onClose} className="h-9 w-9 rounded-md border border-line-200 flex items-center justify-center text-ink-500 hover:border-brand-400 shrink-0">
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="px-5 py-3 border-b border-line-100 flex items-center gap-2 overflow-x-auto no-scrollbar">
          {visibleSteps.map((s, i) => {
            const active = s.id === step;
            const done = i < stepIdx;
            return (
              <div key={s.id} className="flex items-center gap-2 shrink-0">
                <div className={cn(
                  "h-6 w-6 rounded-full text-[11px] font-semibold inline-flex items-center justify-center",
                  active ? "bg-brand-700 text-white" : done ? "bg-brand-50 text-brand-800" : "bg-bg-100 text-ink-500"
                )}>{i + 1}</div>
                <span className={cn("text-xs", active ? "text-ink-900 font-medium" : "text-ink-500")}>{s.label}</span>
                {i < visibleSteps.length - 1 && <div className="h-px w-6 bg-line-200" />}
              </div>
            );
          })}
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {step === "meta" && (
            <MetaStep
              name={name} setName={setName}
              shortName={shortName} setShortName={setShortName}
              description={description} setDescription={setDescription}
              category={category} setCategory={setCategory}
              ageRange={ageRange} setAgeRange={setAgeRange}
              minutes={minutes} setMinutes={setMinutes}
              instructions={instructions} setInstructions={setInstructions}
            />
          )}
          {step === "scale" && (
            <ScaleStep
              responseType={responseType} setResponseType={switchResponseType}
              likertPoints={likertPoints} setLikertPoints={setLikertPoints}
              likertLabels={likertLabels} setLikertLabels={setLikertLabels}
            />
          )}
          {step === "questions" && (
            <QuestionsStep
              questions={questions} setQuestions={setQuestions}
              responseType={responseType}
            />
          )}
          {step === "ranges" && isScored(responseType) && (
            <RangesStep ranges={ranges} setRanges={setRanges} maxScore={maxScore} />
          )}
          {step === "review" && (
            <ReviewStep
              name={name} description={description} category={category}
              minutes={minutes} ageRange={ageRange}
              questions={questions} ranges={ranges} scale={scale} maxScore={maxScore}
              hasReversed={questions.some((q) => q.reverse)}
              scored={isScored(responseType)}
              responseType={responseType}
            />
          )}
        </div>

        <footer className="px-5 py-4 border-t border-line-100 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={prevStep}
            disabled={stepIdx === 0}
            className="h-10 px-4 rounded-lg border border-line-200 text-sm text-ink-700 hover:border-brand-400 disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center gap-2"
          >
            <ArrowLeft className="h-4 w-4" /> Atrás
          </button>
          {step === "review" ? (
            <button
              type="button"
              onClick={handleSave}
              disabled={createMu.isPending}
              className="h-10 px-5 rounded-lg bg-brand-700 text-white text-sm font-medium hover:bg-brand-800 disabled:opacity-60 inline-flex items-center gap-2"
            >
              {createMu.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckSquare className="h-4 w-4" />}
              Crear test
            </button>
          ) : (
            <button
              type="button"
              onClick={tryNext}
              className="h-10 px-5 rounded-lg bg-brand-700 text-white text-sm font-medium hover:bg-brand-800 inline-flex items-center gap-2"
            >
              Siguiente <ArrowRight className="h-4 w-4" />
            </button>
          )}
        </footer>
      </div>
    </div>
  );
}

// ───────────────────────── Steps ─────────────────────────

function MetaStep(props: {
  name: string; setName: (v: string) => void;
  shortName: string; setShortName: (v: string) => void;
  description: string; setDescription: (v: string) => void;
  category: string; setCategory: (v: string) => void;
  ageRange: string; setAgeRange: (v: string) => void;
  minutes: number; setMinutes: (v: number) => void;
  instructions: string; setInstructions: (v: string) => void;
}) {
  return (
    <div className="space-y-4">
      <Field label="Nombre del test" required>
        <input
          autoFocus
          type="text"
          value={props.name}
          onChange={(e) => props.setName(e.target.value)}
          maxLength={120}
          placeholder="Ej. Tamizaje rápido de ansiedad"
          className="w-full h-10 px-3 rounded-lg border border-line-200 bg-bg text-sm text-ink-900 focus:outline-none focus:border-brand-400"
        />
      </Field>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Acrónimo">
          <input
            type="text"
            value={props.shortName}
            onChange={(e) => props.setShortName(e.target.value)}
            maxLength={20}
            placeholder="TRA-1"
            className="w-full h-10 px-3 rounded-lg border border-line-200 bg-bg text-sm text-ink-900 focus:outline-none focus:border-brand-400"
          />
        </Field>
        <Field label="Categoría">
          <select
            value={props.category}
            onChange={(e) => props.setCategory(e.target.value)}
            className="w-full h-10 px-3 rounded-lg border border-line-200 bg-bg text-sm text-ink-900 focus:outline-none focus:border-brand-400"
          >
            <option value="Tamizaje">Tamizaje</option>
            <option value="Autoevaluación">Autoevaluación</option>
            <option value="Anamnesis">Anamnesis</option>
            <option value="Seguimiento">Seguimiento</option>
            <option value="Personalizado">Personalizado</option>
          </select>
        </Field>
        <Field label="Rango de edad">
          <input
            type="text"
            value={props.ageRange}
            onChange={(e) => props.setAgeRange(e.target.value)}
            placeholder="18+"
            className="w-full h-10 px-3 rounded-lg border border-line-200 bg-bg text-sm text-ink-900 focus:outline-none focus:border-brand-400"
          />
        </Field>
        <Field label="Duración (minutos)">
          <input
            type="number"
            min={1} max={120}
            value={props.minutes}
            onChange={(e) => props.setMinutes(Math.max(1, Math.min(120, Number(e.target.value) || 1)))}
            className="w-full h-10 px-3 rounded-lg border border-line-200 bg-bg text-sm text-ink-900 focus:outline-none focus:border-brand-400"
          />
        </Field>
      </div>
      <Field label="Descripción">
        <textarea
          value={props.description}
          onChange={(e) => props.setDescription(e.target.value)}
          rows={2}
          placeholder="Para qué sirve este test y cómo se interpreta."
          className="w-full px-3 py-2 rounded-lg border border-line-200 bg-bg text-sm text-ink-900 focus:outline-none focus:border-brand-400 resize-none"
        />
      </Field>
      <Field label="Instrucciones para el paciente (opcional)">
        <textarea
          value={props.instructions}
          onChange={(e) => props.setInstructions(e.target.value)}
          rows={3}
          placeholder='Ej. "Lee cada afirmación y elige la opción que mejor describe cómo te has sentido la última semana."'
          className="w-full px-3 py-2 rounded-lg border border-line-200 bg-bg text-sm text-ink-900 focus:outline-none focus:border-brand-400 resize-none"
        />
      </Field>
    </div>
  );
}

function ScaleStep(props: {
  responseType: ResponseType; setResponseType: (v: ResponseType) => void;
  likertPoints: number; setLikertPoints: (v: number) => void;
  likertLabels: string[]; setLikertLabels: (v: string[]) => void;
}) {
  function setLikertLabel(idx: number, value: string) {
    const next = [...props.likertLabels];
    next[idx] = value;
    props.setLikertLabels(next);
  }
  return (
    <div className="space-y-4">
      <p className="text-xs text-ink-500">¿Cómo va a responder el paciente? Aplica a todas las preguntas del test (excepto en Actividad, donde cada pregunta lleva su propio formato).</p>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <button
          type="button"
          onClick={() => props.setResponseType("vf")}
          className={cn(
            "rounded-lg border p-4 text-left transition-colors",
            props.responseType === "vf" ? "border-brand-700 bg-brand-50/40" : "border-line-200 hover:border-brand-400"
          )}
        >
          <div className="flex items-center gap-2 mb-1">
            <CheckSquare className="h-4 w-4 text-brand-700" />
            <span className="text-sm font-medium text-ink-900">Verdadero / Falso</span>
          </div>
          <p className="text-xs text-ink-500">Dos opciones fijas. Cada Verdadero suma 1 punto.</p>
        </button>
        <button
          type="button"
          onClick={() => props.setResponseType("likert")}
          className={cn(
            "rounded-lg border p-4 text-left transition-colors",
            props.responseType === "likert" ? "border-brand-700 bg-brand-50/40" : "border-line-200 hover:border-brand-400"
          )}
        >
          <div className="flex items-center gap-2 mb-1">
            <Sliders className="h-4 w-4 text-brand-700" />
            <span className="text-sm font-medium text-ink-900">Likert</span>
          </div>
          <p className="text-xs text-ink-500">3-7 niveles entre dos extremos (ej. nunca → siempre). Suma puntaje.</p>
        </button>
        <button
          type="button"
          onClick={() => props.setResponseType("activity")}
          className={cn(
            "rounded-lg border p-4 text-left transition-colors",
            props.responseType === "activity" ? "border-brand-700 bg-brand-50/40" : "border-line-200 hover:border-brand-400"
          )}
        >
          <div className="flex items-center gap-2 mb-1">
            <ListChecks className="h-4 w-4 text-brand-700" />
            <span className="text-sm font-medium text-ink-900">Actividad</span>
          </div>
          <p className="text-xs text-ink-500">Define tus propias opciones para el test. Sin puntaje — el psicólogo lee e interpreta las respuestas.</p>
        </button>
      </div>

      {props.responseType === "likert" && (
        <div className="space-y-3 rounded-lg border border-line-200 bg-bg-100/30 p-4">
          <Field label="Cantidad de niveles">
            <select
              value={props.likertPoints}
              onChange={(e) => props.setLikertPoints(Number(e.target.value))}
              className="h-10 px-3 rounded-lg border border-line-200 bg-bg text-sm text-ink-900 focus:outline-none focus:border-brand-400"
            >
              {[3, 4, 5, 6, 7].map((n) => <option key={n} value={n}>{n} puntos</option>)}
            </select>
          </Field>
          <div>
            <p className="text-xs font-medium text-ink-700 mb-2">Etiquetas (de menor a mayor puntaje)</p>
            <div className="space-y-2">
              {Array.from({ length: props.likertPoints }, (_, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="text-[11px] tabular text-ink-500 w-6 shrink-0">{i}</span>
                  <input
                    type="text"
                    value={props.likertLabels[i] ?? ""}
                    onChange={(e) => setLikertLabel(i, e.target.value)}
                    placeholder={`Opción ${i + 1}`}
                    className="flex-1 h-9 px-3 rounded-md border border-line-200 bg-surface text-sm text-ink-900 focus:outline-none focus:border-brand-400"
                  />
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {props.responseType === "activity" && (
        <div className="rounded-lg border border-line-200 bg-bg-100/30 p-4 text-xs text-ink-700 leading-relaxed flex items-start gap-2">
          <Info className="h-3.5 w-3.5 text-brand-700 shrink-0 mt-0.5" />
          <div>
            <strong>Sin puntaje automático.</strong> En el siguiente paso vas a poder elegir, por cada pregunta, si quieres una opción múltiple, sí/no, una escala numérica o una caja de texto abierto. Las respuestas se guardan tal cual y tú las interpretas clínicamente al revisar el test.
          </div>
        </div>
      )}
    </div>
  );
}

function QuestionsStep({ questions, setQuestions, responseType }: {
  questions: QuestionDraft[];
  setQuestions: (q: QuestionDraft[]) => void;
  responseType: ResponseType;
}) {
  const showReverseFlag = isScored(responseType);
  const isActivity = responseType === "activity";

  function addQuestion() {
    const id = `q${questions.length + 1}`;
    if (isActivity) {
      setQuestions([...questions, {
        id, text: "", reverse: false,
        type: "single_choice",
        options: [{ value: 0, label: "" }, { value: 1, label: "" }],
      }]);
    } else {
      setQuestions([...questions, { id, text: "", reverse: false }]);
    }
  }
  function update(idx: number, patch: Partial<QuestionDraft>) {
    setQuestions(questions.map((q, i) => i === idx ? { ...q, ...patch } : q));
  }
  function setQuestionType(idx: number, type: ActivityQuestionType) {
    const q = questions[idx];
    const patch: Partial<QuestionDraft> = { type };
    // Re-inicializar campos del nuevo tipo
    if (type === "single_choice" && (!q.options || q.options.length < 2)) {
      patch.options = [{ value: 0, label: "" }, { value: 1, label: "" }];
    }
    if (type === "numeric" && q.numericMin == null && q.numericMax == null) {
      patch.numericMin = 0;
      patch.numericMax = 10;
    }
    update(idx, patch);
  }
  function remove(idx: number) {
    if (questions.length <= 1) return;
    setQuestions(questions.filter((_, i) => i !== idx));
  }
  function move(idx: number, dir: -1 | 1) {
    const j = idx + dir;
    if (j < 0 || j >= questions.length) return;
    const next = [...questions];
    [next[idx], next[j]] = [next[j], next[idx]];
    setQuestions(next);
  }
  return (
    <div className="space-y-3">
      {showReverseFlag && (
        <div className="flex items-start gap-2 rounded-md bg-brand-50/50 border border-brand-100 p-3 text-xs text-ink-700 leading-relaxed">
          <Info className="h-3.5 w-3.5 text-brand-700 shrink-0 mt-0.5" />
          <div>
            <strong>¿Qué es "ítem invertido"?</strong> Marca esta casilla solo si una pregunta está formulada al
            revés del resto. Ejemplo en un test de ansiedad:
            <ul className="mt-1.5 space-y-0.5 list-disc list-inside marker:text-brand-700">
              <li><span className="text-ink-900">"Me siento ansioso"</span> → "Siempre" suma alto. <em>Normal.</em></li>
              <li><span className="text-ink-900">"Me siento tranquilo"</span> → "Siempre" debería <em>restar</em>. <em>Invertido.</em></li>
            </ul>
            <p className="mt-1.5">El sistema voltea la respuesta automáticamente al sumar el total. Si todas tus preguntas miden lo mismo en la misma dirección, no necesitas marcar ninguna.</p>
          </div>
        </div>
      )}
      {isActivity && (
        <div className="flex items-start gap-2 rounded-md bg-brand-50/50 border border-brand-100 p-3 text-xs text-ink-700 leading-relaxed">
          <Info className="h-3.5 w-3.5 text-brand-700 shrink-0 mt-0.5" />
          <div>
            <strong>Por cada pregunta</strong> elige el tipo de respuesta — opción múltiple, sí/no, escala numérica o caja de texto abierto. No hay puntaje: tú lees las respuestas y las interpretas clínicamente.
          </div>
        </div>
      )}
      <ul className="space-y-2">
        {questions.map((q, i) => (
          <li key={q.id} className="rounded-lg border border-line-200 bg-surface p-3">
            <div className="flex items-start gap-2">
              <div className="flex flex-col items-center shrink-0 pt-1">
                <button type="button" onClick={() => move(i, -1)} disabled={i === 0}
                  className="text-ink-400 hover:text-brand-700 disabled:opacity-30">
                  <GripVertical className="h-4 w-4" />
                </button>
                <span className="text-[10px] tabular text-ink-500 mt-1">{i + 1}</span>
              </div>
              <div className="flex-1 min-w-0 space-y-2">
                <textarea
                  value={q.text}
                  onChange={(e) => update(i, { text: e.target.value })}
                  rows={2}
                  placeholder='Ej. "Me he sentido nervioso"'
                  className="w-full px-3 py-2 rounded-md border border-line-200 bg-bg text-sm text-ink-900 focus:outline-none focus:border-brand-400 resize-none"
                />
                {showReverseFlag && (
                  <label className="inline-flex items-center gap-2 text-xs text-ink-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={q.reverse}
                      onChange={(e) => update(i, { reverse: e.target.checked })}
                      className="h-3.5 w-3.5 accent-brand-700"
                    />
                    Ítem invertido
                  </label>
                )}
                {isActivity && (
                  <ActivityQuestionEditor
                    q={q}
                    setType={(t) => setQuestionType(i, t)}
                    update={(patch) => update(i, patch)}
                  />
                )}
              </div>
              <button type="button" onClick={() => remove(i)} disabled={questions.length <= 1}
                className="h-8 w-8 rounded-md text-ink-400 hover:text-rose-700 hover:bg-rose-500/10 disabled:opacity-30 disabled:cursor-not-allowed inline-flex items-center justify-center shrink-0"
                title="Eliminar pregunta"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </li>
        ))}
      </ul>
      <button
        type="button"
        onClick={addQuestion}
        className="w-full h-10 rounded-lg border border-dashed border-line-200 text-sm text-ink-500 hover:border-brand-400 hover:text-brand-700 inline-flex items-center justify-center gap-2"
      >
        <Plus className="h-4 w-4" /> Agregar pregunta
      </button>
    </div>
  );
}

/**
 * Editor del tipo de respuesta para una pregunta de Actividad. Muestra los
 * 4 chips (opción múltiple / sí-no / numérico / texto) y debajo el editor
 * específico del tipo elegido.
 */
function ActivityQuestionEditor({ q, setType, update }: {
  q: QuestionDraft;
  setType: (t: ActivityQuestionType) => void;
  update: (patch: Partial<QuestionDraft>) => void;
}) {
  const TYPES: Array<{ value: ActivityQuestionType; label: string; icon: React.ComponentType<{ className?: string }> }> = [
    { value: "single_choice", label: "Opción múltiple", icon: ListChecks },
    { value: "yes_no",        label: "Sí / No",         icon: CheckSquare },
    { value: "numeric",       label: "Numérico",        icon: Hash },
    { value: "text",          label: "Texto abierto",   icon: TypeIcon },
  ];
  return (
    <div className="rounded-md border border-line-100 bg-bg-100/30 p-3 space-y-2">
      <p className="text-[11px] uppercase tracking-wider text-ink-500 font-medium">Tipo de respuesta</p>
      <div className="flex flex-wrap gap-1.5">
        {TYPES.map((t) => {
          const Icon = t.icon;
          const active = q.type === t.value;
          return (
            <button
              key={t.value}
              type="button"
              onClick={() => setType(t.value)}
              className={cn(
                "h-8 px-3 rounded-full text-xs font-medium inline-flex items-center gap-1.5 border transition-colors",
                active
                  ? "border-brand-700 bg-brand-50 text-brand-800"
                  : "border-line-200 bg-surface text-ink-700 hover:border-brand-400"
              )}
            >
              <Icon className="h-3 w-3" /> {t.label}
            </button>
          );
        })}
      </div>

      {q.type === "single_choice" && (
        <SingleChoiceEditor
          options={q.options ?? []}
          setOptions={(opts) => update({ options: opts })}
        />
      )}
      {q.type === "yes_no" && (
        <p className="text-[11px] text-ink-500">El paciente verá dos botones fijos: <strong>Sí</strong> y <strong>No</strong>.</p>
      )}
      {q.type === "numeric" && (
        <div className="grid grid-cols-2 gap-2">
          <label className="block">
            <span className="block text-[11px] text-ink-500 mb-1">Mínimo</span>
            <input
              type="number"
              value={q.numericMin ?? ""}
              onChange={(e) => update({ numericMin: e.target.value === "" ? undefined : Number(e.target.value) })}
              className="w-full h-9 px-2 rounded-md border border-line-200 bg-surface text-sm text-ink-900 tabular focus:outline-none focus:border-brand-400"
            />
          </label>
          <label className="block">
            <span className="block text-[11px] text-ink-500 mb-1">Máximo</span>
            <input
              type="number"
              value={q.numericMax ?? ""}
              onChange={(e) => update({ numericMax: e.target.value === "" ? undefined : Number(e.target.value) })}
              className="w-full h-9 px-2 rounded-md border border-line-200 bg-surface text-sm text-ink-900 tabular focus:outline-none focus:border-brand-400"
            />
          </label>
        </div>
      )}
      {q.type === "text" && (
        <label className="block">
          <span className="block text-[11px] text-ink-500 mb-1">Placeholder (opcional)</span>
          <input
            type="text"
            value={q.placeholder ?? ""}
            onChange={(e) => update({ placeholder: e.target.value })}
            placeholder='Ej. "Cuéntame en tus palabras…"'
            className="w-full h-9 px-3 rounded-md border border-line-200 bg-surface text-sm text-ink-900 focus:outline-none focus:border-brand-400"
          />
        </label>
      )}
    </div>
  );
}

function SingleChoiceEditor({ options, setOptions }: {
  options: Array<{ value: number; label: string }>;
  setOptions: (opts: Array<{ value: number; label: string }>) => void;
}) {
  function update(idx: number, label: string) {
    setOptions(options.map((o, i) => i === idx ? { ...o, label } : o));
  }
  function add() {
    if (options.length >= 10) return;
    setOptions([...options, { value: options.length, label: "" }]);
  }
  function remove(idx: number) {
    if (options.length <= 2) return;
    // Re-indexar values 0..N-1 después de eliminar
    setOptions(options.filter((_, i) => i !== idx).map((o, i) => ({ ...o, value: i })));
  }
  return (
    <div className="space-y-1.5">
      {options.map((o, i) => (
        <div key={i} className="flex items-center gap-2">
          <span className="text-[11px] tabular text-ink-500 w-5 shrink-0">{i + 1}.</span>
          <input
            type="text"
            value={o.label}
            onChange={(e) => update(i, e.target.value)}
            placeholder={`Opción ${i + 1}`}
            className="flex-1 h-9 px-3 rounded-md border border-line-200 bg-surface text-sm text-ink-900 focus:outline-none focus:border-brand-400"
          />
          <button
            type="button"
            onClick={() => remove(i)}
            disabled={options.length <= 2}
            className="h-7 w-7 rounded-md text-ink-400 hover:text-rose-700 hover:bg-rose-500/10 disabled:opacity-30 disabled:cursor-not-allowed inline-flex items-center justify-center"
            title="Eliminar opción"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={add}
        disabled={options.length >= 10}
        className="w-full h-8 rounded-md border border-dashed border-line-200 text-[11px] text-ink-500 hover:border-brand-400 hover:text-brand-700 disabled:opacity-40 inline-flex items-center justify-center gap-1.5"
      >
        <Plus className="h-3 w-3" /> Agregar opción
      </button>
    </div>
  );
}

function RangesStep({ ranges, setRanges, maxScore }: {
  ranges: RangeDraft[];
  setRanges: (r: RangeDraft[]) => void;
  maxScore: number;
}) {
  function add() {
    const last = ranges[ranges.length - 1];
    const start = last ? last.max + 1 : 0;
    const id = `r${ranges.length + 1}`;
    setRanges([...ranges, { id, min: start, max: Math.min(maxScore, start + 5), label: "", level: "moderate" }]);
  }
  function update(idx: number, patch: Partial<RangeDraft>) {
    setRanges(ranges.map((r, i) => i === idx ? { ...r, ...patch } : r));
  }
  function remove(idx: number) {
    setRanges(ranges.filter((_, i) => i !== idx));
  }
  return (
    <div className="space-y-3">
      <div className="flex items-start gap-2 rounded-md bg-bg-100/50 border border-line-200 p-3 text-xs text-ink-700">
        <Info className="h-3.5 w-3.5 text-ink-500 shrink-0 mt-0.5" />
        <span>
          Define cómo el puntaje total (0 - <strong className="tabular">{maxScore}</strong>) se traduce a un nivel
          interpretativo. Los rangos no deben superponerse y deben cubrir todo el espectro de puntajes.
        </span>
      </div>
      <ul className="space-y-2">
        {ranges.map((r, i) => (
          <li key={r.id} className="rounded-lg border border-line-200 bg-surface p-3">
            <div className="grid grid-cols-1 sm:grid-cols-[1fr_70px_70px_140px_36px] gap-2 items-center">
              <input
                type="text"
                value={r.label}
                onChange={(e) => update(i, { label: e.target.value })}
                placeholder="Etiqueta (ej. Mínimo, Moderado…)"
                className="h-9 px-3 rounded-md border border-line-200 bg-bg text-sm text-ink-900 focus:outline-none focus:border-brand-400"
              />
              <input
                type="number"
                value={r.min}
                onChange={(e) => update(i, { min: Math.max(0, Number(e.target.value) || 0) })}
                className="h-9 px-2 rounded-md border border-line-200 bg-bg text-sm text-ink-900 tabular focus:outline-none focus:border-brand-400"
                min={0} max={maxScore}
                placeholder="Min"
              />
              <input
                type="number"
                value={r.max}
                onChange={(e) => update(i, { max: Math.max(0, Number(e.target.value) || 0) })}
                className="h-9 px-2 rounded-md border border-line-200 bg-bg text-sm text-ink-900 tabular focus:outline-none focus:border-brand-400"
                min={0} max={maxScore}
                placeholder="Max"
              />
              <select
                value={r.level}
                onChange={(e) => update(i, { level: e.target.value as Severity })}
                className="h-9 px-2 rounded-md border border-line-200 bg-bg text-sm text-ink-900 focus:outline-none focus:border-brand-400"
              >
                {SEVERITY_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
              <button
                type="button"
                onClick={() => remove(i)}
                className="h-9 w-9 rounded-md text-ink-400 hover:text-rose-700 hover:bg-rose-500/10 inline-flex items-center justify-center"
                title="Eliminar rango"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </li>
        ))}
      </ul>
      <button
        type="button"
        onClick={add}
        className="w-full h-10 rounded-lg border border-dashed border-line-200 text-sm text-ink-500 hover:border-brand-400 hover:text-brand-700 inline-flex items-center justify-center gap-2"
      >
        <Plus className="h-4 w-4" /> Agregar rango
      </button>
    </div>
  );
}

function ReviewStep({
  name, description, category, minutes, ageRange, questions, ranges, scale, maxScore, hasReversed,
  scored, responseType,
}: {
  name: string; description: string; category: string; minutes: number; ageRange: string;
  questions: QuestionDraft[]; ranges: RangeDraft[];
  scale: Array<{ value: number; label: string }>;
  maxScore: number; hasReversed: boolean;
  scored: boolean; responseType: ResponseType;
}) {
  const sortedRanges = [...ranges].sort((a, b) => a.min - b.min);
  const responseLabel = responseType === "vf" ? "Verdadero / Falso"
    : responseType === "likert" ? "Likert"
    : "Actividad";
  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-line-200 bg-bg-100/30 p-4">
        <h4 className="font-serif text-base text-ink-900">{name || "Sin nombre"}</h4>
        <p className="text-xs text-ink-500 mt-0.5">
          {category} · {questions.length} preguntas · ~{minutes} min · {ageRange}
        </p>
        {description && <p className="text-sm text-ink-700 mt-2">{description}</p>}
      </div>

      <div>
        <p className="text-[11px] uppercase tracking-widest text-ink-500 font-medium mb-2">
          Tipo de respuesta — {responseLabel}
        </p>
        {scored ? (
          <div className="flex flex-wrap gap-1.5">
            {scale.map((s) => (
              <span key={s.value} className="text-xs px-2 py-1 rounded-md bg-bg-100 text-ink-700 border border-line-200">
                <span className="tabular text-ink-500 mr-1">{s.value}</span>
                {s.label}
              </span>
            ))}
          </div>
        ) : (
          <ul className="space-y-1.5">
            {questions.map((q, i) => (
              <li key={q.id} className="text-xs text-ink-700">
                <span className="tabular text-ink-500 mr-1">{i + 1}.</span>
                {q.text || "—"}
                <span className="ml-2 inline-block px-1.5 py-0.5 rounded bg-bg-100 text-[10px] text-ink-500 border border-line-200">
                  {q.type ? ACTIVITY_TYPE_LABELS[q.type] : "—"}
                </span>
              </li>
            ))}
          </ul>
        )}
        {hasReversed && scored && (
          <p className="text-[11px] text-ink-500 mt-2">El test incluye ítems invertidos — el scoring los compensa automáticamente.</p>
        )}
      </div>

      {scored ? (
        <div>
          <p className="text-[11px] uppercase tracking-widest text-ink-500 font-medium mb-2">Severidad</p>
          <ul className="space-y-1.5">
            {sortedRanges.map((r) => {
              const sev = SEVERITY_OPTIONS.find((o) => o.value === r.level);
              return (
                <li key={r.id} className="flex items-center justify-between rounded-md border border-line-100 px-3 py-2">
                  <div className="flex items-center gap-2">
                    <span className={cn("text-[10px] px-1.5 py-0.5 rounded font-medium uppercase tracking-wider", sev?.class)}>
                      {sev?.label}
                    </span>
                    <span className="text-sm text-ink-900">{r.label || "—"}</span>
                  </div>
                  <span className="text-xs text-ink-500 tabular">{r.min} – {r.max}</span>
                </li>
              );
            })}
          </ul>
          <p className="text-[11px] text-ink-500 mt-2">Puntaje máximo posible: <span className="tabular">{maxScore}</span></p>
        </div>
      ) : (
        <div className="rounded-lg border border-line-200 bg-bg-100/30 p-4">
          <p className="text-[11px] uppercase tracking-widest text-ink-500 font-medium mb-1">Resultados</p>
          <p className="text-sm text-ink-900">Sin puntaje automático.</p>
          <p className="text-xs text-ink-500 mt-1">
            Al completar el test, vas a ver la lista de respuestas tal cual el paciente las marcó. La interpretación clínica queda en tus manos.
          </p>
        </div>
      )}
    </div>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-ink-700 mb-1.5">
        {label}{required && <span className="text-rose-700"> *</span>}
      </span>
      {children}
    </label>
  );
}
