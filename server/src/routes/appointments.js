import { Router } from "express";
import { db } from "../db.js";
import { requireAuth } from "../auth.js";
import { sendAppointmentEmail } from "../mailer.js";

/**
 * Dispara una notificación por email de manera asíncrona y NO bloqueante.
 * Cualquier error queda contenido dentro del mailer (que loguea a email_log).
 * El propósito de este wrapper es desacoplar el envío del flujo HTTP — la
 * respuesta de la API ya salió cuando el email se está mandando.
 */
function notifyAsync({ kind, appointment, previous }) {
  setImmediate(() => {
    try {
      const patient = appointment.patient_id
        ? db.prepare("SELECT id, name, preferred_name, email FROM patients WHERE id = ? AND workspace_id = ?")
            .get(appointment.patient_id, appointment.workspace_id)
        : null;
      if (!patient) return; // sin paciente no hay a quién notificar
      const professional = appointment.professional_id
        ? db.prepare("SELECT id, name, title, email FROM professionals WHERE id = ?")
            .get(appointment.professional_id)
        : null;
      const workspace = db.prepare("SELECT name FROM workspaces WHERE id = ?")
        .get(appointment.workspace_id);
      sendAppointmentEmail({
        kind,
        appointment,
        patient,
        professional,
        workspaceName: workspace?.name ?? null,
        replyTo: professional?.email ?? undefined,
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
    const startMs = Date.parse(`${c.date}T${c.time}:00`);
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

  const { date, from, to, professional_id, sede_id } = req.query;
  let sql = "SELECT * FROM appointments WHERE workspace_id = ?";
  const args = [req.user.workspace_id];
  if (date) { sql += " AND date = ?"; args.push(date); }
  if (from) { sql += " AND date >= ?"; args.push(from); }
  if (to)   { sql += " AND date <= ?"; args.push(to); }
  if (professional_id) { sql += " AND professional_id = ?"; args.push(professional_id); }
  if (sede_id) { sql += " AND sede_id = ?"; args.push(sede_id); }
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

router.post("/", (req, res) => {
  const a = req.body ?? {};
  const r = db.prepare(`
    INSERT INTO appointments (workspace_id, sede_id, professional_id, patient_id, date, time, duration_min, patient_name, professional, modality, room, status, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    req.user.workspace_id, a.sede_id ?? a.sedeId ?? null, a.professional_id ?? a.professionalId ?? null, a.patient_id ?? a.patientId ?? null,
    a.date ?? colombiaDateIso(new Date()),
    a.time, a.duration_min ?? 50, a.patient_name ?? a.patientName ?? "",
    a.professional ?? "", a.modality ?? "individual", a.room ?? "",
    a.status ?? "pendiente", a.notes ?? ""
  );
  const row = db.prepare("SELECT * FROM appointments WHERE id = ?").get(r.lastInsertRowid);
  req.app.get("io")?.to(`ws-${req.user.workspace_id}`).emit("appointment:created", row);
  // Email best-effort al paciente — async, no bloquea la respuesta. El
  // caller puede saltarlo enviando notify=false en body (útil cuando
  // la cita se agenda mientras hablas por WhatsApp con el paciente).
  if (a.notify !== false) {
    notifyAsync({ kind: "appointment_created", appointment: row });
  }
  res.status(201).json(row);
});

router.patch("/:id", (req, res) => {
  const existing = db.prepare("SELECT * FROM appointments WHERE id = ? AND workspace_id = ?").get(req.params.id, req.user.workspace_id);
  if (!existing) return res.status(404).json({ error: "Cita no encontrada" });
  const a = { ...existing, ...req.body };
  db.prepare(`
    UPDATE appointments SET date=?, time=?, duration_min=?, patient_id=?, patient_name=?, professional=?, professional_id=?, sede_id=?, modality=?, room=?, status=?, notes=?
    WHERE id = ? AND workspace_id = ?
  `).run(a.date, a.time, a.duration_min, a.patient_id, a.patient_name, a.professional, a.professional_id, a.sede_id, a.modality, a.room, a.status, a.notes, req.params.id, req.user.workspace_id);
  const row = db.prepare("SELECT * FROM appointments WHERE id = ?").get(req.params.id);
  req.app.get("io")?.to(`ws-${req.user.workspace_id}`).emit("appointment:updated", row);
  // Email de reprogramación solo si cambió fecha u hora. Otros cambios
  // (notas internas, status, etc.) no ameritan notificación al paciente.
  const dateChanged = existing.date !== row.date;
  const timeChanged = existing.time !== row.time;
  if ((dateChanged || timeChanged) && req.body?.notify !== false) {
    notifyAsync({
      kind: "appointment_rescheduled",
      appointment: row,
      previous: { date: existing.date, time: existing.time },
    });
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
