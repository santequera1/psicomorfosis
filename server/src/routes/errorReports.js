/**
 * Endpoint público para reportes de problemas / errores capturados desde
 * el frontend. Se diseñó público intencionalmente: si el bug ocurre en
 * login o durante una pantalla de error genérico ("Something went
 * wrong"), el usuario puede no tener sesión válida y aun así queremos
 * recibir el reporte.
 *
 * Si el reporte llega con un token Authorization válido lo enriquecemos
 * con user_id, role y workspace; si no, queda anónimo.
 *
 * Rate limit por IP simple (memoria del proceso) para evitar abuso —
 * en producción seria se reemplaza por Redis o un middleware dedicado,
 * pero para una beta de 5-10 personas con un solo proceso PM2 sobra.
 */
import { Router } from "express";
import { db } from "../db.js";
import { verifyToken } from "../auth.js";

const router = Router();

const RATE_LIMIT_WINDOW_MS = 60_000;       // 1 minuto
const RATE_LIMIT_MAX_PER_IP = 20;           // 20 reportes/min/IP
const ipBuckets = new Map();                // ip -> { count, resetAt }

function rateLimitOk(ip) {
  const now = Date.now();
  const bucket = ipBuckets.get(ip);
  if (!bucket || bucket.resetAt < now) {
    ipBuckets.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }
  if (bucket.count >= RATE_LIMIT_MAX_PER_IP) return false;
  bucket.count++;
  return true;
}

router.post("/error-reports", (req, res) => {
  const ip = req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.ip || "unknown";
  if (!rateLimitOk(ip)) {
    return res.status(429).json({ error: "Demasiados reportes. Intenta en un minuto." });
  }

  const {
    kind,
    url,
    message,
    stack,
    user_description,
    user_agent,
  } = req.body ?? {};

  // Validación mínima: tiene que haber algo (mensaje del error o
  // descripción del usuario). Sin esto no sirve guardar nada.
  const hasMessage = typeof message === "string" && message.trim().length > 0;
  const hasDescription = typeof user_description === "string" && user_description.trim().length > 0;
  if (!hasMessage && !hasDescription) {
    return res.status(400).json({ error: "Falta mensaje o descripción del problema." });
  }

  // Truncamos campos largos para no llenar la BD por accidente. stack
  // traces minificados pueden ser enormes (cientos de KB).
  const trunc = (s, max) => (typeof s === "string" ? s.slice(0, max) : null);

  // Auth opcional: si viene token, enriquecemos con user info.
  const auth = req.headers.authorization;
  let user = null;
  if (auth?.startsWith("Bearer ")) {
    try { user = verifyToken(auth.slice(7)); } catch { /* token inválido = anónimo */ }
  }

  const reportKind = kind === "auto" ? "auto" : "manual";

  try {
    const ins = db.prepare(`
      INSERT INTO error_reports (
        workspace_id, user_id, user_role, user_name, kind,
        url, message, stack, user_description, user_agent
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      user?.workspace_id ?? null,
      user?.id ?? null,
      user?.role ?? null,
      user?.name ?? null,
      reportKind,
      trunc(url, 500),
      trunc(message, 2000),
      trunc(stack, 8000),
      trunc(user_description, 4000),
      trunc(user_agent, 500),
    );
    res.status(201).json({ id: ins.lastInsertRowid });
  } catch (err) {
    // Si la inserción falla no queremos romper la UX del usuario que
    // ya está viendo un error — devolvemos 200 con mensaje suave.
    console.error("[error-reports] insert failed:", err);
    res.status(202).json({ ok: false, message: "Reporte recibido pero no se pudo guardar; lo investigamos." });
  }
});

export default router;
