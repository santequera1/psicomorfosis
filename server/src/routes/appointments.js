import { Router } from "express";
import { db } from "../db.js";
import { requireAuth } from "../auth.js";

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

function autoMarkPastAppointmentsAttended(workspaceId) {
  const now = new Date();
  // Solo escaneamos las del día de hoy y hacia atrás (las futuras nunca
  // están "pasadas"). Limitamos a últimas 14 días para mantener la
  // query barata.
  const todayIso = now.toISOString().slice(0, 10);
  const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000)
    .toISOString().slice(0, 10);
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

router.post("/", (req, res) => {
  const a = req.body ?? {};
  const r = db.prepare(`
    INSERT INTO appointments (workspace_id, sede_id, professional_id, patient_id, date, time, duration_min, patient_name, professional, modality, room, status, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    req.user.workspace_id, a.sede_id ?? a.sedeId ?? null, a.professional_id ?? a.professionalId ?? null, a.patient_id ?? a.patientId ?? null,
    a.date ?? new Date().toISOString().slice(0, 10),
    a.time, a.duration_min ?? 50, a.patient_name ?? a.patientName ?? "",
    a.professional ?? "", a.modality ?? "individual", a.room ?? "",
    a.status ?? "pendiente", a.notes ?? ""
  );
  const row = db.prepare("SELECT * FROM appointments WHERE id = ?").get(r.lastInsertRowid);
  req.app.get("io")?.to(`ws-${req.user.workspace_id}`).emit("appointment:created", row);
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
  res.json(row);
});

router.delete("/:id", (req, res) => {
  const r = db.prepare("DELETE FROM appointments WHERE id = ? AND workspace_id = ?").run(req.params.id, req.user.workspace_id);
  if (r.changes === 0) return res.status(404).json({ error: "No encontrada" });
  req.app.get("io")?.to(`ws-${req.user.workspace_id}`).emit("appointment:deleted", { id: Number(req.params.id) });
  res.status(204).end();
});

export default router;
