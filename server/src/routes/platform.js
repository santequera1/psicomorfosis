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
import { validateUsername, validateEmail } from "../lib/validators.js";

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

  // Cargamos TODOS los miembros (no-paciente) de una sola pasada y los
  // agrupamos por workspace en JS. Antes solo enviábamos `owner_*` (el
  // primer user), lo que ocultaba a quienes comparten espacio — caso
  // típico del workspace legal, donde María y Alba comparten id=4 y
  // sólo aparecía una de ellas. Un query global + Map es O(N) sobre
  // usuarios, mejor que N+1 subqueries por workspace.
  const memberRows = db.prepare(`
    SELECT id, workspace_id, name, username, email, role,
           is_legal_admin, is_platform_admin, last_login_at
    FROM users
    WHERE role != 'paciente'
    ORDER BY workspace_id, id
  `).all();
  const membersByWs = new Map();
  for (const m of memberRows) {
    if (!membersByWs.has(m.workspace_id)) membersByWs.set(m.workspace_id, []);
    membersByWs.get(m.workspace_id).push({
      id: m.id,
      name: m.name,
      username: m.username,
      email: m.email,
      role: m.role,
      isLegalAdmin: !!m.is_legal_admin,
      isPlatformAdmin: !!m.is_platform_admin,
      lastLoginAt: m.last_login_at,
    });
  }

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
    members: membersByWs.get(r.id) ?? [],
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
 * DELETE /api/platform/workspaces/:id
 * Body: { confirm_name: string }  // debe coincidir con el nombre exacto del workspace
 *
 * Elimina permanentemente un workspace y todos sus datos (cascade en FKs).
 * Para evitar borrados accidentales, exige tipear el nombre exacto.
 * No se permite borrar el workspace propio (donde está el platform admin).
 */
router.delete("/workspaces/:id", (req, res) => {
  const id = Number(req.params.id);
  const ws = db.prepare("SELECT id, name FROM workspaces WHERE id = ?").get(id);
  if (!ws) return res.status(404).json({ error: "Workspace no encontrado" });
  if (id === req.user.workspace_id) {
    return res.status(400).json({ error: "No puedes eliminar tu propio workspace de plataforma" });
  }
  const { confirm_name } = req.body ?? {};
  if (confirm_name !== ws.name) {
    return res.status(400).json({
      error: `Para confirmar, el campo "confirm_name" debe coincidir exactamente con "${ws.name}"`,
    });
  }
  // ON DELETE CASCADE en las FKs limpia patients, documents, appointments,
  // notes, etc. Los archivos en disk (uploads/) quedan huérfanos — limpieza
  // futura via cron si hace falta.
  db.prepare("DELETE FROM workspaces WHERE id = ?").run(id);
  res.json({ ok: true });
});

/**
 * POST /api/platform/users/:id/reset-password
 * Body: { new_password: string }  // mínimo 6 caracteres
 *
 * El platform admin define una contraseña nueva para un usuario y se la
 * comparte por fuera (WhatsApp/email). El user debería cambiarla al
 * próximo login (UI le sugiere hacerlo, pero no es obligatorio aún).
 */
router.post("/users/:id/reset-password", (req, res) => {
  const userId = Number(req.params.id);
  const u = db.prepare("SELECT id, username, name, workspace_id, is_platform_admin FROM users WHERE id = ?").get(userId);
  if (!u) return res.status(404).json({ error: "Usuario no encontrado" });
  // No permitir resetear el password del propio platform admin desde acá
  // (debería usar Configuración > Cambiar contraseña con su password actual)
  if (u.id === req.user.id) {
    return res.status(400).json({ error: "Para tu propia contraseña, usa Configuración" });
  }
  const { new_password } = req.body ?? {};
  if (!new_password || typeof new_password !== "string" || new_password.length < 6) {
    return res.status(400).json({ error: "La contraseña debe tener al menos 6 caracteres" });
  }
  db.prepare("UPDATE users SET password_hash = ? WHERE id = ?")
    .run(bcrypt.hashSync(new_password, 10), userId);
  res.json({ ok: true, username: u.username, name: u.name });
});

/**
 * PATCH /api/platform/users/:id
 * Body: { username?, email?, name? }
 *
 * El platform admin actualiza username, email y/o nombre de un usuario
 * staff de cualquier workspace. NO requiere password actual del user
 * (el admin actúa con su propia autoridad). Para pacientes, el username
 * es el email y se gestiona desde otro flujo — este endpoint NO los
 * acepta para evitar accidentes.
 *
 * Validaciones: formato + unicidad (case-insensitive). Errores 4xx
 * específicos para que el cliente pueda mostrar el motivo exacto.
 */
router.patch("/users/:id", (req, res) => {
  const userId = Number(req.params.id);
  const u = db.prepare("SELECT id, username, email, name, role FROM users WHERE id = ?").get(userId);
  if (!u) return res.status(404).json({ error: "Usuario no encontrado" });
  if (u.role === "paciente") {
    return res.status(400).json({ error: "Las cuentas de paciente se gestionan desde otro flujo" });
  }

  const { username, email, name } = req.body ?? {};
  const updates = [];
  const params = [];

  if (typeof username === "string" && username.trim()) {
    const v = validateUsername(username);
    if (!v.ok) return res.status(400).json({ error: v.error });
    if (v.value !== u.username.toLowerCase()) {
      const taken = db.prepare("SELECT id FROM users WHERE LOWER(username) = ? AND id != ?")
        .get(v.value, u.id);
      if (taken) return res.status(409).json({ error: "Ese nombre de usuario ya está en uso" });
      updates.push("username = ?");
      params.push(v.value);
    }
  }

  if (typeof email === "string" && email.trim()) {
    const v = validateEmail(email);
    if (!v.ok) return res.status(400).json({ error: v.error });
    if (v.value !== (u.email ?? "").toLowerCase()) {
      const taken = db.prepare(
        "SELECT id FROM users WHERE LOWER(email) = ? AND role != 'paciente' AND id != ?"
      ).get(v.value, u.id);
      if (taken) return res.status(409).json({ error: "Ese correo ya está en uso por otra cuenta" });
      updates.push("email = ?");
      params.push(v.value);
    }
  }

  if (typeof name === "string" && name.trim().length > 0 && name.trim() !== u.name) {
    updates.push("name = ?");
    params.push(name.trim());
  }

  if (updates.length === 0) {
    return res.json({ ok: true, noop: true });
  }
  params.push(u.id);
  db.prepare(`UPDATE users SET ${updates.join(", ")} WHERE id = ?`).run(...params);

  const fresh = db.prepare("SELECT id, username, email, name, role FROM users WHERE id = ?").get(u.id);
  res.json({ ok: true, user: fresh });
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

// ─────────────────────────────────────────────────────────────────────
// Error reports
// ─────────────────────────────────────────────────────────────────────
// El POST público para crear reportes vive en routes/errorReports.js
// (lo recibe cualquier usuario incluso sin sesión). Aquí solo expongo
// los endpoints administrativos para revisarlos y resolverlos.

/**
 * GET /api/platform/error-reports
 * Lista paginada de reportes con info del usuario y workspace.
 * Filtros opcionales: ?status=open|resolved|all
 */
router.get("/error-reports", (req, res) => {
  const status = req.query.status === "all" ? null : (req.query.status === "resolved" ? "resolved" : "open");
  const limit = Math.min(Number(req.query.limit) || 100, 500);
  const offset = Math.max(Number(req.query.offset) || 0, 0);

  const where = status ? "WHERE er.status = ?" : "";
  const params = status ? [status, limit, offset] : [limit, offset];

  const rows = db.prepare(`
    SELECT
      er.id, er.kind, er.url, er.message, er.user_description, er.user_agent,
      er.status, er.created_at, er.resolved_at,
      er.user_role, er.user_name,
      w.name AS workspace_name,
      ru.name AS resolved_by_name,
      (SELECT COUNT(*) FROM error_report_attachments era WHERE era.report_id = er.id) AS attachments_count
    FROM error_reports er
    LEFT JOIN workspaces w ON w.id = er.workspace_id
    LEFT JOIN users ru ON ru.id = er.resolved_by
    ${where}
    ORDER BY er.created_at DESC
    LIMIT ? OFFSET ?
  `).all(...params);

  const counts = db.prepare(`
    SELECT
      SUM(CASE WHEN status = 'open' THEN 1 ELSE 0 END) AS open_count,
      SUM(CASE WHEN status = 'resolved' THEN 1 ELSE 0 END) AS resolved_count,
      COUNT(*) AS total_count
    FROM error_reports
  `).get();

  res.json({ items: rows, counts });
});

/**
 * GET /api/platform/error-reports/:id
 * Detalle completo (incluye stack trace, que omitimos en el listado,
 * y la lista de adjuntos asociados).
 */
router.get("/error-reports/:id", (req, res) => {
  const row = db.prepare(`
    SELECT
      er.*,
      w.name AS workspace_name,
      ru.name AS resolved_by_name
    FROM error_reports er
    LEFT JOIN workspaces w ON w.id = er.workspace_id
    LEFT JOIN users ru ON ru.id = er.resolved_by
    WHERE er.id = ?
  `).get(req.params.id);
  if (!row) return res.status(404).json({ error: "Reporte no encontrado" });
  const attachments = db.prepare(`
    SELECT id, url, mime, size, original_name, created_at
    FROM error_report_attachments
    WHERE report_id = ?
    ORDER BY id ASC
  `).all(req.params.id);
  res.json({ ...row, attachments });
});

/**
 * PATCH /api/platform/error-reports/:id
 * Actualiza estado (open|resolved). Marca quién y cuándo resolvió.
 */
router.patch("/error-reports/:id", (req, res) => {
  const { status } = req.body ?? {};
  if (status !== "open" && status !== "resolved") {
    return res.status(400).json({ error: "status debe ser 'open' o 'resolved'" });
  }
  const now = new Date().toISOString();
  if (status === "resolved") {
    db.prepare(
      "UPDATE error_reports SET status = ?, resolved_at = ?, resolved_by = ? WHERE id = ?"
    ).run(status, now, req.user?.id ?? null, req.params.id);
  } else {
    db.prepare(
      "UPDATE error_reports SET status = ?, resolved_at = NULL, resolved_by = NULL WHERE id = ?"
    ).run(status, req.params.id);
  }
  res.json({ ok: true });
});

export default router;
