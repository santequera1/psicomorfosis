/**
 * Rutas para el bot de Laura en WhatsApp.
 *
 * Autenticación:
 *  - Todos los endpoints requieren el header `X-Bot-Api-Key` con el
 *    valor de process.env.BOT_API_KEY (definido en .env, NO commiteado).
 *  - El bot NO usa JWT de usuario. En su lugar, cuando llama a
 *    endpoints regulares de la app, manda `X-Bot-Api-Key` +
 *    `X-Bot-Actor-User-Id` — el middleware requireAuth de auth.js
 *    reconoce esa combinación y setea req.user al actor real.
 *  - Este esquema mantiene la auditoría intacta: cada request queda
 *    con el usuario que "actuó" (aunque el bot sea el llamante).
 *
 * Endpoints:
 *  - POST /api/bot/identify — phone → user context (role, ids, scope).
 */

import { Router } from "express";
import { db } from "../db.js";
import { syncBeforeNotify } from "../lib/gcal.js";
import { isBookableSlot, computeAvailability } from "./public-booking.js";
import { sendBookingRequestEmails } from "../mailer.js";
import { ensureMeetingUrl } from "../lib/video.js";
import { notifyPatientDeclined, notifyBookingRequested } from "../lib/psicobot.js";
import { notifyAsync as notifyAppointmentAsync } from "./appointments.js";

const router = Router();

const MAX_PHONE_MATCH_LEN = 15; // ITU-T E.164 max

/** Quita todo lo que no sea dígito. "+57 310 482 1290" → "573104821290" */
function normalizePhone(raw) {
  if (typeof raw !== "string") return "";
  return raw.replace(/\D/g, "");
}

/** Middleware: valida el header X-Bot-Api-Key contra BOT_API_KEY del .env.
 *  Sin BOT_API_KEY definido, rechaza todas las requests (seguridad
 *  por defecto — no queremos que un bot "abierto" existiera si alguien
 *  se olvida de configurar la key). */
function requireBotApiKey(req, res, next) {
  const expected = process.env.BOT_API_KEY?.trim();
  if (!expected) {
    return res.status(503).json({
      error: "Bot API no configurada en el servidor",
      hint: "Falta BOT_API_KEY en .env",
    });
  }
  const got = req.headers["x-bot-api-key"];
  if (!got || got !== expected) {
    return res.status(401).json({ error: "X-Bot-Api-Key inválida" });
  }
  next();
}

// SCOPE al prefijo /bot — este router está montado en /api a secas, y un
// router.use() global interceptaba TODO /api/* que cayera hasta aquí
// (p.ej. /patients/:id/notes y /diagnoses, montados después) devolviendo
// 401 "X-Bot-Api-Key inválida" a usuarios con sesión válida. Misma clase
// de bug que el de laura.js con requireAuth global (jul 2026).
router.use("/bot", requireBotApiKey);

/**
 * POST /api/bot/identify
 *
 * Body: { phone: string }
 *   Ej: { "phone": "+57 310 482 1290" } o { "phone": "573104821290" }
 *
 * Respuesta si es paciente:
 *   {
 *     kind: "patient",
 *     actor_user_id: 123,        // ← el bot usa esto en X-Bot-Actor-User-Id
 *     user_id: 123,              // (alias por claridad)
 *     workspace_id: 1,
 *     workspace_name: "Consulta Nathaly",
 *     patient: {
 *       id: "P-1013",
 *       name: "Daniel Felipe Angulo",
 *       preferred_name: null,
 *       email: "...",
 *     },
 *     professional: {            // el psicólogo del paciente
 *       id: 5,
 *       name: "Nathaly Ferrer",
 *       phone: "+57 304 219 0650",
 *     },
 *     scope: {
 *       // qué puede leer/hacer el bot en nombre de este actor
 *       can_read_own_appointments: true,
 *       can_read_own_tasks: true,
 *       can_read_own_tests: true,
 *       can_read_own_documents: true,
 *       can_confirm_own_appointments: true,
 *       can_reagenda_own_appointments: "requires_professional_approval",
 *     }
 *   }
 *
 * Respuesta si es staff:
 *   {
 *     kind: "staff",
 *     actor_user_id: 42,
 *     user_id: 42,
 *     workspace_id: 1,
 *     workspace_name: "Consulta Nathaly",
 *     role: "psicologa",
 *     name: "Nathaly Ferrer",
 *     email: "...",
 *     professional_id: 5,
 *     scope: {
 *       can_read_workspace_agenda: true,
 *       can_read_workspace_patients: true,
 *       can_read_workspace_tasks: true,
 *       can_write_appointments: true,
 *       can_write_tasks: true,
 *       is_admin: false,
 *       is_super_admin: false,
 *     }
 *   }
 *
 * Respuesta si no matchea:
 *   404 { kind: "unknown" }
 */
router.post("/bot/identify", (req, res) => {
  const raw = req.body?.phone;
  const normalized = normalizePhone(raw);
  if (!normalized || normalized.length < 6 || normalized.length > MAX_PHONE_MATCH_LEN) {
    return res.status(400).json({ error: "phone requerido (formato E.164 o dígitos)" });
  }

  // Matching flexible: el phone guardado puede tener espacios, guiones,
  // el prefijo +57, o solo el número local. Normalizamos ambos lados
  // y matcheamos por sufijo — el número puede estar guardado como
  // "+57 310 482 1290" o "3104821290" y ambos deben resolver al mismo
  // paciente. Solo comparamos los últimos 10 dígitos (el número local)
  // como fallback si el match completo falla.
  const last10 = normalized.slice(-10);

  // 1) Match staff — via professionals.phone → users con professional_id
  //    Solo consideramos usuarios que NO son pacientes.
  const staffCandidates = db.prepare(`
    SELECT
      u.id           AS user_id,
      u.workspace_id AS workspace_id,
      u.role         AS role,
      u.name         AS name,
      u.email        AS email,
      u.professional_id AS professional_id,
      p.phone        AS prof_phone,
      p.name         AS prof_name,
      w.name         AS workspace_name
    FROM users u
    JOIN professionals p ON p.id = u.professional_id
    LEFT JOIN workspaces w ON w.id = u.workspace_id
    WHERE u.role != 'paciente'
      AND p.phone IS NOT NULL
      AND p.phone != ''
  `).all();

  const staffMatch = staffCandidates.find((s) => {
    const n = normalizePhone(s.prof_phone);
    return n === normalized || n.endsWith(last10) || normalized.endsWith(n.slice(-10));
  });

  if (staffMatch) {
    return res.json({
      kind: "staff",
      actor_user_id: staffMatch.user_id,
      user_id: staffMatch.user_id,
      workspace_id: staffMatch.workspace_id,
      workspace_name: staffMatch.workspace_name ?? null,
      role: staffMatch.role,
      name: staffMatch.name,
      email: staffMatch.email,
      professional_id: staffMatch.professional_id,
      scope: {
        can_read_workspace_agenda: true,
        can_read_workspace_patients: true,
        can_read_workspace_tasks: true,
        can_read_workspace_documents: true,
        can_write_appointments: true,
        can_write_tasks: true,
        can_write_notes: true,
        is_admin: staffMatch.role === "admin" || staffMatch.role === "super_admin",
        is_super_admin: staffMatch.role === "super_admin",
      },
    });
  }

  // 2) Match paciente — via patients.phone. También devolvemos el user
  //    asociado (si el paciente activó su cuenta del portal) — el bot
  //    lo usará como actor_user_id para llamar endpoints.
  const patientCandidates = db.prepare(`
    SELECT
      p.id               AS patient_id,
      p.workspace_id     AS workspace_id,
      p.name             AS name,
      p.preferred_name   AS preferred_name,
      p.email            AS email,
      p.phone            AS phone,
      p.professional_id  AS professional_id,
      w.name             AS workspace_name,
      pr.name            AS prof_name,
      pr.phone           AS prof_phone,
      u.id               AS user_id
    FROM patients p
    LEFT JOIN workspaces w ON w.id = p.workspace_id
    LEFT JOIN professionals pr ON pr.id = p.professional_id
    LEFT JOIN users u ON u.patient_id = p.id
    WHERE p.phone IS NOT NULL
      AND p.phone != ''
      AND p.archived_at IS NULL
  `).all();

  const patientMatch = patientCandidates.find((p) => {
    const n = normalizePhone(p.phone);
    return n === normalized || n.endsWith(last10) || normalized.endsWith(n.slice(-10));
  });

  if (patientMatch) {
    return res.json({
      kind: "patient",
      // Si el paciente activó el portal, tiene user_id. Si no, es null
      // — el bot igual puede identificarlo pero no puede "actuar como
      // él" en endpoints que requieren req.user (ej: marcar tarea
      // completada). En ese caso el bot debería invitarlo a activar
      // la cuenta.
      actor_user_id: patientMatch.user_id,
      user_id: patientMatch.user_id,
      workspace_id: patientMatch.workspace_id,
      workspace_name: patientMatch.workspace_name ?? null,
      patient: {
        id: patientMatch.patient_id,
        name: patientMatch.name,
        preferred_name: patientMatch.preferred_name,
        email: patientMatch.email,
      },
      professional: patientMatch.professional_id ? {
        id: patientMatch.professional_id,
        name: patientMatch.prof_name,
        phone: patientMatch.prof_phone,
      } : null,
      account_activated: patientMatch.user_id != null,
      scope: {
        can_read_own_appointments: true,
        can_read_own_tasks: true,
        can_read_own_tests: true,
        can_read_own_documents: true,
        can_confirm_own_appointments: true,
        can_reagenda_own_appointments: "requires_professional_approval",
        can_mark_own_task_completed: true,
      },
    });
  }

  // 3) Desconocido
  return res.status(404).json({ kind: "unknown" });
});

/**
 * GET /api/bot/health
 * Diagnóstico simple para que el bot verifique que la API es alcanzable
 * y su API key es correcta. Útil para el bootstrap del bot.
 */
router.get("/bot/health", (_req, res) => {
  res.json({ ok: true, timestamp: new Date().toISOString() });
});

// ═══════════════════════════════════════════════════════════════════════
// RISK FLAGS — escalamiento clínico
// ═══════════════════════════════════════════════════════════════════════

/**
 * POST /api/bot/risk-flag
 *
 * El bot llama este endpoint cuando detecta señales de riesgo en un
 * mensaje del paciente. Registra el flag en la BD, marca el paciente
 * como risk elevado si severity es high/critical, y crea una
 * notificación urgente para el psicólogo.
 *
 * Body:
 *   {
 *     phone: string          // teléfono del paciente
 *     severity: "low"|"medium"|"high"|"critical"
 *     category: string       // "suicidal_ideation", "self_harm", "crisis", ...
 *     snippet: string        // extracto anonimizado (max 500 chars)
 *     confidence: number     // 0-1
 *   }
 *
 * Respuesta:
 *   {
 *     ok: true,
 *     flag_id: number,
 *     patient_id: string,
 *     professional: { id, name, phone, email } | null,
 *     notified: boolean      // si se disparó email al psicólogo
 *   }
 *
 * IMPORTANTE: este endpoint NO manda mensajes al paciente. El bot
 * hace la contención + líneas de emergencia por su cuenta (protocolo
 * §6.2). Este endpoint solo persiste + notifica al staff.
 */
router.post("/bot/risk-flag", async (req, res) => {
  const { phone, severity, category, snippet, confidence } = req.body ?? {};

  const validSeverities = new Set(["low", "medium", "high", "critical"]);
  if (!phone || !validSeverities.has(severity)) {
    return res.status(400).json({
      error: "phone y severity (low|medium|high|critical) requeridos",
    });
  }
  const normalized = normalizePhone(phone);
  const last10 = normalized.slice(-10);

  // Buscar paciente por phone
  const candidates = db.prepare(`
    SELECT p.id, p.workspace_id, p.name, p.preferred_name, p.email, p.phone,
           p.professional_id, p.risk,
           pr.name AS prof_name, pr.email AS prof_email, pr.phone AS prof_phone,
           w.name AS workspace_name
    FROM patients p
    LEFT JOIN professionals pr ON pr.id = p.professional_id
    LEFT JOIN workspaces w ON w.id = p.workspace_id
    WHERE p.phone IS NOT NULL AND p.phone != '' AND p.archived_at IS NULL
  `).all();
  const patient = candidates.find((p) => {
    const n = normalizePhone(p.phone);
    return n === normalized || n.endsWith(last10) || normalized.endsWith(n.slice(-10));
  });
  if (!patient) return res.status(404).json({ error: "Paciente no encontrado" });

  const cleanSnippet = String(snippet ?? "").slice(0, 500);
  const conf = typeof confidence === "number" ? Math.max(0, Math.min(1, confidence)) : null;

  // Insertar el flag
  const ins = db.prepare(`
    INSERT INTO risk_flags (workspace_id, patient_id, source, severity, category, snippet, confidence)
    VALUES (?, ?, 'whatsapp_bot', ?, ?, ?, ?)
  `).run(patient.workspace_id, patient.id, severity, String(category ?? "unspecified").slice(0, 80), cleanSnippet, conf);
  const flagId = ins.lastInsertRowid;

  // Escalar el nivel de riesgo del paciente si severity es high/critical
  // y no estaba ya en alto/crítico.
  const isEscalation = severity === "high" || severity === "critical";
  const currentRisk = String(patient.risk ?? "low").toLowerCase();
  if (isEscalation && currentRisk !== "high" && currentRisk !== "critical") {
    db.prepare("UPDATE patients SET risk = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
      .run(severity, patient.id);
  }

  // Notificación urgente en la app (bell icon del psicólogo)
  const notifId = `RF-${patient.workspace_id}-${flagId}`;
  const displayName = patient.preferred_name || patient.name?.split(" ")[0] || "un paciente";
  const title = severity === "critical"
    ? `🚨 Crisis detectada — ${displayName}`
    : `⚠️ Riesgo detectado — ${displayName}`;
  db.prepare(`
    INSERT INTO notifications (id, workspace_id, type, title, description, at, urgent)
    VALUES (?, ?, 'risk_flag', ?, ?, CURRENT_TIMESTAMP, ?)
  `).run(notifId, patient.workspace_id, title,
    `Bot de WhatsApp marcó ${severity} en un mensaje del paciente. Revisá en su ficha.`,
    isEscalation ? 1 : 0);

  // Email al psicólogo (best-effort, async)
  let notified = false;
  if (patient.prof_email) {
    notified = true;
    setImmediate(() => {
      import("../mailer.js").then(({ sendRiskFlagEmail }) => {
        if (typeof sendRiskFlagEmail === "function") {
          sendRiskFlagEmail({
            to: patient.prof_email,
            professionalName: patient.prof_name,
            patient: {
              id: patient.id,
              name: patient.name,
              preferred_name: patient.preferred_name,
            },
            severity,
            category,
            snippet: cleanSnippet,
            workspaceName: patient.workspace_name,
          }).catch((e) => console.warn(`[bot/risk-flag] email falló: ${e?.message ?? e}`));
        }
      });
    });
  }

  console.log(`[bot/risk-flag] patient=${patient.id} severity=${severity} category=${category} flag_id=${flagId}`);

  res.status(201).json({
    ok: true,
    flag_id: flagId,
    patient_id: patient.id,
    workspace_id: patient.workspace_id,
    professional: patient.professional_id ? {
      id: patient.professional_id,
      name: patient.prof_name,
      phone: patient.prof_phone,
      email: patient.prof_email,
    } : null,
    notified,
    escalated_patient_risk: isEscalation && currentRisk !== "high" && currentRisk !== "critical",
  });
});

// ═══════════════════════════════════════════════════════════════════════
// APPOINTMENTS — vocabulario + reschedule request del paciente
// ═══════════════════════════════════════════════════════════════════════

/**
 * GET /api/bot/appointment-vocab
 *
 * Devuelve los strings exactos que el bot debe usar para status en
 * PATCH /api/appointments/:id. Documentativo — se puede cachear.
 */
router.get("/bot/appointment-vocab", (_req, res) => {
  res.json({
    statuses: {
      pending: "pendiente",
      confirmed: "confirmada",
      attended: "atendida",
      // Para cancelar: NO usar status='cancelada'; usar DELETE /api/appointments/:id
      // El delete acepta body { notify: false } si querés silenciar el email.
    },
    actions: {
      confirm: { method: "PATCH", body_hint: { status: "confirmada" } },
      mark_attended: { method: "PATCH", body_hint: { status: "atendida" } },
      cancel: { method: "DELETE", body_hint: { notify: true, reason: "opcional" } },
      reschedule: {
        method: "PATCH",
        body_hint: { date: "YYYY-MM-DD", time: "HH:MM" },
        note: "Si cambian date o time, se envía email automático de reprogramación (a menos que notify=false).",
      },
    },
    modalities: ["individual", "pareja", "familiar", "grupal", "tele"],
    duration_default_min: 50,
  });
});

/**
 * POST /api/bot/reschedule-request
 *
 * El paciente pide reagendar por WhatsApp. Como el scope del paciente
 * requiere aprobación del psicólogo (requires_professional_approval),
 * no aplicamos el cambio: creamos un pedido persistente + notificación
 * urgente al staff. El psicólogo aprueba/rechaza desde la app.
 *
 * Body:
 *   {
 *     phone: string,             // del paciente
 *     appointment_id: number,    // la cita que quiere cambiar
 *     reason?: string,           // motivo dado por el paciente
 *     preferred_slots?: [        // opcional
 *       { date: "2026-07-05", time: "10:00" },
 *       ...
 *     ]
 *   }
 *
 * Respuesta:
 *   { ok: true, request_id, appointment_id, patient_id, status: "pending" }
 */
/**
 * POST /api/bot/appointments/confirm
 * body: { phone, appointment_id }
 *
 * El paciente respondió "sí" por WhatsApp. Clave por teléfono, SIN actor:
 * quien reserva desde el perfil público no tiene cuenta del portal y
 * antes el bot le pedía "activa tu cuenta" para poder confirmar — un
 * callejón sin salida para alguien que solo dejó su número.
 *
 * Seguridad: el teléfono debe pertenecer al paciente de ESA cita. Solo
 * pasa de pendiente/solicitada a confirmada; no toca citas atendidas ni
 * canceladas. Idempotente: confirmar dos veces responde ok.
 */
router.post("/bot/appointments/confirm", async (req, res) => {
  const { phone, appointment_id } = req.body ?? {};
  const apptId = Number(appointment_id);
  if (!phone || !Number.isFinite(apptId)) {
    return res.status(400).json({ error: "phone y appointment_id requeridos" });
  }
  const normalized = normalizePhone(phone);
  const last10 = normalized.slice(-10);
  const appt = db.prepare("SELECT * FROM appointments WHERE id = ?").get(apptId);
  if (!appt) return res.status(404).json({ error: "Cita no encontrada" });
  const patient = appt.patient_id
    ? db.prepare("SELECT id, name, preferred_name, phone, workspace_id FROM patients WHERE id = ?").get(appt.patient_id)
    : null;
  const n = normalizePhone(patient?.phone ?? "");
  const matches = patient && n && (n === normalized || n.endsWith(last10) || normalized.endsWith(n.slice(-10)));
  if (!matches) return res.status(403).json({ error: "La cita no pertenece a este número" });

  if (appt.status === "confirmada") {
    return res.json({ ok: true, already: true, appointment_id: apptId, status: "confirmada" });
  }
  if (!["pendiente", "solicitada"].includes(String(appt.status))) {
    return res.status(409).json({ error: `La cita está en estado "${appt.status}" y no se puede confirmar` });
  }
  db.prepare("UPDATE appointments SET status = 'confirmada' WHERE id = ?").run(apptId);
  let row = db.prepare("SELECT * FROM appointments WHERE id = ?").get(apptId);
  // Igual que al confirmar desde la agenda: calendario del profesional
  // (esperando Meet si aplica) y aviso al paciente con .ics y enlace. Una
  // solicitud web confirmada por WhatsApp no recibía nunca el enlace.
  const wasRequest = appt.status === "solicitada";
  row = await syncBeforeNotify(row);
  if (wasRequest) notifyAppointmentAsync({ kind: "appointment_created", appointment: row });
  req.app.get("io")?.to(`ws-${row.workspace_id}`).emit("appointment:updated", row);
  console.log(`[bot] paciente ${patient.id} confirmó cita ${apptId} por WhatsApp`);
  res.json({ ok: true, appointment_id: apptId, status: "confirmada", patient_id: patient.id });
});

router.post("/bot/reschedule-request", (req, res) => {
  const { phone, appointment_id, reason, preferred_slots } = req.body ?? {};
  const apptId = Number(appointment_id);
  if (!phone || !Number.isFinite(apptId)) {
    return res.status(400).json({ error: "phone y appointment_id requeridos" });
  }
  const normalized = normalizePhone(phone);
  const last10 = normalized.slice(-10);

  // Buscar paciente por phone
  const candidates = db.prepare(`
    SELECT id, workspace_id, name, preferred_name, phone
    FROM patients
    WHERE phone IS NOT NULL AND phone != '' AND archived_at IS NULL
  `).all();
  const patient = candidates.find((p) => {
    const n = normalizePhone(p.phone);
    return n === normalized || n.endsWith(last10) || normalized.endsWith(n.slice(-10));
  });
  if (!patient) return res.status(404).json({ error: "Paciente no encontrado" });

  // Validar que la cita existe y es del paciente
  const appt = db.prepare("SELECT * FROM appointments WHERE id = ? AND workspace_id = ?")
    .get(apptId, patient.workspace_id);
  if (!appt) return res.status(404).json({ error: "Cita no encontrada" });
  if (appt.patient_id !== patient.id) {
    return res.status(403).json({ error: "La cita no pertenece a este paciente" });
  }

  const slotsJson = Array.isArray(preferred_slots) && preferred_slots.length > 0
    ? JSON.stringify(preferred_slots.slice(0, 5))
    : null;
  const cleanReason = String(reason ?? "").slice(0, 500);

  const ins = db.prepare(`
    INSERT INTO reschedule_requests (workspace_id, appointment_id, patient_id, reason, preferred_slots, source, status)
    VALUES (?, ?, ?, ?, ?, 'whatsapp_bot', 'pending')
  `).run(patient.workspace_id, apptId, patient.id, cleanReason, slotsJson);
  const reqId = ins.lastInsertRowid;

  // Notificación al staff
  const notifId = `RR-${patient.workspace_id}-${reqId}`;
  const displayName = patient.preferred_name || patient.name?.split(" ")[0] || "el paciente";
  const description = slotsJson
    ? `Pidió reagendar ${appt.date} ${appt.time} y propuso alternativas. Revisá en agenda.`
    : `Pidió reagendar ${appt.date} ${appt.time} sin proponer horarios. Escribile para coordinar.`;
  db.prepare(`
    INSERT INTO notifications (id, workspace_id, type, title, description, at, urgent)
    VALUES (?, ?, 'reschedule_request', ?, ?, CURRENT_TIMESTAMP, 0)
  `).run(notifId, patient.workspace_id, `📅 ${displayName} pide reagendar`, description);

  // WhatsApp al profesional además de la campana: "X avisó que no podrá
  // asistir". El bot despacha el rendered_message tal cual (a3c6773).
  const prof = appt.professional_id
    ? db.prepare(`
        SELECT p.id, p.name, p.phone, u.id AS user_id
        FROM professionals p
        LEFT JOIN users u ON u.professional_id = p.id AND u.role <> 'paciente'
        WHERE p.id = ?
      `).get(appt.professional_id)
    : null;
  if (prof) notifyPatientDeclined({ professional: prof, patient, appointment: appt, reason: cleanReason });

  console.log(`[bot/reschedule-request] patient=${patient.id} appt=${apptId} slots=${slotsJson ? "yes" : "no"}`);

  res.status(201).json({
    ok: true,
    request_id: reqId,
    appointment_id: apptId,
    patient_id: patient.id,
    workspace_id: patient.workspace_id,
    status: "pending",
    original: { date: appt.date, time: appt.time },
  });
});

// ═══════════════════════════════════════════════════════════════════════
// OPT-IN / OPT-OUT de WhatsApp
// ═══════════════════════════════════════════════════════════════════════

/**
 * POST /api/bot/opt-out
 *
 * El paciente pidió salir de las comunicaciones por WhatsApp (STOP,
 * BAJA, "no me escribas más", etc.). Marca whatsapp_opt_in=0 en
 * patients + registra el timestamp del opt-out. La plataforma dejará
 * de pushear recordatorios automáticos por WhatsApp a este número.
 *
 * Body: { phone: string }
 * Respuesta: { ok: true, patient_id, opted_out_at }
 *
 * El bot debe seguir respondiendo mensajes entrantes (para poder
 * gestionar re-optin), pero no debe iniciar outbound salvo por
 * pedido explícito.
 */
router.post("/bot/opt-out", (req, res) => {
  const { phone } = req.body ?? {};
  if (!phone) return res.status(400).json({ error: "phone requerido" });
  const normalized = normalizePhone(phone);
  const last10 = normalized.slice(-10);

  const candidates = db.prepare(`
    SELECT id, workspace_id, phone, whatsapp_opt_in FROM patients
    WHERE phone IS NOT NULL AND phone != '' AND archived_at IS NULL
  `).all();
  const patient = candidates.find((p) => {
    const n = normalizePhone(p.phone);
    return n === normalized || n.endsWith(last10) || normalized.endsWith(n.slice(-10));
  });
  if (!patient) return res.status(404).json({ error: "Paciente no encontrado" });

  db.prepare(`
    UPDATE patients
    SET whatsapp_opt_in = 0,
        whatsapp_opt_out_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(patient.id);

  console.log(`[bot/opt-out] patient=${patient.id} phone=${phone}`);
  res.json({
    ok: true,
    patient_id: patient.id,
    workspace_id: patient.workspace_id,
    opted_out_at: new Date().toISOString(),
  });
});

/**
 * POST /api/bot/opt-in
 *
 * El paciente aceptó recibir comunicaciones por WhatsApp (contraparte
 * de opt-out). Marca whatsapp_opt_in=1 + timestamp.
 */
router.post("/bot/opt-in", (req, res) => {
  const { phone } = req.body ?? {};
  if (!phone) return res.status(400).json({ error: "phone requerido" });
  const normalized = normalizePhone(phone);
  const last10 = normalized.slice(-10);

  const candidates = db.prepare(`
    SELECT id, workspace_id, phone FROM patients
    WHERE phone IS NOT NULL AND phone != '' AND archived_at IS NULL
  `).all();
  const patient = candidates.find((p) => {
    const n = normalizePhone(p.phone);
    return n === normalized || n.endsWith(last10) || normalized.endsWith(n.slice(-10));
  });
  if (!patient) return res.status(404).json({ error: "Paciente no encontrado" });

  db.prepare(`
    UPDATE patients
    SET whatsapp_opt_in = 1,
        whatsapp_opt_in_at = CURRENT_TIMESTAMP,
        whatsapp_opt_out_at = NULL,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(patient.id);

  console.log(`[bot/opt-in] patient=${patient.id}`);
  res.json({
    ok: true,
    patient_id: patient.id,
    workspace_id: patient.workspace_id,
    opted_in_at: new Date().toISOString(),
  });
});

// ═══════════════════════════════════════════════════════════════════════
// TESTS — marcar como enviado offline
// ═══════════════════════════════════════════════════════════════════════

/**
 * POST /api/bot/tests/:id/mark-submitted
 *
 * Caso: el paciente respondió el test por otro canal (papel, Google
 * Forms, chat con el psicólogo) y le dice al bot "ya lo entregué".
 * El bot marca la aplicación como 'entregado_offline' — el psicólogo
 * la ve como completada pero SIN score (porque no hay respuestas
 * calculables en la app).
 *
 * Body: { phone: string, note?: string }
 * Respuesta: { ok, test_application_id, status }
 *
 * NO calcula score. Si el psicólogo quiere score, tiene que digitalizar
 * las respuestas y usar POST /api/tests/applications/:id/submit desde
 * la web.
 */
router.post("/bot/tests/:id/mark-submitted", (req, res) => {
  const applicationId = req.params.id;
  const { phone, note } = req.body ?? {};
  if (!phone) return res.status(400).json({ error: "phone requerido" });
  const normalized = normalizePhone(phone);
  const last10 = normalized.slice(-10);

  const application = db.prepare("SELECT * FROM test_applications WHERE id = ?").get(applicationId);
  if (!application) return res.status(404).json({ error: "Test application no encontrada" });

  // Validar que el paciente del test matchea con el phone
  const patient = db.prepare(`
    SELECT id, name, preferred_name, phone, workspace_id FROM patients
    WHERE id = ? AND archived_at IS NULL
  `).get(application.patient_id);
  if (!patient) return res.status(404).json({ error: "Paciente no encontrado" });

  const patientPhone = normalizePhone(patient.phone ?? "");
  const matches = patientPhone === normalized
    || patientPhone.endsWith(last10)
    || normalized.endsWith(patientPhone.slice(-10));
  if (!matches) {
    return res.status(403).json({ error: "El phone no corresponde al paciente de este test" });
  }

  if (application.status === "completado" || application.status === "entregado_offline") {
    return res.status(409).json({ error: "Test ya está marcado como completado" });
  }

  const cleanNote = String(note ?? "").slice(0, 500);
  db.prepare(`
    UPDATE test_applications
    SET status = 'entregado_offline',
        completed_at = CURRENT_TIMESTAMP,
        interpretation = COALESCE(interpretation, '') || CASE WHEN ? != '' THEN char(10) || 'Paciente reportó vía WhatsApp: ' || ? ELSE '' END
    WHERE id = ?
  `).run(cleanNote, cleanNote, applicationId);

  // Notificación al staff
  const displayName = patient.preferred_name || patient.name?.split(" ")[0] || "el paciente";
  const notifId = `TS-${application.workspace_id}-${applicationId}-${Date.now().toString(36)}`;
  db.prepare(`
    INSERT INTO notifications (id, workspace_id, type, title, description, at, urgent)
    VALUES (?, ?, 'test_offline_delivery', ?, ?, CURRENT_TIMESTAMP, 0)
  `).run(notifId, application.workspace_id,
    `📝 ${displayName} entregó el test`,
    `Reportó por WhatsApp que ya completó "${application.test_name}". Revisá si necesitás digitalizar respuestas para score.`);

  console.log(`[bot/tests/mark-submitted] app=${applicationId} patient=${patient.id}`);

  res.json({
    ok: true,
    test_application_id: applicationId,
    patient_id: patient.id,
    status: "entregado_offline",
  });
});


// ─── Agendamiento de citas NUEVAS por WhatsApp (handoff 4 sep 2026) ────
//
// Caso Oriana: una paciente escribe "¿cómo programo la siguiente cita?"
// y el bot no tenía con qué responder. Estos dos endpoints le dan:
//   1) booking-info  → contexto: quién es, su psicólogo, si hay enlace
//      público, su próxima cita y horarios libres cercanos.
//   2) appointment-request → crear la SOLICITUD (misma tubería del
//      enlace público: cita 'solicitada' + campana urgente + correo +
//      WhatsApp al profesional; el psicólogo confirma desde su agenda).

/** Profesional identificado por su teléfono (Mi perfil). */
function findProfessionalByLast10(last10) {
  const rows = db.prepare("SELECT id, workspace_id, name, phone FROM professionals WHERE active = 1 AND phone IS NOT NULL AND phone != ''").all();
  return rows.find((pr) => normalizePhone(pr.phone).slice(-10) === last10) ?? null;
}

const isIsoDay = (v) => /^\d{4}-\d{2}-\d{2}$/.test(String(v ?? ""));
function botRange(req) {
  // Default: mes en curso (Bogotá).
  const hoy = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const from = isIsoDay(req.query.from) ? String(req.query.from) : hoy.slice(0, 8) + "01";
  const to = isIsoDay(req.query.to) ? String(req.query.to) : hoy;
  return from <= to ? { from, to } : { from: to, to: from };
}

/**
 * GET /api/bot/stats/appointments?phone=&from=&to=
 * "¿Cómo me fue este mes?" — agregados de citas del profesional
 * identificado por su teléfono. Solo números, nunca nombres de pacientes.
 */
router.get("/bot/stats/appointments", (req, res) => {
  const last10 = normalizePhone(String(req.query.phone ?? "")).slice(-10);
  if (last10.length < 7) return res.status(400).json({ error: "phone requerido" });
  const prof = findProfessionalByLast10(last10);
  if (!prof) return res.status(404).json({ error: "professional_not_found" });
  const { from, to } = botRange(req);
  const r = db.prepare(`
    SELECT COUNT(*) AS total,
           SUM(CASE WHEN status = 'atendida' THEN 1 ELSE 0 END) AS atendidas,
           SUM(CASE WHEN status = 'cancelada' THEN 1 ELSE 0 END) AS canceladas,
           SUM(CASE WHEN status = 'no_show' THEN 1 ELSE 0 END) AS no_show,
           SUM(CASE WHEN status IN ('pendiente', 'confirmada', 'solicitada') THEN 1 ELSE 0 END) AS abiertas
    FROM appointments
    WHERE professional_id = ? AND date >= ? AND date <= ?
  `).get(prof.id, from, to);
  res.json({
    professional: prof.name,
    rango: { from, to },
    total: r.total ?? 0,
    atendidas: r.atendidas ?? 0,
    canceladas: r.canceladas ?? 0,
    no_show: r.no_show ?? 0,
    abiertas: r.abiertas ?? 0,
  });
});

/**
 * GET /api/bot/finances/summary?phone=&from=&to=
 * "¿Cuánto facturé esta semana?" — SOLO agregados del workspace del
 * profesional (montos y conteos por estado). Nada de detalle por
 * paciente por este canal.
 */
router.get("/bot/finances/summary", (req, res) => {
  const last10 = normalizePhone(String(req.query.phone ?? "")).slice(-10);
  if (last10.length < 7) return res.status(400).json({ error: "phone requerido" });
  const prof = findProfessionalByLast10(last10);
  if (!prof) return res.status(404).json({ error: "professional_not_found" });
  const { from, to } = botRange(req);
  const agg = (status) => db.prepare(
    "SELECT COUNT(*) AS n, COALESCE(SUM(amount), 0) AS s FROM invoices WHERE workspace_id = ? AND status = ? AND date >= ? AND date <= ?",
  ).get(prof.workspace_id, status, from, to);
  const pagada = agg("pagada"), pendiente = agg("pendiente"), vencida = agg("vencida");
  res.json({
    professional: prof.name,
    rango: { from, to },
    pagado_cop: pagada.s, recibos_pagados: pagada.n,
    pendiente_cop: pendiente.s, recibos_pendientes: pendiente.n,
    vencido_cop: vencida.s, recibos_vencidos: vencida.n,
  });
});

/** Pacientes activos cuyo teléfono termina en los mismos 10 dígitos. */
function findPatientsByLast10(last10) {
  const rows = db.prepare(`
    SELECT id, workspace_id, professional_id, name, preferred_name, phone, email, modality
    FROM patients
    WHERE archived_at IS NULL AND phone IS NOT NULL AND phone != ''
  `).all();
  return rows.filter((p) => normalizePhone(p.phone).slice(-10) === last10);
}

function professionalFor(pt) {
  if (pt.professional_id) {
    const pr = db.prepare("SELECT id, name, email, phone, slug, public_enabled FROM professionals WHERE id = ?").get(pt.professional_id);
    if (pr) return pr;
  }
  return db.prepare("SELECT id, name, email, phone, slug, public_enabled FROM professionals WHERE workspace_id = ? AND active = 1 ORDER BY id LIMIT 1").get(pt.workspace_id) ?? null;
}

/**
 * GET /api/bot/booking-info?phone=...
 * Contexto de agendamiento del paciente identificado por su número.
 * Puede haber varias coincidencias (misma persona, paciente de dos
 * psicólogos): el bot desambigua preguntando.
 */
router.get("/bot/booking-info", (req, res) => {
  const last10 = normalizePhone(String(req.query.phone ?? "")).slice(-10);
  if (last10.length < 7) return res.status(400).json({ error: "phone requerido (mínimo 7 dígitos)" });

  const matches = findPatientsByLast10(last10);
  if (matches.length === 0) return res.json({ found: false, matches: [] });

  const out = matches.map((pt) => {
    const prof = professionalFor(pt);
    const next = db.prepare(`
      SELECT id, date, time, status, modality FROM appointments
      WHERE patient_id = ? AND workspace_id = ?
        AND status NOT IN ('cancelada', 'atendida', 'no_show')
        AND date >= date('now', '-5 hours')
      ORDER BY date, time LIMIT 1
    `).get(pt.id, pt.workspace_id);
    let slots = null;
    if (prof) {
      const av = computeAvailability(prof.id, { days: 5 });
      slots = av.days.slice(0, 3).map((d) => ({ date: d.date, times: d.slots.slice(0, 5) }));
    }
    return {
      patient: { id: pt.id, name: pt.name, preferred_name: pt.preferred_name },
      professional: prof
        ? {
            name: prof.name,
            public_enabled: !!(prof.public_enabled && prof.slug),
            public_url: prof.public_enabled && prof.slug ? `https://psicomorfosis.co/perfil/${prof.slug}` : null,
          }
        : null,
      next_appointment: next ?? null,
      available_slots: slots,
    };
  });
  res.json({ found: true, matches: out });
});

/**
 * POST /api/bot/appointment-request
 * body: { phone, date: "YYYY-MM-DD", time: "HH:mm", modality?, motivo?, patient_id? }
 * Crea la solicitud de cita nueva. Si el número coincide con pacientes
 * de varios workspaces, exige patient_id (el bot desambigua primero).
 */
router.post("/bot/appointment-request", (req, res) => {
  const { phone, date, time, modality, motivo, patient_id } = req.body ?? {};
  const last10 = normalizePhone(String(phone ?? "")).slice(-10);
  if (last10.length < 7) return res.status(400).json({ error: "phone requerido" });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date ?? "")) || !/^\d{2}:\d{2}$/.test(String(time ?? ""))) {
    return res.status(400).json({ error: "date (YYYY-MM-DD) y time (HH:mm) requeridos" });
  }

  let matches = findPatientsByLast10(last10);
  if (patient_id) matches = matches.filter((m) => m.id === String(patient_id));
  if (matches.length === 0) return res.status(404).json({ error: "patient_not_found" });
  if (matches.length > 1) {
    return res.status(409).json({
      error: "multiple_patients",
      hint: "El número coincide con varios pacientes; reintenta con patient_id.",
      matches: matches.map((m) => ({ patient_id: m.id, name: m.name, professional: professionalFor(m)?.name ?? null })),
    });
  }
  const pt = matches[0];
  const prof = professionalFor(pt);
  if (!prof) return res.status(409).json({ error: "no_professional", hint: "El workspace no tiene profesional activo." });

  if (!isBookableSlot(prof.id, String(date), String(time))) {
    const av = computeAvailability(prof.id, { days: 5 });
    return res.status(409).json({
      error: "slot_not_available",
      reason: "Ese horario está fuera del horario de atención del profesional.",
      available_slots: av.days.slice(0, 3).map((d) => ({ date: d.date, times: d.slots.slice(0, 5) })),
    });
  }
  const taken = db.prepare(
    "SELECT 1 FROM appointments WHERE professional_id = ? AND date = ? AND time = ? AND status != 'cancelada'",
  ).get(prof.id, String(date), String(time));
  if (taken) {
    const av = computeAvailability(prof.id, { days: 5 });
    return res.status(409).json({
      error: "slot_taken",
      reason: "Ese horario ya está ocupado.",
      available_slots: av.days.slice(0, 3).map((d) => ({ date: d.date, times: d.slots.slice(0, 5) })),
    });
  }

  const wantsTele = ["tele", "virtual", "videollamada", "online"].includes(String(modality ?? "").toLowerCase());
  const mod = wantsTele ? "tele" : (String(modality ?? "").toLowerCase() === "presencial" ? "individual" : (pt.modality ?? "individual"));
  const cleanMotivo = motivo ? String(motivo).slice(0, 300) : null;

  const info = db.prepare(`
    INSERT INTO appointments (workspace_id, sede_id, professional_id, patient_id, date, time,
                              duration_min, patient_name, professional, modality, room, status, notes, created_at)
    VALUES (?, NULL, ?, ?, ?, ?, 50, ?, ?, ?, ?, 'solicitada', ?, datetime('now'))
  `).run(pt.workspace_id, prof.id, pt.id, String(date), String(time), pt.name, prof.name,
         mod, mod === "tele" ? null : "Por confirmar",
         `[solicitud-whatsapp]${cleanMotivo ? ` ${cleanMotivo}` : ""}`);
  const apptId = info.lastInsertRowid;
  ensureMeetingUrl(db.prepare("SELECT * FROM appointments WHERE id = ?").get(apptId));
  console.log(`[bot/appointment-request] appt=${apptId} patient=${pt.id} prof=${prof.id} ${date} ${time}`);

  try {
    db.prepare(`
      INSERT OR IGNORE INTO notifications (id, workspace_id, type, title, description, at, read, urgent)
      VALUES (?, ?, 'cita', ?, ?, CURRENT_TIMESTAMP, 0, 1)
    `).run(
      `appt-${apptId}-solicitud`,
      pt.workspace_id,
      `Solicitud de cita: ${pt.name} · ${date} ${time}`,
      `Pedida por WhatsApp con Laura (${mod === "tele" ? "videollamada" : "presencial"})${cleanMotivo ? ` · "${cleanMotivo.slice(0, 80)}"` : ""}. Confírmala o propón otro horario.`,
    );
  } catch (e) {
    console.warn(`[bot/appointment-request] notif fail: ${e?.message}`);
  }
  try {
    notifyBookingRequested({
      professional: { name: prof.name, phone: prof.phone },
      patient: { name: pt.name, phone: pt.phone },
      appointment: { id: apptId, date: String(date), time: String(time), modality: mod },
      motivo: cleanMotivo,
      source: "por WhatsApp con Laura",
    });
  } catch (e) {
    console.warn(`[bot/appointment-request] notify fail: ${e?.message}`);
  }
  sendBookingRequestEmails({
    professional: { name: prof.name, email: prof.email },
    patient: { name: pt.name, phone: pt.phone, email: pt.email },
    appointment: { date: String(date), time: String(time), modality: mod },
    motivo: cleanMotivo,
  }).catch((e) => console.warn(`[bot/appointment-request] mail fail: ${e?.message}`));

  res.status(201).json({
    ok: true,
    appointment_id: apptId,
    status: "solicitada",
    patient: { id: pt.id, name: pt.name },
    professional_name: prof.name,
    date: String(date),
    time: String(time),
    modality: mod,
    message: `Solicitud registrada. ${prof.name.split(" ")[0]} la verá en su agenda y la confirmará; el paciente recibirá la confirmación por WhatsApp y correo.`,
  });
});

export default router;
