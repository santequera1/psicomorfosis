import { Router } from "express";
import { db } from "../db.js";
import { requireAuth } from "../auth.js";
import { sendTaskAssignedEmail } from "../mailer.js";

const router = Router();
router.use(requireAuth);

/** Construye la URL absoluta al portal del paciente (tab de tareas)
 *  respetando x-forwarded-* del proxy. */
function portalTasksUrl(req) {
  const base = req.headers["x-forwarded-host"]
    ? `${req.headers["x-forwarded-proto"] ?? "https"}://${req.headers["x-forwarded-host"]}`
    : `${req.protocol}://${req.get("host")}`;
  return `${base}/p/tareas`;
}

router.get("/", (req, res) => {
  const { patient_id, status } = req.query;
  let sql = "SELECT * FROM therapy_tasks WHERE workspace_id = ?";
  const args = [req.user.workspace_id];
  if (patient_id) { sql += " AND patient_id = ?"; args.push(patient_id); }
  if (status)     { sql += " AND status = ?"; args.push(status); }
  sql += " ORDER BY due_at DESC";
  res.json(db.prepare(sql).all(...args));
});

router.post("/", (req, res) => {
  const t = req.body ?? {};
  const id = t.id ?? `TK-${req.user.workspace_id}-${Date.now().toString().slice(-5)}`;
  const patientId = t.patient_id ?? t.patientId;
  db.prepare(`
    INSERT INTO therapy_tasks (id, workspace_id, patient_id, patient_name, title, type, description, assigned_at, due_at, status, adherence, professional, sessions_remaining)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, req.user.workspace_id, patientId, t.patient_name ?? t.patientName, t.title, t.type,
         t.description, t.assigned_at ?? new Date().toISOString().slice(0, 10),
         t.due_at ?? t.dueAt, t.status ?? "asignada", t.adherence ?? 0,
         t.professional ?? "", t.sessions_remaining ?? 1);
  const created = db.prepare("SELECT * FROM therapy_tasks WHERE id = ?").get(id);

  // Notificación al paciente (best-effort, no bloquea la respuesta).
  // Solo si la tarea tiene paciente asociado con email.
  if (patientId) {
    const patient = db.prepare("SELECT id, name, preferred_name, email, workspace_id FROM patients WHERE id = ? AND workspace_id = ?")
      .get(patientId, req.user.workspace_id);
    if (patient?.email) {
      const ws = db.prepare("SELECT name FROM workspaces WHERE id = ?").get(req.user.workspace_id);
      const prof = req.user.professional_id
        ? db.prepare("SELECT name, email FROM professionals WHERE id = ?").get(req.user.professional_id)
        : { name: req.user.name ?? null, email: null };
      const portalUrl = portalTasksUrl(req);
      setImmediate(() => {
        sendTaskAssignedEmail({
          patient,
          task: created,
          professional: prof,
          workspaceName: ws?.name,
          portalUrl,
          replyTo: prof?.email || undefined,
        }).catch((e) => console.warn(`[tasks] email falló: ${e?.message ?? e}`));
      });
    }
  }

  res.status(201).json(created);
});

router.patch("/:id", (req, res) => {
  const existing = db.prepare("SELECT * FROM therapy_tasks WHERE id = ? AND workspace_id = ?").get(req.params.id, req.user.workspace_id);
  if (!existing) return res.status(404).json({ error: "Tarea no encontrada" });
  const merged = { ...existing, ...req.body };
  db.prepare(`
    UPDATE therapy_tasks SET title=?, type=?, description=?, due_at=?, status=?, adherence=?, professional=?, sessions_remaining=? WHERE id=? AND workspace_id=?
  `).run(merged.title, merged.type, merged.description, merged.due_at, merged.status, merged.adherence, merged.professional, merged.sessions_remaining, req.params.id, req.user.workspace_id);
  res.json(db.prepare("SELECT * FROM therapy_tasks WHERE id = ?").get(req.params.id));
});

router.delete("/:id", (req, res) => {
  db.prepare("DELETE FROM therapy_tasks WHERE id = ? AND workspace_id = ?").run(req.params.id, req.user.workspace_id);
  res.status(204).end();
});

export default router;
