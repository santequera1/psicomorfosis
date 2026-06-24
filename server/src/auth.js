import jwt from "jsonwebtoken";
import { db } from "./db.js";

// 7 días: TTL absoluto del token. El sliding refresh (abajo) emite
// uno nuevo cada vez que quedan < 24h de vida — así un usuario que
// usa la app a diario nunca ve la sesión caer. Si no entra en 7
// días corridos, ahí sí re-loguea.
const EXPIRES_IN = "7d";
// Umbral para regenerar token: cuando le quedan < 24h, el middleware
// emite uno fresco en el header X-Refresh-Token. El cliente lo guarda
// transparente y el usuario nunca se entera.
const REFRESH_THRESHOLD_SEC = 24 * 60 * 60;
const FALLBACK_SECRET = "psicomorfosis-dev-secret-change-me";

// IMPORTANT: leer JWT_SECRET de forma LAZY (no a nivel de módulo). Los
// imports ESM se evalúan ANTES del body de index.js donde corre
// dotenvConfig(), así que si capturamos process.env.JWT_SECRET al top-level
// siempre cae al fallback. Lo leemos al primer uso y lo cacheamos para
// no penalizar performance.
let _cachedSecret = null;
function getSecret() {
  if (_cachedSecret) return _cachedSecret;
  const fromEnv = process.env.JWT_SECRET;
  if (!fromEnv) {
    // Avisamos UNA vez al arranque si caemos al fallback — sin esto, tokens
    // se invalidarían silenciosamente entre restarts y los usuarios verían
    // 401/403 sin pista.
    console.warn("[auth] JWT_SECRET no configurado en .env — usando secret de desarrollo. Los tokens NO serán estables entre restarts.");
  }
  _cachedSecret = fromEnv || FALLBACK_SECRET;
  return _cachedSecret;
}

export function signToken(payload) {
  return jwt.sign(payload, getSecret(), { expiresIn: EXPIRES_IN });
}

/**
 * Devuelve true si al token le quedan menos de REFRESH_THRESHOLD_SEC
 * de vida — en ese caso conviene re-emitir uno fresco para que la
 * sesión no caiga durante el uso normal.
 */
function shouldRefresh(payload) {
  if (!payload?.exp) return false;
  const nowSec = Math.floor(Date.now() / 1000);
  return (payload.exp - nowSec) < REFRESH_THRESHOLD_SEC;
}

/**
 * Re-firma el payload del JWT con un nuevo iat/exp. Quitamos los
 * campos managed por la lib antes de re-firmar para que no se
 * dupliquen.
 */
function refreshFromPayload(payload) {
  const { iat: _iat, exp: _exp, ...rest } = payload;
  return signToken(rest);
}

export function verifyToken(token) {
  try {
    const payload = jwt.verify(token, getSecret());
    // Revocación server-side via users.tokens_invalidated_at: si el usuario
    // hizo logout (o cambió contraseña en el futuro), su timestamp queda
    // grabado y CUALQUIER token emitido antes de ese momento se invalida.
    //
    // payload.iat viene en segundos (estándar JWT). Lo comparamos vs ms
    // del timestamp en DB. Si user no existe o no tiene tokens_invalidated_at,
    // el token sigue siendo válido (estado default).
    //
    // Skip para tokens sin id (no debería pasar pero defensa en profundidad).
    if (payload?.id && typeof payload?.iat === "number") {
      const u = db.prepare("SELECT tokens_invalidated_at FROM users WHERE id = ?")
        .get(payload.id);
      if (u?.tokens_invalidated_at) {
        const invalidatedAt = new Date(u.tokens_invalidated_at).getTime();
        const issuedAt = payload.iat * 1000;
        if (issuedAt < invalidatedAt) return null;
      }
    }
    return payload;
  } catch {
    return null;
  }
}

/**
 * Marca todos los tokens del usuario como inválidos. Cualquier JWT emitido
 * antes de este momento será rechazado por verifyToken. El usuario tendrá
 * que volver a hacer login.
 *
 * Llamado desde el endpoint de logout. El timestamp tiene resolución de
 * milisegundo, mientras que JWT `iat` tiene resolución de segundo — para
 * evitar que un token emitido en el mismo segundo del logout siga válido,
 * sumamos 1000ms al timestamp (efectivamente "redondeamos arriba al
 * próximo segundo").
 */
export function invalidateUserTokens(userId) {
  const now = new Date(Date.now() + 1000).toISOString();
  db.prepare("UPDATE users SET tokens_invalidated_at = ? WHERE id = ?")
    .run(now, userId);
  return now;
}

/**
 * Setea X-Refresh-Token en el response si el token actual está cerca
 * de expirar. El cliente lee ese header y reemplaza el token en
 * localStorage sin intervención del usuario. Resultado: el usuario
 * activo nunca pierde la sesión por TTL.
 */
function maybeRefresh(res, payload) {
  if (!shouldRefresh(payload)) return;
  try {
    res.setHeader("X-Refresh-Token", refreshFromPayload(payload));
  } catch (e) {
    console.warn("[auth] no pude refrescar token:", e?.message);
  }
}

export function requireAuth(req, res, next) {
  const header = req.headers.authorization ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: "Missing token" });
  const payload = verifyToken(token);
  if (!payload) return res.status(401).json({ error: "Invalid or expired token" });
  req.user = payload;
  maybeRefresh(res, payload);
  next();
}

export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: "Unauthenticated" });
    if (!roles.includes(req.user.role)) return res.status(403).json({ error: "Forbidden" });
    next();
  };
}

/**
 * Requiere que el JWT pertenezca a un paciente. Usado en /api/portal/*.
 * El JWT del paciente lleva role='paciente' y patient_id no-nulo.
 */
export function requirePatient(req, res, next) {
  const header = req.headers.authorization ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: "Missing token" });
  const payload = verifyToken(token);
  if (!payload) return res.status(401).json({ error: "Invalid or expired token" });
  if (payload.role !== "paciente" || !payload.patient_id) {
    // Log estructurado: nos dice si el problema es role incorrecto (usuario
    // logueado como staff intentando acceder al portal) o patient_id ausente
    // (paciente mal seedado). Vital para diagnosticar 403s en producción.
    console.warn(
      `[auth] 403 portal: role=${JSON.stringify(payload.role)} patient_id=${JSON.stringify(payload.patient_id)} user_id=${payload.id} path=${req.path}`
    );
    return res.status(403).json({
      error: "Acceso solo para pacientes",
      // Pista para que el frontend sepa que tiene que botar el token viejo
      // y mandar al usuario a login. Sin esto el frontend reintenta en loop.
      hint: "wrong_role",
    });
  }
  req.user = payload;
  maybeRefresh(res, payload);
  next();
}

/**
 * Requiere que el JWT pertenezca a un platform admin (dueño de la plataforma,
 * cross-workspace). Diferente de "super_admin" del workspace, que solo es
 * dueño de su propia clínica. Solo platform_admin ve /api/platform/*.
 */
export function requirePlatformAdmin(req, res, next) {
  const header = req.headers.authorization ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: "Missing token" });
  const payload = verifyToken(token);
  if (!payload) return res.status(401).json({ error: "Invalid or expired token" });
  if (!payload.is_platform_admin) {
    return res.status(403).json({ error: "Acceso solo para administradores de plataforma" });
  }
  req.user = payload;
  maybeRefresh(res, payload);
  next();
}

/**
 * Requiere que el JWT pertenezca a un asesor legal (rol transversal,
 * sin workspace clínico). Solo lo cumplen las cuentas marcadas con
 * `is_legal_admin = 1`. Edita políticas y términos desde /legal-admin.
 */
export function requireLegalAdmin(req, res, next) {
  const header = req.headers.authorization ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: "Missing token" });
  const payload = verifyToken(token);
  if (!payload) return res.status(401).json({ error: "Invalid or expired token" });
  if (!payload.is_legal_admin) {
    return res.status(403).json({ error: "Acceso solo para asesores legales" });
  }
  req.user = payload;
  maybeRefresh(res, payload);
  next();
}

/** Lo opuesto a requirePatient: bloquea pacientes en rutas de staff. */
export function requireStaff(req, res, next) {
  const header = req.headers.authorization ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: "Missing token" });
  const payload = verifyToken(token);
  if (!payload) return res.status(401).json({ error: "Invalid or expired token" });
  if (payload.role === "paciente") {
    return res.status(403).json({ error: "Acceso solo para staff" });
  }
  req.user = payload;
  maybeRefresh(res, payload);
  next();
}
