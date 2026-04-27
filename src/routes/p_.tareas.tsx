import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ListChecks, Loader2, CheckCircle2, Clock } from "lucide-react";
import { toast } from "sonner";
import { PortalShell } from "@/components/portal/PortalShell";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/p_/tareas")({
  head: () => ({ meta: [{ title: "Mis tareas · Mi portal" }] }),
  component: PortalTasks,
});

function PortalTasks() {
  const qc = useQueryClient();
  const { data: tasks = [], isLoading } = useQuery({
    queryKey: ["portal-tasks"],
    queryFn: () => api.portalTasks(),
  });

  const completeMu = useMutation({
    mutationFn: (id: string) => api.portalCompleteTask(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["portal-tasks"] });
      toast.success("¡Tarea completada!");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const pending = tasks.filter((t) => t.status !== "completada");
  const done = tasks.filter((t) => t.status === "completada");

  return (
    <PortalShell>
      <header className="mb-8">
        <p className="text-xs uppercase tracking-widest text-brand-700 font-semibold">Tu trabajo terapéutico</p>
        <h1 className="font-serif text-3xl text-ink-900 mt-1">Mis tareas</h1>
        <p className="text-sm text-ink-500 mt-2 max-w-xl">
          Pequeños ejercicios entre sesiones. Hacerlos sostiene el progreso. No te exijas perfección — basta con avanzar.
        </p>
      </header>

      {isLoading && <Loader2 className="h-5 w-5 mx-auto animate-spin text-ink-400" />}

      {!isLoading && tasks.length === 0 && (
        <div className="rounded-2xl border border-dashed border-line-200 bg-surface p-12 text-center">
          <ListChecks className="h-8 w-8 mx-auto text-ink-300 mb-3" />
          <p className="text-sm text-ink-500">No tienes tareas asignadas por ahora.</p>
        </div>
      )}

      {pending.length > 0 && (
        <section className="mb-8">
          <h2 className="font-serif text-lg text-ink-900 mb-3">Pendientes ({pending.length})</h2>
          <ul className="space-y-3">
            {pending.map((t) => (
              <TaskCard
                key={t.id}
                task={t}
                onComplete={() => completeMu.mutate(t.id)}
                completing={completeMu.isPending && completeMu.variables === t.id}
              />
            ))}
          </ul>
        </section>
      )}

      {done.length > 0 && (
        <section>
          <h2 className="font-serif text-lg text-ink-900 mb-3">Completadas ({done.length})</h2>
          <ul className="space-y-2">
            {done.map((t) => (
              <li key={t.id} className="rounded-lg border border-line-100 bg-bg-100 p-3 flex items-center gap-3 opacity-70">
                <CheckCircle2 className="h-4 w-4 text-sage-500 shrink-0" />
                <span className="text-sm text-ink-700 line-through">{t.title}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </PortalShell>
  );
}

function TaskCard({ task, onComplete, completing }: { task: any; onComplete: () => void; completing: boolean }) {
  const dueDate = task.due_at ? new Date(task.due_at) : null;
  const isOverdue = dueDate && dueDate.getTime() < Date.now();

  return (
    <li className={cn(
      "rounded-xl border bg-surface p-5 transition-all",
      isOverdue ? "border-amber-300/50" : "border-line-200 hover:shadow-soft"
    )}>
      <div className="flex items-start gap-4">
        <div className={cn(
          "h-10 w-10 rounded-lg flex items-center justify-center shrink-0",
          isOverdue ? "bg-warning-soft text-risk-moderate" : "bg-brand-50 text-brand-700"
        )}>
          <ListChecks className="h-5 w-5" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-medium text-ink-900">{task.title}</h3>
          {task.description && (
            <p className="text-sm text-ink-700 mt-1 leading-relaxed whitespace-pre-wrap">{task.description}</p>
          )}
          {dueDate && (
            <p className={cn("text-xs mt-2 inline-flex items-center gap-1.5",
              isOverdue ? "text-amber-700" : "text-ink-500"
            )}>
              <Clock className="h-3 w-3" />
              {isOverdue ? "Venció " : "Para "}
              {dueDate.toLocaleDateString("es-CO", { weekday: "long", day: "numeric", month: "long" })}
            </p>
          )}
          {task.adherence != null && task.adherence > 0 && (
            <div className="mt-3">
              <div className="flex items-center justify-between text-xs text-ink-500 mb-1">
                <span>Progreso</span>
                <span className="tabular">{task.adherence}%</span>
              </div>
              <div className="h-1.5 rounded-full bg-bg-100 overflow-hidden">
                <div className="h-full rounded-full bg-brand-700" style={{ width: `${task.adherence}%` }} />
              </div>
            </div>
          )}
        </div>
      </div>
      <div className="mt-4 flex justify-end">
        <button
          onClick={onComplete}
          disabled={completing}
          className="h-9 px-4 rounded-md bg-brand-700 text-white text-sm font-medium hover:bg-brand-800 disabled:opacity-50 inline-flex items-center gap-2"
        >
          {completing ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
          Marcar como hecha
        </button>
      </div>
    </li>
  );
}
