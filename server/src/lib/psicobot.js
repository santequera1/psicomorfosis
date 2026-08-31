import { db } from "../db.js";
/**
 * Cliente para el bot de Laura en WhatsApp (psicobot.wailus.co).
 *
 * Contrato: ver laura/HANDOFF_RECORDATORIOS.md. El bot expone
 *   POST /psico/event
 *
 * con header X-Psico-Secret y un body con:
 *   - event               (appointment.created, task.assigned, ...)
 *   - idempotency_key     (único por intento)
 *   - recipient           (phone + ids + role)
 *   - data                (payload específico del evento)
 *   - rendered_message    (texto YA formateado — el bot lo manda tal cual)
 *
 * Todo el envío es fire-and-forget con setImmediate — nunca bloquea
 * la respuesta al staff. Errores se logean pero no se propagan.
 *
 * Reglas de negocio:
 *   1. Si el recipient es paciente y whatsapp_opt_in=0, se saltea
 *      silenciosamente (el paciente pidió dejar de recibir).
 *   2. Si el recipient no tiene phone, se saltea.
 *   3. rendered_message lo arma acá — el copy vive en las funciones
 *      buildXxxMessage() para poder cambiarlo sin tocar los endpoints.
 *   4. idempotency_key incluye entidad + evento + timestamp para
 *      permitir reintentos manuales sin duplicar.
 */

import crypto from "node:crypto";

const DEFAULT_URL = "https://psicobot.wailus.co/psico/event";
const DEFAULT_TIMEOUT_MS = 8000;

function getConfig() {
  return {
    url: (process.env.PSICOBOT_URL || DEFAULT_URL).trim(),
    secret: (process.env.PSICOBOT_SECRET || "").trim(),
  };
}

function configured() {
  const c = getConfig();
  return !!(c.url && c.secret);
}

/**
 * POST bajo nivel al endpoint del bot. Devuelve { ok, status, body }.
 * NO tira errores — los captura y devuelve ok:false. Los callers usan
 * setImmediate(() => pushEvent(...)) para no bloquear.
 */
async function pushEventRaw(payload) {
  const c = getConfig();
  if (!c.secret) {
    return { ok: false, status: 0, body: "PSICOBOT_SECRET no configurado" };
  }

  const controller = new AbortController();
  const tm = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
  try {
    const res = await fetch(c.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Psico-Secret": c.secret,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    const text = await res.text().catch(() => "");
    clearTimeout(tm);
    return { ok: res.ok, status: res.status, body: text.slice(0, 300) };
  } catch (err) {
    clearTimeout(tm);
    return { ok: false, status: 0, body: String(err?.message ?? err).slice(0, 300) };
  }
}

/**
 * Wrapper con log: dispara el push y logea el resultado. Se usa desde
 * setImmediate en los callers.
 */
async function pushAndLog(payload) {
  const start = Date.now();
  const r = await pushEventRaw(payload);
  const ms = Date.now() - start;
  const label = `[psicobot] ${payload.event} to=${payload.recipient?.phone ?? "?"}`;
  if (r.ok) {
    console.log(`${label} → ${r.status} in ${ms}ms`);
  } else {
    console.warn(`${label} FAILED status=${r.status} ms=${ms} body=${r.body}`);
  }
  return r;
}

/**
 * Chequea que el recipient (si es paciente) tiene opt-in activo y
 * tiene phone. Devuelve true si podemos pushear, false si hay que
 * saltearse silenciosamente.
 */
function canPush(patient) {
  if (!patient?.phone || String(patient.phone).replace(/\D/g, "").length < 6) {
    return false;
  }
  // whatsapp_opt_in solo aplica a pacientes. Si es 0, respetamos el
  // opt-out. Si es null/undefined (paciente viejo sin este campo),
  // asumimos opt-in=false por default — mejor error del lado seguro.
  if (patient.whatsapp_opt_in !== 1 && patient.whatsapp_opt_in !== true) {
    return false;
  }
  return true;
}

function firstName(patient) {
  if (!patient) return "";
  const pref = patient.preferred_name?.trim();
  if (pref) return pref;
  const parts = String(patient.name ?? "").trim().split(/\s+/);
  return parts[0] ?? "";
}

function fmtDate(dateIso) {
  if (!dateIso) return "";
  try {
    const d = new Date(dateIso + "T00:00:00");
    return d.toLocaleDateString("es-CO", { day: "numeric", month: "long" });
  } catch { return dateIso; }
}

function buildRecipient(patient) {
  return {
    phone: patient.phone,
    name: patient.name,
    role: "paciente",
    workspace_id: patient.workspace_id ?? null,
    patient_id: patient.id ?? null,
    user_id: patient.user_id ?? null,
  };
}

// ═════════════════════════════════════════════════════════════════════
// EVENTOS — cada uno arma su payload y dispara pushAndLog con setImmediate
// ═════════════════════════════════════════════════════════════════════

/**
 * Cita creada. El paciente puede responder "sí" para confirmar.
 * data.appointment.id es OBLIGATORIO para que el bot pueda hacer el
 * SÍ/NO cuando el paciente responda.
 */
export function notifyAppointmentCreated({ patient, appointment, professionalName }) {
  if (!configured() || !canPush(patient)) return;
  const name = firstName(patient) || "";
  const saludo = name ? `Hola ${name} 👋` : "Hola 👋";
  const profStr = professionalName ? ` con ${professionalName}` : "";
  const videoLine = appointment.meeting_url
    ? `\n🎥 Videollamada: ${appointment.meeting_url}\n(ábrelo a la hora de la sesión, sin instalar nada)`
    : "";
  const rendered = `${saludo} Te agendé una cita${profStr}:\n\n📅 ${fmtDate(appointment.date)} · ${appointment.time}\n⏰ ${appointment.duration_min ?? 50} min · ${appointment.modality || "individual"}${videoLine}\n\nResponde *sí* para confirmar o *no puedo* si no podrás asistir.`;

  const payload = {
    event: "appointment.created",
    idempotency_key: `evt_appt_created_${appointment.id}_${Date.now()}`,
    recipient: buildRecipient(patient),
    data: {
      appointment: {
        id: appointment.id,
        date: appointment.date,
        time: appointment.time,
        modality: appointment.modality,
        professional_name: professionalName ?? null,
      },
    },
    rendered_message: rendered,
  };
  setImmediate(() => pushAndLog(payload));
}

/**
 * Cita cancelada por el staff.
 */
export function notifyAppointmentCancelled({ patient, appointment, professionalName }) {
  if (!configured() || !canPush(patient)) return;
  const name = firstName(patient) || "";
  const saludo = name ? `Hola ${name}` : "Hola";
  const profStr = professionalName ? ` con ${professionalName}` : "";
  const rendered = `${saludo}, te aviso que se canceló la cita${profStr} del ${fmtDate(appointment.date)} a las ${appointment.time}. Si querés reagendar, escribime *nueva cita* y coordinamos con tu profesional.`;

  const payload = {
    event: "appointment.cancelled",
    idempotency_key: `evt_appt_cancelled_${appointment.id}_${Date.now()}`,
    recipient: buildRecipient(patient),
    data: {
      appointment: {
        id: appointment.id,
        date: appointment.date,
        time: appointment.time,
      },
    },
    rendered_message: rendered,
  };
  setImmediate(() => pushAndLog(payload));
}

/**
 * Tarea terapéutica asignada al paciente.
 */
export function notifyTaskAssigned({ patient, task, professionalName, portalUrl }) {
  if (!configured() || !canPush(patient)) return;
  const name = firstName(patient) || "";
  const saludo = name ? `Hola ${name}` : "Hola";
  const profStr = professionalName ? `${professionalName} te asignó` : "Te asigné";
  const dueLine = task?.due_at
    ? `\n📅 Vence: ${fmtDate(task.due_at?.slice(0, 10))}`
    : "";
  const urlLine = portalUrl ? `\n\nVerla en tu portal: ${portalUrl}` : "";
  const rendered = `${saludo}, ${profStr} una nueva tarea:\n\n✅ *${task.title}*${dueLine}${urlLine}\n\nCuando la termines, responde *hecho* y yo la marco.`;

  const payload = {
    event: "task.assigned",
    idempotency_key: `evt_task_assigned_${task.id}_${Date.now()}`,
    recipient: buildRecipient(patient),
    data: {
      task: {
        id: task.id,
        title: task.title,
        due_at: task.due_at,
        type: task.type,
      },
    },
    rendered_message: rendered,
  };
  setImmediate(() => pushAndLog(payload));
}

/**
 * Test psicométrico asignado al paciente.
 */
export function notifyTestAssigned({ patient, test, professionalName, portalUrl }) {
  if (!configured() || !canPush(patient)) return;
  const name = firstName(patient) || "";
  const saludo = name ? `Hola ${name}` : "Hola";
  const profStr = professionalName ? `${professionalName} te asignó` : "Te asigné";
  const itemsLine = test?.total_items
    ? `\n${test.total_items} preguntas · aprox ${Math.max(5, Math.round(test.total_items / 8))} min`
    : "";
  const urlLine = portalUrl ? `\n\nResponderlo: ${portalUrl}` : "";
  const rendered = `${saludo}, ${profStr} un cuestionario para responder:\n\n🧠 *${test.test_name}*${itemsLine}${urlLine}\n\nNo hay respuestas buenas ni malas. Podés pausar y retomar cuando quieras.`;

  const payload = {
    event: "test.assigned",
    idempotency_key: `evt_test_assigned_${test.id ?? test.test_code}_${patient.id}_${Date.now()}`,
    recipient: buildRecipient(patient),
    data: {
      test: {
        id: test.id ?? null,
        test_code: test.test_code ?? null,
        test_name: test.test_name,
        total_items: test.total_items ?? null,
      },
    },
    rendered_message: rendered,
  };
  setImmediate(() => pushAndLog(payload));
}

/**
 * Documento compartido con el paciente. requiresSignature diferencia
 * "solo lectura" (event=document.shared) de "hay que firmar"
 * (event=document.signature_requested).
 */
export function notifyDocumentShared({ patient, doc, professionalName, url, requiresSignature, daysValid }) {
  if (!configured() || !canPush(patient)) return;
  const name = firstName(patient) || "";
  const saludo = name ? `Hola ${name}` : "Hola";
  const profStr = professionalName || "tu psicóloga/o";
  const rendered = requiresSignature
    ? `${saludo}, ${profStr} te comparte un documento que necesita *tu firma*:\n\n📄 ${doc.name}\n\nPodés leerlo y firmarlo directo en el navegador (no necesitás descargar nada):\n${url}\n\nEl enlace es válido por ${daysValid || 5} días.`
    : `${saludo}, ${profStr} te compartió un documento:\n\n📄 ${doc.name}\n\nVerlo en tu portal: ${url}`;

  const payload = {
    event: requiresSignature ? "document.signature_requested" : "document.shared",
    idempotency_key: `evt_doc_${requiresSignature ? "sign" : "share"}_${doc.id}_${Date.now()}`,
    recipient: buildRecipient(patient),
    data: {
      document: {
        id: doc.id,
        name: doc.name,
        type: doc.type,
        url,
        requires_signature: !!requiresSignature,
      },
    },
    rendered_message: rendered,
  };
  setImmediate(() => pushAndLog(payload));
}

/**
 * Invitación al portal del paciente (cuando el staff genera un link
 * de activación).
 */
export function notifyPortalInvite({ patient, url, professionalName, daysValid }) {
  // EXCEPCIÓN a la regla de opt-in: la invitación al portal es la
  // PRIMERA comunicación autorizada por el psicólogo. Todavía no hay
  // whatsapp_opt_in (justamente el paciente lo aceptará al activar
  // su cuenta). Basta con que tenga phone. Si el paciente ya hizo
  // opt-out explícito antes, respetarlo.
  if (!configured()) return;
  if (!patient?.phone || String(patient.phone).replace(/\D/g, "").length < 6) return;
  if (patient.whatsapp_opt_in === 0 && patient.whatsapp_opt_out_at) return; // opt-out explícito

  const name = firstName(patient) || "";
  const saludo = name ? `Hola ${name} 👋` : "Hola 👋";
  const profStr = professionalName || "tu psicóloga/o";
  const rendered = `${saludo} ${profStr} te invita al portal donde vas a ver tus citas, tareas y documentos:\n\n${url}\n\nCreá tu contraseña ahí (el enlace vale ${daysValid || 5} días). Si tenés dudas, respondeme por acá.`;

  const payload = {
    event: "portal.invite",
    idempotency_key: `evt_portal_invite_${patient.id}_${Date.now()}`,
    recipient: buildRecipient(patient),
    data: {
      url,
      days_valid: daysValid || 5,
    },
    rendered_message: rendered,
  };
  setImmediate(() => pushAndLog(payload));
}

/**
 * El psicólogo (o el paciente desde su portal) activó "Autoriza mensajes
 * por WhatsApp". El bot arma la bienvenida —se presenta, dice para qué
 * escribe y cómo responder NO— y registra el opt-in de su lado. Contrato:
 * psicomorfosis_bot/docs/GUIA_BOT_DESDE_PLATAFORMA.md §3.2.
 */
export function notifyPatientOptIn({ patient, professionalName }) {
  if (!configured()) return;
  const phone = toE164Co(patient?.phone);
  if (!phone || phone.length < 12) return;
  const day = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const payload = {
    event: "patient.whatsapp_optin",
    idempotency_key: `optin-${patient.id}-${day}`,
    recipient: { ...buildRecipient(patient), phone },
    data: { professional: { name: professionalName || null } },
  };
  setImmediate(() => pushAndLog(payload));
}

/**
 * El paciente pidió cambiar la hora desde su portal. Aviso al PROFESIONAL
 * (sin opt-in: es su herramienta). La cita queda "solicitada" hasta que
 * confirme desde Solicitudes.
 */
export function notifyRescheduleRequested({ professional, patient, appointment, previous }) {
  if (!configured()) return;
  if (!professional?.phone || String(professional.phone).replace(/\D/g, "").length < 6) return;
  const rendered =
    `🔁 *${patient?.name ?? "Un paciente"} pidió cambiar su cita* desde el portal\n\n` +
    `Antes: ${fmtDate(previous.date)} · ${previous.time}\n` +
    `Ahora pide: ${fmtDate(appointment.date)} · ${appointment.time}` +
    `\n\nEntra a tu agenda (botón *Solicitudes*) para confirmarla o proponer otra hora.`;
  const payload = {
    event: "appointment.reschedule_requested",
    idempotency_key: `evt_resched_req_${appointment.id}_${Date.now()}`,
    recipient: { phone: toE164Co(professional.phone), name: professional.name, role: "psicologo", workspace_id: appointment.workspace_id ?? null },
    data: { appointment_id: appointment.id, patient_id: patient?.id ?? null, previous, date: appointment.date, time: appointment.time },
    rendered_message: rendered,
  };
  setImmediate(() => pushAndLog(payload));
}

/**
 * El paciente respondió por WhatsApp que NO podrá asistir (o pidió
 * reagendar). Aviso al PROFESIONAL por WhatsApp — el bot ya tiene el
 * evento appointment.reschedule_requested en su catálogo (a3c6773).
 * Solo al psicólogo: el paciente ya recibió su respuesta de Laura.
 */
export function notifyPatientDeclined({ professional, patient, appointment, reason }) {
  if (!configured()) return;
  if (!professional?.phone || String(professional.phone).replace(/\D/g, "").length < 6) return;
  const rendered =
    `⚠️ *${patient?.name ?? "Un paciente"}* avisó que no podrá asistir a la cita del *${fmtDate(appointment.date)} · ${appointment.time}*.` +
    (reason ? `\n\n📝 ${String(reason).slice(0, 300)}` : "") +
    `\n\nEntra a tu agenda para reagendarla o proponerle otro horario.`;
  const payload = {
    event: "appointment.reschedule_requested",
    idempotency_key: `evt_resched_${appointment.id}_${Date.now()}`,
    recipient: {
      phone: toE164Co(professional.phone), name: professional.name, role: "psicologo",
      workspace_id: appointment.workspace_id ?? null, user_id: professional.user_id ?? null,
    },
    data: {
      appointment: { id: appointment.id, date: appointment.date, time: appointment.time, modality: appointment.modality ?? null },
      patient: { name: patient?.name ?? null, phone: patient?.phone ?? null },
      reason: reason ? String(reason).slice(0, 300) : null,
    },
    rendered_message: rendered,
  };
  setImmediate(() => pushAndLog(payload));
}

/** El paciente canceló desde su portal: aviso al PROFESIONAL. */
export function notifyCancelledByPatient({ professional, patient, appointment }) {
  if (!configured()) return;
  if (!professional?.phone || String(professional.phone).replace(/\D/g, "").length < 6) return;
  const rendered =
    `❌ *${patient?.name ?? "Un paciente"} canceló su cita* desde el portal\n\n` +
    `📅 ${fmtDate(appointment.date)} · ${appointment.time}` +
    `\n\nEl hueco queda libre en tu agenda.`;
  const payload = {
    event: "appointment.cancelled",
    idempotency_key: `evt_cancel_by_patient_${appointment.id}`,
    recipient: { phone: toE164Co(professional.phone), name: professional.name, role: "psicologo", workspace_id: appointment.workspace_id ?? null },
    data: { appointment_id: appointment.id, patient_id: patient?.id ?? null, by: "paciente" },
    rendered_message: rendered,
  };
  setImmediate(() => pushAndLog(payload));
}

/**
 * Solicitud de cita desde el perfil público (linktree). El destinatario
 * es el PROFESIONAL — el staff no requiere opt-in (es su herramienta de
 * trabajo). Le avisa al instante para que acepte/rechace desde su agenda.
 */
export function notifyBookingRequested({ professional, patient, appointment, motivo }) {
  if (!configured()) return;
  if (!professional?.phone || String(professional.phone).replace(/\D/g, "").length < 6) return;

  const fecha = fmtDate(appointment.date);
  const mod = appointment.modality === "tele" ? "online" : "presencial";
  const rendered =
    `📥 *Nueva solicitud de cita* desde tu perfil público\n\n` +
    `👤 ${patient.name}${patient.age ? ` · ${patient.age} años` : ""}\n📱 ${patient.phone}\n` +
    `📅 ${fecha} · ${appointment.time} · ${mod}` +
    (motivo ? `\n📝 "${motivo}"` : "") +
    `\n\nEntra a tu agenda para *confirmarla o proponer otro horario*.`;

  const payload = {
    event: "booking.requested",
    idempotency_key: `evt_booking_req_${appointment.id}`,
    recipient: {
      phone: professional.phone,
      name: professional.name,
      role: "psicologo",
      workspace_id: professional.workspace_id ?? null,
    },
    data: {
      appointment: {
        id: appointment.id,
        date: appointment.date,
        time: appointment.time,
        modality: appointment.modality,
      },
      patient: { name: patient.name, phone: patient.phone },
      motivo: motivo || null,
    },
    rendered_message: rendered,
  };
  setImmediate(() => pushAndLog(payload));
}

// Export helpers para tests y para el health-check
export const _internals = {
  configured,
  canPush,
  firstName,
  fmtDate,
  buildRecipient,
  pushEventRaw,
};

/**
 * Teléfono a E.164 colombiano: "300 123 4567" → "+573001234567". Si ya
 * trae indicativo (+57 / 57…) lo respeta. Evolution rechaza números sin
 * indicativo que no sean celulares colombianos.
 */
export function toE164Co(phone) {
  const d = String(phone ?? "").replace(/\D/g, "");
  if (!d) return null;
  if (d.length === 10) return `+57${d}`;
  if (d.length === 12 && d.startsWith("57")) return `+${d}`;
  return `+${d}`;
}

/**
 * El psicólogo acaba de poner (o cambiar) su WhatsApp. El bot arma la
 * bienvenida y lo suscribe a los avisos proactivos (recordatorio 30 min
 * antes de cada cita). Contrato: docs/bot-laura.md §3.2.
 */
export function notifyStaffWhatsappLinked({ user, professional }) {
  if (!configured()) return;
  const phone = toE164Co(professional?.phone);
  if (!phone || phone.length < 12) return;
  const day = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const payload = {
    event: "staff.whatsapp_linked",
    idempotency_key: `staff-${user.id}-linked-${day}`,
    recipient: {
      phone,
      name: user.name || professional.name,
      role: "psicologo",
      workspace_id: user.workspace_id ?? null,
      user_id: user.id,
    },
    data: { professional_id: professional.id },
    rendered_message: null,
  };
  setImmediate(() => pushAndLog(payload));
}

/**
 * Mensaje libre al paciente, redactado por Laura y APROBADO por el
 * profesional en la tarjeta. Respeta opt-in y teléfono como cualquier
 * otro aviso. Devuelve true si se encoló.
 */
export async function notifyPatientMessage({ patient, text, professionalName }) {
  if (!configured()) return { ok: false, reason: "bot_no_configurado" };
  if (!canPush(patient)) return { ok: false, reason: !patient?.phone ? "sin_telefono" : "sin_opt_in" };
  const body = String(text ?? "").trim().slice(0, 1500);
  if (!body) return { ok: false, reason: "texto_vacio" };
  const firma = professionalName ? `\n\n— ${professionalName}, vía Laura (Psicomorfosis)` : "\n\n— Enviado desde Psicomorfosis";
  const payload = {
    event: "patient.message",
    idempotency_key: `evt_patient_msg_${patient.id}_${Date.now()}`,
    recipient: buildRecipient(patient),
    data: { patient_id: patient.id, from: professionalName ?? null },
    rendered_message: body + firma,
  };
  // Acción iniciada por el profesional con un clic: se espera la
  // respuesta del bot para poder decirle "enviado" o "falló" de verdad.
  const r = await pushEventRaw(payload);
  console.log(`[psicobot] patient.message to=${patient.phone} → ${r.ok ? r.status : "FAIL " + r.status + " " + r.body}`);
  return r.ok ? { ok: true } : { ok: false, reason: "bot_error", detail: `${r.status} ${r.body}`.slice(0, 200) };
}

/**
 * Notificación persistente "pon tu WhatsApp" para cuentas nuevas sin
 * teléfono. Queda en la campanita hasta que la lea o ponga el número
 * (el PATCH de profesional la marca leída). Complementa el banner del
 * dashboard, que se puede cerrar.
 */
export function notifyWhatsappSetup(workspaceId, userId) {
  try {
    db.prepare(`
      INSERT OR IGNORE INTO notifications (id, workspace_id, type, title, description, at, read, urgent)
      VALUES (?, ?, 'ajuste', 'Activa los avisos de Laura por WhatsApp', 'Pon tu número en Perfil profesional: recibirás reservas desde tu perfil público, confirmaciones y recordatorios.', CURRENT_TIMESTAMP, 0, 0)
    `).run(`ajuste-whatsapp-${userId}`, workspaceId);
  } catch (e) { console.warn("[notif] whatsapp setup:", e?.message); }
}
