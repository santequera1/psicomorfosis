import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  Circle, Clock, AlertCircle, CheckCircle2, GripVertical, Check,
  CalendarDays, UserPlus, Plus, Search, X, Mail, ArrowRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { fadeUpSubtle, staggerParent } from "./motion";
import { Calendar as CalendarPicker } from "@/components/ui/calendar";
import { es } from "date-fns/locale";
import { GmailIcon, OutlookIcon, GoogleCalendarIcon, GoogleMeetIcon, WhatsAppIcon } from "./BrandIcons";

/**
 * Réplica interactiva del módulo de Tareas embebida en la landing.
 * Ronda 2 sep 2026: reordenamiento en vivo con "abrir espacio" (misma
 * técnica de la app — midpoints cacheados al iniciar el drag), el
 * checkbox mueve la tarjeta a Hecho, íconos de marca en las tarjetas
 * del flujo, salto de atención en "Agendar la cita", fecha con el
 * calendario de shadcn en Nueva tarea, y tareas-vitrina (DSM-5 y
 * Biblioteca clínica) que abren un modal con el pantallazo real.
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

// Igual que en la app: cuánto se desplazan las cards para abrir espacio.
const DRAG_SHIFT_PX = 88;

type IconsKey = "correo" | "gcal" | "laura";

type DemoTask = {
  id: number;
  col: ColKey;
  prevCol?: ColKey;
  title: string;
  description?: string;
  priority: Priority;
  patient?: string;
  type?: string;
  due?: string;
  who: "LA" | "TÚ";
  done?: boolean;
  attention?: boolean;
  iconsKey?: IconsKey;
  detail?: { heading: string; text: string; img: string };
};

const INITIAL: DemoTask[] = [
  { id: 1, col: "TODO", title: "Agendar la cita", description: "El paciente reserva desde tu enlace público, o tú la creas en segundos.", priority: "URGENT", patient: "Valeria Quintero Mesa", type: "Agenda", due: "Hoy", who: "TÚ", attention: true },
  {
    id: 7, col: "TODO", title: "Agregar diagnóstico DSM-5 / CIE-11",
    description: "Toca esta tarjeta y mira cómo se ve en la app.",
    priority: "MEDIUM", type: "Historia clínica", who: "TÚ",
    detail: {
      heading: "DSM-5 y CIE-11 sin googlear códigos",
      text: "Buscador de códigos integrado a la historia clínica: agregas el diagnóstico principal y los comórbidos en segundos, con el código correcto siempre.",
      img: "/landing/diagnostico-dsm5.png",
    },
  },
  { id: 3, col: "IN_PROGRESS", title: "Enviar confirmación por correo", description: "La app la manda sola: con el evento listo para añadir al calendario, y copia para ti.", priority: "HIGH", type: "Automático", due: "Hoy", who: "LA", iconsKey: "correo" },
  {
    id: 9, col: "IN_PROGRESS", title: "Revisar cómo va la consulta",
    description: "Toca esta tarjeta y mira el módulo de reportes.",
    priority: "MEDIUM", type: "Reportes", who: "TÚ",
    detail: {
      heading: "Saber cómo va tu consulta sin abrir Excel",
      text: "Sesiones, ingresos, retención, no-shows y riesgo activo — calculado automático, con filtros por periodo (semana, mes, mes anterior, personalizado).",
      img: "/landing/reportes.png",
    },
  },
  { id: 5, col: "REVIEW", title: "Crear evento en Calendar + Meet", description: "Queda en tu Google Calendar y, si la sesión es virtual, con la reunión de Meet creada.", priority: "MEDIUM", type: "Automático", due: "Hoy", who: "LA", iconsKey: "gcal" },
  {
    id: 8, col: "REVIEW", title: "Organizar la biblioteca clínica",
    description: "Toca esta tarjeta y mira el módulo de documentos.",
    priority: "LOW", type: "Documentos", who: "TÚ",
    detail: {
      heading: "Documentos organizados por paciente",
      text: "Vista por paciente con totales, pendientes de firma, firmados y borradores — y tus plantillas listas a la mano para reutilizar.",
      img: "/landing/carpeta-documentos.png",
    },
  },
  { id: 6, col: "DONE", title: "Laura avisa por WhatsApp", description: "Confirmación y recordatorio al paciente — y aviso para ti.", priority: "LOW", type: "Automático", due: "Hoy", who: "LA", done: true, iconsKey: "laura" },
];

function TaskIcons({ iconsKey }: { iconsKey: IconsKey }) {
  const chip = "h-5 w-5 rounded bg-bg-50 border border-line-100 grid place-content-center shrink-0";
  if (iconsKey === "correo") {
    return (
      <div className="flex items-center gap-1 mb-2" aria-hidden>
        <span className={chip}><GmailIcon className="h-3 w-3 text-[#EA4335]" /></span>
        <span className={chip}><OutlookIcon className="h-3 w-3 text-[#0F6CBD]" /></span>
        <span className={chip}><Mail className="h-3 w-3 text-ink-500" /></span>
      </div>
    );
  }
  if (iconsKey === "gcal") {
    return (
      <div className="flex items-center gap-1 mb-2" aria-hidden>
        <span className={chip}><GoogleCalendarIcon className="h-3 w-3 text-[#4285F4]" /></span>
        <span className={chip}><GoogleMeetIcon className="h-3 w-3 text-[#00832d]" /></span>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-1 mb-2" aria-hidden>
      <span className="h-5 w-5 rounded-full overflow-hidden border border-line-100 bg-brand-50 shrink-0">
        <img src="/laura/laura-profile-2.svg" alt="" className="h-full w-full object-cover" />
      </span>
      <span className="h-5 w-5 rounded-full bg-[#25D366] text-white grid place-content-center shrink-0">
        <WhatsAppIcon className="h-3 w-3" />
      </span>
    </div>
  );
}

export function TareasShowcase() {
  const [tasks, setTasks] = useState<DemoTask[]>(INITIAL);
  const [query, setQuery] = useState("");
  const [dragId, setDragId] = useState<number | null>(null);
  const [over, setOver] = useState<{ col: ColKey; gap: number } | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [detail, setDetail] = useState<DemoTask["detail"] | null>(null);
  // Midpoints por columna, cacheados al INICIAR el drag (como en la app:
  // si se recalculan en vivo, las cards desplazadas mueven los midpoints
  // y se arma un loop de retroalimentación).
  const midCache = useRef<Record<string, number[]>>({});

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return tasks;
    return tasks.filter((t) => t.title.toLowerCase().includes(q) || (t.patient ?? "").toLowerCase().includes(q));
  }, [tasks, query]);

  function startDrag(id: number) {
    setDragId(id);
    requestAnimationFrame(() => {
      const cache: Record<string, number[]> = {};
      document.querySelectorAll<HTMLElement>("[data-show-col]").forEach((colEl) => {
        const key = colEl.getAttribute("data-show-col")!;
        const mids: number[] = [];
        colEl.querySelectorAll<HTMLElement>("[data-show-card]").forEach((c) => {
          if (Number(c.getAttribute("data-show-card")) === id) return;
          const r = c.getBoundingClientRect();
          mids.push(r.top + r.height / 2 + window.scrollY);
        });
        cache[key] = mids;
      });
      midCache.current = cache;
    });
  }

  function endDrag() {
    setDragId(null);
    setOver(null);
  }

  // Red de seguridad: si el drag termina fuera de cualquier columna (o el
  // navegador se come el dragend), limpiamos igual para que la card
  // colapsada reaparezca.
  useEffect(() => {
    if (dragId == null) return;
    const clear = () => endDrag();
    window.addEventListener("dragend", clear);
    window.addEventListener("drop", clear);
    return () => {
      window.removeEventListener("dragend", clear);
      window.removeEventListener("drop", clear);
    };
  }, [dragId]);

  function onColDragOver(e: React.DragEvent, colKey: ColKey) {
    e.preventDefault();
    const mids = midCache.current[colKey] ?? [];
    const y = e.clientY + window.scrollY;
    let gap = mids.length;
    for (let i = 0; i < mids.length; i++) {
      if (y < mids[i]) { gap = i; break; }
    }
    setOver((prev) => (prev && prev.col === colKey && prev.gap === gap ? prev : { col: colKey, gap }));
  }

  function dropInto(colKey: ColKey, gap: number) {
    if (dragId == null) return;
    setTasks((prev) => {
      const dragged = prev.find((t) => t.id === dragId);
      if (!dragged) return prev;
      const rest = prev.filter((t) => t.id !== dragId);
      const updated: DemoTask = { ...dragged, col: colKey, done: colKey === "DONE" ? true : dragged.done && colKey === "DONE" };
      const colTasks = rest.filter((t) => t.col === colKey);
      const insertBefore = colTasks[gap];
      const arr = [...rest];
      if (insertBefore) {
        arr.splice(arr.indexOf(insertBefore), 0, updated);
      } else {
        const lastIdx = arr.reduce((acc, t, i) => (t.col === colKey ? i : acc), -1);
        arr.splice(lastIdx + 1, 0, updated);
      }
      return arr;
    });
    endDrag();
  }

  // Checkbox: marcar hecha la MUEVE a "Hecho" (como en la app);
  // desmarcarla la devuelve a su columna anterior.
  function toggleDone(id: number) {
    setTasks((prev) => prev.map((t) => {
      if (t.id !== id) return t;
      if (!t.done) return { ...t, done: true, prevCol: t.col, col: "DONE" };
      return { ...t, done: false, col: t.prevCol ?? "TODO", prevCol: undefined };
    }));
  }

  function addTask(t: { col: ColKey; title: string; description?: string; priority: Priority; due?: string }) {
    setTasks((prev) => [...prev, { ...t, id: Math.max(...prev.map((x) => x.id)) + 1, who: "TÚ" }]);
  }

  return (
    <section id="flujo" className="pt-6 pb-14 sm:pt-8 sm:pb-24 relative">
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

        <motion.div
          initial={{ opacity: 0, y: 30, filter: "blur(10px)" }}
          whileInView={{ opacity: 1, y: 0, filter: "blur(0px)" }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ duration: 0.9 }}
          className="rounded-2xl border border-line-200 bg-surface shadow-2xl shadow-brand-700/10 overflow-hidden"
        >
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

          <div className="px-4 sm:px-6 pb-6 flex gap-3 overflow-x-auto sm:grid sm:grid-cols-4 sm:overflow-visible [scrollbar-width:thin]">
            {COLUMNS.map((col) => {
              const colTasks = visible.filter((t) => t.col === col.key);
              const Icon = col.icon;
              const isOverThis = over?.col === col.key && dragId != null;
              return (
                <div
                  key={col.key}
                  data-show-col={col.key}
                  onDragOver={(e) => onColDragOver(e, col.key)}
                  onDrop={(e) => { e.preventDefault(); if (over?.col === col.key) dropInto(col.key, over.gap); else endDrag(); }}
                  className={cn(
                    "w-70 sm:w-auto shrink-0 flex flex-col rounded-xl bg-bg border border-line-200 p-3 min-h-75 transition-colors",
                    isOverThis && "border-brand-400",
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
                      isOverThis ? (
                        <div
                          aria-hidden
                          className="rounded-lg border-2 border-dashed border-brand-400/40 bg-brand-50/20 transition-all duration-200"
                          style={{ height: DRAG_SHIFT_PX - 8 }}
                        />
                      ) : (
                        <div className="text-xs text-ink-400 px-2 py-6 text-center border border-dashed border-line-200 rounded-lg">
                          Sin tareas
                        </div>
                      )
                    ) : (
                      (() => {
                        const draggedIdxInCol = dragId != null ? colTasks.findIndex((x) => x.id === dragId) : -1;
                        return colTasks.map((t, idx) => {
                          const isBeingDragged = dragId === t.id;
                          const visualIdx = isBeingDragged
                            ? -1
                            : (draggedIdxInCol >= 0 && draggedIdxInCol < idx ? idx - 1 : idx);
                          const shouldShift = !isBeingDragged && isOverThis && over != null && visualIdx >= over.gap;
                          const cardStyle: React.CSSProperties = {
                            transition: "transform 220ms ease-out, max-height 220ms ease-out, opacity 150ms ease-out, margin 220ms ease-out",
                            ...(isBeingDragged
                              ? { maxHeight: 0, opacity: 0, marginTop: 0, marginBottom: 0, overflow: "hidden" }
                              : shouldShift
                              ? { transform: `translateY(${DRAG_SHIFT_PX}px)` }
                              : {}),
                          };
                          return (
                            <ShowcaseCard
                              key={t.id}
                              task={t}
                              dragging={isBeingDragged}
                              style={cardStyle}
                              onDragStart={() => startDrag(t.id)}
                              onDragEnd={endDrag}
                              onToggleDone={() => toggleDone(t.id)}
                              onOpenDetail={t.detail ? () => setDetail(t.detail) : undefined}
                            />
                          );
                        });
                      })()
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
      {detail && <DetailModal detail={detail} onClose={() => setDetail(null)} />}
    </section>
  );
}

function ShowcaseCard({ task, dragging, style, onDragStart, onDragEnd, onToggleDone, onOpenDetail }: {
  task: DemoTask;
  dragging: boolean;
  style?: React.CSSProperties;
  onDragStart: () => void;
  onDragEnd: () => void;
  onToggleDone: () => void;
  onOpenDetail?: () => void;
}) {
  const isDone = Boolean(task.done);

  const card = (
    <div
      data-show-card={task.id}
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onClick={onOpenDetail}
      style={style}
      className={cn(
        "group rounded-lg bg-surface border border-line-200 p-3 cursor-grab active:cursor-grabbing",
        "transform-gpu transition-all duration-200 ease-out",
        "hover:border-brand-400 hover:shadow-card hover:-translate-y-0.5 hover:-rotate-[1.5deg]",
        "active:rotate-0 active:translate-y-0 active:duration-75",
        dragging && "opacity-50 ring-2 ring-brand-400 rotate-0",
        onOpenDetail && "cursor-pointer",
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
      {task.iconsKey && <TaskIcons iconsKey={task.iconsKey} />}
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
            <img src="/laura/laura-profile-2.svg" alt="Laura" title="Laura lo hace por ti" className="h-6 w-6 rounded-full bg-brand-50 object-cover" />
          ) : (
            <span className="h-6 w-6 rounded-full bg-brand-50 text-brand-700 text-[10px] font-semibold flex items-center justify-center" title="Tú">
              TÚ
            </span>
          )}
        </div>
      </div>
    </div>
  );

  // Mini salto periódico para llamar la atención hacia "Agendar la cita".
  // OJO: el wrapper existe SIEMPRE que la tarea sea attention — si el
  // wrapper aparece/desaparece según `dragging`, React remonta el nodo en
  // pleno drag HTML5, el dragend se pierde y la card queda colapsada
  // (el bug de "la tarjeta desaparece", 2 sep 2026).
  if (task.attention) {
    const jumping = !isDone && !dragging;
    return (
      <motion.div
        animate={jumping ? { y: [0, -6, 0] } : { y: 0 }}
        transition={jumping
          ? { duration: 0.5, ease: "easeInOut", repeat: Infinity, repeatDelay: 3 }
          : { duration: 0.2 }}
      >
        {card}
      </motion.div>
    );
  }
  return card;
}

/** Modal "Nueva tarea" — con fecha vía el calendario de shadcn. */
function NewTaskModal({ onClose, onCreate }: {
  onClose: () => void;
  onCreate: (t: { col: ColKey; title: string; description?: string; priority: Priority; due?: string }) => void;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<Priority>("MEDIUM");
  const [col, setCol] = useState<ColKey>("TODO");
  const [date, setDate] = useState<Date | undefined>(undefined);
  const [pickerOpen, setPickerOpen] = useState(false);

  const dueLabel = date
    ? date.toLocaleDateString("es-CO", { day: "numeric", month: "short" })
    : null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-ink-900/50 backdrop-blur-sm p-0 sm:p-4" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full sm:max-w-md bg-surface rounded-t-2xl sm:rounded-2xl border border-line-200 shadow-soft-lg overflow-y-auto max-h-[92svh]"
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
          <div>
            <span className="text-xs font-medium text-ink-700">Fecha límite (opcional)</span>
            <button
              type="button"
              onClick={() => setPickerOpen((v) => !v)}
              className="mt-1.5 w-full h-10 px-3 rounded-lg border border-line-200 bg-bg text-sm text-left outline-none focus:border-brand-400 inline-flex items-center gap-2"
            >
              <CalendarDays className="h-4 w-4 text-ink-400" />
              <span className={dueLabel ? "text-ink-900" : "text-ink-400"}>
                {dueLabel ?? "Elegir fecha"}
              </span>
            </button>
            {pickerOpen && (
              <div className="mt-2 rounded-xl border border-line-200 bg-surface flex justify-center py-1">
                <CalendarPicker
                  mode="single"
                  locale={es}
                  selected={date}
                  onSelect={(d) => { setDate(d ?? undefined); setPickerOpen(false); }}
                />
              </div>
            )}
          </div>
        </div>
        <footer className="px-5 py-4 border-t border-line-100 flex items-center justify-end gap-2">
          <button onClick={onClose} className="h-10 px-4 rounded-lg border border-line-200 text-sm text-ink-700 hover:border-brand-400">
            Cancelar
          </button>
          <button
            onClick={() => { if (title.trim()) onCreate({ col, title: title.trim(), description: description.trim() || undefined, priority, due: dueLabel ?? undefined }); }}
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

/** Modal con el pantallazo real de una sección (DSM-5, biblioteca…). */
function DetailModal({ detail, onClose }: {
  detail: NonNullable<DemoTask["detail"]>;
  onClose: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.25 }}
      onClick={onClose}
      className="fixed inset-0 z-50 bg-ink-900/70 backdrop-blur-md flex items-center justify-center p-4 sm:p-8"
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.9, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 260, damping: 26 }}
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-3xl bg-surface rounded-2xl border border-line-200 shadow-2xl overflow-hidden"
      >
        <img src={detail.img} alt={detail.heading} className="w-full h-auto border-b border-line-100 bg-white" />
        <div className="p-5 sm:p-6">
          <h3 className="font-serif text-xl sm:text-2xl text-ink-900">{detail.heading}</h3>
          <p className="mt-2 text-sm text-ink-500 leading-relaxed">{detail.text}</p>
          <a
            href="#demo"
            onClick={onClose}
            className="mt-4 inline-flex items-center gap-2 h-10 px-4 rounded-lg bg-brand-700 text-white text-sm font-medium hover:bg-brand-800"
          >
            Verlo en la app <ArrowRight className="h-4 w-4" />
          </a>
        </div>
        <button
          onClick={onClose}
          aria-label="Cerrar"
          className="absolute top-3 right-3 h-9 w-9 rounded-full bg-surface/90 border border-line-200 text-ink-700 shadow flex items-center justify-center hover:bg-bg-50"
        >
          <X className="h-4 w-4" />
        </button>
      </motion.div>
    </motion.div>
  );
}
