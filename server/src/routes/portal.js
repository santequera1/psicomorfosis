import { Router } from "express";
import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import { db } from "../db.js";
import { signToken, requireAuth, requirePatient } from "../auth.js";
import { calculateScore } from "../psych_test_definitions.js";

const router = Router();

const INVITE_DAYS = 5;
const TOKEN_BYTES = 24;

function safeJSON(s) {
  if (!s) return null;
  try { return JSON.parse(s); } catch { return null; }
}

// ════════════════════════════════════════════════════════════════════════════
// GENERAR INVITACIÓN (staff)
// ════════════════════════════════════════════════════════════════════════════

/**
 * POST /api/patients/:id/invite (montado bajo /api/patients en index.js)
 * Crea o renueva un token de invitación para que el paciente active su cuenta.
 * Devuelve URL absoluta + texto sugerido para WhatsApp.
 */
router.post("/patients/:id/invite", requireAuth, (req, res) => {
  if (req.user.role === "paciente") return res.status(403).json({ error: "Solo staff" });
  const patient = db.prepare("SELECT * FROM patients WHERE id = ? AND workspace_id = ?")
    .get(req.params.id, req.user.workspace_id);
  if (!patient) return res.status(404).json({ error: "Paciente no encontrado" });
  if (!patient.email) return res.status(400).json({ error: "El paciente debe tener email para invitarlo al portal" });

  // Si ya existe usuario para este paciente, no se puede re-invitar — usar reset password.
  const existingUser = db.prepare("SELECT id FROM users WHERE patient_id = ? AND workspace_id = ?")
    .get(patient.id, req.user.workspace_id);
  if (existingUser) {
    return res.status(409).json({
      error: "Este paciente ya tiene cuenta activa. Si olvidó la contraseña, use el flujo de recuperación.",
      already_active: true,
    });
  }

  // Invalidar invitaciones previas no usadas
  db.prepare("DELETE FROM patient_invites WHERE patient_id = ? AND used_at IS NULL").run(patient.id);

  const token = crypto.randomBytes(TOKEN_BYTES).toString("hex");
  const expiresAt = new Date(Date.now() + INVITE_DAYS * 24 * 60 * 60 * 1000).toISOString();

  db.prepare(`
    INSERT INTO patient_invites (workspace_id, patient_id, token, expires_at, created_by_user_id)
    VALUES (?, ?, ?, ?, ?)
  `).run(req.user.workspace_id, patient.id, token, expiresAt, req.user.id);

  // Construir URL absoluta — preferir el header host si está detrás de proxy
  const base = req.headers["x-forwarded-host"]
    ? `${req.headers["x-forwarded-proto"] ?? "https"}://${req.headers["x-forwarded-host"]}`
    : `${req.protocol}://${req.get("host")}`;
  const url = `${base}/p/activar/${token}`;

  // Datos para construir el mensaje WhatsApp
  const ws = db.prepare("SELECT name FROM workspaces WHERE id = ?").get(req.user.workspace_id);
  const prof = req.user.name || "Tu psicóloga";
  const greetingName = patient.preferred_name || patient.name.split(" ")[0];
  const whatsappText = [
    `Hola ${greetingName}, soy ${prof}.`,
    ``,
    `Te invito al portal de ${ws?.name || "Psicomorfosis"} para que puedas:`,
    `• Ver tus próximas citas`,
    `• Acceder a tus tareas terapéuticas`,
    `• Recibir documentos importantes`,
    ``,
    `Crea tu contraseña aquí (válido por ${INVITE_DAYS} días):`,
    url,
    ``,
    `¡Te espero!`,
  ].join("\n");

  res.status(201).json({
    token,
    url,
    expires_at: expiresAt,
    days_valid: INVITE_DAYS,
    whatsapp_text: whatsappText,
  });
});

// ════════════════════════════════════════════════════════════════════════════
// FLUJO PÚBLICO — el paciente activa su cuenta
// ════════════════════════════════════════════════════════════════════════════

/**
 * GET /api/patient-invite/:token
 * Devuelve metadata para mostrar la pantalla de bienvenida del paciente
 * (nombre del paciente, profesional, clínica). Sin auth.
 */
router.get("/patient-invite/:token", (req, res) => {
  const inv = db.prepare("SELECT * FROM patient_invites WHERE token = ?").get(req.params.token);
  if (!inv) return res.status(404).json({ error: "Invitación no encontrada" });
  if (inv.used_at) return res.status(409).json({ error: "Esta invitación ya fue usada", used: true });
  if (new Date(inv.expires_at).getTime() < Date.now()) {
    return res.status(410).json({ error: "Esta invitación expiró. Pide a tu psicóloga una nueva." });
  }

  const patient = db.prepare("SELECT id, name, preferred_name, email FROM patients WHERE id = ?").get(inv.patient_id);
  const ws = db.prepare("SELECT name FROM workspaces WHERE id = ?").get(inv.workspace_id);
  const prof = patient ? db.prepare(`
    SELECT p.name, p.title FROM professionals p
    INNER JOIN patients pt ON pt.professional_id = p.id
    WHERE pt.id = ? LIMIT 1
  `).get(patient.id) : null;
  const settings = Object.fromEntries(
    db.prepare("SELECT key, value FROM settings WHERE workspace_id = ?").all(inv.workspace_id)
      .map((s) => [s.key, s.value])
  );

  res.json({
    valid: true,
    patient: patient ? {
      id: patient.id,
      name: patient.name,
      preferred_name: patient.preferred_name,
      email: patient.email,
    } : null,
    professional: prof ? { name: prof.name, title: prof.title } : null,
    clinic: { name: ws?.name, city: settings.city, address: settings.address },
    expires_at: inv.expires_at,
  });
});

/**
 * POST /api/patient-invite/:token/activate
 * Crea el user del paciente con la contraseña que eligió. Devuelve JWT del paciente.
 */
router.post("/patient-invite/:token/activate", (req, res) => {
  const { password } = req.body ?? {};
  if (!password || typeof password !== "string" || password.length < 8) {
    return res.status(400).json({ error: "La contraseña debe tener al menos 8 caracteres." });
  }
  const inv = db.prepare("SELECT * FROM patient_invites WHERE token = ?").get(req.params.token);
  if (!inv) return res.status(404).json({ error: "Invitación no encontrada" });
  if (inv.used_at) return res.status(409).json({ error: "Esta invitación ya fue usada" });
  if (new Date(inv.expires_at).getTime() < Date.now()) {
    return res.status(410).json({ error: "Esta invitación expiró" });
  }
  const patient = db.prepare("SELECT * FROM patients WHERE id = ?").get(inv.patient_id);
  if (!patient || !patient.email) {
    return res.status(400).json({ error: "El paciente no tiene email asociado." });
  }

  // Username = email (único)
  const existing = db.prepare("SELECT id FROM users WHERE username = ?").get(patient.email);
  if (existing) {
    return res.status(409).json({ error: "Ya existe una cuenta con este correo. Usa el flujo de inicio de sesión." });
  }

  const hash = bcrypt.hashSync(password, 10);
  const now = new Date().toISOString();

  const tx = db.transaction(() => {
    const ins = db.prepare(`
      INSERT INTO users (workspace_id, username, password_hash, name, email, role, patient_id)
      VALUES (?, ?, ?, ?, ?, 'paciente', ?)
    `).run(inv.workspace_id, patient.email, hash, patient.name, patient.email, patient.id);
    db.prepare("UPDATE patient_invites SET used_at = ? WHERE id = ?").run(now, inv.id);
    return ins.lastInsertRowid;
  });
  const userId = tx();

  const token = signToken({
    id: userId,
    workspace_id: inv.workspace_id,
    username: patient.email,
    role: "paciente",
    name: patient.name,
    patient_id: patient.id,
  });

  res.status(201).json({
    token,
    user: {
      id: userId,
      name: patient.name,
      email: patient.email,
      role: "paciente",
      patient_id: patient.id,
      workspace_id: inv.workspace_id,
    },
  });
});

/**
 * POST /api/auth/patient/login (montado bajo /api/auth)
 * Login del paciente. Email + password. Verifica que role='paciente'.
 */
router.post("/auth/patient/login", (req, res) => {
  const { email, password } = req.body ?? {};
  if (!email || !password) return res.status(400).json({ error: "Email y contraseña requeridos" });
  const user = db.prepare("SELECT * FROM users WHERE username = ? AND role = 'paciente'").get(email);
  if (!user) return res.status(401).json({ error: "Credenciales inválidas" });
  if (!bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: "Credenciales inválidas" });
  }
  const token = signToken({
    id: user.id,
    workspace_id: user.workspace_id,
    username: user.username,
    role: "paciente",
    name: user.name,
    patient_id: user.patient_id,
  });
  res.json({
    token,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: "paciente",
      patient_id: user.patient_id,
      workspace_id: user.workspace_id,
    },
  });
});

// ════════════════════════════════════════════════════════════════════════════
// PORTAL DEL PACIENTE — endpoints para el paciente autenticado
// ════════════════════════════════════════════════════════════════════════════

/**
 * GET /api/portal/me — datos completos del paciente + su psicóloga + clínica.
 */
router.get("/portal/me", requirePatient, (req, res) => {
  const p = db.prepare("SELECT * FROM patients WHERE id = ? AND workspace_id = ?")
    .get(req.user.patient_id, req.user.workspace_id);
  if (!p) return res.status(404).json({ error: "Paciente no encontrado" });
  const prof = p.professional_id
    ? db.prepare("SELECT id, name, title, phone, email, signature_url FROM professionals WHERE id = ?").get(p.professional_id)
    : null;
  const ws = db.prepare("SELECT name, mode FROM workspaces WHERE id = ?").get(p.workspace_id);
  const settings = Object.fromEntries(
    db.prepare("SELECT key, value FROM settings WHERE workspace_id = ?").all(p.workspace_id)
      .map((s) => [s.key, s.value])
  );

  res.json({
    patient: {
      id: p.id,
      name: p.name,
      preferredName: p.preferred_name,
      pronouns: p.pronouns,
      doc: p.doc,
      age: p.age,
      phone: p.phone,
      email: p.email,
      address: p.address,
      modality: p.modality,
      photo_url: p.photo_url,
      reason: p.reason,
    },
    professional: prof,
    clinic: {
      name: ws?.name,
      city: settings.city,
      address: settings.address,
      phone: settings.phone,
      consultorio: settings.consultorio_name,
    },
  });
});

/**
 * PATCH /api/portal/me — el paciente edita su perfil (campos limitados).
 * No puede cambiar: nombre legal, doc, modalidad, profesional, status, riesgo.
 */
router.patch("/portal/me", requirePatient, (req, res) => {
  const { phone, email, address, photo_url, preferred_name, pronouns } = req.body ?? {};
  const fields = [];
  const params = [];
  if (phone !== undefined)          { fields.push("phone = ?");          params.push(phone); }
  if (email !== undefined)          { fields.push("email = ?");          params.push(email); }
  if (address !== undefined)        { fields.push("address = ?");        params.push(address); }
  if (photo_url !== undefined)      { fields.push("photo_url = ?");      params.push(photo_url); }
  if (preferred_name !== undefined) { fields.push("preferred_name = ?"); params.push(preferred_name); }
  if (pronouns !== undefined)       { fields.push("pronouns = ?");       params.push(pronouns); }
  if (fields.length === 0) return res.json({ ok: true });
  fields.push("updated_at = CURRENT_TIMESTAMP");
  params.push(req.user.patient_id);
  db.prepare(`UPDATE patients SET ${fields.join(", ")} WHERE id = ?`).run(...params);
  res.json({ ok: true });
});

/**
 * GET /api/portal/appointments — citas del paciente, futuras + pasadas.
 */
router.get("/portal/appointments", requirePatient, (req, res) => {
  const rows = db.prepare(`
    SELECT a.*, pr.name AS professional_name, s.name AS sede_name, s.address AS sede_address
    FROM appointments a
    LEFT JOIN professionals pr ON a.professional_id = pr.id
    LEFT JOIN sedes s ON a.sede_id = s.id
    WHERE a.patient_id = ? AND a.workspace_id = ?
    ORDER BY a.date DESC, a.time DESC
  `).all(req.user.patient_id, req.user.workspace_id);
  res.json(rows);
});

/**
 * GET /api/portal/tasks — tareas terapéuticas del paciente.
 */
router.get("/portal/tasks", requirePatient, (req, res) => {
  const rows = db.prepare(`
    SELECT * FROM therapy_tasks
    WHERE patient_id = ? AND workspace_id = ?
    ORDER BY due_at ASC
  `).all(req.user.patient_id, req.user.workspace_id);
  res.json(rows);
});

/**
 * POST /api/portal/tasks/:id/complete — marca la tarea como completada.
 */
router.post("/portal/tasks/:id/complete", requirePatient, (req, res) => {
  const r = db.prepare(`
    UPDATE therapy_tasks SET status = 'completada', adherence = 100
    WHERE id = ? AND patient_id = ? AND workspace_id = ?
  `).run(req.params.id, req.user.patient_id, req.user.workspace_id);
  if (r.changes === 0) return res.status(404).json({ error: "Tarea no encontrada" });
  res.json({ ok: true });
});

/**
 * GET /api/portal/tests — tests asignados al paciente.
 * Devuelve tanto pendientes como completados (para histórico). Cada uno trae
 * la definición completa del test inline para que la UI pueda renderizar el
 * aplicador sin un fetch extra.
 */
router.get("/portal/tests", requirePatient, (req, res) => {
  const apps = db.prepare(`
    SELECT * FROM test_applications
    WHERE patient_id = ? AND workspace_id = ?
    ORDER BY status = 'pendiente' DESC, COALESCE(completed_at, assigned_at, date) DESC
  `).all(req.user.patient_id, req.user.workspace_id);

  // Anotar cada aplicación con la definición completa de su test
  const testCache = new Map();
  const result = apps.map((a) => {
    let def = testCache.get(a.test_code);
    if (def === undefined) {
      const t = db.prepare("SELECT * FROM psych_tests WHERE code = ?").get(a.test_code);
      def = t ? {
        id: t.id,
        code: t.code,
        name: t.name,
        short_name: t.short_name,
        items: t.items,
        minutes: t.minutes,
        category: t.category,
        description: t.description,
        ...(t.questions_json ? safeJSON(t.questions_json) : {}),
      } : null;
      testCache.set(a.test_code, def);
    }
    return {
      ...a,
      answers_json: a.answers_json ? safeJSON(a.answers_json) : null,
      alerts_json: a.alerts_json ? safeJSON(a.alerts_json) : null,
      definition: def,
    };
  });

  res.json(result);
});

/**
 * PATCH /api/portal/tests/:id/progress — el paciente guarda respuestas
 * parciales para retomar después. Cambia status pendiente → en_curso.
 * NO marca completada — eso es exclusivo del submit.
 */
router.patch("/portal/tests/:id/progress", requirePatient, (req, res) => {
  const app = db.prepare("SELECT * FROM test_applications WHERE id = ? AND patient_id = ? AND workspace_id = ?")
    .get(req.params.id, req.user.patient_id, req.user.workspace_id);
  if (!app) return res.status(404).json({ error: "Test no encontrado" });
  if (app.status === "completado") return res.status(409).json({ error: "Ya completaste este test" });

  const { answers } = req.body ?? {};
  if (!answers || typeof answers !== "object") return res.status(400).json({ error: "answers requerido" });

  const previous = app.answers_json ? safeJSON(app.answers_json) : {};
  const merged = { ...previous, ...answers };
  const answeredCount = Object.keys(merged).filter((k) => merged[k] != null).length;
  const nowIso = new Date().toISOString();

  db.prepare(`
    UPDATE test_applications
    SET answers_json = ?,
        answered_items = ?,
        status = CASE WHEN status = 'pendiente' THEN 'en_curso' ELSE status END,
        started_at = COALESCE(started_at, ?),
        paused_at = ?
    WHERE id = ?
  `).run(JSON.stringify(merged), answeredCount, nowIso, nowIso, req.params.id);

  res.json({ ok: true, answered_items: answeredCount });
});

/**
 * POST /api/portal/tests/:id/submit — el paciente envía sus respuestas.
 * Calcula score, marca completada, genera alerta al psicólogo si aplica.
 */
router.post("/portal/tests/:id/submit", requirePatient, (req, res) => {
  const app = db.prepare("SELECT * FROM test_applications WHERE id = ? AND patient_id = ? AND workspace_id = ?")
    .get(req.params.id, req.user.patient_id, req.user.workspace_id);
  if (!app) return res.status(404).json({ error: "Test no encontrado" });
  if (app.status === "completado") return res.status(409).json({ error: "Ya completaste este test" });

  const test = db.prepare("SELECT * FROM psych_tests WHERE code = ?").get(app.test_code);
  if (!test || !test.questions_json) return res.status(500).json({ error: "Definición del test no disponible" });
  const def = safeJSON(test.questions_json);

  const { answers } = req.body ?? {};
  if (!answers || typeof answers !== "object") return res.status(400).json({ error: "Respuestas requeridas" });

  const missing = def.questions.filter((q) => answers[q.id] == null);
  if (missing.length > 0) {
    return res.status(400).json({ error: `Faltan ${missing.length} respuestas`, missing: missing.map((q) => q.id) });
  }

  const calc = calculateScore(def, answers);
  const completedAt = new Date().toISOString();

  db.prepare(`
    UPDATE test_applications
    SET status = 'completado', score = ?, level = ?, interpretation = ?,
        answers_json = ?, alerts_json = ?,
        completed_at = ?, date = ?, applied_by = 'paciente'
    WHERE id = ?
  `).run(
    calc.score, calc.level, calc.label,
    JSON.stringify(answers),
    Object.keys(calc.alerts).length > 0 ? JSON.stringify(calc.alerts) : null,
    completedAt, completedAt.slice(0, 10),
    req.params.id
  );

  // Si hay alerta crítica → notificar al psicólogo
  if (calc.alerts.critical_response) {
    db.prepare(`
      INSERT INTO notifications (id, workspace_id, type, title, description, at, read, urgent)
      VALUES (?, ?, 'alerta', ?, ?, ?, 0, 1)
    `).run(
      `N-test-${req.params.id}-${Date.now()}`,
      app.workspace_id,
      `Respuesta crítica en ${test.code}`,
      `${app.patient_name} marcó una respuesta clínicamente significativa. Revisar lo antes posible.`,
      completedAt
    );
  }

  // Devolver al paciente solo el resultado básico — sin interpretación detallada
  // (eso es para discutir con su psicóloga).
  res.json({
    ok: true,
    score: calc.score,
    level: calc.level,
    label: calc.label,
    has_critical_response: !!calc.alerts.critical_response,
  });
});

/**
 * GET /api/portal/documents — documentos compartidos con el paciente
 * (todos los documentos donde patient_id es el suyo y status no es eliminado).
 */
router.get("/portal/documents", requirePatient, (req, res) => {
  const rows = db.prepare(`
    SELECT id, name, type, kind, mime, size_kb, status, signed_at, created_at, updated_at, professional
    FROM documents
    WHERE patient_id = ? AND workspace_id = ? AND archived_at IS NULL
    ORDER BY created_at DESC
  `).all(req.user.patient_id, req.user.workspace_id);
  res.json(rows);
});

export default router;
