import { Router } from "express";
import { db } from "../db.js";
import { requireAuth } from "../auth.js";
import { sendAppointmentEmail } from "../mailer.js";
import { notifyAppointmentCreated, notifyAppointmentCancelled } from "../lib/psicobot.js";
import { ensureMeetingUrl } from "../lib/video.js";
import { syncBeforeNotify, syncAppointmentAsync, removeEventAsync } from "../lib/gcal.js";

/**
 * Dispara una notificación por email de manera asíncrona y NO bloqueante.
 * Cualquier error queda contenido dentro del mailer (que loguea a email_log).
 * El propósito de este wrapper es desacoplar el envío del flujo HTTP — la
 * respuesta de la API ya salió cuando el email se está mandando.
 */
/**
 * Resuelve el "lugar" de una cita como string listo para el email.
 *
 * Prioridad:
 *   1. Telepsicología (texto fijo)
 *   2. Sede asignada (sede_id): "<nombre> · <dirección>"
 *   3. room libre: si coincide con settings.consultorio_name, enriquecer
 *      con la dirección del consultorio principal; si no, devolverlo
 *      tal cual (probablemente texto libre tipo "domicilio paciente").
 *   4. Vacío.
 */
function buildAppointmentLocation({ appointment, sede, settings }) {
  if (appointment.modality === "tele" || appointment.modality === "virtual") {
    // El enlace va aparte como botón en el correo (ver mailer); aquí
    // solo el texto de la fila "Lugar".
    return appointment.meeting_url
      ? "Telepsicología (videollamada — botón más abajo)"
      : "Telepsicología (videollamada — el enlace te lo compartirá tu psicóloga/o)";
  }
  if (sede) {
    return sede.address ? `${sede.name} · ${sede.address}` : sede.name;
  }
  const room = appointment.room?.trim();
  if (room) {
    if (settings?.consultorio_name === room && settings.address) {
      return `${room} · ${settings.address}`;
    }
    return room;
  }
  return "";
}

export function notifyAsync({ kind, appointment, previous }) {
  setImmediate(() => {
    try {
      // Traemos phone y whatsapp_opt_in además de email para poder
      // pushear al bot de WhatsApp también (best-effort, respeta opt-in).
      const patient = appointment.patient_id
        ? db.prepare("SELECT id, name, preferred_name, email, phone, whatsapp_opt_in, workspace_id FROM patients WHERE id = ? AND workspace_id = ?")
            .get(appointment.patient_id, appointment.workspace_id)
        : null;
      if (!patient) return; // sin paciente no hay a quién notificar
      const professional = appointment.professional_id
        ? db.prepare("SELECT id, name, title, email FROM professionals WHERE id = ?")
            .get(appointment.professional_id)
        : null;
      const workspace = db.prepare("SELECT name FROM workspaces WHERE id = ?")
        .get(appointment.workspace_id);

      // Push al bot de Laura (WhatsApp). La función internamente valida
      // opt-in y phone; si no aplica se saltea silenciosamente.
      if (kind === "appointment_created") {
        notifyAppointmentCreated({
          patient,
          appointment,
          professionalName: professional?.name,
        });
      } else if (kind === "appointment_cancelled") {
        notifyAppointmentCancelled({
          patient,
          appointment,
          professionalName: professional?.name,
        });
      }
      // appointment_rescheduled se cubre con el email por ahora. Cuando
      // haya scheduler de reminders, incluir un evento propio.

      // Resolver "lugar" para que el email lo muestre completo (nombre
      // del consultorio + dirección). Sin esto, el paciente solo recibía
      // un nombre suelto sin saber dónde es.
      const sede = appointment.sede_id
        ? db.prepare("SELECT id, name, address FROM sedes WHERE id = ? AND workspace_id = ?")
            .get(appointment.sede_id, appointment.workspace_id)
        : null;
      const settings = Object.fromEntries(
        db.prepare("SELECT key, value FROM settings WHERE workspace_id = ?")
          .all(appointment.workspace_id)
          .map((s) => [s.key, s.value]),
      );
      const location = buildAppointmentLocation({ appointment, sede, settings });

      sendAppointmentEmail({
        kind,
        appointment,
        patient,
        professional,
        workspaceName: workspace?.name ?? null,
        replyTo: professional?.email ?? undefined,
        location,
        previous,
      }).catch((err) => console.warn("[mailer] notifyAsync caught:", err?.message));
    } catch (err) {
      console.warn("[mailer] notifyAsync setup failed:", err?.message);
    }
  });
}

const router = Router();
router.use(requireAuth);

/**
 * Auto-marcado de citas pasadas como "atendida".
 *
 * Lazy: corre antes de cada GET de appointments del workspace. Si una cita
 * tiene status "pendiente" o "confirmada" y su hora de fin (date + time +
 * duration_min) ya pasó hace al menos `GRACE_MIN`, se marca como atendida.
 *
 * Usamos lazy en vez de cron para no necesitar un proceso separado y
 * porque el efecto solo importa cuando alguien mira la agenda. La grace
 * window de 30 min es para no marcar citas que JUSTO acaban de empezar
 * (la psicóloga puede estar en sesión sin haber dado click a "Atender").
 */
const ATTEND_GRACE_MIN = 30;

// Colombia es siempre UTC-5 (sin horario de verano).
const COLOMBIA_OFFSET_MS = -5 * 60 * 60 * 1000;
function colombiaDateIso(date) {
  return new Date(date.getTime() + COLOMBIA_OFFSET_MS).toISOString().slice(0, 10);
}

function autoMarkPastAppointmentsAttended(workspaceId) {
  const now = new Date();
  // Solo escaneamos las del día de hoy y hacia atrás (las futuras nunca
  // están "pasadas"). Limitamos a últimas 14 días para mantener la
  // query barata. Usamos la fecha de Colombia para evitar marcar citas
  // del día siguiente cuando el servidor está en UTC.
  const todayIso = colombiaDateIso(now);
  const fourteenDaysAgo = colombiaDateIso(new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000));
  const candidates = db.prepare(`
    SELECT id, date, time, duration_min FROM appointments
    WHERE workspace_id = ?
      AND status IN ('pendiente', 'confirmada')
      AND date >= ? AND date <= ?
  `).all(workspaceId, fourteenDaysAgo, todayIso);

  if (candidates.length === 0) return;
  const upd = db.prepare("UPDATE appointments SET status = 'atendida' WHERE id = ? AND workspace_id = ?");
  for (const c of candidates) {
    if (!c.date || !c.time) continue;
    // Hora de Colombia explícita (-05:00, sin horario de verano). Sin la
    // zona, Node la leía como UTC en el servidor y marcaba "atendidas" citas
    // que aún faltaban hasta 5 horas (bug visto el 27 ago 2026: 11:30 y
    // 14:30 cerradas a las 11:11; el bot dejaba de recordarlas).
    const startMs = Date.parse(`${c.date}T${c.time}:00-05:00`);
    if (Number.isNaN(startMs)) continue;
    const endMs = startMs + (c.duration_min ?? 50) * 60 * 1000;
    const graceMs = endMs + ATTEND_GRACE_MIN * 60 * 1000;
    if (now.getTime() >= graceMs) {
      upd.run(c.id, workspaceId);
    }
  }
}

router.get("/", (req, res) => {
  // Antes de devolver, hacemos una pasada para marcar citas pasadas como
  // atendidas automáticamente. Idempotente — si ya están en otro estado
  // (cancelada, atendida, no_show), no se tocan.
  try { autoMarkPastAppointmentsAttended(req.user.workspace_id); } catch { /* no bloquear el GET */ }

  const { date, from, to, professional_id, sede_id, patient_id, status } = req.query;
  let sql = "SELECT * FROM appointments WHERE workspace_id = ?";
  const args = [req.user.workspace_id];
  if (date) { sql += " AND date = ?"; args.push(date); }
  if (from) { sql += " AND date >= ?"; args.push(from); }
  if (to)   { sql += " AND date <= ?"; args.push(to); }
  if (professional_id) { sql += " AND professional_id = ?"; args.push(professional_id); }
  if (sede_id) { sql += " AND sede_id = ?"; args.push(sede_id); }
  // patient_id se aceptaba en la URL pero no filtraba: la ficha del
  // paciente contaba TODAS las citas atendidas del workspace ("36
  // sesiones" para cualquier paciente) y tomaba como "inicio" la cita
  // más antigua del consultorio.
  if (patient_id) { sql += " AND patient_id = ?"; args.push(String(patient_id)); }
  if (status) { sql += " AND status = ?"; args.push(String(status)); }
  sql += " ORDER BY date, time";
  res.json(db.prepare(sql).all(...args));
});

/**
 * GET /api/appointments/:id — devuelve UNA cita por id.
 *
 * Usado por el deeplink desde notificaciones (la psicóloga hace click en
 * "Cita próxima · María" y queremos llevarla directo al detalle, sin
 * forzarla a buscar entre todas las citas del día). El filtro por
 * workspace_id es la garantía de que no se puede leer citas de otro
 * workspace pasando un id arbitrario.
 */
router.get("/:id", (req, res) => {
  const row = db.prepare(
    "SELECT * FROM appointments WHERE id = ? AND workspace_id = ?"
  ).get(req.params.id, req.user.workspace_id);
  if (!row) return res.status(404).json({ error: "Cita no encontrada" });
  res.json(row);
});

router.post("/", async (req, res) => {
  const a = req.body ?? {};
  // Defensas que faltaban (el bot de WhatsApp creó una cita en 2025, sin
  // profesional y sin nombre de paciente — y el auto-marcado la dejó
  // "atendida" al instante):
  //  - fecha en el pasado → 400 (una cita nueva nunca es para ayer);
  //  - sin professional_id → el del usuario que la crea;
  //  - sin patient_name → el nombre del paciente por su id.
  const today = colombiaDateIso(new Date());
  const date = a.date ?? today;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date)) || String(date) < today) {
    return res.status(400).json({ error: `La fecha ${date} ya pasó. Indica una fecha de hoy en adelante (formato YYYY-MM-DD).` });
  }
  if (!a.time || !/^\d{2}:\d{2}$/.test(String(a.time))) {
    return res.status(400).json({ error: "Hora requerida (HH:mm)" });
  }
  const patientId = a.patient_id ?? a.patientId ?? null;
  const patientRow = patientId
    ? db.prepare("SELECT name FROM patients WHERE id = ? AND workspace_id = ?").get(patientId, req.user.workspace_id)
    : null;
  if (patientId && !patientRow) return res.status(404).json({ error: "Paciente no encontrado en este workspace" });
  let professionalId = a.professional_id ?? a.professionalId ?? req.user.professional_id ?? null;
  let professionalName = a.professional ?? "";
  if (professionalId && !professionalName) {
    professionalName = db.prepare("SELECT name FROM professionals WHERE id = ?").get(professionalId)?.name ?? "";
  }
  const r = db.prepare(`
    INSERT INTO appointments (workspace_id, sede_id, professional_id, patient_id, date, time, duration_min, patient_name, professional, modality, room, status, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    req.user.workspace_id, a.sede_id ?? a.sedeId ?? null, professionalId, patientId,
    date,
    a.time, a.duration_min ?? 50, a.patient_name ?? a.patientName ?? patientRow?.name ?? "",
    professionalName, a.modality ?? "individual", a.room ?? "",
    // Al CREAR solo tienen sentido pendiente/confirmada — el bot (act-as)
    // llegó a crear citas nacidas "atendida" (handoff 4-sep). Cualquier
    // otro valor cae a pendiente; los demás estados se alcanzan por PATCH.
    ["pendiente", "confirmada"].includes(String(a.status)) ? String(a.status) : "pendiente",
    a.notes ?? ""
  );
  db.prepare("UPDATE appointments SET created_at = datetime('now') WHERE id = ?").run(r.lastInsertRowid);
  let row = ensureMeetingUrl(db.prepare("SELECT * FROM appointments WHERE id = ?").get(r.lastInsertRowid));
  // Google Calendar del profesional (si lo conectó). Si usa Meet y la cita
  // es online, esperamos (máx. 4 s) para que el aviso lleve el enlace de
  // Meet y no el de Jitsi; si no, se sincroniza en segundo plano.
  row = await syncBeforeNotify(row);
  req.app.get("io")?.to(`ws-${req.user.workspace_id}`).emit("appointment:created", row);
  // Email best-effort al paciente — async, no bloquea la respuesta. El
  // caller puede saltarlo enviando notify=false en body (útil cuando
  // la cita se agenda mientras hablas por WhatsApp con el paciente).
  if (a.notify !== false) {
    notifyAsync({ kind: "appointment_created", appointment: row });
  }
  res.status(201).json(row);
});

router.patch("/:id", async (req, res) => {
  const existing = db.prepare("SELECT * FROM appointments WHERE id = ? AND workspace_id = ?").get(req.params.id, req.user.workspace_id);
  if (!existing) return res.status(404).json({ error: "Cita no encontrada" });
  const a = { ...existing, ...req.body };
  db.prepare(`
    UPDATE appointments SET date=?, time=?, duration_min=?, patient_id=?, patient_name=?, professional=?, professional_id=?, sede_id=?, modality=?, room=?, status=?, notes=?
    WHERE id = ? AND workspace_id = ?
  `).run(a.date, a.time, a.duration_min, a.patient_id, a.patient_name, a.professional, a.professional_id, a.sede_id, a.modality, a.room, a.status, a.notes, req.params.id, req.user.workspace_id);
  let row = ensureMeetingUrl(db.prepare("SELECT * FROM appointments WHERE id = ?").get(req.params.id));
  // Calendario del profesional:
  //  - cancelada → borrar el evento;
  //  - solicitada → confirmada → crear (esperando Meet si aplica, porque
  //    el aviso de confirmación lleva el enlace);
  //  - cualquier otro cambio (fecha, hora, modalidad) → actualizar en 2º plano.
  const rescheduled = existing.date !== row.date || existing.time !== row.time;
  if (row.status === "cancelada") {
    removeEventAsync(row);
  } else if (existing.professional_id !== row.professional_id && existing.google_event_id) {
    // Cambió de profesional: el evento vive en el calendario del anterior.
    // Se borra allí y se vuelve a crear en el del nuevo (si lo conectó).
    removeEventAsync(existing);
    db.prepare("UPDATE appointments SET google_event_id = NULL WHERE id = ?").run(row.id);
    row = { ...row, google_event_id: null };
    syncAppointmentAsync(row);
  } else if (existing.status === "solicitada" && row.status === "confirmada") {
    row = await syncBeforeNotify(row);
  } else if (rescheduled && req.body?.notify !== false) {
    // El correo de reprogramación lleva el enlace: si aplica Meet y la cita
    // aún no está en el calendario, se espera para que vaya el definitivo.
    row = await syncBeforeNotify(row);
  } else if (rescheduled || existing.modality !== row.modality || existing.duration_min !== row.duration_min
             || existing.status !== row.status || existing.patient_id !== row.patient_id
             || existing.patient_name !== row.patient_name || existing.room !== row.room || existing.sede_id !== row.sede_id) {
    syncAppointmentAsync(row);
  }
  // La solicitud se resolvió (confirmada, cancelada, reprogramada…): la
  // notificación de la campana deja de estar pendiente.
  if (existing.status === "solicitada" && row.status !== "solicitada") {
    try { db.prepare("UPDATE notifications SET read = 1 WHERE id = ? AND workspace_id = ?").run(`appt-${row.id}-solicitud`, req.user.workspace_id); } catch { /* noop */ }
  }
  req.app.get("io")?.to(`ws-${req.user.workspace_id}`).emit("appointment:updated", row);
  // Email de reprogramación solo si cambió fecha u hora. Otros cambios
  // (notas internas, status, etc.) no ameritan notificación al paciente.
  if (rescheduled && req.body?.notify !== false) {
    notifyAsync({
      kind: "appointment_rescheduled",
      appointment: row,
      previous: { date: existing.date, time: existing.time },
    });
  }
  // Solicitud web aceptada (solicitada → confirmada): el paciente dejó
  // sus datos esperando exactamente esta confirmación. notifyAsync manda
  // WhatsApp (Laura) Y correo con .ics y enlace de videollamada — antes
  // solo salía el WhatsApp, y quien no tenía el bot activo no recibía
  // nada por escrito.
  if (existing.status === "solicitada" && row.status === "confirmada" && req.body?.notify !== false) {
    notifyAsync({ kind: "appointment_created", appointment: row });
  }
  res.json(row);
});

router.delete("/:id", (req, res) => {
  // Capturamos la cita ANTES del DELETE para tener los datos del email
  // de cancelación. Si el caller pasa notify=false (checkbox "no avisar
  // al paciente" en el modal de cancelar), saltamos el envío.
  const existing = db.prepare("SELECT * FROM appointments WHERE id = ? AND workspace_id = ?")
    .get(req.params.id, req.user.workspace_id);
  const r = db.prepare("DELETE FROM appointments WHERE id = ? AND workspace_id = ?").run(req.params.id, req.user.workspace_id);
  if (r.changes === 0) return res.status(404).json({ error: "No encontrada" });
  if (existing) removeEventAsync(existing);
  if (existing?.status === "solicitada") {
    try { db.prepare("UPDATE notifications SET read = 1 WHERE id = ? AND workspace_id = ?").run(`appt-${existing.id}-solicitud`, req.user.workspace_id); } catch { /* noop */ }
  }
  req.app.get("io")?.to(`ws-${req.user.workspace_id}`).emit("appointment:deleted", { id: Number(req.params.id) });
  // notify puede venir en body (DELETE permite body en HTTP 1.1) o en query
  // string como ?notify=false — ambos funcionan.
  const skipNotify = req.body?.notify === false || req.query?.notify === "false";
  if (existing && !skipNotify) {
    notifyAsync({ kind: "appointment_cancelled", appointment: existing });
  }
  res.status(204).end();
});

export default router;
