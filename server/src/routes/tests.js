import { Router } from "express";
import { db } from "../db.js";
import { requireAuth } from "../auth.js";

const router = Router();
router.use(requireAuth);

function parseTest(row) {
  if (!row) return null;
  return {
    id: row.id, code: row.code, name: row.name, shortName: row.short_name,
    items: row.items, minutes: row.minutes, category: row.category,
    description: row.description, ageRange: row.age_range,
    scoring: row.scoring ? JSON.parse(row.scoring) : [],
  };
}

// Catálogo global (compartido)
router.get("/catalog", (_req, res) => {
  res.json(db.prepare("SELECT * FROM psych_tests ORDER BY category, code").all().map(parseTest));
});

router.get("/catalog/:id", (req, res) => {
  const row = db.prepare("SELECT * FROM psych_tests WHERE id = ?").get(req.params.id);
  if (!row) return res.status(404).json({ error: "Test no encontrado" });
  res.json(parseTest(row));
});

// Aplicaciones del workspace
router.get("/applications", (req, res) => {
  const { patient_id, status } = req.query;
  let sql = "SELECT * FROM test_applications WHERE workspace_id = ?";
  const args = [req.user.workspace_id];
  if (patient_id) { sql += " AND patient_id = ?"; args.push(patient_id); }
  if (status)     { sql += " AND status = ?"; args.push(status); }
  sql += " ORDER BY date DESC";
  res.json(db.prepare(sql).all(...args));
});

router.post("/applications", (req, res) => {
  const a = req.body ?? {};
  const id = a.id ?? `T-${req.user.workspace_id}-${Date.now().toString().slice(-5)}`;
  db.prepare(`
    INSERT INTO test_applications (id, workspace_id, patient_id, patient_name, test_code, test_name, date, score, interpretation, level, professional, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, req.user.workspace_id, a.patient_id ?? a.patientId, a.patient_name ?? a.patientName, a.test_code ?? a.testCode,
         a.test_name ?? a.testName, a.date ?? new Date().toISOString().slice(0, 10),
         a.score ?? 0, a.interpretation ?? "", a.level ?? "none",
         a.professional ?? "", a.status ?? "completado");
  res.status(201).json(db.prepare("SELECT * FROM test_applications WHERE id = ?").get(id));
});

export default router;
