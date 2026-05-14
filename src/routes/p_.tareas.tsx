import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { ListChecks, Loader2, CheckCircle2, Clock, Download, Upload, FileText, RefreshCw } from "lucide-react";
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

  const submitMu = useMutation({
    mutationFn: (vars: { id: string; file: File }) => api.portalSubmitTaskFile(vars.id, vars.file),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["portal-tasks"] });
      toast.success("¡Tarea entregada! Tu psicóloga la recibió.");
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
                onSubmitFile={(file) => submitMu.mutate({ id: t.id, file })}
                submitting={submitMu.isPending && submitMu.variables?.id === t.id}
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

function TaskCard({ task, onComplete, completing, onSubmitFile, submitting }: {
  task: any;
  onComplete: () => void;
  completing: boolean;
  onSubmitFile: (file: File) => void;
  submitting: boolean;
}) {
  const dueDate = task.due_at ? new Date(task.due_at) : null;
  const isOverdue = dueDate && dueDate.getTime() < Date.now();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pickedName, setPickedName] = useState<string | null>(null);

  // Tres estados del flujo Moodle:
  //   - hasTemplate + !hasSubmission: el psicólogo adjuntó plantilla, falta entregar.
  //   - hasTemplate + hasSubmission:  ya entregaste, mostramos confirmación + opción reenviar.
  //   - !hasTemplate: tarea sin adjuntos (texto puro) → flujo original "marcar hecha".
  const hasTemplate = !!task.template_document;
  const hasSubmission = !!task.submission_document;

  function handlePickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    // Confirmación visual antes de subir — el paciente ve qué eligió.
    setPickedName(file.name);
    onSubmitFile(file);
    // Permitir re-elegir el mismo archivo si falla la subida.
    e.target.value = "";
  }

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

          {/* Bloque del flujo Moodle: solo cuando hay plantilla adjunta. */}
          {hasTemplate && (
            <div className="mt-4 rounded-lg border border-brand-200/60 bg-brand-50/40 p-3 space-y-2">
              <div className="flex items-center gap-2 text-xs text-brand-800 font-medium">
                <FileText className="h-3.5 w-3.5" />
                Tarea con archivo adjunto
              </div>
              <a
                href={api.portalDocumentFileUrl(task.template_document.id)}
                download={task.template_document.original_name ?? task.template_document.name ?? "consigna"}
                className="inline-flex items-center gap-1.5 text-sm text-brand-700 hover:text-brand-800 hover:underline"
              >
                <Download className="h-3.5 w-3.5" />
                Descargar consigna ({task.template_document.original_name ?? task.template_document.name})
              </a>
              {hasSubmission && task.submitted_at && (
                <p className="text-xs text-success">
                  ✓ Entregaste el {new Date(task.submitted_at).toLocaleDateString("es-CO", { day: "numeric", month: "long", year: "numeric" })}
                  {task.submission_document.original_name ? ` — ${task.submission_document.original_name}` : ""}
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap justify-end gap-2">
        {/* Botón "Entregar / Reenviar tarea" solo cuando hay plantilla. */}
        {hasTemplate && (
          <>
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.webp,.gif,.txt"
              className="sr-only"
              onChange={handlePickFile}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={submitting}
              className={cn(
                "h-9 px-4 rounded-md text-sm font-medium inline-flex items-center gap-2 disabled:opacity-50",
                hasSubmission
                  ? "border border-line-200 text-ink-700 hover:border-brand-400"
                  : "bg-brand-700 text-white hover:bg-brand-800"
              )}
              title={hasSubmission ? "Subir una versión nueva (la anterior queda archivada)" : "Subir tu respuesta como archivo"}
            >
              {submitting
                ? <><Loader2 className="h-4 w-4 animate-spin" /> Subiendo {pickedName ? `(${pickedName})` : "…"}</>
                : hasSubmission
                  ? <><RefreshCw className="h-4 w-4" /> Reenviar</>
                  : <><Upload className="h-4 w-4" /> Entregar tarea</>}
            </button>
          </>
        )}

        {/* Botón "Marcar hecha": disponible siempre que no esté ya completada.
            En tareas con plantilla, lo dejamos disponible POR SI el paciente
            entregó por otro canal (ya pasa) — pero es lo de menos. El indicador
            real es submission_document. */}
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
