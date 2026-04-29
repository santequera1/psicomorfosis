/**
 * Rutas de administración de plataforma (cross-workspace).
 * Acceso restringido a usuarios con is_platform_admin=1.
 *
 * Pensado para la fase beta: el dueño de la app puede:
 *  - Ver todos los workspaces (psicólogos / clínicas) con stats de uso
 *  - Crear cuentas nuevas (workspace + primer usuario psicólogo)
 *  - Habilitar / deshabilitar workspaces
 *  - Drilldown a un workspace específico (pacientes, docs, citas)
 */
import { Router } from "express";
import bcrypt from "bcryptjs";
import { db } from "../db.js";
import { requirePlatformAdmin } from "../auth.js";

const router = Router();
router.use(requirePlatformAdmin);

/** Genera un username sugerido a partir del email (parte antes del @). */
function suggestUsername(email) {
  if (!email) return null;
  const base = email.split("@")[0]?.toLowerCase().replace(/[^a-z0-9._-]/g, "") ?? "";
  if (!base) return null;
  // Asegurar único
  let candidate = base;
  let n = 1;
  while (db.prepare("SELECT 1 FROM users WHERE username = ?").get(candidate)) {
    candidate = `${base}${n++}`;
  }
  return candidate;
}

/**
 * GET /api/platform/workspaces
 * Lista todos los workspaces con stats agregados. Útil para el dashboard
 * principal del platform admin: cuántos pacientes tiene cada cuenta, cuándo
 * fue el último login, cuántos docs creó la última semana, etc.
 */
router.get("/workspaces", (req, res) => {
  const since7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const since30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const rows = db.prepare(`
    SELECT
      w.id, w.name, w.mode, w.disabled_at, w.disabled_reason, w.created_at,
      (SELECT COUNT(*) FROM users WHERE workspace_id = w.id AND role != 'paciente') AS users_count,
      (SELECT COUNT(*) FROM patients WHERE workspace_id = w.id AND archived_at IS NULL) AS patients_count,
      (SELECT COUNT(*) FROM documents WHERE workspace_id = w.id AND archived_at IS NULL) AS documents_count,
      (SELECT COUNT(*) FROM documents WHERE workspace_id = w.id AND created_at >= ?) AS documents_7d,
      (SELECT COUNT(*) FROM appointments WHERE workspace_id = w.id AND date >= ?) AS appointments_30d,
      (SELECT MAX(last_login_at) FROM users WHERE workspace_id = w.id AND role != 'paciente') AS last_login_at,
      (SELECT name FROM users WHERE workspace_id = w.id AND role != 'paciente' AND is_platform_admin != 1 ORDER BY id LIMIT 1) AS owner_name,
      (SELECT email FROM users WHERE workspace_id = w.id AND role != 'paciente' ORDER BY id LIMIT 1) AS owner_email,
      (SELECT username FROM users WHERE workspace_id = w.id AND role != 'paciente' ORDER BY id LIMIT 1) AS owner_username
    FROM workspaces w
    ORDER BY (w.disabled_at IS NULL) DESC, w.created_at DESC
  `).all(since7d, since30d);

  res.json(rows.map((r) => ({
    id: r.id,
    name: r.name,
    mode: r.mode,
    disabledAt: r.disabled_at,
    disabledReason: r.disabled_reason,
    createdAt: r.created_at,
    usersCount: r.users_count,
    patientsCount: r.patients_count,
    documentsCount: r.documents_count,
    documents7d: r.documents_7d,
    appointments30d: r.appointments_30d,
    lastLoginAt: r.last_login_at,
    ownerName: r.owner_name,
    ownerEmail: r.owner_email,
    ownerUsername: r.owner_username,
  })));
});

/**
 * GET /api/platform/workspaces/:id
 * Detalle de un workspace con su lista de usuarios y stats más finos.
 */
router.get("/workspaces/:id", (req, res) => {
  const id = Number(req.params.id);
  const ws = db.prepare("SELECT * FROM workspaces WHERE id = ?").get(id);
  if (!ws) return res.status(404).json({ error: "Workspace no encontrado" });

  const users = db.prepare(`
    SELECT id, username, name, email, role, is_platform_admin, last_login_at, created_at
    FROM users WHERE workspace_id = ? ORDER BY id ASC
  `).all(id);

  const stats = db.prepare(`
    SELECT
      (SELECT COUNT(*) FROM patients WHERE workspace_id = ? AND archived_at IS NULL) AS patients_count,
      (SELECT COUNT(*) FROM patients WHERE workspace_id = ? AND archived_at IS NOT NULL) AS patients_archived,
      (SELECT COUNT(*) FROM documents WHERE workspace_id = ? AND archived_at IS NULL) AS documents_count,
      (SELECT COUNT(*) FROM documents WHERE workspace_id = ? AND status = 'firmado') AS documents_signed,
      (SELECT COUNT(*) FROM appointments WHERE workspace_id = ?) AS appointments_total,
      (SELECT COUNT(*) FROM test_applications ta JOIN patients p ON ta.patient_id = p.id WHERE p.workspace_id = ?) AS tests_count,
      (SELECT COUNT(*) FROM clinical_notes WHERE workspace_id = ?) AS notes_count
  `).get(id, id, id, id, id, id, id);

  res.json({
    workspace: {
      id: ws.id,
      name: ws.name,
      mode: ws.mode,
      disabledAt: ws.disabled_at,
      disabledReason: ws.disabled_reason,
      createdAt: ws.created_at,
    },
    users: users.map((u) => ({
      id: u.id,
      username: u.username,
      name: u.name,
      email: u.email,
      role: u.role,
      isPlatformAdmin: !!u.is_platform_admin,
      lastLoginAt: u.last_login_at,
      createdAt: u.created_at,
    })),
    stats,
  });
});

/**
 * POST /api/platform/workspaces/:id/disable
 * Body: { reason?: string }
 * Desactiva un workspace. Los usuarios no pueden hacer login (excepto
 * platform admins, ver auth.js). La data no se borra.
 */
router.post("/workspaces/:id/disable", (req, res) => {
  const id = Number(req.params.id);
  const reason = (req.body?.reason ?? "").toString().slice(0, 200) || null;
  const ws = db.prepare("SELECT id FROM workspaces WHERE id = ?").get(id);
  if (!ws) return res.status(404).json({ error: "Workspace no encontrado" });
  db.prepare("UPDATE workspaces SET disabled_at = ?, disabled_reason = ? WHERE id = ?")
    .run(new Date().toISOString(), reason, id);
  res.json({ ok: true });
});

/** POST /api/platform/workspaces/:id/enable — reactiva un workspace deshabilitado. */
router.post("/workspaces/:id/enable", (req, res) => {
  const id = Number(req.params.id);
  const ws = db.prepare("SELECT id FROM workspaces WHERE id = ?").get(id);
  if (!ws) return res.status(404).json({ error: "Workspace no encontrado" });
  db.prepare("UPDATE workspaces SET disabled_at = NULL, disabled_reason = NULL WHERE id = ?").run(id);
  res.json({ ok: true });
});

/**
 * POST /api/platform/workspaces
 * Body: { workspaceName, mode, ownerName, ownerEmail, username?, password, professionalTitle?, professionalPhone? }
 *
 * Crea un workspace nuevo con su primer usuario (rol 'super_admin' del
 * workspace) y un profesional asociado. Esto es lo que el platform admin usa
 * para invitar a un psicólogo a la fase beta. Devuelve credenciales para que
 * el admin se las comparta por email/whatsapp.
 */
router.post("/workspaces", (req, res) => {
  const {
    workspaceName, mode = "individual",
    ownerName, ownerEmail, username, password,
    professionalTitle, professionalPhone, professionalApproach,
  } = req.body ?? {};

  if (!workspaceName || !ownerName || !ownerEmail || !password) {
    return res.status(400).json({
      error: "workspaceName, ownerName, ownerEmail y password son requeridos",
    });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: "La contraseña debe tener al menos 6 caracteres" });
  }
  if (!["individual", "organization"].includes(mode)) {
    return res.status(400).json({ error: "mode inválido (individual | organization)" });
  }

  // Resolver username único
  let finalUsername = (username ?? "").toString().toLowerCase().replace(/[^a-z0-9._-]/g, "");
  if (!finalUsername) finalUsername = suggestUsername(ownerEmail);
  if (!finalUsername) return res.status(400).json({ error: "username inválido" });
  if (db.prepare("SELECT 1 FROM users WHERE username = ?").get(finalUsername)) {
    return res.status(409).json({ error: `El username "${finalUsername}" ya existe` });
  }
  if (db.prepare("SELECT 1 FROM users WHERE email = ?").get(ownerEmail)) {
    return res.status(409).json({ error: `Ya existe una cuenta con el correo ${ownerEmail}` });
  }

  // Transacción: crear workspace + user + professional + vincularlos
  const tx = db.transaction(() => {
    const wsId = db.prepare("INSERT INTO workspaces (name, mode) VALUES (?, ?)")
      .run(workspaceName, mode).lastInsertRowid;

    const profId = db.prepare(`
      INSERT INTO professionals (workspace_id, name, title, email, phone, approach, active)
      VALUES (?, ?, ?, ?, ?, ?, 1)
    `).run(
      wsId, ownerName,
      professionalTitle ?? "Psicólogo/a clínico/a",
      ownerEmail,
      professionalPhone ?? null,
      professionalApproach ?? null,
    ).lastInsertRowid;

    const userId = db.prepare(`
      INSERT INTO users (workspace_id, username, password_hash, name, email, role, professional_id)
      VALUES (?, ?, ?, ?, ?, 'super_admin', ?)
    `).run(
      wsId, finalUsername, bcrypt.hashSync(password, 10),
      ownerName, ownerEmail, profId,
    ).lastInsertRowid;

    return { wsId, userId, profId };
  });

  try {
    const { wsId, userId, profId } = tx();
    res.status(201).json({
      workspaceId: wsId,
      userId,
      professionalId: profId,
      username: finalUsername,
      // No devolvemos el password en claro pero el admin lo acaba de teclear,
      // así que lo conoce. Frontend muestra confirmación con el username.
    });
  } catch (err) {
    console.error("[platform] create workspace failed:", err);
    res.status(500).json({ error: "No se pudo crear la cuenta: " + (err?.message ?? "error desconocido") });
  }
});

/**
 * GET /api/platform/usage
 * KPIs globales de la plataforma para el dashboard top.
 */
router.get("/usage", (req, res) => {
  const since7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const since30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const stats = db.prepare(`
    SELECT
      (SELECT COUNT(*) FROM workspaces) AS workspaces_total,
      (SELECT COUNT(*) FROM workspaces WHERE disabled_at IS NULL) AS workspaces_active,
      (SELECT COUNT(*) FROM users WHERE role != 'paciente') AS staff_users,
      (SELECT COUNT(*) FROM users WHERE role = 'paciente') AS patient_users,
      (SELECT COUNT(*) FROM users WHERE last_login_at >= ? AND role != 'paciente') AS active_staff_7d,
      (SELECT COUNT(*) FROM patients WHERE archived_at IS NULL) AS patients_total,
      (SELECT COUNT(*) FROM documents WHERE created_at >= ?) AS docs_30d,
      (SELECT COUNT(*) FROM appointments WHERE date >= date('now', '-30 days')) AS appts_30d
  `).get(since7d, since30d);

  res.json(stats);
});

export default router;
