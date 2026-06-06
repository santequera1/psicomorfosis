/**
 * Bus de eventos de messaging. Capa de aplicación entre los controllers
 * (appointments, documents, tareas, tests, invoices) y la lib de bajo
 * nivel (messaging.js).
 *
 * Responsabilidades:
 *   1. Cargar la config del workspace y decidir si el evento está
 *      habilitado para este workspace.
 *   2. Resolver al/los destinatario(s) (paciente / profesional / ambos)
 *      según EVENTS[type].kind.
 *   3. Verificar opt-in del paciente (sin opt-in → skip silencioso).
 *   4. Construir el `data` con los pedazos relevantes desde la BD
 *      (patient, appointment, document, etc.).
 *   5. Delegar al sender de bajo nivel y dejar un log.
 *
 * Diseño no-bloqueante: `emit()` retorna una Promise, pero los
 * controllers la deberían disparar fire-and-forget (no `await` en el
 * camino crítico de la petición HTTP del usuario). Si el envío al bot
 * tarda 8 segundos, el endpoint del front debe seguir respondiendo en
 * 100ms. Cada caller usa: `bus.emit(...).catch(logErr)` o el helper
 * `bus.emitAsync(...)` que ya ignora errores.
 */

import { db } from "../db.js";
import { EVENTS, isValidEventType } from "./messaging-events.js";
import { sendBotEvent, normalizePhone, messagingStatus } from "./messaging.js";

// ── Helpers de carga ───────────────────────────────────────────────────

function loadConfig(workspace_id) {
  return db.prepare(
    `SELECT workspace_id, enabled, sender_label, test_phone, enabled_events
     FROM workspace_messaging_config WHERE workspace_id = ?`,
  ).get(workspace_id);
}

function loadPatient(patient_id, workspace_id) {
  return db.prepare(
    `SELECT id, name, preferred_name, phone, email,
            whatsapp_opt_in, whatsapp_opt_in_at, whatsapp_opt_out_at
     FROM patients WHERE id = ? AND workspace_id = ?`,
  ).get(patient_id, workspace_id);
}

function loadWorkspaceProfessional(workspace_id) {
  // Para "professional" como destinatario tomamos al super_admin del
  // workspace (consulta individual). Si el workspace es de varios profes,
  // habría que recibir professional_id explícito en el data — fase 2.
  return db.prepare(
    `SELECT u.id, u.name, u.email, p.phone
     FROM users u
     LEFT JOIN professionals p ON p.id = u.professional_id
     WHERE u.workspace_id = ? AND u.role IN ('super_admin','admin','professional')
     ORDER BY (u.role = 'super_admin') DESC, u.id ASC
     LIMIT 1`,
  ).get(workspace_id);
}

// ── Helpers de presentación ────────────────────────────────────────────

const MONTH_ES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

function humanDate(isoDate) {
  // Espera "YYYY-MM-DD". Retorna "lunes 9 de junio". No usa Date para
  // evitar problemas de timezone con dates sin hora.
  if (!isoDate) return "";
  const [y, m, d] = isoDate.split("-").map(Number);
  if (!y || !m || !d) return isoDate;
  return `${d} de ${MONTH_ES[m - 1] ?? "?"} de ${y}`;
}

function firstName(fullName) {
  if (!fullName) return "";
  return String(fullName).trim().split(/\s+/)[0];
}

const MODALITY_ES = {
  individual: "presencial individual",
  pareja:     "presencial pareja",
  familiar:   "presencial familiar",
  tele:       "telepsicología",
};

// ── Resolución de destinatarios ────────────────────────────────────────

function buildPatientRecipient(patient) {
  if (!patient?.phone) return null;
  return {
    kind: "patient",
    id: patient.id,
    phone: normalizePhone(patient.phone),
    name: patient.preferred_name || patient.name,
    first_name: firstName(patient.preferred_name || patient.name),
  };
}

function buildProfessionalRecipient(prof) {
  if (!prof?.phone) return null;
  return {
    kind: "professional",
    id: prof.id,
    phone: normalizePhone(prof.phone),
    name: prof.name,
    first_name: firstName(prof.name),
  };
}

// ── Construcción del data por tipo de evento ───────────────────────────

function buildEventData(type, raw) {
  switch (type) {
    case "appointment.created":
    case "appointment.reminder.24h":
    case "appointment.reminder.1h":
    case "appointment.cancelled":
    case "appointment.confirmed_by_patient": {
      const a = raw.appointment ?? {};
      return {
        patient: pickPatientFields(raw.patient),
        appointment: {
          id: a.id,
          date: a.date,
          date_human: humanDate(a.date),
          time: a.time,
          duration_min: a.duration_min,
          modality: a.modality,
          modality_human: MODALITY_ES[a.modality] ?? (a.modality ?? ""),
          room: a.room,
          // Sufijo opcional para que la plantilla pueda escribir "{{mod}}{{room_suffix}}"
          // y produzca "presencial individual · Consultorio 2" o solo "telepsicología".
          room_suffix: a.room ? ` · ${a.room}` : "",
        },
      };
    }
    case "document.shared":
    case "document.signature_requested":
    case "document.signed": {
      const d = raw.document ?? {};
      return {
        patient: pickPatientFields(raw.patient),
        document: { id: d.id, name: d.name, type: d.type, kind: d.kind },
      };
    }
    case "task.assigned":
    case "task.submitted": {
      const t = raw.task ?? {};
      return {
        patient: pickPatientFields(raw.patient),
        task: {
          id: t.id,
          title: t.title,
          description: t.description,
          due_date: t.due_date,
          due_human: t.due_date ? `Para el ${humanDate(t.due_date)}` : "Sin fecha límite",
        },
      };
    }
    case "test.assigned": {
      const tt = raw.test ?? {};
      return {
        patient: pickPatientFields(raw.patient),
        test: {
          id: tt.id, name: tt.name, code: tt.code,
          duration_min: tt.duration_min ?? tt.minutes ?? 15,
        },
      };
    }
    case "invoice.paid": {
      const inv = raw.invoice ?? {};
      return {
        patient: pickPatientFields(raw.patient),
        invoice: {
          id: inv.id, concept: inv.concept,
          amount: inv.amount,
          amount_human: typeof inv.amount === "number"
            ? `COP $${inv.amount.toLocaleString("es-CO")}`
            : String(inv.amount ?? ""),
        },
      };
    }
    case "clinical_risk.alert": {
      return {
        patient: pickPatientFields(raw.patient),
        alert: raw.alert ?? { source: "test", detail: "" },
      };
    }
    case "portal.invite": {
      return {
        patient: pickPatientFields(raw.patient),
        invite_url: raw.invite_url ?? null,
      };
    }
    default:
      return raw;
  }
}

function pickPatientFields(p) {
  if (!p) return {};
  return {
    id: p.id,
    full_name: p.name,
    preferred_name: p.preferred_name,
    first_name: firstName(p.preferred_name || p.name),
  };
}

// ── Helpers de gating ──────────────────────────────────────────────────

function isEventEnabledForWorkspace(config, event_type) {
  if (!config || !config.enabled) return false;
  let list = null;
  try { list = config.enabled_events ? JSON.parse(config.enabled_events) : null; }
  catch { list = null; }
  // Si no hay lista configurada, asumimos: todos habilitados.
  if (!Array.isArray(list)) return true;
  return list.includes(event_type);
}

function isPatientOptedIn(patient) {
  if (!patient) return false;
  if (patient.whatsapp_opt_out_at) return false;
  return Boolean(patient.whatsapp_opt_in);
}

// ── API pública del bus ────────────────────────────────────────────────

/**
 * Emite un evento.
 *
 * @param {string} type — uno de EVENT_TYPES
 * @param {object} ctx  — { workspace_id, patient?, professional?,
 *                          appointment?, document?, task?, test?,
 *                          invoice?, alert?, invite_url?, idempotency_key? }
 *
 *   El caller pasa los OBJETOS YA cargados de su flujo (evita queries
 *   redundantes). El bus solo carga lo que falte (patient para opt-in,
 *   professional del workspace si no se pasó, config del workspace).
 *
 * @returns {Promise<{ok: boolean, results: Array<{kind, status, log_id?}>}>}
 */
export async function emit(type, ctx) {
  if (!isValidEventType(type)) {
    throw new Error(`messaging-bus.emit: tipo inválido "${type}"`);
  }
  const workspace_id = ctx.workspace_id;
  if (!workspace_id) throw new Error("messaging-bus.emit: falta workspace_id");

  const config = loadConfig(workspace_id);
  if (!isEventEnabledForWorkspace(config, type)) {
    return { ok: true, results: [{ kind: "skipped_workspace_disabled" }] };
  }

  // Patient puede venir en ctx o lo cargamos del id que venga adentro
  // de los pedazos relacionados (appointment.patient_id, etc.).
  let patient = ctx.patient ?? null;
  const inferredPatientId =
    ctx.appointment?.patient_id ?? ctx.document?.patient_id ??
    ctx.task?.patient_id ?? ctx.test?.patient_id ?? ctx.invoice?.patient_id ??
    ctx.alert?.patient_id ?? null;
  if (!patient && inferredPatientId) {
    patient = loadPatient(inferredPatientId, workspace_id);
  }

  const eventDef = EVENTS[type];
  const recipients = [];

  if (eventDef.kind === "patient" || eventDef.kind === "both") {
    if (patient) {
      if (!isPatientOptedIn(patient)) {
        recipients.push({ kind: "skipped_opt_out", who: "patient" });
      } else {
        const r = buildPatientRecipient(patient);
        if (r) recipients.push({ ...r, _send: true });
        else recipients.push({ kind: "skipped_no_phone", who: "patient" });
      }
    } else {
      recipients.push({ kind: "skipped_no_patient", who: "patient" });
    }
  }

  if (eventDef.kind === "professional" || eventDef.kind === "both") {
    const prof = ctx.professional ?? loadWorkspaceProfessional(workspace_id);
    const r = buildProfessionalRecipient(prof);
    if (r) recipients.push({ ...r, _send: true });
    else recipients.push({ kind: "skipped_no_phone", who: "professional" });
  }

  const data = buildEventData(type, { ...ctx, patient });
  const sender_label = config?.sender_label ?? "tu psicóloga";

  const results = [];
  for (const r of recipients) {
    if (!r._send) {
      results.push({ kind: r.kind, who: r.who });
      continue;
    }
    try {
      const res = await sendBotEvent({
        workspace_id, event_type: type,
        recipient: r, data, sender_label,
        idempotency_key: ctx.idempotency_key
          ? `${ctx.idempotency_key}:${r.kind}` : null,
      });
      results.push({ kind: r.kind, status: res.status, log_id: res.log_id });
    } catch (err) {
      console.error("[messaging-bus] envío falló", type, err);
      results.push({ kind: r.kind, status: "error", error: err.message });
    }
  }
  return { ok: true, results };
}

/**
 * Fire-and-forget para uso desde controllers HTTP: no espera, no rompe
 * la response si algo falla. El error queda en console.error y en el
 * log de outbound.
 */
export function emitAsync(type, ctx) {
  emit(type, ctx).catch((err) => {
    console.error("[messaging-bus] emit async error", type, err);
  });
}

export { messagingStatus };
