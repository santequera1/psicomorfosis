import { Router } from "express";
import { db } from "../db.js";
import { requireAuth } from "../auth.js";

const router = Router();
router.use(requireAuth);

router.get("/", (req, res) => {
  const { status, q, patient_id } = req.query;
  let sql = "SELECT * FROM invoices WHERE workspace_id = ?";
  const args = [req.user.workspace_id];
  if (status) { sql += " AND status = ?"; args.push(status); }
  if (patient_id) { sql += " AND patient_id = ?"; args.push(patient_id); }
  if (q) { sql += " AND (patient_name LIKE ? OR concept LIKE ? OR id LIKE ?)"; args.push(`%${q}%`, `%${q}%`, `%${q}%`); }
  sql += " ORDER BY date DESC";
  res.json(db.prepare(sql).all(...args));
});

router.post("/", (req, res) => {
  const i = req.body ?? {};
  const id = i.id ?? `F-2026-${String(Math.floor(Math.random() * 9000) + 1000)}`;
  db.prepare(`
    INSERT INTO invoices (id, workspace_id, patient_id, patient_name, professional, concept, amount, method, status, date)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, req.user.workspace_id, i.patient_id ?? i.patientId ?? null, i.patient_name ?? i.patientName ?? "",
         i.professional ?? "", i.concept ?? "Sesión", i.amount ?? 180000,
         i.method ?? "Tarjeta", i.status ?? "pendiente",
         i.date ?? new Date().toISOString().slice(0, 10));
  res.status(201).json(db.prepare("SELECT * FROM invoices WHERE id = ?").get(id));
});

router.patch("/:id", (req, res) => {
  const existing = db.prepare("SELECT * FROM invoices WHERE id = ? AND workspace_id = ?").get(req.params.id, req.user.workspace_id);
  if (!existing) return res.status(404).json({ error: "Factura no encontrada" });
  const m = { ...existing, ...req.body };
  db.prepare("UPDATE invoices SET concept = ?, amount = ?, method = ?, status = ? WHERE id = ? AND workspace_id = ?")
    .run(m.concept, m.amount, m.method, m.status, req.params.id, req.user.workspace_id);
  res.json(db.prepare("SELECT * FROM invoices WHERE id = ?").get(req.params.id));
});

router.delete("/:id", (req, res) => {
  db.prepare("DELETE FROM invoices WHERE id = ? AND workspace_id = ?").run(req.params.id, req.user.workspace_id);
  res.status(204).end();
});

// Reporte rápido
router.get("/summary", (req, res) => {
  const ws = req.user.workspace_id;
  const row = db.prepare(`
    SELECT
      COALESCE(SUM(CASE WHEN status = 'pagada'    THEN amount END), 0) AS paid,
      COALESCE(SUM(CASE WHEN status = 'pendiente' THEN amount END), 0) AS pending,
      COALESCE(SUM(CASE WHEN status = 'vencida'   THEN amount END), 0) AS overdue,
      COUNT(*) AS total
    FROM invoices WHERE workspace_id = ?
  `).get(ws);
  res.json(row);
});

export default router;
