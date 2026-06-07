/**
 * Endpoints públicos de la landing (/inicio).
 *
 * v2 (5 jun 2026): el form de "Empieza aquí" ya no es solo un lead — pide
 * los datos para crear cuenta (incluyendo password). Persiste en
 * account_requests con status='pending'; el admin aprueba/rechaza desde
 * /platform/solicitudes. La tabla demo_requests queda como histórico.
 */
import { Router } from "express";
import bcrypt from "bcryptjs";
import rateLimit from "express-rate-limit";
import { db } from "../db.js";
import {
  sendDemoRequestEmail,
  sendAccountRequestReceivedEmail,
  sendAccountRequestNotificationEmail,
} from "../mailer.js";
import { validateUsername, validateEmail } from "../lib/validators.js";

const router = Router();

// Rate limit estricto: evitar spam del form. 5 envíos por IP cada 15 min
// es suficiente para uso legítimo. Si en el evento alguien presiona
// submit 6 veces seguidas, es spam o impaciencia — el primero ya entró.
const demoLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Demasiadas solicitudes. Intenta de nuevo en 15 min." },
});

// Para el form de registro real damos un poco más de tolerancia (el form
// es más largo, pueden equivocarse al confirmar contraseña, etc.) pero
// seguimos estrictos por IP.
const registerLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 8,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Demasiadas solicitudes. Intenta de nuevo en 15 min." },
});

/** Sugiere username del email si el campo viene vacío. Asegura unicidad
 *  contra users + account_requests pending. */
function suggestUsernameFromEmail(email) {
  if (!email) return null;
  const base = email.split("@")[0]?.toLowerCase().replace(/[^a-z0-9._-]/g, "") ?? "";
  if (!base) return null;
  let candidate = base;
  let n = 1;
  while (
    db.prepare("SELECT 1 FROM users WHERE username = ?").get(candidate) ||
    db.prepare("SELECT 1 FROM account_requests WHERE username = ? AND status = 'pending'").get(candidate)
  ) {
    candidate = `${base}${n++}`;
  }
  return candidate;
}

router.post("/landing/demo-request", demoLimiter, async (req, res) => {
  const { name, email, phone, message } = req.body ?? {};
  // Validación mínima — no queremos fricciones para un lead legítimo
  // pero sí queremos descartar bots con campos vacíos / inválidos.
  if (typeof name !== "string" || name.trim().length < 2) {
    return res.status(400).json({ error: "Nombre requerido" });
  }
  if (typeof email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: "Email inválido" });
  }
  // Anti-spam ligero: si message tiene un link o más de N URLs, lo
  // marcamos como spam silenciosamente (devolvemos 200, pero no
  // enviamos email — solo log en DB).
  const msg = typeof message === "string" ? message.trim().slice(0, 2000) : "";
  const urlCount = (msg.match(/https?:\/\//gi) ?? []).length;
  const looksSpam = urlCount > 1;

  const ip = req.headers["x-forwarded-for"]?.toString().split(",")[0].trim()
    || req.socket?.remoteAddress
    || "";
  const userAgent = (req.headers["user-agent"] ?? "").slice(0, 500);
  const safePhone = typeof phone === "string" ? phone.trim().slice(0, 50) : null;

  // 1) Persistir SIEMPRE — el lead no se pierde aunque falle el email.
  const ins = db.prepare(`
    INSERT INTO demo_requests (name, email, phone, message, ip, user_agent, status)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    name.trim().slice(0, 100),
    email.trim().slice(0, 200),
    safePhone,
    msg || null,
    ip,
    userAgent,
    looksSpam ? "spam" : "nuevo",
  );

  // 2) Enviar email (best effort). El destinatario sale de env var
  //    DEMO_LEADS_EMAIL; default al gmail personal de Stiven.
  if (!looksSpam) {
    try {
      await sendDemoRequestEmail({
        name: name.trim(),
        email: email.trim(),
        phone: safePhone,
        message: msg || undefined,
        toEmail: process.env.DEMO_LEADS_EMAIL || "stivenantequera@gmail.com",
      });
    } catch (e) {
      // Ya está logueado en mailer.js; aquí solo no rompemos la respuesta.
      console.warn("[landing] email fallido (lead igual quedó en DB):", e?.message);
    }
  }

  res.status(201).json({ ok: true, id: ins.lastInsertRowid });
});

// ════════════════════════════════════════════════════════════════════════
// REGISTRO AUTOSERVICIO — POST /api/landing/register
// ════════════════════════════════════════════════════════════════════════

router.post("/landing/register", registerLimiter, async (req, res) => {
  const body = req.body ?? {};
  const fullName = String(body.fullName ?? body.full_name ?? "").trim();
  const email    = String(body.email ?? "").trim().toLowerCase();
  let username   = String(body.username ?? "").trim().toLowerCase();
  const password = String(body.password ?? "");
  const phone    = String(body.phone ?? "").trim().slice(0, 50);
  const message  = String(body.message ?? "").trim().slice(0, 2000);

  // ── Validaciones ─────────────────────────────────────────────────────
  if (fullName.length < 2 || fullName.length > 100) {
    return res.status(400).json({ error: "El nombre completo debe tener entre 2 y 100 caracteres" });
  }
  const emailCheck = validateEmail(email);
  if (!emailCheck.ok) return res.status(400).json({ error: emailCheck.error });
  if (password.length < 8) {
    return res.status(400).json({ error: "La contraseña debe tener al menos 8 caracteres" });
  }
  if (password.length > 128) {
    return res.status(400).json({ error: "La contraseña es demasiado larga" });
  }

  // Si vino vacío, derivamos del email.
  if (!username) {
    username = suggestUsernameFromEmail(email);
    if (!username) {
      return res.status(400).json({ error: "No pudimos derivar un usuario válido de tu email. Escríbelo manualmente." });
    }
  } else {
    const usernameCheck = validateUsername(username);
    if (!usernameCheck.ok) return res.status(400).json({ error: usernameCheck.error });
    username = usernameCheck.value;
  }

  // ── Unicidad: no permitimos solicitar con un email/username que YA
  // está en uso por una cuenta existente. Para solicitudes pendientes,
  // permitimos reintento (sobrescribimos la anterior) para que el usuario
  // pueda corregir si se equivocó al primer envío.
  if (db.prepare("SELECT 1 FROM users WHERE email = ?").get(email)) {
    return res.status(409).json({
      error: "Ya existe una cuenta con ese correo. Si la olvidaste, entra a /login y usa 'Olvidé mi contraseña'.",
    });
  }
  if (db.prepare("SELECT 1 FROM users WHERE username = ?").get(username)) {
    return res.status(409).json({ error: `El usuario "${username}" ya está en uso. Intenta con otro.` });
  }

  // Si ya hay una solicitud pendiente con este email, devolvemos 409
  // explicando — no la sobreescribimos silenciosamente porque podría
  // ser una persona distinta usando el mismo email por error.
  const pending = db.prepare(
    "SELECT id FROM account_requests WHERE email = ? AND status = 'pending'",
  ).get(email);
  if (pending) {
    return res.status(409).json({
      error: "Ya tienes una solicitud pendiente con ese correo. Te avisamos por email en cuanto la revisemos.",
    });
  }

  // ── Persist ──────────────────────────────────────────────────────────
  const ip = req.headers["x-forwarded-for"]?.toString().split(",")[0].trim()
    || req.socket?.remoteAddress
    || "";
  const userAgent = (req.headers["user-agent"] ?? "").slice(0, 500);
  const passwordHash = bcrypt.hashSync(password, 10);

  const ins = db.prepare(`
    INSERT INTO account_requests
    (full_name, email, username, password_hash, phone, message, ip, user_agent)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    fullName.slice(0, 100),
    email.slice(0, 200),
    username,
    passwordHash,
    phone || null,
    message || null,
    ip,
    userAgent,
  );

  const requestId = ins.lastInsertRowid;

  // ── Emails (best-effort, no bloquean la respuesta) ───────────────────
  // Acuse de recibo al solicitante
  sendAccountRequestReceivedEmail({
    fullName, email, username,
    replyTo: process.env.DEMO_LEADS_EMAIL || undefined,
  }).catch((e) => console.warn("[landing/register] acuse de recibo error:", e?.message));

  // Notificación a Stiven
  sendAccountRequestNotificationEmail({
    request: { full_name: fullName, email, username, phone, message },
    toEmail: process.env.DEMO_LEADS_EMAIL || "stivenantequera@gmail.com",
  }).catch((e) => console.warn("[landing/register] notif admin error:", e?.message));

  return res.status(201).json({ ok: true, id: requestId, username });
});

export default router;
