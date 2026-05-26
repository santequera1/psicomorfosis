/**
 * Endpoints públicos de la landing (/inicio).
 * Solo recibe el form "Solicitar demo" — siempre persiste en
 * demo_requests aunque SMTP falle, para no perder leads.
 */
import { Router } from "express";
import rateLimit from "express-rate-limit";
import { db } from "../db.js";
import { sendDemoRequestEmail } from "../mailer.js";

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

export default router;
