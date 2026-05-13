import jwt from "jsonwebtoken";

const EXPIRES_IN = "24h";
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

export function verifyToken(token) {
  try {
    return jwt.verify(token, getSecret());
  } catch {
    return null;
  }
}

export function requireAuth(req, res, next) {
  const header = req.headers.authorization ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: "Missing token" });
  const payload = verifyToken(token);
  if (!payload) return res.status(401).json({ error: "Invalid or expired token" });
  req.user = payload;
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
  next();
}
