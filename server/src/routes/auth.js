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

export default router;
