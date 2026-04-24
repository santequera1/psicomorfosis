import { Router } from "express";
import { db } from "../db.js";
import { requireAuth } from "../auth.js";

const router = Router();
router.use(requireAuth);

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
  db.prepare(`
    INSERT INTO therapy_tasks (id, workspace_id, patient_id, patient_name, title, type, description, assigned_at, due_at, status, adherence, professional, sessions_remaining)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, req.user.workspace_id, t.patient_id ?? t.patientId, t.patient_name ?? t.patientName, t.title, t.type,
         t.description, t.assigned_at ?? new Date().toISOString().slice(0, 10),
         t.due_at ?? t.dueAt, t.status ?? "asignada", t.adherence ?? 0,
         t.professional ?? "", t.sessions_remaining ?? 1);
  res.status(201).json(db.prepare("SELECT * FROM therapy_tasks WHERE id = ?").get(id));
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
