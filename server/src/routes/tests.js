import { Router } from "express";
import { db } from "../db.js";
import { requireAuth } from "../auth.js";
import { calculateScore } from "../psych_test_definitions.js";

const router = Router();
router.use(requireAuth);

const now = () => new Date().toISOString();
const nowDate = () => now().slice(0, 10);

function safeJSON(s) {
  if (!s) return null;
  try { return JSON.parse(s); } catch { return null; }
}

/** Normaliza un row de psych_tests (incluye questions_json parseado). */
function parseTest(row) {
  if (!row) return null;
  const def = safeJSON(row.questions_json);
  return {
    id: row.id, code: row.code, name: row.name, shortName: row.short_name,
    items: row.items, minutes: row.minutes, category: row.category,
    description: row.description, ageRange: row.age_range,
    scoring: row.scoring ? safeJSON(row.scoring) : [],
    // Definición completa: instrucciones, escala, preguntas, ranges, alerts.
    // Si questions_json no está cargado (BD vieja), devuelve null y la UI lo
    // tratará como "no aplicable" (no hay aplicador).
    definition: def,
  };
}

function parseApplication(row) {
  if (!row) return null;
  return {
    ...row,
    answers_json: safeJSON(row.answers_json),
    alerts_json: safeJSON(row.alerts_json),
  };
}

// ════════════════════════════════════════════════════════════════════════════
// CATÁLOGO (global, compartido)
// ════════════════════════════════════════════════════════════════════════════

router.get("/catalog", (_req, res) => {
  const rows = db.prepare("SELECT * FROM psych_tests ORDER BY category, code").all();
  res.json(rows.map(parseTest));
});

router.get("/catalog/:id", (req, res) => {
  const row = db.prepare("SELECT * FROM psych_tests WHERE id = ?").get(req.params.id);
  if (!row) return res.status(404).json({ error: "Test no encontrado" });
  res.json(parseTest(row));
});

// ════════════════════════════════════════════════════════════════════════════
// APLICACIONES (workspace-scoped)
// ════════════════════════════════════════════════════════════════════════════

router.get("/applications", (req, res) => {
  const { patient_id, status, test_code } = req.query;
  let sql = "SELECT * FROM test_applications WHERE workspace_id = ?";
  const args = [req.user.workspace_id];
  if (patient_id) { sql += " AND patient_id = ?"; args.push(patient_id); }
  if (status)     { sql += " AND status = ?";     args.push(status); }
  if (test_code)  { sql += " AND test_code = ?";  args.push(test_code); }
  sql += " ORDER BY COALESCE(completed_at, assigned_at, date) DESC";
  res.json(db.prepare(sql).all(...args).map(parseApplication));
});

router.get("/applications/:id", (req, res) => {
  const row = db.prepare("SELECT * FROM test_applications WHERE id = ? AND workspace_id = ?")
    .get(req.params.id, req.user.workspace_id);
  if (!row) return res.status(404).json({ error: "Aplicación no encontrada" });
  res.json(parseApplication(row));
});

/**
 * Crea una aplicación. Modos:
 *  1. Aplicada en sesión por el psicólogo (con respuestas) → completada
 *  2. Asignada al paciente para autoaplicación → pendiente
 *  3. Sin respuestas (ingreso histórico manual) → completada con score directo
 */
router.post("/applications", (req, res) => {
  const a = req.body ?? {};
  const testId = a.test_id ?? a.testId;
  if (!testId) return res.status(400).json({ error: "test_id requerido" });
  const test = db.prepare("SELECT * FROM psych_tests WHERE id = ?").get(testId);
  if (!test) return res.status(404).json({ error: "Test no encontrado en el catálogo" });

  const id = a.id ?? `T-${req.user.workspace_id}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  const def = safeJSON(test.questions_json);

  // Modo 2: asignación al paciente (sin respuestas, marca pendiente)
  if (a.assign_to_patient === true || a.assign_to_patient === "true") {
    if (!a.patient_id && !a.patientId) return res.status(400).json({ error: "patient_id requerido para asignar" });
    const patientId = a.patient_id ?? a.patientId;
    const patient = db.prepare("SELECT * FROM patients WHERE id = ? AND workspace_id = ?").get(patientId, req.user.workspace_id);
    if (!patient) return res.status(404).json({ error: "Paciente no encontrado" });

    db.prepare(`
      INSERT INTO test_applications (id, workspace_id, patient_id, patient_name, test_code, test_name, status, applied_by, assigned_at, professional)
      VALUES (?, ?, ?, ?, ?, ?, 'pendiente', 'paciente', ?, ?)
    `).run(id, req.user.workspace_id, patient.id, patient.name, test.code, test.name, now(), req.user.name ?? "");

    return res.status(201).json(parseApplication(db.prepare("SELECT * FROM test_applications WHERE id = ?").get(id)));
  }

  // Modo 1: aplicación con respuestas (paciente o profesional)
  const answers = a.answers ?? null;
  let score = a.score ?? 0;
  let level = a.level ?? "none";
  let interpretation = a.interpretation ?? "";
  let alerts = null;

  if (answers && def) {
    const calc = calculateScore(def, answers);
    score = calc.score;
    level = calc.level;
    interpretation = calc.label;
    alerts = Object.keys(calc.alerts).length > 0 ? calc.alerts : null;
  }

  db.prepare(`
    INSERT INTO test_applications (
      id, workspace_id, patient_id, patient_name, test_code, test_name,
      date, score, interpretation, level, professional, status,
      applied_by, completed_at, answers_json, alerts_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'completado', ?, ?, ?, ?)
  `).run(
    id, req.user.workspace_id,
    a.patient_id ?? a.patientId ?? null,
    a.patient_name ?? a.patientName ?? null,
    test.code, test.name,
    nowDate(), score, interpretation, level,
    a.professional ?? req.user.name ?? "",
    a.applied_by ?? "profesional",
    now(),
    answers ? JSON.stringify(answers) : null,
    alerts ? JSON.stringify(alerts) : null
  );

  res.status(201).json(parseApplication(db.prepare("SELECT * FROM test_applications WHERE id = ?").get(id)));
});

/**
 * Submit de respuestas para una aplicación pendiente (asignada al paciente).
 * Calcula score server-side y la marca completada.
 */
router.post("/applications/:id/submit", (req, res) => {
  const app = db.prepare("SELECT * FROM test_applications WHERE id = ? AND workspace_id = ?")
    .get(req.params.id, req.user.workspace_id);
  if (!app) return res.status(404).json({ error: "Aplicación no encontrada" });
  if (app.status === "completado") return res.status(409).json({ error: "Esta aplicación ya fue completada" });

  const test = db.prepare("SELECT * FROM psych_tests WHERE code = ?").get(app.test_code);
  if (!test) return res.status(500).json({ error: "Test no encontrado" });
  const def = safeJSON(test.questions_json);
  if (!def) return res.status(500).json({ error: "Definición del test no disponible" });

  const { answers } = req.body ?? {};
  if (!answers || typeof answers !== "object") return res.status(400).json({ error: "answers requerido" });

  // Validar que todas las preguntas estén respondidas
  const missing = def.questions.filter((q) => answers[q.id] == null);
  if (missing.length > 0) {
    return res.status(400).json({ error: `Faltan ${missing.length} respuestas`, missing: missing.map((q) => q.id) });
  }

  const calc = calculateScore(def, answers);

  db.prepare(`
    UPDATE test_applications
    SET status = 'completado', score = ?, level = ?, interpretation = ?,
        answers_json = ?, alerts_json = ?,
        completed_at = ?, date = ?
    WHERE id = ?
  `).run(
    calc.score, calc.level, calc.label,
    JSON.stringify(answers),
    Object.keys(calc.alerts).length > 0 ? JSON.stringify(calc.alerts) : null,
    now(), nowDate(),
    req.params.id
  );

  // Si hay alerta crítica, crear notificación al psicólogo
  if (calc.alerts.critical_response && app.patient_id) {
    db.prepare(`
      INSERT INTO notifications (id, workspace_id, type, title, description, at, read, urgent)
      VALUES (?, ?, 'alerta', ?, ?, ?, 0, 1)
    `).run(
      `N-test-${req.params.id}-${Date.now()}`,
      req.user.workspace_id,
      `Respuesta crítica en ${test.code}`,
      `${app.patient_name} marcó una respuesta clínicamente significativa en el ítem de riesgo. Revisar y contactar.`,
      now()
    );
  }

  const row = db.prepare("SELECT * FROM test_applications WHERE id = ?").get(req.params.id);
  res.json(parseApplication(row));
});

router.delete("/applications/:id", (req, res) => {
  const r = db.prepare("DELETE FROM test_applications WHERE id = ? AND workspace_id = ?")
    .run(req.params.id, req.user.workspace_id);
  if (r.changes === 0) return res.status(404).json({ error: "No encontrado" });
  res.json({ ok: true });
});

export default router;
