import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/app/AppShell";
import { KpiCard } from "@/components/app/KpiCard";
import {
  PHQ9_ITEMS, PHQ9_OPTIONS, TEST_EVOLUTION,
} from "@/lib/mock-data";
import { api, type ApiPatient } from "@/lib/api";
import {
  Brain, ClipboardList, CheckCircle2, Clock, Send, Search, X, ChevronRight, Sparkles,
  FileBarChart, Plus, ArrowLeft, ArrowRight, Filter, TrendingDown, Loader2,
  AlertOctagon, Phone, ShieldAlert,
} from "lucide-react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Tooltip } from "recharts";

// Tipo del catálogo tal como lo devuelve el backend
interface PsychTest {
  id: string;
  code: string;
  name: string;
  shortName: string;
  items: number;
  minutes: number;
  category: string;
  description: string;
  ageRange: string;
  scoring: { range: string; label: string; level: "none" | "low" | "moderate" | "high" | "critical" }[];
}

interface TestApplicationRow {
  id: string;
  patient_id: string;
  patient_name: string;
  test_code: string;
  test_name: string;
  date: string;
  score: number;
  interpretation: string;
  level: "none" | "low" | "moderate" | "high" | "critical";
  professional: string;
  status: string;
}

export const Route = createFileRoute("/tests")({
  head: () => ({
    meta: [
      { title: "Tests psicométricos · Psicomorfosis" },
      { name: "description", content: "Catálogo, aplicación e histórico de tests psicométricos." },
    ],
  }),
  component: TestsPage,
});

type View = "catalogo" | "historico" | "aplicar";

const LEVEL_STYLE: Record<string, string> = {
  none: "bg-bg-100 text-ink-500",
  low: "bg-success-soft text-success",
  moderate: "bg-warning-soft text-risk-moderate",
  high: "bg-error-soft text-risk-high",
  critical: "bg-error-soft text-risk-critical",
};

function TestsPage() {
  const [view, setView] = useState<View>("catalogo");
  const [activeTest, setActiveTest] = useState<PsychTest | null>(null);

  const { data: catalog = [] } = useQuery({ queryKey: ["test-catalog"], queryFn: () => api.listTestCatalog() });
  const { data: applications = [] } = useQuery({ queryKey: ["test-applications"], queryFn: () => api.listTestApplications() });
  const { data: patients = [] } = useQuery({ queryKey: ["patients"], queryFn: () => api.listPatients() });

  const tests = catalog as unknown as PsychTest[];
  const apps = applications as unknown as TestApplicationRow[];

  const kpis = useMemo(() => {
    const pending = apps.filter((t) => t.status !== "completado").length;
    const completed = apps.filter((t) => t.status === "completado").length;
    const highRisk = apps.filter((t) => t.level === "high" || t.level === "critical").length;
    return { pending, completed, highRisk, total: apps.length };
  }, [apps]);

  return (
    <AppShell>
      <div className="space-y-8">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm text-ink-500">Biblioteca clínica · instrumentos validados</p>
            <h1 className="font-serif text-2xl md:text-[32px] leading-tight text-ink-900 mt-1">Tests psicométricos</h1>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setView("aplicar")}
              className="h-10 px-4 rounded-lg bg-brand-700 text-primary-foreground text-sm font-medium hover:bg-brand-800 inline-flex items-center gap-2"
            >
              <Plus className="h-4 w-4" /> Aplicar test
            </button>
            <button className="h-10 px-4 rounded-lg border border-line-200 bg-surface text-ink-700 text-sm hover:border-brand-400">
              Exportar resultados
            </button>
          </div>
        </header>

        <section className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <KpiCard label="Tests disponibles" value={String(tests.length)} hint="instrumentos" icon={<Brain className="h-4 w-4" />} delta={{ neutral: true, value: "" }} />
          <KpiCard label="Aplicaciones" value={String(kpis.total)} hint="en total" icon={<ClipboardList className="h-4 w-4" />} delta={{ neutral: true, value: "" }} />
          <KpiCard label="Calificados" value={String(kpis.completed)} hint="listos para sesión" icon={<CheckCircle2 className="h-4 w-4" />} delta={{ neutral: true, value: "" }} />
          <KpiCard label="Requieren atención" value={String(kpis.highRisk)} emphasis={kpis.highRisk > 0 ? "risk" : "default"} hint="alto o crítico" icon={<FileBarChart className="h-4 w-4" />} delta={{ neutral: true, value: "" }} />
        </section>

        <div className="flex items-center gap-1 p-1 rounded-lg bg-bg-100 w-fit">
          {([
            { id: "catalogo", label: "Catálogo" },
            { id: "historico", label: "Histórico" },
            { id: "aplicar", label: "Aplicación" },
          ] as const).map((t) => (
            <button
              key={t.id}
              onClick={() => setView(t.id)}
              className={
                "px-4 py-2 text-sm rounded-md transition-colors " +
                (view === t.id ? "bg-surface text-ink-900 font-medium shadow-xs" : "text-ink-500 hover:text-ink-900")
              }
            >
              {t.label}
            </button>
          ))}
        </div>

        {view === "catalogo" && <Catalog tests={tests} onApply={(t) => { setActiveTest(t); setView("aplicar"); }} />}
        {view === "historico" && <Historico applications={apps} />}
        {view === "aplicar" && <ApplyView tests={tests} patients={patients} preselect={activeTest} onClose={() => setView("catalogo")} />}
      </div>
    </AppShell>
  );
}

function Catalog({ tests, onApply }: { tests: PsychTest[]; onApply: (t: PsychTest) => void }) {
  const [query, setQuery] = useState("");
  const [cat, setCat] = useState<string>("Todas");
  const [previewTest, setPreviewTest] = useState<PsychTest | null>(null);
  const categories = ["Todas", ...Array.from(new Set(tests.map((t) => t.category)))];

  const filtered = tests.filter((t) => {
    if (cat !== "Todas" && t.category !== cat) return false;
    if (!query.trim()) return true;
    const q = query.toLowerCase();
    return t.name.toLowerCase().includes(q) || t.code.toLowerCase().includes(q) || t.category.toLowerCase().includes(q);
  });

  if (tests.length === 0) {
    return (
      <div className="flex items-center justify-center py-16 text-sm text-ink-500">
        <Loader2 className="h-4 w-4 animate-spin mr-2" /> Cargando catálogo…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex-1 min-w-[260px] flex items-center gap-2 h-10 px-3 rounded-md border border-line-200 bg-surface">
          <Search className="h-4 w-4 text-ink-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar por nombre o código (PHQ, GAD, Beck)…"
            className="flex-1 bg-transparent text-sm text-ink-900 placeholder:text-ink-400 outline-none"
          />
        </div>
        <div className="flex items-center gap-1 flex-wrap">
          {categories.map((c) => (
            <button
              key={c}
              onClick={() => setCat(c)}
              className={
                "px-3 h-9 text-xs rounded-md border transition-colors " +
                (cat === c ? "border-brand-700 bg-brand-50 text-brand-800 font-medium" : "border-line-200 bg-surface text-ink-700 hover:border-brand-400")
              }
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {filtered.map((t) => (
          <article key={t.id} className="rounded-xl border border-line-200 bg-surface p-5 flex flex-col hover:border-brand-400 transition-colors">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="inline-flex items-center gap-1.5 text-[11px] uppercase tracking-[0.08em] text-brand-800 bg-brand-50 px-2 py-0.5 rounded-full font-medium">
                  {t.category}
                </div>
                <h3 className="font-serif text-lg text-ink-900 mt-2">{t.name}</h3>
                <p className="text-xs text-ink-500">{t.code} · {t.ageRange}</p>
              </div>
              <div className="h-9 w-9 rounded-lg bg-lavender-100 text-lavender-500 flex items-center justify-center">
                <Brain className="h-4 w-4" />
              </div>
            </div>

            <p className="mt-3 text-sm text-ink-700 flex-1">{t.description}</p>

            <div className="mt-4 flex items-center gap-4 text-xs text-ink-500">
              <span className="inline-flex items-center gap-1"><ClipboardList className="h-3.5 w-3.5" /> {t.items} ítems</span>
              <span className="inline-flex items-center gap-1"><Clock className="h-3.5 w-3.5" /> ~{t.minutes} min</span>
            </div>

            <div className="mt-4 pt-4 border-t border-line-100 space-y-1.5">
              {t.scoring.map((s, i) => (
                <div key={i} className="flex items-center justify-between text-[11px]">
                  <span className="text-ink-500 tabular">{s.range}</span>
                  <span className={"px-2 py-0.5 rounded-full font-medium " + LEVEL_STYLE[s.level]}>{s.label}</span>
                </div>
              ))}
            </div>

            <div className="mt-4 flex gap-2">
              <button
                onClick={() => onApply(t)}
                className="flex-1 h-9 rounded-md bg-brand-700 text-primary-foreground text-xs font-medium hover:bg-brand-800 inline-flex items-center justify-center gap-1.5"
              >
                <Send className="h-3.5 w-3.5" /> Aplicar
              </button>
              <button
                onClick={() => setPreviewTest(t)}
                className="h-9 px-3 rounded-md border border-line-200 bg-surface text-xs text-ink-700 hover:border-brand-400"
              >
                Ver ítems
              </button>
            </div>
          </article>
        ))}
      </div>

      {filtered.length === 0 && (
        <div className="rounded-xl border border-dashed border-line-200 p-12 text-center">
          <Search className="h-6 w-6 text-ink-400 mx-auto mb-2" />
          <p className="text-sm text-ink-500">Sin resultados para "{query}"</p>
        </div>
      )}

      {previewTest && <TestPreviewModal test={previewTest} onClose={() => setPreviewTest(null)} onApply={() => { const t = previewTest; setPreviewTest(null); onApply(t); }} />}
    </div>
  );
}

function TestPreviewModal({ test, onClose, onApply }: { test: PsychTest; onClose: () => void; onApply: () => void }) {
  const hasPhqItems = test.id === "phq9";
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-900/40 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="w-full max-w-2xl max-h-[90vh] overflow-hidden rounded-2xl bg-surface shadow-modal flex flex-col" onClick={(e) => e.stopPropagation()}>
        <header className="p-5 border-b border-line-100 flex items-start justify-between">
          <div>
            <p className="text-[11px] uppercase tracking-widest text-brand-800 font-medium">{test.code} · {test.category}</p>
            <h3 className="font-serif text-xl text-ink-900 mt-0.5">{test.name}</h3>
            <p className="text-xs text-ink-500 mt-1">{test.items} ítems · ~{test.minutes} min · {test.ageRange}</p>
          </div>
          <button onClick={onClose} className="h-9 w-9 rounded-md border border-line-200 text-ink-500 hover:border-brand-400 flex items-center justify-center">
            <X className="h-4 w-4" />
          </button>
        </header>
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          <p className="text-sm text-ink-700">{test.description}</p>

          <div className="rounded-lg border border-line-200 overflow-hidden">
            <div className="px-4 py-2.5 bg-bg-100/60 border-b border-line-100 text-[11px] uppercase tracking-wider text-ink-500 font-medium">
              Interpretación por rangos
            </div>
            <ul className="divide-y divide-line-100">
              {test.scoring.map((s, i) => (
                <li key={i} className="px-4 py-2.5 flex items-center justify-between text-sm">
                  <span className="tabular text-ink-700">{s.range}</span>
                  <span className={"px-2 py-0.5 rounded-full text-[11px] font-medium " + LEVEL_STYLE[s.level]}>{s.label}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-lg border border-line-200 overflow-hidden">
            <div className="px-4 py-2.5 bg-bg-100/60 border-b border-line-100 text-[11px] uppercase tracking-wider text-ink-500 font-medium">
              Ítems
            </div>
            {hasPhqItems ? (
              <ol className="divide-y divide-line-100">
                {PHQ9_ITEMS.map((item, i) => (
                  <li key={i} className="px-4 py-2.5 flex items-start gap-3 text-sm">
                    <span className="font-serif text-ink-400 tabular shrink-0">{i + 1}.</span>
                    <span className="text-ink-700">
                      {item}
                      {i === 8 && <span className="ml-2 inline-flex items-center gap-1 text-[10px] uppercase tracking-wider text-risk-high font-medium"><AlertOctagon className="h-3 w-3" /> crítico</span>}
                    </span>
                  </li>
                ))}
              </ol>
            ) : (
              <div className="p-6 text-center">
                <ClipboardList className="h-5 w-5 text-ink-400 mx-auto mb-2" />
                <p className="text-sm text-ink-500">
                  Los {test.items} ítems de {test.code} están disponibles en formato estándar.
                </p>
                <p className="text-xs text-ink-400 mt-1">
                  El render interactivo paso a paso se aplica hoy solo en PHQ-9. Para los demás instrumentos se muestra la ficha del test al aplicar.
                </p>
              </div>
            )}
          </div>
        </div>
        <footer className="p-4 border-t border-line-100 bg-bg-100/30 flex justify-end gap-2">
          <button onClick={onClose} className="h-9 px-3 rounded-md border border-line-200 text-sm text-ink-700 hover:border-brand-400">Cerrar</button>
          <button onClick={onApply} className="h-9 px-4 rounded-md bg-brand-700 text-primary-foreground text-sm font-medium hover:bg-brand-800 inline-flex items-center gap-2">
            <Send className="h-3.5 w-3.5" /> Aplicar este test
          </button>
        </footer>
      </div>
    </div>
  );
}

function Historico({ applications }: { applications: TestApplicationRow[] }) {
  const [patient, setPatient] = useState<string>("Todos");
  const patients = ["Todos", ...Array.from(new Set(applications.map((t) => t.patient_name)))];

  const filtered = applications.filter((t) => patient === "Todos" || t.patient_name === patient);

  const STATUS: Record<string, string> = {
    completado: "bg-success-soft text-success",
    en_curso: "bg-brand-50 text-brand-800",
    enviado: "bg-warning-soft text-risk-moderate",
  };

  return (
    <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
      <div className="xl:col-span-2 rounded-xl border border-line-200 bg-surface">
        <div className="p-4 flex flex-wrap items-center justify-between gap-2 border-b border-line-100">
          <div>
            <h3 className="font-serif text-lg text-ink-900">Aplicaciones</h3>
            <p className="text-xs text-ink-500">{filtered.length} registros</p>
          </div>
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-ink-400" />
            <select
              value={patient}
              onChange={(e) => setPatient(e.target.value)}
              className="h-9 px-3 rounded-md border border-line-200 bg-surface text-sm text-ink-700 outline-none hover:border-brand-400"
            >
              {patients.map((p) => <option key={p}>{p}</option>)}
            </select>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-[0.08em] text-ink-500 bg-bg-100/50 border-b border-line-100">
                <th className="px-5 py-3 font-medium">Paciente</th>
                <th className="px-3 py-3 font-medium">Test</th>
                <th className="px-3 py-3 font-medium">Fecha</th>
                <th className="px-3 py-3 font-medium">Puntaje</th>
                <th className="px-3 py-3 font-medium">Interpretación</th>
                <th className="px-3 py-3 font-medium">Estado</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((t) => (
                <tr key={t.id} className="border-b border-line-100 last:border-0 hover:bg-brand-50/50">
                  <td className="px-5 py-3 text-ink-900 font-medium">{t.patient_name}</td>
                  <td className="px-3 py-3 text-ink-700">
                    <div>{t.test_code}</div>
                    <div className="text-[11px] text-ink-500">{t.test_name}</div>
                  </td>
                  <td className="px-3 py-3 text-ink-700 tabular">{t.date}</td>
                  <td className="px-3 py-3 tabular font-serif text-lg text-ink-900">{t.status !== "completado" ? "—" : t.score}</td>
                  <td className="px-3 py-3">
                    {t.status === "completado" ? (
                      <span className={"px-2 py-0.5 rounded-full text-[11px] font-medium " + LEVEL_STYLE[t.level]}>{t.interpretation}</span>
                    ) : (
                      <span className="text-xs text-ink-500">{t.interpretation}</span>
                    )}
                  </td>
                  <td className="px-3 py-3">
                    <span className={"px-2 py-0.5 rounded-full text-[11px] font-medium capitalize " + (STATUS[t.status] ?? "bg-bg-100 text-ink-500")}>
                      {t.status.replace("_", " ")}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="rounded-xl border border-line-200 bg-surface p-5">
        <div className="mb-2">
          <p className="text-[11px] uppercase tracking-[0.1em] text-brand-800 font-medium">Evolución</p>
          <h3 className="font-serif text-lg text-ink-900 mt-1">María Camila · GAD-7</h3>
          <p className="text-xs text-ink-500">Últimas 5 aplicaciones</p>
        </div>
        <div className="flex items-center gap-2 my-3">
          <span className="font-serif text-4xl text-ink-900 tabular">8</span>
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium bg-success-soft text-success">
            <TrendingDown className="h-3 w-3" /> −7 pts
          </span>
        </div>
        <div className="h-48">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={TEST_EVOLUTION}>
              <CartesianGrid stroke="oklch(0.92 0.01 240)" strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="oklch(0.55 0.02 240)" tickLine={false} axisLine={false} />
              <YAxis tick={{ fontSize: 11 }} stroke="oklch(0.55 0.02 240)" tickLine={false} axisLine={false} domain={[0, 21]} />
              <Tooltip
                contentStyle={{ border: "1px solid oklch(0.92 0.01 240)", borderRadius: 8, fontSize: 12 }}
                formatter={(v: unknown) => [`${String(v)} pts`, "Puntaje"]}
              />
              <Line type="monotone" dataKey="score" stroke="oklch(0.53 0.045 200)" strokeWidth={2.5} dot={{ r: 4, fill: "oklch(0.53 0.045 200)" }} activeDot={{ r: 6 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <div className="mt-3 text-xs text-ink-500 flex items-start gap-2">
          <Sparkles className="h-3.5 w-3.5 text-brand-700 mt-0.5 shrink-0" />
          <span>La paciente ha presentado reducción sostenida tras iniciar exposiciones graduales.</span>
        </div>
      </div>
    </div>
  );
}

function ApplyView({ tests, patients, preselect, onClose }: { tests: PsychTest[]; patients: ApiPatient[]; preselect: PsychTest | null; onClose: () => void }) {
  const [test, setTest] = useState<PsychTest | null>(preselect ?? tests[0] ?? null);
  const [patient, setPatient] = useState<string>(patients[0]?.name ?? "");
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<number[]>(Array(PHQ9_ITEMS.length).fill(-1));
  const [done, setDone] = useState(false);

  if (!test) {
    return (
      <div className="flex items-center justify-center py-16 text-sm text-ink-500">
        <Loader2 className="h-4 w-4 animate-spin mr-2" /> Cargando tests…
      </div>
    );
  }

  const usePhq = test.id === "phq9";
  const total = usePhq ? PHQ9_ITEMS.length : test.items;
  const progress = Math.round(((step + (done ? 1 : 0)) / total) * 100);

  const score = answers.reduce((acc, v) => acc + (v >= 0 ? v : 0), 0);
  const interpretation = test.scoring.find((s) => {
    const [min, max] = s.range.replace("≥", "").replace("<", "").split(/[–-]/).map((x) => parseInt(x.trim()));
    if (s.range.startsWith("≥")) return score >= min;
    if (s.range.startsWith("<")) return score < min;
    if (!isNaN(min) && !isNaN(max)) return score >= min && score <= max;
    return false;
  }) ?? test.scoring[0];

  function answer(v: number) {
    const next = [...answers];
    next[step] = v;
    setAnswers(next);
    if (step < total - 1) setStep(step + 1);
    else setDone(true);
  }

  function reset() {
    setAnswers(Array(PHQ9_ITEMS.length).fill(-1));
    setStep(0);
    setDone(false);
  }

  if (done) {
    return (
      <div className="rounded-xl border border-line-200 bg-surface p-8 max-w-3xl">
        <div className="flex items-center gap-3 mb-6">
          <div className="h-12 w-12 rounded-xl bg-success-soft text-success flex items-center justify-center">
            <CheckCircle2 className="h-6 w-6" />
          </div>
          <div>
            <p className="text-xs text-ink-500 uppercase tracking-wider">Aplicación completa</p>
            <h2 className="font-serif text-2xl text-ink-900">{test.name}</h2>
            <p className="text-sm text-ink-500">{patient} · {new Date().toLocaleDateString("es-CO", { day: "2-digit", month: "long", year: "numeric" })}</p>
          </div>
        </div>

        {/* Alerta crítica automática: PHQ-9 ítem 9 (ideación suicida) > 0 dispara protocolo sin importar total */}
        {usePhq && answers[8] > 0 && <Phq9Item9Alert level={answers[8]} patient={patient} />}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div className="rounded-lg border border-line-200 p-4">
            <div className="text-xs text-ink-500 uppercase tracking-wider mb-1">Puntaje total</div>
            <div className="font-serif text-4xl text-ink-900 tabular">{score}<span className="text-lg text-ink-500">/27</span></div>
          </div>
          <div className="rounded-lg border border-line-200 p-4 md:col-span-2">
            <div className="text-xs text-ink-500 uppercase tracking-wider mb-1">Interpretación</div>
            <div className="flex items-center gap-2">
              <span className={"px-3 py-1 rounded-full text-sm font-medium " + LEVEL_STYLE[interpretation.level]}>
                {interpretation.label}
              </span>
              <span className="text-sm text-ink-500">rango {interpretation.range}</span>
            </div>
            {(interpretation.level === "high" || interpretation.level === "critical") && (
              <p className="text-xs text-risk-high mt-2">⚠ Se recomienda evaluación clínica inmediata.</p>
            )}
          </div>
        </div>

        <div className="rounded-lg border border-line-200 p-4 mb-4">
          <h4 className="font-medium text-sm text-ink-900 mb-2">Respuestas por ítem</h4>
          <div className="space-y-1.5">
            {PHQ9_ITEMS.map((item, i) => (
              <div key={i} className="flex items-center justify-between text-xs">
                <span className="text-ink-700 truncate pr-4">{i + 1}. {item}</span>
                <span className="tabular text-ink-500 shrink-0">{PHQ9_OPTIONS[answers[i]]?.label ?? "—"} <span className="font-medium text-ink-900">({answers[i]})</span></span>
              </div>
            ))}
          </div>
        </div>

        <div className="flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 h-10 rounded-md bg-brand-700 text-primary-foreground text-sm font-medium hover:bg-brand-800"
          >
            Guardar en historia clínica
          </button>
          <button onClick={reset} className="h-10 px-4 rounded-md border border-line-200 text-sm text-ink-700 hover:border-brand-400">
            Nueva aplicación
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-line-200 bg-surface p-8 max-w-3xl">
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <p className="text-xs text-ink-500 uppercase tracking-wider">Aplicación interactiva</p>
          <h2 className="font-serif text-2xl text-ink-900 mt-1">{test.name}</h2>
          <p className="text-sm text-ink-500">{test.code} · Paciente: {patient}</p>
        </div>
        <button onClick={onClose} className="h-9 w-9 rounded-md border border-line-200 text-ink-500 hover:border-brand-400 flex items-center justify-center">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="mb-4 grid grid-cols-1 md:grid-cols-2 gap-3">
        <label className="text-xs text-ink-500 uppercase tracking-wider flex flex-col gap-1">
          Test
          <select
            value={test.id}
            onChange={(e) => { const t = tests.find((x) => x.id === e.target.value); if (t) { setTest(t); reset(); } }}
            className="h-10 px-3 rounded-md border border-line-200 bg-surface text-sm text-ink-900 outline-none hover:border-brand-400 normal-case"
          >
            {tests.map((t) => <option key={t.id} value={t.id}>{t.code} · {t.name}</option>)}
          </select>
        </label>
        <label className="text-xs text-ink-500 uppercase tracking-wider flex flex-col gap-1">
          Paciente
          <select
            value={patient}
            onChange={(e) => setPatient(e.target.value)}
            className="h-10 px-3 rounded-md border border-line-200 bg-surface text-sm text-ink-900 outline-none hover:border-brand-400 normal-case"
          >
            {patients.map((p) => <option key={p.id}>{p.name}</option>)}
          </select>
        </label>
      </div>

      <div className="mb-6">
        <div className="flex items-center justify-between text-xs text-ink-500 mb-1.5">
          <span>Pregunta {step + 1} de {total}</span>
          <span className="tabular">{progress}%</span>
        </div>
        <div className="h-1.5 rounded-full bg-bg-100 overflow-hidden">
          <div className="h-full bg-brand-700 transition-all" style={{ width: `${progress}%` }} />
        </div>
      </div>

      {usePhq ? (
        <>
          <div className="mb-6">
            <p className="text-xs text-ink-500 uppercase tracking-wider mb-2">
              En las últimas 2 semanas, ¿con qué frecuencia le ha molestado…
            </p>
            <h3 className="font-serif text-xl text-ink-900 leading-snug">{PHQ9_ITEMS[step]}?</h3>
          </div>
          <div className="space-y-2">
            {PHQ9_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => answer(opt.value)}
                className={
                  "w-full flex items-center justify-between px-4 py-3.5 rounded-lg border text-left transition-colors " +
                  (answers[step] === opt.value ? "border-brand-700 bg-brand-50" : "border-line-200 bg-surface hover:border-brand-400 hover:bg-bg-100/40")
                }
              >
                <span className="text-sm text-ink-900">{opt.label}</span>
                <span className="tabular text-xs text-ink-500">{opt.value} pts</span>
              </button>
            ))}
          </div>
        </>
      ) : (
        <div className="rounded-lg border border-dashed border-line-200 p-8 text-center">
          <Brain className="h-8 w-8 text-ink-400 mx-auto mb-2" />
          <p className="text-sm text-ink-500">La aplicación interactiva de <strong>{test.code}</strong> está disponible como plantilla.</p>
          <p className="text-xs text-ink-400 mt-1">Selecciona PHQ-9 para probar la aplicación completa.</p>
        </div>
      )}

      <div className="mt-6 flex items-center justify-between">
        <button
          onClick={() => setStep(Math.max(0, step - 1))}
          disabled={step === 0}
          className="h-10 px-3 rounded-md border border-line-200 text-sm text-ink-700 hover:border-brand-400 disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center gap-1.5"
        >
          <ArrowLeft className="h-4 w-4" /> Anterior
        </button>
        <span className="text-xs text-ink-400">Puntaje parcial: <span className="tabular text-ink-700 font-medium">{score}</span></span>
        <button
          onClick={() => { if (answers[step] < 0) return; if (step < total - 1) setStep(step + 1); else setDone(true); }}
          className="h-10 px-4 rounded-md bg-brand-700 text-primary-foreground text-sm font-medium hover:bg-brand-800 inline-flex items-center gap-1.5"
        >
          {step === total - 1 ? "Ver resultado" : "Siguiente"} <ArrowRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

/**
 * Alerta clínica crítica cuando el ítem 9 del PHQ-9 (ideación suicida) puntúa > 0.
 * El protocolo obliga a activarla independientemente del puntaje total.
 */
function Phq9Item9Alert({ level, patient }: { level: number; patient: string }) {
  const severity = level >= 2 ? "crítico" : "elevado";
  function openCrisis() {
    window.dispatchEvent(new Event("psm:open-crisis"));
  }
  return (
    <div className="mb-6 rounded-xl border-2 border-risk-high bg-error-soft p-5 shadow-card animate-in fade-in">
      <div className="flex items-start gap-4">
        <div className="h-12 w-12 rounded-xl bg-risk-high text-primary-foreground flex items-center justify-center shrink-0">
          <AlertOctagon className="h-6 w-6" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[11px] uppercase tracking-widest text-risk-high font-semibold">Alerta clínica de seguridad</p>
          <h3 className="font-serif text-xl text-ink-900 mt-0.5">
            Riesgo {severity} · Ideación de daño reportada
          </h3>
          <p className="text-sm text-ink-700 mt-2 leading-relaxed">
            <strong>{patient}</strong> respondió al ítem 9 del PHQ-9
            {" "}
            <strong>"{["", "Varios días", "Más de la mitad de los días", "Casi todos los días"][level]}"</strong>.
            Independientemente del puntaje total, este hallazgo requiere evaluación inmediata del riesgo suicida y
            activación del protocolo de crisis (Resolución 2350 de 2020).
          </p>
          <div className="mt-4 grid grid-cols-2 md:grid-cols-3 gap-2 text-xs">
            <div className="rounded-md bg-surface border border-risk-high/30 px-3 py-2">
              <div className="text-ink-500 uppercase tracking-wider">Línea 106</div>
              <a href="tel:106" className="tabular text-ink-900 font-medium">106 (Bogotá 24/7)</a>
            </div>
            <div className="rounded-md bg-surface border border-risk-high/30 px-3 py-2">
              <div className="text-ink-500 uppercase tracking-wider">Emergencia</div>
              <a href="tel:123" className="tabular text-ink-900 font-medium">123</a>
            </div>
            <div className="rounded-md bg-surface border border-risk-high/30 px-3 py-2">
              <div className="text-ink-500 uppercase tracking-wider">MinSalud</div>
              <a href="tel:192" className="tabular text-ink-900 font-medium">192 · opción 4</a>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              onClick={openCrisis}
              className="h-10 px-4 rounded-md bg-risk-high text-primary-foreground text-sm font-semibold hover:bg-risk-critical inline-flex items-center gap-2"
            >
              <ShieldAlert className="h-4 w-4" /> Activar protocolo de crisis
            </button>
            <a
              href="tel:106"
              className="h-10 px-4 rounded-md border border-risk-high/40 text-sm text-risk-high hover:bg-error-soft/80 inline-flex items-center gap-2"
            >
              <Phone className="h-4 w-4" /> Llamar 106
            </a>
          </div>
          <p className="text-[11px] text-ink-500 mt-3">
            Recuerda documentar en la historia clínica: evaluación del riesgo, plan de seguridad acordado, red de apoyo
            contactada y seguimiento pactado.
          </p>
        </div>
      </div>
    </div>
  );
}
