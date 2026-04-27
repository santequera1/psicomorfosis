import jwt from "jsonwebtoken";

const SECRET = process.env.JWT_SECRET ?? "psicomorfosis-dev-secret-change-me";
const EXPIRES_IN = "24h";

export function signToken(payload) {
  return jwt.sign(payload, SECRET, { expiresIn: EXPIRES_IN });
}

export function verifyToken(token) {
  try {
    return jwt.verify(token, SECRET);
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
    return res.status(403).json({ error: "Acceso solo para pacientes" });
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
