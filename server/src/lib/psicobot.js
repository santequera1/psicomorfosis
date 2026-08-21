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
    `👤 ${patient.name}\n📱 ${patient.phone}\n` +
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
