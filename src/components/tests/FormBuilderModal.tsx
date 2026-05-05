import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  X, Plus, Trash2, ArrowLeft, ArrowRight, GripVertical, Loader2,
  CheckSquare, Sliders, Info,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { api, type CreateFormBody, type PsychTestRange } from "@/lib/api";

/**
 * Builder simple para que el psicólogo cree formularios tipo cuestionario
 * (autoevaluaciones / tamizajes). Soporta dos formatos:
 *   - V/F: 2 opciones fijas con valores 1/0
 *   - Likert: 3-7 opciones con etiquetas configurables
 *
 * Scoring exclusivo por suma. La estructura de `definition` es idéntica
 * a la de los instrumentos clínicos para que el TestRunner los renderice
 * sin código condicional. La extensibilidad a múltiples escalas/pesos
 * queda diferida — la API ya acepta el shape, pero la UI solo expone
 * scoring por suma en este v1.
 */

type ResponseType = "vf" | "likert";
type Severity = "none" | "low" | "moderate" | "high" | "critical";

type Step = "meta" | "scale" | "questions" | "ranges" | "review";

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

interface QuestionDraft { id: string; text: string; reverse: boolean }
interface RangeDraft   { id: string; min: number; max: number; label: string; level: Severity }

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

  // Step 2: scale
  const [responseType, setResponseType] = useState<ResponseType>("likert");
  const [likertPoints, setLikertPoints] = useState(5);
  const [likertLabels, setLikertLabels] = useState<string[]>([
    "Nunca", "Casi nunca", "A veces", "Casi siempre", "Siempre",
  ]);

  // Step 3: questions
  const [questions, setQuestions] = useState<QuestionDraft[]>([
    { id: "q1", text: "", reverse: false },
  ]);

  // Step 4: ranges
  const [ranges, setRanges] = useState<RangeDraft[]>([]);

  // Step navigation
  const [step, setStep] = useState<Step>("meta");
  const stepIdx = STEPS.findIndex((s) => s.id === step);

  // Escala efectiva según el tipo
  const scale = useMemo(() => {
    if (responseType === "vf") {
      return [
        { value: 1, label: "Verdadero" },
        { value: 0, label: "Falso" },
      ];
    }
    return likertLabels.slice(0, likertPoints).map((label, i) => ({
      value: i,
      label: label.trim() || `Opción ${i + 1}`,
    }));
  }, [responseType, likertPoints, likertLabels]);

  // Score máximo posible (para validación de rangos y precarga inicial)
  const maxScore = useMemo(() => {
    const high = scale.reduce((m, o) => Math.max(m, o.value), 0);
    return high * questions.length;
  }, [scale, questions.length]);

  // Auto-genera 3 rangos al pasar al step "ranges" si está vacío.
  function ensureRanges() {
    if (ranges.length > 0) return;
    const third = Math.floor(maxScore / 3);
    const twoThird = Math.floor((maxScore * 2) / 3);
    setRanges([
      { id: "r1", min: 0,            max: Math.max(0, third - 1),       label: "Bajo",      level: "low" },
      { id: "r2", min: third,        max: Math.max(third, twoThird - 1), label: "Moderado", level: "moderate" },
      { id: "r3", min: twoThird,     max: maxScore,                     label: "Alto",      level: "high" },
    ]);
  }

  function nextStep() {
    if (step === "questions") ensureRanges();
    const next = STEPS[stepIdx + 1];
    if (next) setStep(next.id);
  }
  function prevStep() {
    const prev = STEPS[stepIdx - 1];
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
    if (questions.some((q) => !q.text.trim())) return "Hay preguntas sin texto";
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
    else if (step === "ranges") err = validateRanges();
    if (err) { toast.error(err); return; }
    nextStep();
  }

  const createMu = useMutation({
    mutationFn: (body: CreateFormBody) => api.createTestForm(body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["test-catalog"] });
      toast.success("Formulario creado");
      onClose();
    },
    onError: (e: Error) => toast.error(e.message ?? "Error al crear el formulario"),
  });

  function handleSave() {
    const err = validateMeta() ?? validateScale() ?? validateQuestions() ?? validateRanges();
    if (err) { toast.error(err); return; }
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
        questions: questions.map((q, i) => ({
          id: q.id || `q${i + 1}`,
          text: q.text.trim(),
          ...(q.reverse ? { reverse: true } : {}),
        })),
        scoring: { type: questions.some((q) => q.reverse) ? "sum_reversed" : "sum" },
        ranges: ranges
          .sort((a, b) => a.min - b.min)
          .map<PsychTestRange>((r) => ({ min: r.min, max: r.max, label: r.label.trim(), level: r.level })),
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
            <p className="text-[11px] uppercase tracking-widest text-brand-700 font-medium">Formulario del consultorio</p>
            <h3 className="font-serif text-xl text-ink-900 mt-0.5">Crear formulario</h3>
            <p className="text-xs text-ink-500 mt-1">
              Cuestionarios cortos para tamizaje o autoevaluación. No reemplaza un instrumento clínico validado.
            </p>
          </div>
          <button onClick={onClose} className="h-9 w-9 rounded-md border border-line-200 flex items-center justify-center text-ink-500 hover:border-brand-400 shrink-0">
            <X className="h-4 w-4" />
          </button>
        </header>

        {/* Stepper */}
        <div className="px-5 py-3 border-b border-line-100 flex items-center gap-2 overflow-x-auto no-scrollbar">
          {STEPS.map((s, i) => {
            const active = s.id === step;
            const done = i < stepIdx;
            return (
              <div key={s.id} className="flex items-center gap-2 shrink-0">
                <div className={cn(
                  "h-6 w-6 rounded-full text-[11px] font-semibold inline-flex items-center justify-center",
                  active ? "bg-brand-700 text-white" : done ? "bg-brand-50 text-brand-800" : "bg-bg-100 text-ink-500"
                )}>{i + 1}</div>
                <span className={cn("text-xs", active ? "text-ink-900 font-medium" : "text-ink-500")}>{s.label}</span>
                {i < STEPS.length - 1 && <div className="h-px w-6 bg-line-200" />}
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
              responseType={responseType} setResponseType={setResponseType}
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
          {step === "ranges" && (
            <RangesStep
              ranges={ranges} setRanges={setRanges}
              maxScore={maxScore}
            />
          )}
          {step === "review" && (
            <ReviewStep
              name={name} description={description} category={category}
              minutes={minutes} ageRange={ageRange}
              questions={questions} ranges={ranges} scale={scale} maxScore={maxScore}
              hasReversed={questions.some((q) => q.reverse)}
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
              Crear formulario
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
      <Field label="Nombre del formulario" required>
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
        <Field label="Etiqueta corta (code)">
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
          placeholder="Para qué sirve este formulario y cómo se interpreta."
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
  function setLabel(idx: number, value: string) {
    const next = [...props.likertLabels];
    next[idx] = value;
    props.setLikertLabels(next);
  }
  return (
    <div className="space-y-4">
      <p className="text-xs text-ink-500">¿Cómo van a responder los pacientes? Aplica a todas las preguntas del formulario.</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
          <p className="text-xs text-ink-500">3-7 niveles entre dos extremos (ej. nunca → siempre).</p>
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
                    onChange={(e) => setLabel(i, e.target.value)}
                    placeholder={`Opción ${i + 1}`}
                    className="flex-1 h-9 px-3 rounded-md border border-line-200 bg-surface text-sm text-ink-900 focus:outline-none focus:border-brand-400"
                  />
                </div>
              ))}
            </div>
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
  function addQuestion() {
    const id = `q${questions.length + 1}`;
    setQuestions([...questions, { id, text: "", reverse: false }]);
  }
  function update(idx: number, patch: Partial<QuestionDraft>) {
    setQuestions(questions.map((q, i) => i === idx ? { ...q, ...patch } : q));
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
      <div className="flex items-start gap-2 rounded-md bg-brand-50/50 border border-brand-100 p-3 text-xs text-ink-700">
        <Info className="h-3.5 w-3.5 text-brand-700 shrink-0 mt-0.5" />
        <span>
          <strong>Ítem invertido:</strong> marca esta opción cuando una respuesta "alta" reste en lugar de sumar.
          Útil cuando una pregunta está formulada en negativo (ej. "Me siento bien" en una escala de depresión).
        </span>
      </div>
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
                  placeholder={responseType === "vf" ? 'Ej. "Me he sentido tenso o nervioso"' : 'Ej. "Me he sentido nervioso"'}
                  className="w-full px-3 py-2 rounded-md border border-line-200 bg-bg text-sm text-ink-900 focus:outline-none focus:border-brand-400 resize-none"
                />
                <label className="inline-flex items-center gap-2 text-xs text-ink-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={q.reverse}
                    onChange={(e) => update(i, { reverse: e.target.checked })}
                    className="h-3.5 w-3.5 accent-brand-700"
                  />
                  Ítem invertido
                </label>
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
}: {
  name: string; description: string; category: string; minutes: number; ageRange: string;
  questions: QuestionDraft[]; ranges: RangeDraft[];
  scale: Array<{ value: number; label: string }>;
  maxScore: number; hasReversed: boolean;
}) {
  const sortedRanges = [...ranges].sort((a, b) => a.min - b.min);
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
        <p className="text-[11px] uppercase tracking-widest text-ink-500 font-medium mb-2">Tipo de respuesta</p>
        <div className="flex flex-wrap gap-1.5">
          {scale.map((s) => (
            <span key={s.value} className="text-xs px-2 py-1 rounded-md bg-bg-100 text-ink-700 tabular border border-line-200">
              {s.value} · {s.label}
            </span>
          ))}
        </div>
        {hasReversed && (
          <p className="text-[11px] text-ink-500 mt-2">El formulario incluye ítems invertidos — el scoring los compensa automáticamente.</p>
        )}
      </div>

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
