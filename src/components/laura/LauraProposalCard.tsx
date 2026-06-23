import { useNavigate } from "@tanstack/react-router";
import {
  ArrowRight, MapPin, User as UserIcon, FileText, Check,
  X as XIcon, ShieldCheck, CalendarPlus, ListChecks,
} from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Tarjeta de "propuesta de acción" que Laura emite vía tool_use.
 *
 * Filosofía del componente: **NO ejecuta cambios en BD desde aquí.**
 * Solo navega o pre-llena vistas para que el psicólogo apruebe
 * y guarde manualmente en la pantalla destino. Esto cumple
 * laura-condicionantes.md §0.1 (propose → approve).
 *
 * Tres formas de propuesta:
 *  - navigate_to:          un botón "Ir"
 *  - open_patient:         un botón "Abrir ficha"
 *  - propose_clinical_note: card con preview del contenido y botón
 *    "Revisar y guardar" que abre la ficha con la nota pre-cargada
 *    en query params (`?laura_note=<encoded>`).
 *
 * Estado: una vez ejecutada o descartada, la tarjeta queda en estado
 * "muted" (no se puede re-ejecutar) — esto evita doble navegación y
 * deja claro al usuario qué decidió.
 */

export type ProposedAction = {
  tool_id: string;
  name: string;
  input: Record<string, unknown>;
};

type Props = {
  action: ProposedAction;
  /** Estado de la decisión del usuario. Si null, la tarjeta es interactiva. */
  decision?: "approved" | "dismissed" | null;
  onDecide?: (tool_id: string, decision: "approved" | "dismissed") => void;
};

export function LauraProposalCard({ action, decision, onDecide }: Props) {
  const navigate = useNavigate();
  const isMuted = decision != null;

  function approve(navigateFn?: () => void) {
    onDecide?.(action.tool_id, "approved");
    navigateFn?.();
  }
  function dismiss() {
    onDecide?.(action.tool_id, "dismissed");
  }

  /**
   * Wrapper sobre navigate de TanStack: si la ruta no matchea
   * ninguna route registrada, cae a window.location.assign para
   * garantizar que el usuario llega a algún lado (aun con full
   * page reload). Esto evita la pantalla blanca con error que
   * pasaba antes cuando Laura proponía rutas no exactas.
   */
  function safeNavigate(fn: () => void, fallbackHref: string) {
    try {
      fn();
    } catch (err) {
      console.warn("[laura] navigate falló, fallback a location.assign", err);
      window.location.assign(fallbackHref);
    }
  }

  // ── navigate_to ─────────────────────────────────────────────────────
  if (action.name === "navigate_to") {
    const path = String(action.input.path ?? "/");
    const reason = String(action.input.reason ?? "Te llevo a esa sección.");
    return (
      <Card icon={<MapPin className="h-3.5 w-3.5" />} title="Ir a una sección" muted={isMuted}>
        <p className="text-xs text-ink-700 leading-relaxed">{reason}</p>
        <CodeChip>{path}</CodeChip>
        <Footer
          muted={isMuted}
          decision={decision}
          actions={
            <>
              <ApproveButton
                label="Ir"
                onClick={() => approve(() =>
                  safeNavigate(() => navigate({ to: path as never }), path)
                )}
              />
              <DismissButton onClick={dismiss} />
            </>
          }
        />
      </Card>
    );
  }

  // ── open_patient ────────────────────────────────────────────────────
  if (action.name === "open_patient") {
    const patientId = String(action.input.patient_id ?? "");
    const reason = String(action.input.reason ?? "Te abro la ficha del paciente.");
    return (
      <Card icon={<UserIcon className="h-3.5 w-3.5" />} title="Abrir ficha de paciente" muted={isMuted}>
        <p className="text-xs text-ink-700 leading-relaxed">{reason}</p>
        <CodeChip>{patientId}</CodeChip>
        <Footer
          muted={isMuted}
          decision={decision}
          actions={
            <>
              <ApproveButton
                label="Abrir ficha"
                onClick={() => approve(() =>
                  safeNavigate(
                    () => navigate({ to: "/pacientes/$id", params: { id: patientId } }),
                    `/pacientes/${patientId}`,
                  )
                )}
              />
              <DismissButton onClick={dismiss} />
            </>
          }
        />
      </Card>
    );
  }

  // ── propose_clinical_note ───────────────────────────────────────────
  if (action.name === "propose_clinical_note") {
    const patientId = String(action.input.patient_id ?? "");
    const kind = String(action.input.kind ?? "evolucion");
    const title = String(action.input.title ?? "Nota clínica");
    const content = String(action.input.content ?? "");
    const kindLabel: Record<string, string> = {
      motivo: "Motivo de consulta",
      antecedentes: "Antecedentes",
      examen_mental: "Examen mental",
      evolucion: "Evolución",
      plan: "Plan terapéutico",
    };
    const handleApprove = () => {
      // Encode el payload como base64 (URL-safe-ish) para evitar
      // problemas con caracteres especiales en el query string.
      // /historia es donde vive el editor de notas; le pasamos el
      // patient id y la nota pre-cargada.
      const payload = btoa(unescape(encodeURIComponent(JSON.stringify({
        kind, title, content,
      }))));
      approve(() =>
        safeNavigate(
          () =>
            navigate({
              to: "/historia",
              search: { id: patientId, laura_note: payload } as never,
            }),
          `/historia?id=${encodeURIComponent(patientId)}&laura_note=${encodeURIComponent(payload)}`,
        )
      );
    };
    return (
      <Card
        icon={<FileText className="h-3.5 w-3.5" />}
        title="Propuesta de nota clínica"
        muted={isMuted}
      >
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-1.5 text-[10px] text-ink-500">
            <span className="px-1.5 py-0.5 rounded-full bg-brand-50 text-brand-800 border border-brand-200/70 font-medium">
              {kindLabel[kind] ?? kind}
            </span>
            <span className="px-1.5 py-0.5 rounded-full bg-bg-50 border border-line-200 font-mono">
              {patientId}
            </span>
          </div>
          <p className="text-xs font-medium text-ink-900">{title}</p>
          <div className="text-[11px] text-ink-700 leading-relaxed whitespace-pre-wrap rounded-md border border-line-100 bg-bg-50/70 p-2 max-h-40 overflow-y-auto">
            {content}
          </div>
          <p className="text-[10px] text-ink-500 inline-flex items-center gap-1">
            <ShieldCheck className="h-3 w-3" />
            Al aprobar, te llevo a la historia del paciente con la nota pre-cargada.
            Tú decides si guardar/firmar.
          </p>
        </div>
        <Footer
          muted={isMuted}
          decision={decision}
          actions={
            <>
              <ApproveButton label="Revisar y guardar" onClick={handleApprove} />
              <DismissButton onClick={dismiss} />
            </>
          }
        />
      </Card>
    );
  }

  // ── propose_appointment ─────────────────────────────────────────────
  if (action.name === "propose_appointment") {
    const patientId = String(action.input.patient_id ?? "");
    const date = String(action.input.date ?? ""); // yyyy-mm-dd
    const time = String(action.input.time ?? ""); // HH:mm
    const duration = Number(action.input.duration ?? 50);
    const modality = String(action.input.modality ?? "individual");
    const notes = String(action.input.notes ?? "");
    const patientName = String(action.input.patient_name ?? "");

    const modalityLabel: Record<string, string> = {
      individual: "Individual", pareja: "Pareja", familiar: "Familiar",
      grupal: "Grupal", tele: "Telepsicología",
    };

    const handleApprove = () => {
      const payload = btoa(unescape(encodeURIComponent(JSON.stringify({
        patientId, date, time, duration, modality, notes,
      }))));
      approve(() =>
        safeNavigate(
          () => navigate({
            to: "/agenda",
            search: { laura_appt: payload } as never,
          }),
          `/agenda?laura_appt=${encodeURIComponent(payload)}`,
        )
      );
    };

    // Formato amigable de la fecha para preview
    let prettyDate = date;
    try {
      if (date) {
        const d = new Date(date + "T00:00:00");
        prettyDate = d.toLocaleDateString("es-CO", {
          weekday: "long", day: "numeric", month: "long",
        });
      }
    } catch { /* keep raw */ }

    return (
      <Card icon={<CalendarPlus className="h-3.5 w-3.5" />} title="Propuesta de cita" muted={isMuted}>
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-1.5 text-[10px] text-ink-500">
            <span className="px-1.5 py-0.5 rounded-full bg-brand-50 text-brand-800 border border-brand-200/70 font-medium">
              {modalityLabel[modality] ?? modality}
            </span>
            <span className="px-1.5 py-0.5 rounded-full bg-bg-50 border border-line-200 font-mono">
              {patientId}
            </span>
          </div>
          {patientName && <p className="text-xs font-medium text-ink-900">{patientName}</p>}
          <div className="text-[11px] text-ink-700 leading-relaxed rounded-md border border-line-100 bg-bg-50/70 p-2 space-y-0.5">
            <p><span className="font-medium text-ink-900">Fecha:</span> {prettyDate || "—"}</p>
            <p><span className="font-medium text-ink-900">Hora:</span> {time || "—"} <span className="text-ink-500">({duration} min)</span></p>
            {notes && <p><span className="font-medium text-ink-900">Notas:</span> {notes}</p>}
          </div>
          <p className="text-[10px] text-ink-500 inline-flex items-center gap-1">
            <ShieldCheck className="h-3 w-3" />
            Al aprobar, te abro el formulario de agenda con esto pre-cargado.
            Tú decides si guardar.
          </p>
        </div>
        <Footer
          muted={isMuted}
          decision={decision}
          actions={
            <>
              <ApproveButton label="Revisar y crear" onClick={handleApprove} />
              <DismissButton onClick={dismiss} />
            </>
          }
        />
      </Card>
    );
  }

  // ── propose_task ────────────────────────────────────────────────────
  if (action.name === "propose_task") {
    const title = String(action.input.title ?? "");
    const description = String(action.input.description ?? "");
    const patientId = String(action.input.patient_id ?? "");
    const patientName = String(action.input.patient_name ?? "");
    const dueDate = String(action.input.due_date ?? ""); // yyyy-mm-dd
    const priority = String(action.input.priority ?? "MEDIUM").toUpperCase();
    const type = String(action.input.type ?? "");

    const priorityLabel: Record<string, string> = {
      LOW: "Baja", MEDIUM: "Media", HIGH: "Alta", URGENT: "Urgente",
    };

    const handleApprove = () => {
      // Construimos un objeto Partial<Tarea> compatible con el dialog.
      const taskPayload: Record<string, unknown> = {
        title, description,
      };
      if (patientId) taskPayload.patient_id = patientId;
      if (patientName) taskPayload.patient_name = patientName;
      if (dueDate) taskPayload.due_date = dueDate;
      if (priority && ["LOW", "MEDIUM", "HIGH", "URGENT"].includes(priority)) {
        taskPayload.priority = priority;
      }
      if (type) taskPayload.type = type;

      const payload = btoa(unescape(encodeURIComponent(JSON.stringify(taskPayload))));
      approve(() =>
        safeNavigate(
          () => navigate({
            to: "/tareas",
            search: { laura_task: payload } as never,
          }),
          `/tareas?laura_task=${encodeURIComponent(payload)}`,
        )
      );
    };

    let prettyDue = dueDate;
    try {
      if (dueDate) {
        const d = new Date(dueDate + "T00:00:00");
        prettyDue = d.toLocaleDateString("es-CO", { weekday: "long", day: "numeric", month: "long" });
      }
    } catch { /* keep raw */ }

    return (
      <Card icon={<ListChecks className="h-3.5 w-3.5" />} title="Propuesta de tarea" muted={isMuted}>
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-1.5 text-[10px] text-ink-500">
            {patientId && (
              <span className="px-1.5 py-0.5 rounded-full bg-bg-50 border border-line-200 font-mono">
                {patientId}
              </span>
            )}
            {type && (
              <span className="px-1.5 py-0.5 rounded-full bg-brand-50 text-brand-800 border border-brand-200/70 font-medium">
                {type}
              </span>
            )}
            <span className={cn(
              "px-1.5 py-0.5 rounded-full font-medium border",
              priority === "URGENT" && "bg-rose-50 text-rose-800 border-rose-200/70",
              priority === "HIGH" && "bg-amber-50 text-amber-800 border-amber-200/70",
              (priority === "MEDIUM" || !priority) && "bg-bg-50 text-ink-700 border-line-200",
              priority === "LOW" && "bg-sage-50 text-sage-800 border-sage-200/70",
            )}>
              Prioridad: {priorityLabel[priority] ?? priority}
            </span>
          </div>
          <p className="text-xs font-medium text-ink-900">{title}</p>
          {patientName && (
            <p className="text-[11px] text-ink-700">Para: <span className="font-medium">{patientName}</span></p>
          )}
          {description && (
            <div className="text-[11px] text-ink-700 leading-relaxed whitespace-pre-wrap rounded-md border border-line-100 bg-bg-50/70 p-2 max-h-32 overflow-y-auto">
              {description}
            </div>
          )}
          {prettyDue && (
            <p className="text-[11px] text-ink-700">Vence: <span className="font-medium">{prettyDue}</span></p>
          )}
          <p className="text-[10px] text-ink-500 inline-flex items-center gap-1">
            <ShieldCheck className="h-3 w-3" />
            Al aprobar, te abro el formulario de tarea con esto pre-cargado. Tú decides si guardar.
          </p>
        </div>
        <Footer
          muted={isMuted}
          decision={decision}
          actions={
            <>
              <ApproveButton label="Revisar y crear" onClick={handleApprove} />
              <DismissButton onClick={dismiss} />
            </>
          }
        />
      </Card>
    );
  }

  // Fallback genérico (tool desconocido por el cliente)
  return (
    <Card icon={<FileText className="h-3.5 w-3.5" />} title={`Propuesta: ${action.name}`} muted={isMuted}>
      <pre className="text-[10px] text-ink-600 overflow-x-auto bg-bg-50 p-2 rounded-md border border-line-100">
        {JSON.stringify(action.input, null, 2)}
      </pre>
      <Footer
        muted={isMuted}
        decision={decision}
        actions={<DismissButton onClick={dismiss} />}
      />
    </Card>
  );
}

// ─── Subcomponentes ────────────────────────────────────────────────────

function Card({
  icon, title, muted, children,
}: {
  icon: React.ReactNode;
  title: string;
  muted?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={cn(
      "rounded-xl border bg-surface px-3 py-2.5 space-y-2 transition-opacity",
      muted ? "border-line-100 opacity-60" : "border-brand-200/70 shadow-sm",
    )}>
      <div className="flex items-center gap-1.5 text-[11px] font-semibold text-brand-800">
        <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-brand-50 text-brand-700">
          {icon}
        </span>
        {title}
      </div>
      {children}
    </div>
  );
}

function CodeChip({ children }: { children: React.ReactNode }) {
  return (
    <code className="inline-block mt-1 text-[11px] px-2 py-0.5 rounded-md bg-bg-50 border border-line-200 text-ink-700 font-mono">
      {children}
    </code>
  );
}

function Footer({
  muted, decision, actions,
}: {
  muted?: boolean;
  decision?: "approved" | "dismissed" | null;
  actions: React.ReactNode;
}) {
  if (muted) {
    return (
      <p className="text-[10px] text-ink-500 inline-flex items-center gap-1">
        {decision === "approved" ? (
          <><Check className="h-3 w-3" /> Aprobado</>
        ) : (
          <><XIcon className="h-3 w-3" /> Descartado</>
        )}
      </p>
    );
  }
  return <div className="flex items-center gap-2 pt-1">{actions}</div>;
}

function ApproveButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="h-8 px-3 rounded-lg bg-brand-700 text-white text-xs font-medium hover:bg-brand-800 inline-flex items-center gap-1.5"
    >
      {label}
      <ArrowRight className="h-3 w-3" />
    </button>
  );
}

function DismissButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="h-8 px-2.5 rounded-lg border border-line-200 text-xs text-ink-700 hover:bg-bg-50 inline-flex items-center gap-1"
    >
      Descartar
    </button>
  );
}
