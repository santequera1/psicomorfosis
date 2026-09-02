import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  Circle, Clock, AlertCircle, CheckCircle2, GripVertical, Check,
  CalendarDays, UserPlus, Plus, Search, X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { fadeUpSubtle, staggerParent } from "./motion";

/**
 * Réplica interactiva del módulo de Tareas, embebida en la landing
 * (pedido 2 sep 2026): reemplaza al timeline de "Así fluye una cita".
 * Los 4 pasos del flujo de una cita viven como tarjetas reales — una
 * por columna — y el visitante puede arrastrarlas, marcarlas hechas y
 * crear tareas nuevas con el mismo modal de la app. Todo client-side:
 * es una demo fiel, no un mock estático.
 *
 * Clases copiadas 1:1 de src/routes/tareas.tsx (KanbanColumn/TareaCard)
 * para que sea una representación honesta de la app.
 */

type Priority = "LOW" | "MEDIUM" | "HIGH" | "URGENT";
type ColKey = "TODO" | "IN_PROGRESS" | "REVIEW" | "DONE";

const PRIORITY_LABEL: Record<Priority, string> = {
  LOW: "Baja", MEDIUM: "Media", HIGH: "Alta", URGENT: "Urgente",
};
const PRIORITY_CLASS: Record<Priority, string> = {
  LOW: "bg-sage-500/15 text-sage-700",
  MEDIUM: "bg-brand-50 text-brand-700",
  HIGH: "bg-amber-500/12 text-amber-700",
  URGENT: "bg-rose-500/12 text-rose-700",
};

const COLUMNS: { key: ColKey; name: string; icon: typeof Circle; color: string }[] = [
  { key: "TODO", name: "Por hacer", icon: Circle, color: "var(--ink-400)" },
  { key: "IN_PROGRESS", name: "En progreso", icon: Clock, color: "var(--brand-700)" },
  { key: "REVIEW", name: "En revisión", icon: AlertCircle, color: "var(--warning)" },
  { key: "DONE", name: "Hecho", icon: CheckCircle2, color: "var(--success)" },
];

type DemoTask = {
  id: number;
  col: ColKey;
  title: string;
  description?: string;
  priority: Priority;
  patient?: string;
  type?: string;
  due?: string;
  who: "LA" | "TÚ";
  done?: boolean;
};

// Los 4 pasos del flujo como tarjetas (una por columna) + relleno demo.
const INITIAL: DemoTask[] = [
  { id: 1, col: "TODO", title: "Agendar la cita", description: "El paciente reserva desde tu enlace público, o tú la creas en segundos.", priority: "URGENT", patient: "Valeria Quintero Mesa", type: "Agenda", due: "Hoy", who: "TÚ" },
  { id: 2, col: "TODO", title: "Revisar tamizaje pendiente", description: "[demo] Tarea de demostración.", priority: "MEDIUM", patient: "Mariana Ospina Cárdenas", type: "Sesión clínica", due: "27 de sep", who: "TÚ" },
  { id: 3, col: "IN_PROGRESS", title: "Enviar confirmación por correo", description: "La app la manda sola: con el evento listo para añadir al calendario, y copia para ti.", priority: "HIGH", type: "Automático", due: "Hoy", who: "LA" },
  { id: 4, col: "IN_PROGRESS", title: "Actualizar consentimientos", description: "[demo] Tarea de demostración.", priority: "MEDIUM", type: "Administrativo", due: "30 de sep", who: "TÚ" },
  { id: 5, col: "REVIEW", title: "Crear evento en Calendar + Meet", description: "Queda en tu Google Calendar y, si la sesión es virtual, con la reunión de Meet creada.", priority: "MEDIUM", type: "Automático", due: "Hoy", who: "LA" },
  { id: 6, col: "DONE", title: "Laura avisa por WhatsApp", description: "Confirmación y recordatorio al paciente — y aviso para ti.", priority: "LOW", type: "Automático", due: "Hoy", who: "LA", done: true },
];

export function TareasShowcase() {
  const [tasks, setTasks] = useState<DemoTask[]>(INITIAL);
  const [query, setQuery] = useState("");
  const [dragId, setDragId] = useState<number | null>(null);
  const [overCol, setOverCol] = useState<ColKey | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return tasks;
    return tasks.filter((t) => t.title.toLowerCase().includes(q) || (t.patient ?? "").toLowerCase().includes(q));
  }, [tasks, query]);

  function moveTo(id: number, col: ColKey) {
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, col, done: col === "DONE" ? true : t.done && col === "DONE" } : t)));
  }

  function toggleDone(id: number) {
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, done: !t.done } : t)));
  }

  function addTask(t: Omit<DemoTask, "id" | "who">) {
    setTasks((prev) => [...prev, { ...t, id: Math.max(...prev.map((x) => x.id)) + 1, who: "TÚ" }]);
  }

  return (
    <section id="flujo" className="py-14 sm:py-24 relative">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div
          variants={staggerParent}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, amount: 0.4 }}
          className="text-center max-w-2xl mx-auto mb-10"
        >
          <motion.p variants={fadeUpSubtle} className="text-xs uppercase tracking-widest text-brand-700 font-semibold">
            Así fluye una cita
          </motion.p>
          <motion.h2 variants={fadeUpSubtle} className="mt-2 font-serif text-3xl sm:text-5xl text-ink-900 tracking-tight text-balance">
            Agendas una vez. Todo lo demás pasa solo.
          </motion.h2>
          <motion.p variants={fadeUpSubtle} className="mt-3 text-sm sm:text-base text-ink-500">
            Y esto no es una imagen: es el módulo de Tareas de la app, de verdad.
            Arrastra las tarjetas, márcalas hechas o crea una nueva.
          </motion.p>
        </motion.div>

        {/* Marco tipo "ventana de la app": el tablero real, sin sidebar. */}
        <motion.div
          initial={{ opacity: 0, y: 30, filter: "blur(10px)" }}
          whileInView={{ opacity: 1, y: 0, filter: "blur(0px)" }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ duration: 0.9 }}
          className="rounded-2xl border border-line-200 bg-surface shadow-2xl shadow-brand-700/10 overflow-hidden"
        >
          {/* Cabecera del módulo — como en la app */}
          <div className="px-4 sm:px-6 pt-5 pb-4 flex items-end justify-between gap-3 flex-wrap">
            <div>
              <p className="text-[10px] uppercase tracking-widest text-brand-700 font-semibold">Mi organización</p>
              <h3 className="font-serif text-2xl text-ink-900 leading-tight">Tareas</h3>
              <p className="text-xs text-ink-500">{tasks.length} tareas</p>
            </div>
            <button
              onClick={() => setModalOpen(true)}
              className="h-10 px-4 rounded-lg bg-brand-700 text-white text-sm font-medium hover:bg-brand-800 inline-flex items-center gap-2"
            >
              <Plus className="h-4 w-4" /> Nueva tarea
            </button>
          </div>

          {/* Barra de búsqueda/filtros — la búsqueda funciona de verdad */}
          <div className="px-4 sm:px-6 pb-4">
            <div className="rounded-xl border border-line-200 bg-bg-50/60 p-2.5 space-y-2">
              <div className="flex items-center gap-2 h-9 px-3 rounded-lg border border-line-200 bg-surface">
                <Search className="h-4 w-4 text-ink-400 shrink-0" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Buscar tareas…"
                  className="flex-1 bg-transparent text-sm text-ink-900 placeholder:text-ink-400 outline-none min-w-0"
                />
                {query && (
                  <button onClick={() => setQuery("")} className="text-ink-400 hover:text-ink-700" aria-label="Limpiar búsqueda">
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
              <div className="flex items-center gap-1.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {["Todas", "Hoy", "Esta semana", "Vencidas"].map((f, i) => (
                  <span key={f} className={cn(
                    "shrink-0 h-7 px-3 rounded-full text-xs font-medium inline-flex items-center",
                    i === 0 ? "bg-brand-700 text-white" : "bg-surface border border-line-200 text-ink-600",
                  )}>
                    {f}
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* Tablero: 4 columnas (scroll horizontal en móvil, como en la app) */}
          <div className="px-4 sm:px-6 pb-6 flex gap-3 overflow-x-auto sm:grid sm:grid-cols-4 sm:overflow-visible [scrollbar-width:thin]">
            {COLUMNS.map((col) => {
              const colTasks = visible.filter((t) => t.col === col.key);
              const Icon = col.icon;
              return (
                <div
                  key={col.key}
                  onDragOver={(e) => { e.preventDefault(); setOverCol(col.key); }}
                  onDragLeave={() => setOverCol((c) => (c === col.key ? null : c))}
                  onDrop={(e) => {
                    e.preventDefault();
                    if (dragId != null) moveTo(dragId, col.key);
                    setDragId(null);
                    setOverCol(null);
                  }}
                  className={cn(
                    "w-70 sm:w-auto shrink-0 flex flex-col rounded-xl bg-bg border border-line-200 p-3 min-h-75 transition-colors",
                    overCol === col.key && dragId != null && "border-brand-400 bg-brand-50/20",
                  )}
                >
                  <div className="flex items-center justify-between mb-3 px-1">
                    <div className="flex items-center gap-2">
                      <Icon className="h-4 w-4" style={{ color: col.color }} />
                      <h4 className="text-sm font-medium text-ink-900">{col.name}</h4>
                      <span className="text-xs text-ink-500">{colTasks.length}</span>
                    </div>
                  </div>
                  <div className="flex-1 flex flex-col gap-2">
                    {colTasks.length === 0 ? (
                      <div className="text-xs text-ink-400 px-2 py-6 text-center border border-dashed border-line-200 rounded-lg">
                        {dragId != null ? "Suéltala aquí" : "Sin tareas"}
                      </div>
                    ) : (
                      colTasks.map((t) => (
                        <ShowcaseCard
                          key={t.id}
                          task={t}
                          dragging={dragId === t.id}
                          onDragStart={() => setDragId(t.id)}
                          onDragEnd={() => { setDragId(null); setOverCol(null); }}
                          onToggleDone={() => toggleDone(t.id)}
                        />
                      ))
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </motion.div>

        <p className="mt-4 text-center text-xs text-ink-400">
          Los pasos automáticos (correo, Calendar + Meet, WhatsApp) los hace la app — por eso el avatar de esas tarjetas es de Laura.
        </p>
      </div>

      {modalOpen && <NewTaskModal onClose={() => setModalOpen(false)} onCreate={(t) => { addTask(t); setModalOpen(false); }} />}
    </section>
  );
}

function ShowcaseCard({ task, dragging, onDragStart, onDragEnd, onToggleDone }: {
  task: DemoTask;
  dragging: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
  onToggleDone: () => void;
}) {
  const isDone = Boolean(task.done);
  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      className={cn(
        "group rounded-lg bg-surface border border-line-200 p-3 cursor-grab active:cursor-grabbing",
        "transform-gpu transition-all duration-200 ease-out",
        "hover:border-brand-400 hover:shadow-card hover:-translate-y-0.5 hover:-rotate-[1.5deg]",
        "active:rotate-0 active:translate-y-0 active:duration-75",
        dragging && "opacity-50 ring-2 ring-brand-400 rotate-0",
      )}
    >
      <div className="flex items-start gap-2 mb-2">
        <span className="text-ink-300 group-hover:text-ink-500 transition-colors shrink-0 mt-0.5 cursor-grab" aria-hidden>
          <GripVertical className="h-4 w-4" />
        </span>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onToggleDone(); }}
          aria-label={isDone ? "Desmarcar tarea" : "Marcar tarea como hecha"}
          className={cn(
            "h-5 w-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors mt-0.5",
            isDone ? "border-success bg-success text-white" : "border-line-200 hover:border-brand-700 hover:bg-brand-50",
          )}
        >
          {isDone && <Check className="h-3 w-3" strokeWidth={3} />}
        </button>
        <h5 className={cn(
          "text-sm font-medium leading-snug line-clamp-2 flex-1",
          isDone ? "text-ink-500 line-through" : "text-ink-900",
        )}>
          {task.title}
        </h5>
        <span className={cn("shrink-0 text-[10px] font-medium px-1.5 py-0.5 rounded uppercase tracking-wide", PRIORITY_CLASS[task.priority])}>
          {PRIORITY_LABEL[task.priority]}
        </span>
      </div>
      {task.description && (
        <p className="text-xs text-ink-500 line-clamp-2 mb-2">{task.description}</p>
      )}
      {task.patient && (
        <div className="mb-2">
          <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full bg-brand-50 text-brand-800 border border-brand-100 truncate max-w-full">
            <UserPlus className="h-3 w-3 shrink-0" /> <span className="truncate">{task.patient}</span>
          </span>
        </div>
      )}
      <div className="flex items-center justify-between gap-2 mt-2">
        <div className="flex items-center gap-1.5 flex-wrap min-w-0">
          {task.type && <span className="text-[10px] text-ink-500 truncate">{task.type}</span>}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {task.due && (
            <span className="text-[10px] inline-flex items-center gap-1 text-ink-500">
              <CalendarDays className="h-3 w-3" /> {task.due}
            </span>
          )}
          {task.who === "LA" ? (
            <img
              src="/laura/laura-profile-2.svg"
              alt="Laura"
              title="Laura lo hace por ti"
              className="h-6 w-6 rounded-full bg-brand-50 object-cover"
            />
          ) : (
            <span className="h-6 w-6 rounded-full bg-brand-50 text-brand-700 text-[10px] font-semibold flex items-center justify-center" title="Tú">
              TÚ
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

/** Modal "Nueva tarea" — versión compacta del de la app, client-side. */
function NewTaskModal({ onClose, onCreate }: {
  onClose: () => void;
  onCreate: (t: { col: ColKey; title: string; description?: string; priority: Priority; due?: string }) => void;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<Priority>("MEDIUM");
  const [col, setCol] = useState<ColKey>("TODO");

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-ink-900/50 backdrop-blur-sm p-0 sm:p-4" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full sm:max-w-md bg-surface rounded-t-2xl sm:rounded-2xl border border-line-200 shadow-soft-lg overflow-hidden"
      >
        <header className="px-5 py-4 border-b border-line-100 flex items-center justify-between">
          <h3 className="font-serif text-lg text-ink-900">Nueva tarea</h3>
          <button onClick={onClose} className="h-8 w-8 rounded-md hover:bg-bg-100 flex items-center justify-center text-ink-500" aria-label="Cerrar">
            <X className="h-4 w-4" />
          </button>
        </header>
        <div className="p-5 space-y-4">
          <label className="block">
            <span className="text-xs font-medium text-ink-700">Título</span>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="p. ej. Preparar informe de Valeria"
              autoFocus
              className="mt-1.5 w-full h-10 px-3 rounded-lg border border-line-200 bg-bg text-sm text-ink-900 outline-none focus:border-brand-400"
            />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-ink-700">Descripción (opcional)</span>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              className="mt-1.5 w-full px-3 py-2.5 rounded-lg border border-line-200 bg-bg text-sm text-ink-900 outline-none focus:border-brand-400 resize-none"
            />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-xs font-medium text-ink-700">Prioridad</span>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as Priority)}
                className="mt-1.5 w-full h-10 px-2.5 rounded-lg border border-line-200 bg-bg text-sm text-ink-900 outline-none focus:border-brand-400"
              >
                <option value="URGENT">Urgente</option>
                <option value="HIGH">Alta</option>
                <option value="MEDIUM">Media</option>
                <option value="LOW">Baja</option>
              </select>
            </label>
            <label className="block">
              <span className="text-xs font-medium text-ink-700">Columna</span>
              <select
                value={col}
                onChange={(e) => setCol(e.target.value as ColKey)}
                className="mt-1.5 w-full h-10 px-2.5 rounded-lg border border-line-200 bg-bg text-sm text-ink-900 outline-none focus:border-brand-400"
              >
                {COLUMNS.map((c) => <option key={c.key} value={c.key}>{c.name}</option>)}
              </select>
            </label>
          </div>
        </div>
        <footer className="px-5 py-4 border-t border-line-100 flex items-center justify-end gap-2">
          <button onClick={onClose} className="h-10 px-4 rounded-lg border border-line-200 text-sm text-ink-700 hover:border-brand-400">
            Cancelar
          </button>
          <button
            onClick={() => { if (title.trim()) onCreate({ col, title: title.trim(), description: description.trim() || undefined, priority, due: "Hoy" }); }}
            disabled={!title.trim()}
            className="h-10 px-4 rounded-lg bg-brand-700 text-white text-sm font-medium hover:bg-brand-800 disabled:opacity-50"
          >
            Crear tarea
          </button>
        </footer>
      </div>
    </div>
  );
}
