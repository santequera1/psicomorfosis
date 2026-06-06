/**
 * Rutas del módulo de messaging:
 *
 *   PUBLIC (firmadas, sin JWT):
 *     POST  /api/webhooks/messaging    — entrante desde el bot
 *
 *   STAFF (requireAuth):
 *     GET   /api/messaging/status       — diagnóstico de la config
 *     GET   /api/messaging/config       — config del workspace del user
 *     PATCH /api/messaging/config       — actualizar config
 *     GET   /api/messaging/templates    — listar plantillas + defaults
 *     PATCH /api/messaging/templates/:event_type — guardar plantilla custom
 *     POST  /api/messaging/test         — disparar evento de prueba
 *     GET   /api/messaging/log          — historial de envíos
 *
 *   PATIENT (requirePatient):
 *     POST  /api/portal/me/whatsapp-opt-in   — paciente acepta
 *     POST  /api/portal/me/whatsapp-opt-out  — paciente se da de baja
 *
 * El webhook entrante NO usa el body parser global (express.json en
 * index.js) porque necesitamos el raw body como string EXACTO para
 * verificar la firma HMAC. Por eso registra su propio middleware con
 * `express.raw`.
 */

import { Router } from "express";
import { db } from "../db.js";
import { requireAuth, requirePatient } from "../auth.js";
import { EVENTS, EVENT_TYPES, isValidEventType } from "../lib/messaging-events.js";
import { DEFAULT_TEMPLATES } from "../lib/messaging-templates.js";
import { verifyInbound, messagingStatus } from "../lib/messaging.js";
import * as bus from "../lib/messaging-bus.js";

const router = Router();

// ════════════════════════════════════════════════════════════════════════
// WEBHOOK ENTRANTE — bot → Psicomorfosis
// ════════════════════════════════════════════════════════════════════════

/**
 * El bot externo nos avisa de cosas que pasaron al otro lado:
 *   - "patient_reply"      : el paciente respondió un texto libre
 *   - "patient_confirmed"  : respondió SÍ a un recordatorio
 *   - "patient_cancelled"  : respondió NO / CANCELAR
 *   - "patient_opt_out"    : escribió STOP / PARAR
 *   - "delivery_status"    : ack de entrega (sent/delivered/read)
 *   - "clinical_risk_signal": detección de la IA del bot
 *
 * Contrato del body:
 *   {
 *     event_id: "<uuid>",            -- dedupe
 *     event: "patient_reply" | ...,
 *     workspace_id: number,
 *     occurred_at: ISO,
 *     phone: "+57...",
 *     payload: { ... }                -- específico por tipo
 *   }
 *
 * El body llega como raw Buffer (sin parser JSON) porque la firma se
 * calcula sobre el string exacto. Express.raw nos da `req.body` como
 * Buffer.
 */
router.post(
  "/webhooks/messaging",
  (req, res) => {
    // `req.rawBody` lo deja el parser JSON global (verify callback en
    // index.js) como Buffer con los bytes exactos enviados por el cliente.
    // NO usamos `JSON.stringify(req.body)` porque puede diferir en
    // whitespace / orden de keys y eso rompe la firma.
    const rawBody = req.rawBody instanceof Buffer ? req.rawBody.toString("utf8") : "";
    const sigHeader = req.get("X-Psicomorfosis-Signature") ?? "";
    const secret = process.env.MESSAGING_INBOUND_SECRET;

    if (!secret) {
      console.warn("[messaging] webhook rechazado: MESSAGING_INBOUND_SECRET no configurado");
      return res.status(503).json({ error: "Webhook deshabilitado" });
    }
    if (!verifyInbound(rawBody, sigHeader, secret)) {
      // No revelamos por qué falló (timing, replay, hex mismatch). Solo 401.
      return res.status(401).json({ error: "Firma inválida" });
    }

    // El body ya viene parseado por express.json — no re-parsear.
    const body = req.body ?? {};
    const { event_id, event, workspace_id, phone, payload, occurred_at } = body;
    if (!event_id || !event) {
      return res.status(400).json({ error: "Faltan event_id o event" });
    }

    // Deduplicación. INSERT puede colisionar con PK; si pasa, ya lo
    // procesamos antes — devolvemos 200 igual (bot satisfecho, no
    // re-intenta) pero marcamos para que no se reprocese.
    let isDuplicate = false;
    try {
      db.prepare(
        `INSERT INTO messaging_inbound_events (event_id, workspace_id, event_type, payload_json)
         VALUES (?, ?, ?, ?)`,
      ).run(event_id, workspace_id ?? null, event, JSON.stringify(body));
    } catch (err) {
      if (/UNIQUE/i.test(String(err?.message)) || /PRIMARY KEY/i.test(String(err?.message))) {
        isDuplicate = true;
      } else {
        console.error("[messaging] error guardando inbound event:", err);
        return res.status(500).json({ error: "internal" });
      }
    }
    if (isDuplicate) {
      return res.json({ ok: true, deduped: true });
    }

    // Procesamiento por tipo. Fire-and-forget para no atrasar la
    // respuesta al bot.
    try {
      handleInboundEvent(event, { workspace_id, phone, payload, occurred_at });
    } catch (err) {
      console.error("[messaging] handler error", event, err);
    }
    return res.json({ ok: true });
  },
);

function handleInboundEvent(event, ctx) {
  const { workspace_id, phone, payload = {} } = ctx;
  switch (event) {
    case "patient_opt_out":
      patientOptOutByPhone(workspace_id, phone, "remoto:STOP");
      break;
    case "patient_confirmed":
      markAppointmentConfirmedByPhone(workspace_id, phone, payload);
      break;
    case "patient_cancelled":
      markAppointmentCancelledByPhone(workspace_id, phone, payload);
      break;
    case "patient_reply":
    case "delivery_status":
    case "clinical_risk_signal":
      // v1: solo registramos en inbound_events (ya quedó arriba).
      // El bot puede usar `clinical_risk_signal` para alertar al psic.;
      // a futuro lo conectamos a `clinical_risk.alert` emitido al revés.
      break;
    default:
      console.warn("[messaging] evento entrante no manejado:", event);
  }
}

function patientOptOutByPhone(workspace_id, phone, source) {
  if (!phone) return;
  const norm = phone.replace(/[^\d+]/g, "");
  // Match laxo: el phone en patients puede tener formato distinto. Por eso
  // buscamos por sufijo de 10 dígitos (números colombianos).
  const tail = norm.slice(-10);
  const candidates = db.prepare(
    `SELECT id, phone FROM patients
     WHERE workspace_id = ? AND phone LIKE ?`,
  ).all(workspace_id ?? 0, `%${tail}`);
  for (const p of candidates) {
    db.prepare(
      `UPDATE patients
       SET whatsapp_opt_in = 0, whatsapp_opt_out_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
    ).run(p.id);
  }
  console.log(`[messaging] opt-out aplicado a ${candidates.length} pacientes (source=${source})`);
}

function markAppointmentConfirmedByPhone(_workspace_id, _phone, _payload) {
  // Placeholder. Sprint 2: localizar la cita por idempotency_key del
  // recordatorio original y poner status='confirmada'. Por ahora solo
  // queda registrado el evento entrante.
}

function markAppointmentCancelledByPhone(_workspace_id, _phone, _payload) {
  // Placeholder. Sprint 2: marcar cita como 'cancelada_por_paciente' y
  // disparar appointment.cancelled hacia el profesional.
}

// ════════════════════════════════════════════════════════════════════════
// STAFF — config y diagnóstico
// ════════════════════════════════════════════════════════════════════════

router.get("/messaging/status", requireAuth, (_req, res) => {
  res.json(messagingStatus());
});

router.get("/messaging/config", requireAuth, (req, res) => {
  const row = db.prepare(
    `SELECT workspace_id, enabled, sender_label, test_phone, enabled_events, updated_at
     FROM workspace_messaging_config WHERE workspace_id = ?`,
  ).get(req.user.workspace_id);
  if (!row) {
    return res.json({
      workspace_id: req.user.workspace_id,
      enabled: false,
      sender_label: null,
      test_phone: null,
      enabled_events: null,
      updated_at: null,
    });
  }
  res.json({
    ...row,
    enabled: Boolean(row.enabled),
    enabled_events: row.enabled_events ? JSON.parse(row.enabled_events) : null,
  });
});

router.patch("/messaging/config", requireAuth, (req, res) => {
  const { enabled, sender_label, test_phone, enabled_events } = req.body ?? {};
  const wsid = req.user.workspace_id;

  // Validación: enabled_events debe ser array de strings válidos
  let eventsJson = null;
  if (enabled_events !== undefined) {
    if (enabled_events === null) eventsJson = null;
    else if (!Array.isArray(enabled_events)) {
      return res.status(400).json({ error: "enabled_events debe ser array" });
    } else {
      const invalid = enabled_events.filter((e) => !isValidEventType(e));
      if (invalid.length) {
        return res.status(400).json({ error: `Eventos inválidos: ${invalid.join(", ")}` });
      }
      eventsJson = JSON.stringify(enabled_events);
    }
  }

  const existing = db.prepare(
    "SELECT workspace_id FROM workspace_messaging_config WHERE workspace_id = ?",
  ).get(wsid);

  if (!existing) {
    db.prepare(
      `INSERT INTO workspace_messaging_config
       (workspace_id, enabled, sender_label, test_phone, enabled_events)
       VALUES (?, ?, ?, ?, ?)`,
    ).run(
      wsid,
      enabled ? 1 : 0,
      sender_label ?? null,
      test_phone ?? null,
      eventsJson,
    );
  } else {
    // Update parcial: solo los campos provistos.
    const sets = ["updated_at = CURRENT_TIMESTAMP"];
    const args = [];
    if (enabled !== undefined)       { sets.push("enabled = ?");        args.push(enabled ? 1 : 0); }
    if (sender_label !== undefined)  { sets.push("sender_label = ?");   args.push(sender_label); }
    if (test_phone !== undefined)    { sets.push("test_phone = ?");     args.push(test_phone); }
    if (enabled_events !== undefined){ sets.push("enabled_events = ?"); args.push(eventsJson); }
    db.prepare(`UPDATE workspace_messaging_config SET ${sets.join(", ")} WHERE workspace_id = ?`)
      .run(...args, wsid);
  }
  res.json({ ok: true });
});

/**
 * Lista todos los eventos del catálogo con su plantilla actual
 * (custom del workspace si existe, default si no) y un flag is_custom
 * para que la UI sepa si se está mostrando la default o una guardada.
 */
router.get("/messaging/templates", requireAuth, (req, res) => {
  const customs = db.prepare(
    `SELECT event_type, body_text, enabled
     FROM message_templates
     WHERE workspace_id = ? AND channel = 'whatsapp'`,
  ).all(req.user.workspace_id);
  const customByType = new Map(customs.map((c) => [c.event_type, c]));

  const rows = EVENT_TYPES.map((type) => {
    const custom = customByType.get(type);
    return {
      event_type: type,
      description: EVENTS[type].description,
      kind: EVENTS[type].kind,
      body_text: custom?.body_text ?? DEFAULT_TEMPLATES[type] ?? "",
      enabled: custom ? Boolean(custom.enabled) : true,
      is_custom: Boolean(custom),
    };
  });
  res.json(rows);
});

router.patch("/messaging/templates/:event_type", requireAuth, (req, res) => {
  const { event_type } = req.params;
  if (!isValidEventType(event_type)) {
    return res.status(400).json({ error: "event_type inválido" });
  }
  const { body_text, enabled } = req.body ?? {};
  if (typeof body_text !== "string" || body_text.length < 1) {
    return res.status(400).json({ error: "body_text es requerido" });
  }
  if (body_text.length > 4096) {
    return res.status(400).json({ error: "body_text excede 4096 chars" });
  }

  db.prepare(
    `INSERT INTO message_templates (workspace_id, event_type, channel, body_text, enabled)
     VALUES (?, ?, 'whatsapp', ?, ?)
     ON CONFLICT (workspace_id, event_type, channel)
     DO UPDATE SET body_text = excluded.body_text,
                   enabled = excluded.enabled,
                   updated_at = CURRENT_TIMESTAMP`,
  ).run(req.user.workspace_id, event_type, body_text, enabled === false ? 0 : 1);
  res.json({ ok: true });
});

/**
 * Dispara un evento de prueba contra el bot. Tres modos:
 *   - `test_phone`: usa el del workspace_messaging_config.test_phone
 *   - `patient_id`: dispara contra el opt-in real del paciente
 *   - sin nada: usa test_phone como fallback
 *
 * Genera datos sintéticos plausibles para variables del template (ej:
 * fecha = mañana, modalidad = individual). Útil para verificar que el
 * bot recibe la forma correcta antes de mandar a pacientes reales.
 */
router.post("/messaging/test", requireAuth, async (req, res) => {
  const { event_type, patient_id } = req.body ?? {};
  if (!isValidEventType(event_type)) {
    return res.status(400).json({ error: "event_type inválido" });
  }
  const config = db.prepare(
    `SELECT enabled, sender_label, test_phone FROM workspace_messaging_config WHERE workspace_id = ?`,
  ).get(req.user.workspace_id);

  // Recipient: paciente real (si pidió uno) o sintético sobre test_phone.
  let recipient = null;
  let patient = null;
  if (patient_id) {
    patient = db.prepare(
      `SELECT id, name, preferred_name, phone, whatsapp_opt_in, whatsapp_opt_out_at
       FROM patients WHERE id = ? AND workspace_id = ?`,
    ).get(patient_id, req.user.workspace_id);
    if (!patient) return res.status(404).json({ error: "Paciente no encontrado" });
  } else {
    const phone = config?.test_phone;
    if (!phone) {
      return res.status(400).json({
        error: "Configura test_phone en /api/messaging/config o pasa patient_id",
      });
    }
    recipient = {
      kind: "patient",
      id: "TEST",
      phone,
      name: "Paciente de prueba",
      first_name: "Paciente",
    };
  }

  // Data sintética
  const tomorrow = new Date(Date.now() + 24 * 3600 * 1000)
    .toISOString().slice(0, 10);
  const ctx = {
    workspace_id: req.user.workspace_id,
    patient: patient ?? { id: "TEST", name: "Paciente de prueba", preferred_name: "Paciente" },
    appointment: { id: 0, date: tomorrow, time: "10:00", modality: "individual", room: "Consultorio A", duration_min: 50 },
    document: { id: "DOC-TEST", name: "Documento de prueba", type: "informe", kind: "editor" },
    task: { id: 0, title: "Tarea de prueba", description: "Esto es una prueba", due_date: tomorrow },
    test: { id: "TEST-001", name: "Test de prueba", code: "TEST", duration_min: 10 },
    invoice: { id: 0, concept: "Sesión de prueba", amount: 180000 },
    alert: { source: "test", detail: "Esto es una alerta de prueba" },
    invite_url: "https://psico.wailus.co/p/activar/test",
    idempotency_key: `test-${event_type}-${Date.now()}`,
  };

  if (recipient) {
    // Modo test_phone: bypass del bus (no carga patient ni opt-in)
    const { sendBotEvent } = await import("../lib/messaging.js");
    const result = await sendBotEvent({
      workspace_id: req.user.workspace_id,
      event_type,
      recipient,
      data: ctx,
      sender_label: config?.sender_label ?? "tu psicóloga",
      idempotency_key: ctx.idempotency_key,
    });
    return res.json(result);
  }

  const result = await bus.emit(event_type, ctx);
  res.json(result);
});

router.get("/messaging/log", requireAuth, (req, res) => {
  const limit = Math.min(Number(req.query.limit ?? 50), 200);
  const rows = db.prepare(
    `SELECT id, event_type, recipient_kind, recipient_phone,
            status, bot_response_code, error, sent_at, idempotency_key,
            rendered_message
     FROM messaging_outbound_log
     WHERE workspace_id = ?
     ORDER BY id DESC LIMIT ?`,
  ).all(req.user.workspace_id, limit);
  res.json(rows);
});

// ════════════════════════════════════════════════════════════════════════
// PATIENT — opt-in / opt-out
// ════════════════════════════════════════════════════════════════════════

router.post("/portal/me/whatsapp-opt-in", requirePatient, (req, res) => {
  const r = db.prepare(
    `UPDATE patients
     SET whatsapp_opt_in = 1,
         whatsapp_opt_in_at = CURRENT_TIMESTAMP,
         whatsapp_opt_out_at = NULL
     WHERE id = ? AND workspace_id = ?`,
  ).run(req.user.patient_id, req.user.workspace_id);
  if (r.changes === 0) return res.status(404).json({ error: "Paciente no encontrado" });
  res.json({ ok: true, opted_in: true });
});

router.post("/portal/me/whatsapp-opt-out", requirePatient, (req, res) => {
  const r = db.prepare(
    `UPDATE patients
     SET whatsapp_opt_in = 0,
         whatsapp_opt_out_at = CURRENT_TIMESTAMP
     WHERE id = ? AND workspace_id = ?`,
  ).run(req.user.patient_id, req.user.workspace_id);
  if (r.changes === 0) return res.status(404).json({ error: "Paciente no encontrado" });
  res.json({ ok: true, opted_in: false });
});

export default router;
