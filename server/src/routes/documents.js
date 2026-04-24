import { Router } from "express";
import { db } from "../db.js";
import { requireAuth } from "../auth.js";

const router = Router();
router.use(requireAuth);

router.get("/", (req, res) => {
  const { patient_id, type, status, q } = req.query;
  let sql = "SELECT * FROM documents WHERE workspace_id = ?";
  const args = [req.user.workspace_id];
  if (patient_id) { sql += " AND patient_id = ?"; args.push(patient_id); }
  if (type)       { sql += " AND type = ?";       args.push(type); }
  if (status)     { sql += " AND status = ?";     args.push(status); }
  if (q)          { sql += " AND (name LIKE ? OR patient_name LIKE ?)"; args.push(`%${q}%`, `%${q}%`); }
  sql += " ORDER BY updated_at DESC";
  res.json(db.prepare(sql).all(...args));
});

router.post("/", (req, res) => {
  const d = req.body ?? {};
  const id = d.id ?? `D-${req.user.workspace_id}-${Date.now().toString().slice(-5)}`;
  const now = new Date().toISOString().slice(0, 10);
  db.prepare(`
    INSERT INTO documents (id, workspace_id, name, type, patient_id, patient_name, created_at, updated_at, size_kb, status, professional, signed_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, req.user.workspace_id, d.name, d.type ?? "informe", d.patient_id ?? null, d.patient_name ?? null,
         now, now, d.size_kb ?? 100, d.status ?? "borrador", d.professional ?? "", null);
  res.status(201).json(db.prepare("SELECT * FROM documents WHERE id = ?").get(id));
});

router.post("/:id/sign", (req, res) => {
  const signed_at = new Date().toISOString();
  const r = db.prepare("UPDATE documents SET status = 'firmado', signed_at = ?, updated_at = ? WHERE id = ? AND workspace_id = ?")
    .run(signed_at, signed_at.slice(0, 10), req.params.id, req.user.workspace_id);
  if (r.changes === 0) return res.status(404).json({ error: "Documento no encontrado" });
  res.json(db.prepare("SELECT * FROM documents WHERE id = ?").get(req.params.id));
});

router.delete("/:id", (req, res) => {
  db.prepare("DELETE FROM documents WHERE id = ? AND workspace_id = ?").run(req.params.id, req.user.workspace_id);
  res.status(204).end();
});

export default router;
