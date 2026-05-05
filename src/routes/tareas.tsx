import { createFileRoute, useSearch } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Plus, Search, Filter, Circle, Clock, AlertCircle, CheckCircle2,
  CalendarDays, Flag, User, Pencil, Trash2, Archive, Copy, X, UserPlus, Users,
} from "lucide-react";
import { AppShell } from "@/components/app/AppShell";
import {
  api, type Tarea, type TareaStatus, type TareaPriority,
  type TareaProject, type TareaColumn, type Professional, type ApiPatient,
  TAREA_TYPES, type TareaType, type TareaVisibility,
} from "@/lib/api";
import { useWorkspace } from "@/lib/workspace";
import { cn } from "@/lib/utils";

type TareasSearch = { patient?: string };
export const Route = createFileRoute("/tareas")({
  head: () => ({ meta: [{ title: "Tareas — Psicomorfosis" }] }),
  validateSearch: (s: Record<string, unknown>): TareasSearch => ({
    patient: typeof s.patient === "string" ? s.patient : undefined,
  }),
  component: TareasPage,
});

const PRIORITY_LABEL: Record<TareaPriority, string> = {
  LOW: "Baja", MEDIUM: "Media", HIGH: "Alta", URGENT: "Urgente",
};

const PRIORITY_CLASS: Record<TareaPriority, string> = {
  LOW: "bg-sage-500/15 text-sage-700",
  MEDIUM: "bg-brand-50 text-brand-700",
  HIGH: "bg-amber-500/12 text-amber-700",
  URGENT: "bg-rose-500/12 text-rose-700",
};

const COLUMN_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  Circle, Clock, AlertCircle, CheckCircle2,
};

type DateFilter = "all" | "today" | "week" | "overdue";
type ScopeFilter = "all" | "with_patient" | "internal";

function TareasPage() {
  const queryClient = useQueryClient();
  const { data: workspace } = useWorkspace();
  const isOrg = workspace?.mode === "organization";
  const searchParams = useSearch({ from: "/tareas" });

  const { data: tasks = [] } = useQuery({
    queryKey: ["tareas"],
    queryFn: () => api.listTareas(),
  });
  const { data: columns = [] } = useQuery({
    queryKey: ["tarea-columns"],
    queryFn: () => api.listTareaColumns(),
  });
  const { data: projects = [] } = useQuery({
    queryKey: ["tarea-projects"],
    queryFn: () => api.listTareaProjects(),
  });
  const { data: professionals = [] } = useQuery({
    queryKey: ["professionals"],
    queryFn: () => api.listProfessionals(),
  });
  const { data: patients = [] } = useQuery({
    queryKey: ["patients"],
    queryFn: () => api.listPatients(),
  });

  const [search, setSearch] = useState("");
  const [filterPriority, setFilterPriority] = useState<TareaPriority | "all">("all");
  const [filterAssignee, setFilterAssignee] = useState<number | "all">("all");
  const [filterProject, setFilterProject] = useState<number | "all">("all");
  const [filterPatient, setFilterPatient] = useState<string | "all">(searchParams.patient ?? "all");
  const [scopeFilter, setScopeFilter] = useState<ScopeFilter>(searchParams.patient ? "with_patient" : "all");
  const [dateFilter, setDateFilter] = useState<DateFilter>("all");

  const [editing, setEditing] = useState<Tarea | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [draggedId, setDraggedId] = useState<number | null>(null);

  // Filtros
  const filteredTasks = useMemo(() => {
    return tasks.filter((t) => {
      if (search) {
        const q = normalize(search);
        const inTitle = normalize(t.title).includes(q);
        const inDesc = t.description && normalize(t.description).includes(q);
        if (!inTitle && !inDesc) return false;
      }
      if (filterPriority !== "all" && t.priority !== filterPriority) return false;
      if (filterAssignee !== "all" && t.assignee_id !== filterAssignee) return false;
      if (filterProject !== "all" && t.project_id !== filterProject) return false;
      if (filterPatient !== "all" && t.patient_id !== filterPatient) return false;
      if (scopeFilter === "with_patient" && !t.patient_id) return false;
      if (scopeFilter === "internal" && t.patient_id) return false;
      if (dateFilter === "today") return isToday(t.due_date);
      if (dateFilter === "week") return isThisWeek(t.due_date);
      if (dateFilter === "overdue") return isOverdue(t.due_date) && t.status !== "DONE";
      return true;
    });
  }, [tasks, search, filterPriority, filterAssignee, filterProject, filterPatient, scopeFilter, dateFilter]);

  // DnD
  const moveMutation = useMutation({
    mutationFn: ({ id, status, position }: { id: number; status: TareaStatus; position: number }) =>
      api.moveTarea(id, status, position),
    onMutate: async ({ id, status, position }) => {
      await queryClient.cancelQueries({ queryKey: ["tareas"] });
      const prev = queryClient.getQueryData<Tarea[]>(["tareas"]);
      queryClient.setQueryData<Tarea[]>(["tareas"], (old) =>
        old?.map((t) => t.id === id ? { ...t, status, position, completed_at: status === "DONE" ? (t.completed_at ?? new Date().toISOString()) : t.completed_at } : t) ?? []
      );
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(["tareas"], ctx.prev);
      toast.error("No se pudo mover la tarea");
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["tareas"] }),
  });

  const handleDragStart = (e: React.DragEvent, taskId: number) => {
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", String(taskId));
    setDraggedId(taskId);
  };
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  };
  const handleDrop = (e: React.DragEvent, status: TareaStatus) => {
    e.preventDefault();
    const taskId = Number(e.dataTransfer.getData("text/plain"));
    const t = tasks.find((x) => x.id === taskId);
    setDraggedId(null);
    if (!t || t.status === status) return;
    const tasksInColumn = filteredTasks.filter((x) => x.status === status);
    moveMutation.mutate({ id: taskId, status, position: tasksInColumn.length });
  };

  // Acciones rápidas
  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.deleteTarea(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tareas"] });
      toast.success("Tarea enviada a la papelera");
    },
  });
  const archiveMutation = useMutation({
    mutationFn: (id: number) => api.archiveTarea(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tareas"] });
      toast.success("Tarea archivada");
    },
  });
  const duplicateMutation = useMutation({
    mutationFn: (id: number) => api.duplicateTarea(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tareas"] });
      toast.success("Tarea duplicada");
    },
  });

  return (
    <AppShell>
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <header className="flex items-end justify-between mb-5 sm:mb-6 flex-wrap gap-3">
          <div>
            <div className="text-xs uppercase tracking-[0.14em] text-brand-700 font-semibold">
              {isOrg ? "Organización del equipo" : "Mi organización"}
            </div>
            <h1 className="font-serif text-2xl md:text-3xl text-ink-900 mt-1">Tareas</h1>
            <p className="text-sm text-ink-500 mt-1">
              {filteredTasks.length} {filteredTasks.length === 1 ? "tarea" : "tareas"}
              {tasks.length !== filteredTasks.length && ` · ${tasks.length} total`}
            </p>
          </div>
          <button
            onClick={() => { setEditing(null); setDialogOpen(true); }}
            className="h-10 px-4 rounded-lg bg-brand-700 text-white text-sm font-medium hover:bg-brand-700/90 flex items-center gap-2"
          >
            <Plus className="h-4 w-4" /> Nueva tarea
          </button>
        </header>

        {/* Filtros */}
        <div className="rounded-xl bg-surface border border-line-200 shadow-soft p-3 mb-5">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-50">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-ink-400" />
              <input
                type="text"
                placeholder="Buscar tareas…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full h-10 pl-9 pr-3 rounded-lg border border-line-200 bg-bg text-sm text-ink-900 placeholder:text-ink-400 focus:outline-none focus:border-brand-400"
              />
            </div>
            <FilterScroll>
              <FilterChip active={dateFilter === "all"} onClick={() => setDateFilter("all")}>
                Todas
              </FilterChip>
              <FilterChip active={dateFilter === "today"} onClick={() => setDateFilter("today")}>
                <CalendarDays className="h-3.5 w-3.5" /> Hoy
              </FilterChip>
              <FilterChip active={dateFilter === "week"} onClick={() => setDateFilter("week")}>
                Esta semana
              </FilterChip>
              <FilterChip active={dateFilter === "overdue"} onClick={() => setDateFilter("overdue")}>
                <AlertCircle className="h-3.5 w-3.5" /> Vencidas
              </FilterChip>
            </FilterScroll>
          </div>
          <div className="flex flex-wrap items-center gap-2 mt-2">
            <FilterScroll>
              <FilterChip active={scopeFilter === "all"} onClick={() => setScopeFilter("all")}>
                <Filter className="h-3.5 w-3.5" /> Todo
              </FilterChip>
              <FilterChip active={scopeFilter === "with_patient"} onClick={() => setScopeFilter("with_patient")}>
                <UserPlus className="h-3.5 w-3.5" /> Con paciente
              </FilterChip>
              <FilterChip active={scopeFilter === "internal"} onClick={() => setScopeFilter("internal")}>
                <Users className="h-3.5 w-3.5" /> Internas
              </FilterChip>
            </FilterScroll>
          </div>
          <div className="flex flex-wrap items-center gap-2 mt-2">
            <Select
              value={filterPriority}
              onChange={(v) => setFilterPriority(v as TareaPriority | "all")}
              icon={<Flag className="h-3.5 w-3.5" />}
              options={[
                { value: "all", label: "Toda prioridad" },
                { value: "URGENT", label: "Urgente" },
                { value: "HIGH", label: "Alta" },
                { value: "MEDIUM", label: "Media" },
                { value: "LOW", label: "Baja" },
              ]}
            />
            {isOrg && (
              <Select
                value={String(filterAssignee)}
                onChange={(v) => setFilterAssignee(v === "all" ? "all" : Number(v))}
                icon={<User className="h-3.5 w-3.5" />}
                options={[
                  { value: "all", label: "Todo el equipo" },
                  ...professionals.map((p) => ({ value: String(p.id), label: p.name })),
                ]}
              />
            )}
            {projects.length > 0 && (
              <Select
                value={String(filterProject)}
                onChange={(v) => setFilterProject(v === "all" ? "all" : Number(v))}
                icon={<Filter className="h-3.5 w-3.5" />}
                options={[
                  { value: "all", label: "Todos los proyectos" },
                  ...projects.map((p) => ({ value: String(p.id), label: p.name })),
                ]}
              />
            )}
            {patients.length > 0 && (
              <Select
                value={filterPatient}
                onChange={(v) => setFilterPatient(v)}
                icon={<UserPlus className="h-3.5 w-3.5" />}
                options={[
                  { value: "all", label: "Todos los pacientes" },
                  ...patients.map((p) => ({ value: p.id, label: p.preferredName ?? p.name })),
                ]}
              />
            )}
          </div>
        </div>

        {/* Kanban */}
        <div className="overflow-x-auto -mx-3 px-3 sm:mx-0 sm:px-0">
          <div className="flex gap-4 min-w-max sm:min-w-0 sm:grid sm:grid-cols-2 lg:grid-cols-4 pb-2">
            {columns.map((col) => (
              <KanbanColumn
                key={col.id}
                column={col}
                tasks={filteredTasks.filter((t) => t.status === col.status).sort(sortTasks)}
                projects={projects}
                professionals={professionals}
                patients={patients}
                onDragOver={handleDragOver}
                onDrop={(e) => handleDrop(e, col.status)}
                onTaskDragStart={handleDragStart}
                draggedId={draggedId}
                onTaskClick={(t) => { setEditing(t); setDialogOpen(true); }}
                onTaskDelete={(id) => deleteMutation.mutate(id)}
                onTaskArchive={(id) => archiveMutation.mutate(id)}
                onTaskDuplicate={(id) => duplicateMutation.mutate(id)}
              />
            ))}
          </div>
        </div>

        {dialogOpen && (
          <TareaDialog
            task={editing}
            projects={projects}
            professionals={professionals}
            patients={patients}
            isOrg={!!isOrg}
            onClose={() => { setDialogOpen(false); setEditing(null); }}
          />
        )}
      </div>
    </AppShell>
  );
}

// ─── Sub-componentes ────────────────────────────────────────────────────────

function FilterScroll({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
      {children}
    </div>
  );
}

function FilterChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "h-8 px-3 rounded-full text-xs font-medium whitespace-nowrap inline-flex items-center gap-1.5 transition-colors",
        active
          ? "bg-brand-700 text-white"
          : "bg-bg border border-line-200 text-ink-700 hover:border-brand-400"
      )}
    >
      {children}
    </button>
  );
}

function Select({
  value, onChange, options, icon,
}: {
  value: string | number;
  onChange: (v: string) => void;
  options: Array<{ value: string; label: string }>;
  icon?: React.ReactNode;
}) {
  return (
    <div className="relative">
      {icon && <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-400">{icon}</span>}
      <select
        value={String(value)}
        onChange={(e) => onChange(e.target.value)}
        className={cn(
          "h-9 pr-8 rounded-lg border border-line-200 bg-bg text-xs text-ink-700",
          "focus:outline-none focus:border-brand-400 cursor-pointer",
          icon ? "pl-7" : "pl-3"
        )}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  );
}

function KanbanColumn({
  column, tasks, projects, professionals, patients,
  onDragOver, onDrop, onTaskDragStart, draggedId,
  onTaskClick, onTaskDelete, onTaskArchive, onTaskDuplicate,
}: {
  column: TareaColumn;
  tasks: Tarea[];
  projects: TareaProject[];
  professionals: Professional[];
  patients: ApiPatient[];
  onDragOver: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void;
  onTaskDragStart: (e: React.DragEvent, id: number) => void;
  draggedId: number | null;
  onTaskClick: (t: Tarea) => void;
  onTaskDelete: (id: number) => void;
  onTaskArchive: (id: number) => void;
  onTaskDuplicate: (id: number) => void;
}) {
  const Icon = column.icon ? COLUMN_ICONS[column.icon] ?? Circle : Circle;
  return (
    <div
      onDragOver={onDragOver}
      onDrop={onDrop}
      className="w-70 sm:w-auto shrink-0 flex flex-col rounded-xl bg-bg border border-line-200 p-3 min-h-75"
    >
      <div className="flex items-center justify-between mb-3 px-1">
        <div className="flex items-center gap-2">
          <Icon className="h-4 w-4" style={{ color: column.color }} />
          <h2 className="text-sm font-medium text-ink-900">{column.name}</h2>
          <span className="text-xs text-ink-500">{tasks.length}</span>
        </div>
      </div>
      <div className="flex-1 flex flex-col gap-2">
        {tasks.length === 0 ? (
          <div className="text-xs text-ink-400 px-2 py-6 text-center border border-dashed border-line-200 rounded-lg">
            Sin tareas
          </div>
        ) : (
          tasks.map((t) => (
            <TareaCard
              key={t.id}
              task={t}
              project={projects.find((p) => p.id === t.project_id) ?? null}
              assignee={professionals.find((p) => p.id === t.assignee_id) ?? null}
              patient={patients.find((p) => p.id === t.patient_id) ?? null}
              dragging={draggedId === t.id}
              onDragStart={(e) => onTaskDragStart(e, t.id)}
              onClick={() => onTaskClick(t)}
              onDelete={() => onTaskDelete(t.id)}
              onArchive={() => onTaskArchive(t.id)}
              onDuplicate={() => onTaskDuplicate(t.id)}
            />
          ))
        )}
      </div>
    </div>
  );
}

function TareaCard({
  task, project, assignee, patient, dragging,
  onDragStart, onClick, onDelete, onArchive, onDuplicate,
}: {
  task: Tarea;
  project: TareaProject | null;
  assignee: Professional | null;
  patient: ApiPatient | null;
  dragging: boolean;
  onDragStart: (e: React.DragEvent) => void;
  onClick: () => void;
  onDelete: () => void;
  onArchive: () => void;
  onDuplicate: () => void;
}) {
  const overdue = isOverdue(task.due_date) && task.status !== "DONE";
  const initials = (assignee?.name ?? "")
    .split(" ").slice(0, 2).map((n) => n[0]).join("").toUpperCase();
  const patientLabel = patient ? (patient.preferredName ?? patient.name) : null;

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onClick={onClick}
      className={cn(
        "group rounded-lg bg-surface border border-line-200 p-3 cursor-grab active:cursor-grabbing",
        "hover:border-brand-400 hover:shadow-soft transition-all",
        dragging && "opacity-50 ring-2 ring-brand-400"
      )}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <h3 className="text-sm font-medium text-ink-900 leading-snug line-clamp-2 flex-1">
          {task.title}
        </h3>
        <span
          className={cn(
            "shrink-0 text-[10px] font-medium px-1.5 py-0.5 rounded uppercase tracking-wide",
            PRIORITY_CLASS[task.priority]
          )}
        >
          {PRIORITY_LABEL[task.priority]}
        </span>
      </div>
      {task.description && (
        <p className="text-xs text-ink-500 line-clamp-2 mb-2">{task.description}</p>
      )}
      {patientLabel && (
        <div className="mb-2">
          <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full bg-brand-50 text-brand-800 border border-brand-100 truncate max-w-full">
            <UserPlus className="h-3 w-3 shrink-0" /> <span className="truncate">{patientLabel}</span>
          </span>
        </div>
      )}
      <div className="flex items-center justify-between gap-2 mt-2">
        <div className="flex items-center gap-1.5 flex-wrap min-w-0">
          {project && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-bg border border-line-200 text-ink-700 truncate">
              {project.name}
            </span>
          )}
          {task.type && (
            <span className="text-[10px] text-ink-500 truncate">{task.type}</span>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {task.due_date && (
            <span className={cn(
              "text-[10px] inline-flex items-center gap-1",
              overdue ? "text-rose-700 font-medium" : "text-ink-500"
            )}>
              <CalendarDays className="h-3 w-3" /> {formatDate(task.due_date)}
            </span>
          )}
          {assignee && (
            <span
              className="h-6 w-6 rounded-full bg-brand-50 text-brand-700 text-[10px] font-semibold flex items-center justify-center"
              title={assignee.name}
            >
              {initials}
            </span>
          )}
        </div>
      </div>
      {/* Acciones rápidas */}
      <div className="flex items-center gap-1 mt-2 pt-2 border-t border-line-100 opacity-0 group-hover:opacity-100 transition-opacity">
        <CardAction icon={<Pencil className="h-3 w-3" />} onClick={(e) => { e.stopPropagation(); onClick(); }} label="Editar" />
        <CardAction icon={<Copy className="h-3 w-3" />} onClick={(e) => { e.stopPropagation(); onDuplicate(); }} label="Duplicar" />
        <CardAction icon={<Archive className="h-3 w-3" />} onClick={(e) => { e.stopPropagation(); onArchive(); }} label="Archivar" />
        <CardAction icon={<Trash2 className="h-3 w-3" />} onClick={(e) => { e.stopPropagation(); onDelete(); }} label="Borrar" danger />
      </div>
    </div>
  );
}

function CardAction({
  icon, onClick, label, danger,
}: {
  icon: React.ReactNode;
  onClick: (e: React.MouseEvent) => void;
  label: string;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      className={cn(
        "h-6 w-6 rounded inline-flex items-center justify-center text-ink-500",
        danger ? "hover:bg-rose-500/10 hover:text-rose-700" : "hover:bg-bg hover:text-ink-900"
      )}
    >
      {icon}
    </button>
  );
}

// ─── Modal crear/editar ─────────────────────────────────────────────────────

function TareaDialog({
  task, projects, professionals, patients, isOrg, onClose,
}: {
  task: Tarea | null;
  projects: TareaProject[];
  professionals: Professional[];
  patients: ApiPatient[];
  isOrg: boolean;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const isEdit = !!task;

  const [title, setTitle] = useState(task?.title ?? "");
  const [description, setDescription] = useState(task?.description ?? "");
  const [type, setType] = useState<TareaType | "">(task?.type ?? "");
  const [status, setStatus] = useState<TareaStatus>(task?.status ?? "TODO");
  const [priority, setPriority] = useState<TareaPriority>(task?.priority ?? "MEDIUM");
  const [assigneeId, setAssigneeId] = useState<number | "">(task?.assignee_id ?? "");
  const [projectId, setProjectId] = useState<number | "">(task?.project_id ?? "");
  const [patientId, setPatientId] = useState<string | "">(task?.patient_id ?? "");
  const [visibility, setVisibility] = useState<TareaVisibility>(task?.visibility ?? "team");
  const [dueDate, setDueDate] = useState(task?.due_date?.slice(0, 10) ?? "");

  const saveMutation = useMutation({
    mutationFn: async (body: Partial<Tarea>) => {
      if (isEdit && task) return api.updateTarea(task.id, body);
      return api.createTarea(body);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tareas"] });
      toast.success(isEdit ? "Tarea actualizada" : "Tarea creada");
      onClose();
    },
    onError: (e: Error) => toast.error(e.message ?? "Error al guardar"),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      toast.error("El título es obligatorio");
      return;
    }
    saveMutation.mutate({
      title: title.trim(),
      description: description.trim() || null,
      type: type || null,
      status,
      priority,
      assignee_id: assigneeId === "" ? null : assigneeId,
      project_id: projectId === "" ? null : projectId,
      patient_id: patientId === "" ? null : patientId,
      visibility,
      due_date: dueDate || null,
    });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-ink-900/50 backdrop-blur-sm p-0 sm:p-4"
      onClick={onClose}
    >
      <form
        onSubmit={handleSubmit}
        onClick={(e) => e.stopPropagation()}
        className="w-full sm:max-w-2xl bg-surface rounded-t-2xl sm:rounded-2xl border border-line-200 shadow-soft-lg max-h-[90vh] overflow-y-auto"
      >
        <header className="sticky top-0 bg-surface border-b border-line-200 px-5 py-4 flex items-center justify-between">
          <div>
            <h2 className="font-serif text-lg text-ink-900">
              {isEdit ? "Editar tarea" : "Nueva tarea"}
            </h2>
            {isEdit && (
              <p className="text-xs text-ink-500 mt-0.5">
                Creada {formatDate(task!.created_at)}
              </p>
            )}
          </div>
          <button type="button" onClick={onClose} className="h-8 w-8 rounded-md hover:bg-bg flex items-center justify-center text-ink-500">
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="p-5 space-y-4">
          <Field label="Título" required>
            <input
              autoFocus
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={200}
              className="w-full h-10 px-3 rounded-lg border border-line-200 bg-bg text-sm text-ink-900 focus:outline-none focus:border-brand-400"
              placeholder="¿Qué hay que hacer?"
            />
          </Field>

          <Field label="Descripción">
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="w-full px-3 py-2 rounded-lg border border-line-200 bg-bg text-sm text-ink-900 focus:outline-none focus:border-brand-400 resize-none"
              placeholder="Detalles, notas, contexto…"
            />
          </Field>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Estado">
              <FormSelect
                value={status}
                onChange={(v) => setStatus(v as TareaStatus)}
                options={[
                  { value: "TODO", label: "Por hacer" },
                  { value: "IN_PROGRESS", label: "En progreso" },
                  { value: "IN_REVIEW", label: "En revisión" },
                  { value: "DONE", label: "Hecho" },
                ]}
              />
            </Field>
            <Field label="Prioridad">
              <FormSelect
                value={priority}
                onChange={(v) => setPriority(v as TareaPriority)}
                options={[
                  { value: "LOW", label: "Baja" },
                  { value: "MEDIUM", label: "Media" },
                  { value: "HIGH", label: "Alta" },
                  { value: "URGENT", label: "Urgente" },
                ]}
              />
            </Field>
            <Field label="Tipo">
              <FormSelect
                value={type}
                onChange={(v) => setType(v as TareaType | "")}
                options={[
                  { value: "", label: "—" },
                  ...TAREA_TYPES.map((t) => ({ value: t, label: t })),
                ]}
              />
            </Field>
            <Field label="Vencimiento">
              <DateInput value={dueDate} onChange={setDueDate} />
            </Field>

            {isOrg && (
              <Field label="Asignar a">
                <FormSelect
                  value={String(assigneeId)}
                  onChange={(v) => setAssigneeId(v === "" ? "" : Number(v))}
                  options={[
                    { value: "", label: "Sin asignar" },
                    ...professionals.map((p) => ({ value: String(p.id), label: p.name })),
                  ]}
                />
              </Field>
            )}

            {projects.length > 0 && (
              <Field label="Proyecto">
                <FormSelect
                  value={String(projectId)}
                  onChange={(v) => setProjectId(v === "" ? "" : Number(v))}
                  options={[
                    { value: "", label: "Sin proyecto" },
                    ...projects.map((p) => ({ value: String(p.id), label: p.name })),
                  ]}
                />
              </Field>
            )}

            <Field label="Paciente relacionado">
              <PatientCombobox patients={patients} value={patientId} onChange={setPatientId} />
              {patientId && visibility !== "private" && (
                <p className="text-[11px] text-ink-500 mt-1">
                  ⓘ El paciente verá esta tarea en su portal. Si es una nota interna, marca la visibilidad como <span className="font-medium">Privada</span>.
                </p>
              )}
            </Field>

            <Field label="Visibilidad">
              <FormSelect
                value={visibility}
                onChange={(v) => setVisibility(v as TareaVisibility)}
                options={[
                  { value: "private", label: "Privada (solo yo)" },
                  { value: "team", label: "Equipo" },
                  { value: "workspace", label: "Todo el workspace" },
                ]}
              />
            </Field>
          </div>
        </div>

        <footer className="sticky bottom-0 bg-surface border-t border-line-200 px-5 py-4 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="h-10 px-4 rounded-lg border border-line-200 bg-bg text-sm text-ink-700 hover:border-brand-400"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={saveMutation.isPending}
            className="h-10 px-4 rounded-lg bg-brand-700 text-white text-sm font-medium hover:bg-brand-700/90 disabled:opacity-50"
          >
            {saveMutation.isPending ? "Guardando…" : isEdit ? "Guardar cambios" : "Crear tarea"}
          </button>
        </footer>
      </form>
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

function FormSelect({
  value, onChange, options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full h-10 px-3 rounded-lg border border-line-200 bg-bg text-sm text-ink-900 focus:outline-none focus:border-brand-400 cursor-pointer"
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  );
}

// Wrapper sobre <input type="date"> que llama showPicker() al click. En
// algunos navegadores el ícono nativo del calendario es invisible o muy
// pequeño y los usuarios no se dan cuenta de que el campo es interactivo;
// con showPicker() basta tocar cualquier parte del input para que abra.
function DateInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const ref = useRef<HTMLInputElement | null>(null);
  return (
    <div className="relative">
      <input
        ref={ref}
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onClick={() => { try { ref.current?.showPicker?.(); } catch { /* no-op */ } }}
        style={{ colorScheme: "light" }}
        className="w-full h-10 pl-3 pr-9 rounded-lg border border-line-200 bg-bg text-sm text-ink-900 focus:outline-none focus:border-brand-400 cursor-pointer"
      />
      <CalendarDays className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-ink-400 pointer-events-none" />
    </div>
  );
}

// Combobox con búsqueda para elegir paciente. El select nativo se vuelve
// inusable a partir de unas decenas de pacientes; este permite teclear y
// filtrar por nombre, alias o documento.
function PatientCombobox({
  patients, value, onChange,
}: { patients: ApiPatient[]; value: string; onChange: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const containerRef = useRef<HTMLDivElement | null>(null);

  const selected = patients.find((p) => p.id === value) ?? null;
  const selectedLabel = selected ? (selected.preferredName ?? selected.name) : "";

  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") setOpen(false); }
    window.addEventListener("mousedown", onClick);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onClick);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const filtered = useMemo(() => {
    const q = normalize(query);
    if (!q) return patients.slice(0, 50);
    return patients.filter((p) => {
      const haystack = normalize(`${p.name} ${p.preferredName ?? ""} ${p.doc ?? ""}`);
      return haystack.includes(q);
    }).slice(0, 50);
  }, [patients, query]);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full h-10 px-3 rounded-lg border border-line-200 bg-bg text-sm text-ink-900 focus:outline-none focus:border-brand-400 flex items-center justify-between gap-2 cursor-pointer text-left"
      >
        <span className={cn("truncate", !selectedLabel && "text-ink-400")}>
          {selectedLabel || "Buscar paciente…"}
        </span>
        <div className="flex items-center gap-1 shrink-0">
          {value && (
            <span
              role="button"
              tabIndex={-1}
              onClick={(e) => { e.stopPropagation(); onChange(""); }}
              className="text-ink-400 hover:text-ink-700 p-0.5 rounded inline-flex items-center"
              title="Quitar paciente"
            >
              <X className="h-3.5 w-3.5" />
            </span>
          )}
          <Search className="h-3.5 w-3.5 text-ink-400" />
        </div>
      </button>
      {open && (
        <div className="absolute z-50 mt-1 w-full rounded-lg border border-line-200 bg-surface shadow-soft-lg overflow-hidden">
          <div className="p-2 border-b border-line-100">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-ink-400" />
              <input
                autoFocus
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Nombre, alias o documento…"
                className="w-full h-8 pl-7 pr-2 rounded-md border border-line-200 bg-bg text-xs text-ink-900 focus:outline-none focus:border-brand-400"
              />
            </div>
          </div>
          <ul className="max-h-60 overflow-y-auto py-1">
            <li>
              <button
                type="button"
                onClick={() => { onChange(""); setOpen(false); setQuery(""); }}
                className={cn(
                  "w-full text-left px-3 py-2 text-xs hover:bg-bg-100/50",
                  !value && "bg-brand-50/50 text-brand-800"
                )}
              >
                Ninguno
              </button>
            </li>
            {filtered.length === 0 ? (
              <li className="px-3 py-3 text-xs text-ink-400 text-center">Sin coincidencias</li>
            ) : (
              filtered.map((p) => {
                const label = p.preferredName ?? p.name;
                const active = p.id === value;
                return (
                  <li key={p.id}>
                    <button
                      type="button"
                      onClick={() => { onChange(p.id); setOpen(false); setQuery(""); }}
                      className={cn(
                        "w-full text-left px-3 py-2 text-sm hover:bg-bg-100/50",
                        active && "bg-brand-50/50 text-brand-800"
                      )}
                    >
                      <div className="font-medium text-ink-900 truncate">{label}</div>
                      <div className="text-[10px] text-ink-500 truncate tabular">
                        {p.doc ?? p.id}{p.preferredName && p.name !== p.preferredName ? ` · ${p.name}` : ""}
                      </div>
                    </button>
                  </li>
                );
              })
            )}
          </ul>
        </div>
      )}
    </div>
  );
}

// ─── Helpers ────────────────────────────────────────────────────────────────

const PRIORITY_RANK: Record<TareaPriority, number> = { URGENT: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };

function sortTasks(a: Tarea, b: Tarea): number {
  if (a.position !== b.position) return a.position - b.position;
  const ao = isOverdue(a.due_date) ? 1 : 0;
  const bo = isOverdue(b.due_date) ? 1 : 0;
  if (ao !== bo) return bo - ao;
  if (a.due_date && b.due_date) return new Date(a.due_date).getTime() - new Date(b.due_date).getTime();
  if (a.due_date) return -1;
  if (b.due_date) return 1;
  return PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
}

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function isToday(iso: string | null | undefined): boolean {
  if (!iso) return false;
  return startOfDay(new Date(iso)).getTime() === startOfDay(new Date()).getTime();
}

function isThisWeek(iso: string | null | undefined): boolean {
  if (!iso) return false;
  const t = startOfDay(new Date());
  const day = t.getDay();
  const monday = new Date(t);
  monday.setDate(t.getDate() - ((day + 6) % 7));
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  const d = startOfDay(new Date(iso)).getTime();
  return d >= monday.getTime() && d <= sunday.getTime();
}

function isOverdue(iso: string | null | undefined): boolean {
  if (!iso) return false;
  return startOfDay(new Date(iso)).getTime() < startOfDay(new Date()).getTime();
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  const t = startOfDay(new Date()).getTime();
  const x = startOfDay(d).getTime();
  const diffDays = Math.round((x - t) / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return "Hoy";
  if (diffDays === 1) return "Mañana";
  if (diffDays === -1) return "Ayer";
  return d.toLocaleDateString("es-CO", { day: "numeric", month: "short" });
}

function normalize(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}
