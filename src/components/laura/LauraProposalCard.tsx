import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api, normalizeTareaType } from "@/lib/api";
import {
  ArrowRight, MapPin, User as UserIcon, FileText, Check,
  X as XIcon, ShieldCheck, CalendarPlus, ListChecks, UserPlus,
  CalendarClock, CalendarX, CheckCircle2, Brain, Receipt, MessageCircle, Sparkles, Loader2,
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

export type PatientPrefill = {
  name?: string; pronouns?: string; age?: number; phone?: string; email?: string;
  doc?: string; modality?: string; reason?: string; tags?: string[];
};

type Props = {
  action: ProposedAction;
  /** Estado de la decisión del usuario. Si null, la tarjeta es interactiva. */
  decision?: "approved" | "dismissed" | null;
  onDecide?: (tool_id: string, decision: "approved" | "dismissed") => void;
  /** propose_patient: en vez de navegar, quien nos monta abre el
   *  formulario de alta con estos datos y minimiza el chat. */
  onProposePatient?: (prefill: PatientPrefill) => void;
};

export function LauraProposalCard({ action, decision, onDecide, onProposePatient }: Props) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const isMuted = decision != null;

  /**
   * Acciones que se EJECUTAN al aprobar (reprogramar, cancelar, atender,
   * test, recibo, WhatsApp, memoria). La tarjeta es la confirmación
   * explícita del profesional: muestra exactamente qué va a pasar y
   * solo con su clic se llama a la API. Si falla, la tarjeta sigue
   * activa para reintentar.
   */
  async function run(label: string, fn: () => Promise<unknown>, invalidate: string[] = []) {
    if (busy) return;
    setBusy(true);
    try {
      await fn();
      onDecide?.(action.tool_id, "approved");
      for (const k of invalidate) qc.invalidateQueries({ queryKey: [k] });
      toast.success(label);
    } catch (e) {
      toast.error((e as Error)?.message || "No se pudo completar");
    } finally {
      setBusy(false);
    }
  }
  const prettyDate = (d: string) => {
    try { return new Date(d + "T00:00:00").toLocaleDateString("es-CO", { weekday: "long", day: "numeric", month: "long" }); } catch { return d; }
  };
  const str = (k: string) => String(action.input[k] ?? "");
  const num = (k: string) => Number(action.input[k]);
  const Busy = () => (busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null);

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
      grupal: "Grupal", tele: "Videollamada",
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
    const type = normalizeTareaType(action.input.type);

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

  // ── propose_patient ─────────────────────────────────────────────────
  if (action.name === "propose_patient") {
    const name = String(action.input.name ?? "").trim();
    const age = Number(action.input.age);
    const prefill: PatientPrefill = {
      name,
      pronouns: ["ella", "él", "elle"].includes(String(action.input.pronouns)) ? String(action.input.pronouns) : undefined,
      age: Number.isFinite(age) && age > 0 ? age : undefined,
      phone: action.input.phone ? String(action.input.phone) : undefined,
      email: action.input.email ? String(action.input.email) : undefined,
      doc: action.input.doc ? String(action.input.doc) : undefined,
      modality: ["individual", "pareja", "familiar", "grupal", "tele"].includes(String(action.input.modality))
        ? String(action.input.modality) : undefined,
      reason: action.input.reason ? String(action.input.reason) : undefined,
      tags: Array.isArray(action.input.tags) ? action.input.tags.map(String).filter(Boolean) : undefined,
    };
    const detalles: Array<[string, string | undefined]> = [
      ["Edad", prefill.age ? `${prefill.age} años` : undefined],
      ["Teléfono", prefill.phone],
      ["Correo", prefill.email],
      ["Documento", prefill.doc],
      ["Motivo", prefill.reason],
    ];

    return (
      <Card icon={<UserPlus className="h-3.5 w-3.5" />} title="Propuesta de paciente nuevo" muted={isMuted}>
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-ink-900">{name || "Sin nombre"}</p>
          <div className="text-[11px] text-ink-700 leading-relaxed rounded-md border border-line-100 bg-bg-50/70 p-2 space-y-0.5">
            {detalles.filter(([, v]) => v).map(([k, v]) => (
              <p key={k}><span className="font-medium text-ink-900">{k}:</span> {v}</p>
            ))}
            {detalles.every(([, v]) => !v) && <p className="text-ink-500">Solo el nombre — completas el resto en el formulario.</p>}
          </div>
          <p className="text-[10px] text-ink-500 inline-flex items-center gap-1">
            <ShieldCheck className="h-3 w-3" />
            Al aprobar, te abro el formulario de paciente con esto pre-cargado.
            Tú revisas y guardas.
          </p>
        </div>
        <Footer
          muted={isMuted}
          decision={decision}
          actions={
            <>
              <ApproveButton
                label="Revisar y crear"
                onClick={() => approve(() => onProposePatient?.(prefill))}
              />
              <DismissButton onClick={dismiss} />
            </>
          }
        />
      </Card>
    );
  }

  // ── propose_reschedule ──────────────────────────────────────────────
  if (action.name === "propose_reschedule") {
    const id = num("appointment_id"); const date = str("date"); const time = str("time");
    const valid = Number.isFinite(id) && /^\d{4}-\d{2}-\d{2}$/.test(date) && /^\d{2}:\d{2}$/.test(time);
    return (
      <Card icon={<CalendarClock className="h-3.5 w-3.5" />} title="Reprogramar cita" muted={isMuted}>
        <div className="space-y-1.5">
          {str("patient_name") && <p className="text-xs font-medium text-ink-900">{str("patient_name")}</p>}
          <div className="text-[11px] text-ink-700 leading-relaxed rounded-md border border-line-100 bg-bg-50/70 p-2 space-y-0.5">
            <p><span className="font-medium text-ink-900">Nueva fecha:</span> {valid ? prettyDate(date) : date || "—"} · {time || "—"}</p>
            {str("reason") && <p><span className="font-medium text-ink-900">Motivo:</span> {str("reason")}</p>}
            <p className="text-ink-500">Cita #{Number.isFinite(id) ? id : "?"}</p>
          </div>
          <p className="text-[10px] text-ink-500 inline-flex items-center gap-1"><ShieldCheck className="h-3 w-3" /> Al aprobar se cambia la cita y se avisa al paciente por correo (con el nuevo enlace si es online).</p>
        </div>
        <Footer muted={isMuted} decision={decision} actions={<>
          <ApproveButton label={busy ? "Reprogramando…" : "Reprogramar"} onClick={() => valid && run("Cita reprogramada", () => api.updateAppointment(id, { date, time }), ["appointments", "dashboard-stats"])} />
          <DismissButton onClick={dismiss} />
        </>} />
      </Card>
    );
  }

  // ── propose_cancel ──────────────────────────────────────────────────
  if (action.name === "propose_cancel") {
    const id = num("appointment_id");
    const notify = action.input.notify !== false;
    return (
      <Card icon={<CalendarX className="h-3.5 w-3.5" />} title="Cancelar cita" muted={isMuted}>
        <div className="space-y-1.5">
          {str("patient_name") && <p className="text-xs font-medium text-ink-900">{str("patient_name")}</p>}
          <div className="text-[11px] text-ink-700 leading-relaxed rounded-md border border-line-100 bg-bg-50/70 p-2 space-y-0.5">
            {str("date") && <p><span className="font-medium text-ink-900">Cita:</span> {prettyDate(str("date"))} · {str("time")}</p>}
            {str("reason") && <p><span className="font-medium text-ink-900">Motivo:</span> {str("reason")}</p>}
            <p className="text-ink-500">{notify ? "Se avisa al paciente." : "Sin avisar al paciente."}</p>
          </div>
        </div>
        <Footer muted={isMuted} decision={decision} actions={<>
          <ApproveButton label={busy ? "Cancelando…" : "Cancelar cita"} onClick={() => Number.isFinite(id) && run("Cita cancelada", () => api.deleteAppointment(id, { notify }), ["appointments", "dashboard-stats"])} />
          <DismissButton onClick={dismiss} />
        </>} />
      </Card>
    );
  }

  // ── propose_attended ────────────────────────────────────────────────
  if (action.name === "propose_attended") {
    const id = num("appointment_id");
    return (
      <Card icon={<CheckCircle2 className="h-3.5 w-3.5" />} title="Marcar cita como atendida" muted={isMuted}>
        <div className="space-y-1.5">
          {str("patient_name") && <p className="text-xs font-medium text-ink-900">{str("patient_name")}</p>}
          {str("date") && <p className="text-[11px] text-ink-700">{prettyDate(str("date"))} · {str("time")}</p>}
        </div>
        <Footer muted={isMuted} decision={decision} actions={<>
          <ApproveButton label={busy ? "Guardando…" : "Marcar atendida"} onClick={() => Number.isFinite(id) && run("Cita marcada como atendida", () => api.updateAppointment(id, { status: "atendida", notify: false }), ["appointments", "dashboard-stats"])} />
          <DismissButton onClick={dismiss} />
        </>} />
      </Card>
    );
  }

  // ── propose_test ────────────────────────────────────────────────────
  if (action.name === "propose_test") {
    const patientId = str("patient_id"); const testId = str("test_id");
    return (
      <Card icon={<Sparkles className="h-3.5 w-3.5" />} title="Asignar test" muted={isMuted}>
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-ink-900">{str("test_name") || testId}</p>
          <p className="text-[11px] text-ink-700">Para {str("patient_name") || patientId}. El paciente lo recibe en su portal (y por WhatsApp si lo tiene activo).</p>
        </div>
        <Footer muted={isMuted} decision={decision} actions={<>
          <ApproveButton label={busy ? "Asignando…" : "Asignar"} onClick={() => patientId && testId && run("Test asignado", () => api.assignTestToPatient({ test_id: testId, patient_id: patientId }), ["test-applications", "tests"])} />
          <DismissButton onClick={dismiss} />
        </>} />
      </Card>
    );
  }

  // ── propose_receipt ─────────────────────────────────────────────────
  if (action.name === "propose_receipt") {
    const amount = num("amount");
    const status = str("status") === "pagada" ? "pagada" : "pendiente";
    // Vocabulario del módulo de facturación (Efectivo/Tarjeta/PSE/Transferencia/Convenio).
    const methodRaw = str("method").toLowerCase();
    const method = /nequi|daviplata|transfer/.test(methodRaw) ? "Transferencia"
      : /tarjeta|card/.test(methodRaw) ? "Tarjeta"
      : /pse/.test(methodRaw) ? "PSE"
      : /convenio|eps/.test(methodRaw) ? "Convenio" : "Efectivo";
    const patientId = str("patient_id");
    const cop = Number.isFinite(amount) ? new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(amount) : "—";
    return (
      <Card icon={<Receipt className="h-3.5 w-3.5" />} title="Crear recibo" muted={isMuted}>
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-ink-900">{str("patient_name") || str("patient_id")}</p>
          <div className="text-[11px] text-ink-700 leading-relaxed rounded-md border border-line-100 bg-bg-50/70 p-2 space-y-0.5">
            <p><span className="font-medium text-ink-900">Concepto:</span> {str("concept") || "Sesión"}</p>
            <p><span className="font-medium text-ink-900">Valor:</span> {cop} · {method} · {status}</p>
          </div>
        </div>
        <Footer muted={isMuted} decision={decision} actions={<>
          <ApproveButton label={busy ? "Creando…" : "Crear recibo"} onClick={() => Number.isFinite(amount) && amount > 0 && patientId && run("Recibo creado", () => api.createInvoice({
            patient_id: patientId, patient_name: str("patient_name"), concept: str("concept") || "Sesión",
            amount, method, status, date: new Date().toISOString().slice(0, 10),
          } as never), ["invoices", "invoices-summary"])} />
          <DismissButton onClick={dismiss} />
        </>} />
      </Card>
    );
  }

  // ── propose_message ─────────────────────────────────────────────────
  if (action.name === "propose_message") {
    const patientId = str("patient_id"); const text = str("text");
    return (
      <Card icon={<MessageCircle className="h-3.5 w-3.5" />} title="Enviar WhatsApp al paciente" muted={isMuted}>
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-ink-900">Para {str("patient_name") || patientId}</p>
          <div className="text-[11px] text-ink-900 leading-relaxed rounded-md border border-[#25D366]/40 bg-[#25D366]/5 p-2 whitespace-pre-wrap">{text}</div>
          <p className="text-[10px] text-ink-500 inline-flex items-center gap-1"><ShieldCheck className="h-3 w-3" /> Sale por el WhatsApp de Laura, firmado con tu nombre. Solo si el paciente tiene WhatsApp activo.</p>
        </div>
        <Footer muted={isMuted} decision={decision} actions={<>
          <ApproveButton label={busy ? "Enviando…" : "Enviar"} onClick={() => patientId && text && run("WhatsApp enviado", () => api.lauraSendWhatsapp({ patient_id: patientId, text }))} />
          <DismissButton onClick={dismiss} />
        </>} />
      </Card>
    );
  }

  // ── propose_memory ──────────────────────────────────────────────────
  if (action.name === "propose_memory") {
    const note = str("note");
    return (
      <Card icon={<Brain className="h-3.5 w-3.5" />} title="Guardar en la memoria de Laura" muted={isMuted}>
        <div className="space-y-1.5">
          <p className="text-[11px] text-ink-900 leading-relaxed rounded-md border border-line-100 bg-bg-50/70 p-2">{note}</p>
          <p className="text-[10px] text-ink-500">Laura lo tendrá en cuenta en todas tus conversaciones. Puedes verlo y editarlo desde el icono de memoria del chat.</p>
        </div>
        <Footer muted={isMuted} decision={decision} actions={<>
          <ApproveButton label={busy ? "Guardando…" : "Recordar"} onClick={() => note && run("Guardado en la memoria de Laura", () => api.lauraMemoryAppend(note), ["laura-memory"])} />
          <DismissButton onClick={dismiss} />
        </>} />
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
