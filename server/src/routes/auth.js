import { Router } from "express";
import bcrypt from "bcryptjs";
import { db } from "../db.js";
import { signToken, requireAuth } from "../auth.js";
import { validateUsername, validateEmail, looksLikeEmail } from "../lib/validators.js";

const router = Router();

/**
 * POST /api/auth/login
 * Body: { identifier?: string, username?: string, password: string }
 *
 * Acepta `identifier` (username O email) o `username` legacy. Si el
 * identifier contiene @ buscamos por email (case-insensitive); si no,
 * por username. Mantenemos compat con clientes viejos que envíen el
 * campo `username`.
 *
 * Si dos usuarios tuvieran mismo email (no debería pasar — validamos
 * unicidad al editar/crear), se prefiere el match por username.
 */
router.post("/login", (req, res) => {
  const body = req.body ?? {};
  const password = body.password;
  const rawIdentifier = body.identifier ?? body.username;
  if (!rawIdentifier || !password) {
    return res.status(400).json({ error: "Usuario/correo y contraseña requeridos" });
  }
  const identifier = String(rawIdentifier).trim();
  const lookupSql = `
    SELECT u.*, w.name AS workspace_name, w.mode AS workspace_mode, w.disabled_at, w.disabled_reason
    FROM users u JOIN workspaces w ON u.workspace_id = w.id
    WHERE LOWER(u.username) = LOWER(?) OR LOWER(u.email) = LOWER(?)
    -- Si por error existieran dos coincidencias (un user cuyo username
    -- coincide con el email de otro), preferimos username match.
    ORDER BY (LOWER(u.username) = LOWER(?)) DESC
    LIMIT 1
  `;
  const user = db.prepare(lookupSql).get(identifier, identifier, identifier);
  if (!user) return res.status(401).json({ error: "Credenciales inválidas" });
  const ok = bcrypt.compareSync(password, user.password_hash);
  if (!ok) return res.status(401).json({ error: "Credenciales inválidas" });

  // Bloquear login si el workspace está deshabilitado. Excepción: platform
  // admins pueden seguir entrando (necesitan acceso para reactivar cuentas).
  if (user.disabled_at && !user.is_platform_admin) {
    return res.status(403).json({
      error: user.disabled_reason
        ? `Cuenta deshabilitada: ${user.disabled_reason}`
        : "Esta cuenta está deshabilitada. Contacta al administrador.",
    });
  }

  // Tracking de uso para el panel de plataforma.
  try {
    db.prepare("UPDATE users SET last_login_at = ? WHERE id = ?").run(new Date().toISOString(), user.id);
  } catch { /* no bloquear login si falla tracking */ }

  const token = signToken({
    id: user.id,
    workspace_id: user.workspace_id,
    username: user.username,
    role: user.role,
    name: user.name,
    professional_id: user.professional_id ?? null,
    is_platform_admin: !!user.is_platform_admin,
  });
  res.json({
    token,
    user: {
      id: user.id,
      username: user.username,
      name: user.name,
      email: user.email,
      role: user.role,
      isPlatformAdmin: !!user.is_platform_admin,
      workspaceId: user.workspace_id,
      workspaceName: user.workspace_name,
      workspaceMode: user.workspace_mode,
    },
  });
});

router.get("/me", requireAuth, (req, res) => {
  const user = db.prepare(`
    SELECT u.id, u.username, u.name, u.email, u.role, u.workspace_id, u.is_platform_admin,
           w.name AS workspace_name, w.mode AS workspace_mode, w.disabled_at
    FROM users u JOIN workspaces w ON u.workspace_id = w.id
    WHERE u.id = ?
  `).get(req.user.id);
  if (!user) return res.status(404).json({ error: "No encontrado" });
  if (user.disabled_at && !user.is_platform_admin) {
    return res.status(403).json({ error: "Cuenta deshabilitada" });
  }
  res.json({
    user: {
      id: user.id,
      username: user.username,
      name: user.name,
      email: user.email,
      role: user.role,
      isPlatformAdmin: !!user.is_platform_admin,
      workspaceId: user.workspace_id,
      workspaceName: user.workspace_name,
      workspaceMode: user.workspace_mode,
    },
  });
});

/**
 * GET /api/auth/check-availability?username=X&email=Y&excludeId=N
 *
 * Endpoint público: lo usamos en el formulario de signup futuro y en
 * los formularios de "editar mis credenciales" / panel admin.
 *
 * `excludeId` opcional permite ignorar al propio usuario al editar
 * (para que su username actual no aparezca como "ya en uso por mí
 * mismo"). Se acepta sin auth porque solo retorna boolean — no leak
 * de datos sensibles. Pero limitamos para no convertirlo en oráculo
 * de enumeración: NO devolvemos info de quién lo tiene, solo
 * available true/false.
 */
router.get("/check-availability", (req, res) => {
  const { username, email, excludeId } = req.query;
  const exclude = Number(excludeId) || 0;
  const out = {};

  if (typeof username === "string" && username.trim()) {
    const v = validateUsername(username);
    if (!v.ok) {
      out.usernameAvailable = false;
      out.usernameError = v.error;
    } else {
      const row = db.prepare(
        "SELECT id FROM users WHERE LOWER(username) = ? AND id != ?"
      ).get(v.value, exclude);
      out.usernameAvailable = !row;
    }
  }

  if (typeof email === "string" && email.trim()) {
    const v = validateEmail(email);
    if (!v.ok) {
      out.emailAvailable = false;
      out.emailError = v.error;
    } else {
      // Email solo es "ocupado" si lo tiene OTRO usuario staff (no
      // paciente — los pacientes usan email como username así que
      // ya bloquean por la columna username).
      const row = db.prepare(
        "SELECT id FROM users WHERE LOWER(email) = ? AND role != 'paciente' AND id != ?"
      ).get(v.value, exclude);
      out.emailAvailable = !row;
    }
  }

  res.json(out);
});

/**
 * POST /api/auth/change-password — el usuario autenticado cambia su propia
 * contraseña. Verifica la contraseña actual antes de actualizar para evitar
 * que un token comprometido la cambie sin saber la actual.
 *
 * Body: { current_password: string, new_password: string }
 */
router.post("/change-password", requireAuth, (req, res) => {
  const { current_password, new_password } = req.body ?? {};
  if (typeof current_password !== "string" || typeof new_password !== "string") {
    return res.status(400).json({ error: "Datos inválidos" });
  }
  if (new_password.length < 8) {
    return res.status(400).json({ error: "La nueva contraseña debe tener al menos 8 caracteres" });
  }
  if (current_password === new_password) {
    return res.status(400).json({ error: "La nueva contraseña debe ser distinta de la actual" });
  }
  const user = db.prepare("SELECT id, password_hash FROM users WHERE id = ?").get(req.user.id);
  if (!user) return res.status(404).json({ error: "Usuario no encontrado" });
  if (!bcrypt.compareSync(current_password, user.password_hash)) {
    return res.status(401).json({ error: "La contraseña actual no es correcta" });
  }
  const newHash = bcrypt.hashSync(new_password, 10);
  db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(newHash, user.id);
  res.json({ ok: true });
});

/**
 * POST /api/auth/update-credentials — el usuario autenticado cambia su
 * propio username y/o email. Exige password actual por seguridad
 * (mismo razonamiento que change-password: token comprometido no
 * basta para tomar el control de la cuenta).
 *
 * Body: { current_password: string, username?: string, email?: string }
 *
 * Devuelve el user actualizado + token nuevo (porque el JWT carga el
 * username y queremos que el client lo refresque sin re-login).
 */
router.post("/update-credentials", requireAuth, (req, res) => {
  const { current_password, username, email } = req.body ?? {};
  if (typeof current_password !== "string") {
    return res.status(400).json({ error: "Confirma tu contraseña actual" });
  }
  const wantsUsername = typeof username === "string" && username.trim().length > 0;
  const wantsEmail = typeof email === "string" && email.trim().length > 0;
  if (!wantsUsername && !wantsEmail) {
    return res.status(400).json({ error: "Nada que actualizar" });
  }

  const user = db.prepare("SELECT id, username, email, password_hash, role FROM users WHERE id = ?").get(req.user.id);
  if (!user) return res.status(404).json({ error: "Usuario no encontrado" });
  if (!bcrypt.compareSync(current_password, user.password_hash)) {
    return res.status(401).json({ error: "La contraseña actual no es correcta" });
  }

  const updates = [];
  const params = [];

  let nextUsername = user.username;
  if (wantsUsername) {
    const v = validateUsername(username);
    if (!v.ok) return res.status(400).json({ error: v.error });
    if (v.value !== user.username.toLowerCase()) {
      const taken = db.prepare("SELECT id FROM users WHERE LOWER(username) = ? AND id != ?")
        .get(v.value, user.id);
      if (taken) return res.status(409).json({ error: "Ese nombre de usuario ya está en uso" });
      nextUsername = v.value;
      updates.push("username = ?");
      params.push(v.value);
    }
  }

  let nextEmail = user.email;
  if (wantsEmail) {
    const v = validateEmail(email);
    if (!v.ok) return res.status(400).json({ error: v.error });
    if (v.value !== (user.email ?? "").toLowerCase()) {
      // Para staff exigimos email único entre sí (NO contra pacientes).
      const taken = db.prepare(
        "SELECT id FROM users WHERE LOWER(email) = ? AND role != 'paciente' AND id != ?"
      ).get(v.value, user.id);
      if (taken) return res.status(409).json({ error: "Ese correo ya está en uso por otra cuenta" });
      nextEmail = v.value;
      updates.push("email = ?");
      params.push(v.value);
    }
  }

  if (updates.length === 0) {
    return res.json({ ok: true, noop: true, user: { ...user, username: nextUsername, email: nextEmail } });
  }
  params.push(user.id);
  db.prepare(`UPDATE users SET ${updates.join(", ")} WHERE id = ?`).run(...params);

  // Re-emitimos el token con el username actualizado para que el cliente
  // no quede con un JWT desincronizado de su username.
  const fresh = db.prepare(`
    SELECT u.id, u.username, u.name, u.email, u.role, u.workspace_id,
           u.is_platform_admin, u.professional_id,
           w.name AS workspace_name, w.mode AS workspace_mode
    FROM users u JOIN workspaces w ON u.workspace_id = w.id
    WHERE u.id = ?
  `).get(user.id);

  const token = signToken({
    id: fresh.id,
    workspace_id: fresh.workspace_id,
    username: fresh.username,
    role: fresh.role,
    name: fresh.name,
    professional_id: fresh.professional_id ?? null,
    is_platform_admin: !!fresh.is_platform_admin,
  });

  res.json({
    ok: true,
    token,
    user: {
      id: fresh.id,
      username: fresh.username,
      name: fresh.name,
      email: fresh.email,
      role: fresh.role,
      isPlatformAdmin: !!fresh.is_platform_admin,
      workspaceId: fresh.workspace_id,
      workspaceName: fresh.workspace_name,
      workspaceMode: fresh.workspace_mode,
    },
  });
});

export default router;
