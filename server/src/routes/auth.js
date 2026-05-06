import { Router } from "express";
import bcrypt from "bcryptjs";
import { db } from "../db.js";
import { signToken, requireAuth } from "../auth.js";

const router = Router();

router.post("/login", (req, res) => {
  const { username, password } = req.body ?? {};
  if (!username || !password) return res.status(400).json({ error: "Usuario y contraseña requeridos" });
  const user = db.prepare(`
    SELECT u.*, w.name AS workspace_name, w.mode AS workspace_mode, w.disabled_at, w.disabled_reason
    FROM users u JOIN workspaces w ON u.workspace_id = w.id
    WHERE u.username = ?
  `).get(username);
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
 * POST /api/auth/change-password — el usuario autenticado cambia su propia
 * contraseña. Verifica la contraseña actual antes de actualizar para evitar
 * que un token comprometido la cambie sin saber la actual.
 *
 * Body: { current_password: string, new_password: string }
 *
 * Validaciones:
 *  - current_password debe coincidir con el hash actual
 *  - new_password mínimo 8 caracteres
 *  - new_password distinta de current_password
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

export default router;
