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
    // Distinción "instrumento clínico" vs "formulario del consultorio":
    // - isCustom=false: instrumento oficial mantenido por Psicomorfosis.
    // - isCustom=true: formulario simple creado por el psicólogo en su workspace.
    isCustom: !!row.is_custom,
    workspaceId: row.workspace_id ?? null,
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

// El catálogo devuelve los instrumentos clínicos oficiales (workspace_id NULL)
// + los formularios personalizados del workspace del usuario actual. Los
// formularios de otros workspaces nunca se exponen.
router.get("/catalog", (req, res) => {
  const rows = db.prepare(`
    SELECT * FROM psych_tests
    WHERE (is_custom = 0 OR is_custom IS NULL) OR workspace_id = ?
    ORDER BY is_custom ASC, category, code
  `).all(req.user.workspace_id);
  res.json(rows.map(parseTest));
});

router.get("/catalog/:id", (req, res) => {
  const row = db.prepare(`
    SELECT * FROM psych_tests
    WHERE id = ? AND ((is_custom = 0 OR is_custom IS NULL) OR workspace_id = ?)
  `).get(req.params.id, req.user.workspace_id);
  if (!row) return res.status(404).json({ error: "Test no encontrado" });
  res.json(parseTest(row));
});

// ════════════════════════════════════════════════════════════════════════════
// FORMULARIOS PERSONALIZADOS (workspace-scoped). Crear/eliminar formularios
// simples tipo cuestionario. La estructura del `definition` se mantiene
// idéntica a la de los instrumentos oficiales para que el TestRunner y el
// scoring engine los manejen sin código condicional.
// ════════════════════════════════════════════════════════════════════════════

/**
 * POST /api/tests/forms — crea un formulario personalizado.
 *
 * Body esperado:
 *   {
 *     name: string,
 *     short_name?: string,
 *     description?: string,
 *     category?: string,
 *     age_range?: string,
 *     minutes?: number,
 *     definition: {
 *       instructions?: string,
 *       scale: [{ value, label }, ...],     // global para Likert; [{1,V},{0,F}] para V/F
 *       questions: [{ id, text, reverse? }, ...],
 *       scoring: { type: "sum" | "sum_reversed" },
 *       ranges: [{ min, max, label, level }, ...]
 *     }
 *   }
 *
 * El servidor calcula `items` (n preguntas) y deriva un `id`/`code` únicos
 * con prefijo `form-` para distinguirlos visualmente. Validamos lo mínimo
 * para no aceptar formularios que el aplicador no pueda renderizar.
 */
/**
 * Valida y normaliza el payload de un test personalizado. Devuelve
 * `{ error, status }` si algo está mal, o `{ data: { ... } }` con los
 * campos listos para INSERT/UPDATE. Compartido entre POST (crear) y
 * PATCH (editar) para que las dos rutas tengan exactamente las mismas
 * reglas y normalización.
 */
function buildFormPayload(body) {
  const { name, short_name, description, category, age_range, minutes, definition } = body ?? {};
  if (typeof name !== "string" || !name.trim()) {
    return { error: "El nombre es obligatorio", status: 400 };
  }
  if (!definition || typeof definition !== "object") {
    return { error: "La definición es obligatoria", status: 400 };
  }
  const questions = Array.isArray(definition.questions) ? definition.questions : [];
  if (questions.length === 0) {
    return { error: "El test debe tener al menos una pregunta", status: 400 };
  }
  const scoringType = definition.scoring?.type;
  if (!["sum", "sum_reversed", "none", "activity"].includes(scoringType)) {
    return { error: "Tipo de scoring no soportado", status: 400 };
  }
  const scale = Array.isArray(definition.scale) ? definition.scale : [];
  if (scoringType !== "activity" && scale.length < 2) {
    return { error: "La escala debe tener al menos 2 opciones", status: 400 };
  }
  if (scoringType === "activity") {
    const allowedTypes = new Set(["single_choice", "yes_no", "numeric", "text"]);
    for (const q of questions) {
      if (!allowedTypes.has(q.type)) {
        return { error: `Pregunta "${q.text || q.id}": tipo "${q.type}" no soportado`, status: 400 };
      }
      if (q.type === "single_choice") {
        const opts = Array.isArray(q.options) ? q.options : [];
        if (opts.length < 2) {
          return { error: `Pregunta "${q.text || q.id}": opción múltiple necesita al menos 2 opciones`, status: 400 };
        }
        if (opts.some((o) => !o || typeof o.label !== "string" || !o.label.trim())) {
          return { error: `Pregunta "${q.text || q.id}": todas las opciones necesitan etiqueta`, status: 400 };
        }
      }
      if (q.type === "numeric") {
        const lo = q.numeric_min;
        const hi = q.numeric_max;
        if (lo != null && hi != null && Number(lo) > Number(hi)) {
          return { error: `Pregunta "${q.text || q.id}": el mínimo no puede ser mayor que el máximo`, status: 400 };
        }
      }
    }
  }
  const ranges = Array.isArray(definition.ranges) ? definition.ranges : [];
  const isScored = scoringType === "sum" || scoringType === "sum_reversed";
  if (isScored && ranges.length === 0) {
    return { error: "Define al menos un rango de severidad", status: 400 };
  }
  const normQuestions = questions.map((q, i) => {
    const base = {
      id: typeof q.id === "string" && q.id.trim() ? q.id : `q${i + 1}`,
      text: String(q.text ?? "").trim(),
    };
    if (scoringType === "activity") {
      const out = { ...base, type: q.type };
      if (q.type === "single_choice") {
        out.options = (q.options ?? []).map((o) => ({
          value: Number(o.value),
          label: String(o.label ?? "").trim(),
        }));
      } else if (q.type === "numeric") {
        if (q.numeric_min != null) out.numeric_min = Number(q.numeric_min);
        if (q.numeric_max != null) out.numeric_max = Number(q.numeric_max);
      } else if (q.type === "text") {
        if (q.placeholder) out.placeholder = String(q.placeholder).trim();
      }
      return out;
    }
    return { ...base, ...(q.reverse ? { reverse: true } : {}) };
  });
  const normRanges = ranges.map((r) => ({
    min: Number(r.min),
    max: Number(r.max),
    label: String(r.label ?? "").trim(),
    level: r.level ?? "none",
  }));
  const questions_json = JSON.stringify({
    version: 1,
    instructions: typeof definition.instructions === "string" ? definition.instructions : "",
    scale,
    questions: normQuestions,
    scoring: { type: scoringType },
    ranges: normRanges,
    alerts: null,
  });
  const scoringJson = JSON.stringify(normRanges);
  return {
    data: {
      name: name.trim(),
      short_name: (short_name && short_name.trim()) || null,
      description: (description && description.trim()) || null,
      category: (category && category.trim()) || "Personalizado",
      age_range: (age_range && age_range.trim()) || null,
      minutes: Number.isFinite(minutes) ? Math.max(1, Math.min(120, Number(minutes))) : 5,
      items: normQuestions.length,
      scoringJson,
      questions_json,
    },
  };
}

router.post("/forms", (req, res) => {
  const built = buildFormPayload(req.body);
  if (built.error) return res.status(built.status).json({ error: built.error });
  const d = built.data;

  // ID único: form-<workspace>-<timestamp>-<random>. El code lo usa la UI
  // como "etiqueta corta" — short_name si lo dan, si no derivamos algo.
  const ts = Date.now();
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  const id = `form-${req.user.workspace_id}-${ts}-${rand}`;
  const code = d.short_name || `FORM-${rand}`;
  const created = now();

  db.prepare(`
    INSERT INTO psych_tests
      (id, code, name, short_name, items, minutes, category, description, age_range,
       scoring, questions_json, is_custom, workspace_id, created_by, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?)
  `).run(
    id, code, d.name, d.short_name, d.items, d.minutes, d.category, d.description, d.age_range,
    d.scoringJson, d.questions_json,
    req.user.workspace_id, req.user.id, created, created,
  );

  const row = db.prepare("SELECT * FROM psych_tests WHERE id = ?").get(id);
  res.status(201).json(parseTest(row));
});

/**
 * PATCH /api/tests/forms/:id — edita un formulario personalizado del
 * workspace. Solo se permite editar tests con is_custom=1 que pertenezcan
 * al workspace actual. Las aplicaciones ya hechas conservan su snapshot
 * original en `alerts_json.meta.answers_snapshot`, así que editar el
 * test no rompe los resultados históricos.
 */
router.patch("/forms/:id", (req, res) => {
  const existing = db.prepare(`
    SELECT id FROM psych_tests
    WHERE id = ? AND is_custom = 1 AND workspace_id = ?
  `).get(req.params.id, req.user.workspace_id);
  if (!existing) return res.status(404).json({ error: "Formulario no encontrado o no editable" });

  const built = buildFormPayload(req.body);
  if (built.error) return res.status(built.status).json({ error: built.error });
  const d = built.data;
  const updated = now();

  db.prepare(`
    UPDATE psych_tests
    SET name = ?, short_name = ?, items = ?, minutes = ?, category = ?,
        description = ?, age_range = ?, scoring = ?, questions_json = ?,
        updated_at = ?
    WHERE id = ?
  `).run(
    d.name, d.short_name, d.items, d.minutes, d.category,
    d.description, d.age_range, d.scoringJson, d.questions_json,
    updated, req.params.id,
  );

  const row = db.prepare("SELECT * FROM psych_tests WHERE id = ?").get(req.params.id);
  res.json(parseTest(row));
});

/**
 * DELETE /api/tests/forms/:id — elimina un formulario personalizado del
 * workspace. No toca aplicaciones ya hechas (siguen vivas en
 * test_applications). Solo el workspace propietario puede borrarlo.
 */
router.delete("/forms/:id", (req, res) => {
  const r = db.prepare(`
    DELETE FROM psych_tests
    WHERE id = ? AND is_custom = 1 AND workspace_id = ?
  `).run(req.params.id, req.user.workspace_id);
  if (r.changes === 0) return res.status(404).json({ error: "Formulario no encontrado" });
  res.json({ ok: true });
});

// ════════════════════════════════════════════════════════════════════════════
// SOLICITUDES DE TESTS (canal para que el psicólogo pida tests clínicos
// complejos que solo el equipo Psicomorfosis puede implementar de forma
// validada — Goldberg, GADS, etc.)
// ════════════════════════════════════════════════════════════════════════════

router.get("/requests", (req, res) => {
  const rows = db.prepare(`
    SELECT * FROM test_requests
    WHERE workspace_id = ?
    ORDER BY created_at DESC
  `).all(req.user.workspace_id);
  res.json(rows);
});

router.post("/requests", (req, res) => {
  const { test_name, reason } = req.body ?? {};
  if (typeof test_name !== "string" || !test_name.trim()) {
    return res.status(400).json({ error: "Nombre del test requerido" });
  }
  const requesterName = req.user.name ?? null;
  const r = db.prepare(`
    INSERT INTO test_requests (workspace_id, requested_by, requester_name, test_name, reason, status, created_at)
    VALUES (?, ?, ?, ?, ?, 'open', CURRENT_TIMESTAMP)
  `).run(
    req.user.workspace_id,
    req.user.id,
    requesterName,
    test_name.trim(),
    (typeof reason === "string" ? reason.trim() : "") || null,
  );
  const row = db.prepare("SELECT * FROM test_requests WHERE id = ?").get(r.lastInsertRowid);
  res.status(201).json(row);
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

    const totalItems = def?.questions?.length ?? 0;
    db.prepare(`
      INSERT INTO test_applications (id, workspace_id, patient_id, patient_name, test_code, test_name, status, applied_by, assigned_at, professional, total_items, answered_items)
      VALUES (?, ?, ?, ?, ?, ?, 'pendiente', 'paciente', ?, ?, ?, 0)
    `).run(id, req.user.workspace_id, patient.id, patient.name, test.code, test.name, now(), req.user.name ?? "", totalItems);

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

/**
 * Save progress de un test (pausa). Acepta respuestas parciales y conserva
 * las anteriores no enviadas. NO marca completado — solo persiste el estado
 * para que el paciente/psicólogo pueda retomar después.
 *
 * Cambia status: 'pendiente' → 'en_curso'.
 */
router.patch("/applications/:id/progress", (req, res) => {
  const app = db.prepare("SELECT * FROM test_applications WHERE id = ? AND workspace_id = ?")
    .get(req.params.id, req.user.workspace_id);
  if (!app) return res.status(404).json({ error: "Aplicación no encontrada" });
  if (app.status === "completado") return res.status(409).json({ error: "Esta aplicación ya fue completada" });

  const { answers } = req.body ?? {};
  if (!answers || typeof answers !== "object") return res.status(400).json({ error: "answers requerido" });

  // Merge con respuestas previas: el cliente puede mandar solo el delta, o
  // las completas; ambos casos funcionan.
  const previous = safeJSON(app.answers_json) ?? {};
  const merged = { ...previous, ...answers };
  const answeredCount = Object.keys(merged).filter((k) => merged[k] != null).length;

  db.prepare(`
    UPDATE test_applications
    SET answers_json = ?,
        answered_items = ?,
        status = CASE WHEN status = 'pendiente' THEN 'en_curso' ELSE status END,
        started_at = COALESCE(started_at, ?),
        paused_at = ?
    WHERE id = ?
  `).run(JSON.stringify(merged), answeredCount, now(), now(), req.params.id);

  const row = db.prepare("SELECT * FROM test_applications WHERE id = ?").get(req.params.id);
  res.json(parseApplication(row));
});

/**
 * GET /api/tests/applications/:id/export.csv
 * Exporta las respuestas de una aplicación en CSV. Útil para tests cuya
 * matriz de scoring oficial vive en un Excel externo (MCMI-II) — el
 * psicólogo copia la columna PUNTOS y la pega en su hoja oficial sin
 * tener que transcribir 175 respuestas a mano.
 *
 * Formato: ITEM,PUNTOS  (1=V, 2=F, 0=Sin respuesta) — coincide con la
 * convención de la hoja "Respuestas" del Excel oficial del MCMI-II.
 */
router.get("/applications/:id/export.csv", (req, res) => {
  const app = db.prepare("SELECT * FROM test_applications WHERE id = ? AND workspace_id = ?")
    .get(req.params.id, req.user.workspace_id);
  if (!app) return res.status(404).json({ error: "Aplicación no encontrada" });

  const test = db.prepare("SELECT * FROM psych_tests WHERE code = ?").get(app.test_code);
  if (!test) return res.status(404).json({ error: "Test no encontrado en el catálogo" });
  const def = test.questions_json ? safeJSON(test.questions_json) : null;
  if (!def?.questions) return res.status(500).json({ error: "Definición del test no disponible" });

  const answers = app.answers_json ? safeJSON(app.answers_json) : {};
  const lines = ["ITEM,PUNTOS"];
  for (const q of def.questions) {
    const v = answers[q.id];
    // 0 = sin respuesta (convención del Excel oficial). 1=V, 2=F.
    const cell = (v === 1 || v === 2) ? v : 0;
    lines.push(`${q.id},${cell}`);
  }
  // Agregar metadata al final como comentario (las herramientas de Excel
  // que toman CSV ignoran comillas; lo dejamos como filas extra al pie).
  lines.push("");
  lines.push(`# Test,${app.test_code}`);
  lines.push(`# Paciente,${(app.patient_name ?? "").replace(/,/g, " ")}`);
  if (app.completed_at) lines.push(`# Completado,${app.completed_at}`);

  const csv = "﻿" + lines.join("\r\n"); // BOM para Excel UTF-8
  const safeName = (app.patient_name ?? "paciente").replace(/[^\w\s-]/g, "").trim().replace(/\s+/g, "_").slice(0, 60);
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${app.test_code}_${safeName}.csv"`);
  res.send(csv);
});

router.delete("/applications/:id", (req, res) => {
  const r = db.prepare("DELETE FROM test_applications WHERE id = ? AND workspace_id = ?")
    .run(req.params.id, req.user.workspace_id);
  if (r.changes === 0) return res.status(404).json({ error: "No encontrado" });
  res.json({ ok: true });
});

export default router;
