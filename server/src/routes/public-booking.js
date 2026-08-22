/**
 * Perfil público + reserva de citas (linktree por profesional).
 *
 * Endpoints SIN auth (el visitante es un paciente potencial):
 *   GET  /api/public/professionals/:slug               → datos del perfil
 *   GET  /api/public/professionals/:slug/availability  → slots libres reales
 *   POST /api/public/professionals/:slug/booking       → solicitud de cita
 *
 * La reserva NO confirma: crea la cita en estado 'solicitada' y le avisa
 * al profesional por WhatsApp (Laura) para que acepte desde su agenda.
 * A diferencia de psicora ("honorario a confirmar" con slots genéricos),
 * los slots salen de la agenda REAL del profesional.
 *
 * ⚠️ Este router se monta en /api/public. NUNCA meter router.use(mw)
 * global aquí — ver [auth-diag]/smoke canarios: dos incidentes previos
 * (laura.js, bot.js) por middlewares sin scope en routers de /api.
 */

import { Router } from "express";
import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import { db } from "../db.js";
import { notifyBookingRequested } from "../lib/psicobot.js";
import { sendBookingRequestEmails } from "../mailer.js";
import { ensureMeetingUrl } from "../lib/video.js";

const router = Router();

// Rate limits por endpoint (no router.use global).
const readLimiter = rateLimit({
  windowMs: 60_000, max: 60,
  standardHeaders: true, legacyHeaders: false,
  keyGenerator: (req) => `pub-read:${ipKeyGenerator(req)}`,
});
const bookLimiter = rateLimit({
  windowMs: 10 * 60_000, max: 5,
  standardHeaders: true, legacyHeaders: false,
  keyGenerator: (req) => `pub-book:${ipKeyGenerator(req)}`,
  message: { error: "Demasiadas solicitudes. Intenta de nuevo en unos minutos." },
});

/** Profesional público por slug, o null. */
function publicProfessional(slug) {
  // La foto pública cae a la foto de perfil del usuario vinculado: así
  // nadie tiene que subir una segunda imagen para activar su perfil.
  return db.prepare(`
    SELECT p.id, p.workspace_id, p.name, p.title, p.approach, p.phone, p.email,
           p.slug, p.public_bio, p.public_location,
           p.public_instagram, p.public_areas, p.public_links, p.public_socials, p.public_bg,
           COALESCE(p.public_photo_url, (
             SELECT u.photo_url FROM users u
             WHERE u.professional_id = p.id AND u.photo_url IS NOT NULL
             ORDER BY u.id LIMIT 1
           )) AS public_photo_url
    FROM professionals p
    WHERE p.slug = ? AND p.public_enabled = 1 AND p.active = 1
  `).get(String(slug || "").toLowerCase());
}

function parseLinks(raw) {
  try {
    const arr = JSON.parse(raw ?? "[]");
    return Array.isArray(arr)
      ? arr.filter((l) => l && typeof l.label === "string" && /^https?:\/\//i.test(String(l.url)))
      : [];
  } catch { return []; }
}

// ─── GET perfil ──────────────────────────────────────────────────────
router.get("/professionals/:slug", readLimiter, (req, res) => {
  const p = publicProfessional(req.params.slug);
  if (!p) return res.status(404).json({ error: "Perfil no encontrado" });
  let socials = {};
  try { socials = JSON.parse(p.public_socials || "{}") || {}; } catch { socials = {}; }
  // WhatsApp: el número puesto en redes manda; si no, el del perfil.
  const waDigits = String(socials.whatsapp || p.phone || "").replace(/\D/g, "");
  const instagram = socials.instagram || p.public_instagram || null;
  res.json({
    slug: p.slug,
    name: p.name,
    title: p.title,
    bio: p.public_bio ?? p.approach ?? "",
    photo_url: p.public_photo_url,
    location: p.public_location,
    instagram,
    areas: (p.public_areas ?? "").split(",").map((s) => s.trim()).filter(Boolean),
    whatsapp: waDigits.length >= 10 ? waDigits : null,
    links: parseLinks(p.public_links),
    socials: {
      instagram: instagram ? `https://instagram.com/${instagram}` : null,
      tiktok: socials.tiktok ? `https://www.tiktok.com/@${socials.tiktok}` : null,
      facebook: socials.facebook || null,
      youtube: socials.youtube || null,
      linkedin: socials.linkedin || null,
    },
    bg: p.public_bg || null,
  });
});

// ─── GET disponibilidad ──────────────────────────────────────────────
// Slots de 50 min en grilla horaria Lu-Vi 08:00-17:00, excluyendo las
// horas ya ocupadas en la agenda real del profesional. v1 sin horarios
// configurables por profesional (la grilla coincide con el uso actual
// de la app); cuando haga falta, esto lee de una tabla de horarios.
const GRID = ["08:00", "09:00", "10:00", "11:00", "14:00", "15:00", "16:00", "17:00"];

router.get("/professionals/:slug/availability", readLimiter, (req, res) => {
  const p = publicProfessional(req.params.slug);
  if (!p) return res.status(404).json({ error: "Perfil no encontrado" });

  const days = Math.min(Number(req.query.days) || 14, 30);
  const now = new Date();
  const out = [];

  for (let i = 0; i < days + 7 && out.length < days; i++) {
    const d = new Date(now);
    d.setDate(d.getDate() + 1 + i); // desde mañana
    const dow = d.getDay();
    if (dow === 0 || dow === 6) continue; // Lu-Vi
    const date = d.toISOString().slice(0, 10);
    const taken = new Set(
      db.prepare(`
        SELECT time FROM appointments
        WHERE professional_id = ? AND date = ? AND status != 'cancelada'
      `).all(p.id, date).map((r) => String(r.time).slice(0, 5)),
    );
    const slots = GRID.filter((t) => !taken.has(t));
    if (slots.length) out.push({ date, slots });
  }
  res.json({ days: out, duration_min: 50 });
});

// ─── POST reserva ────────────────────────────────────────────────────
router.post("/professionals/:slug/booking", bookLimiter, (req, res) => {
  const p = publicProfessional(req.params.slug);
  if (!p) return res.status(404).json({ error: "Perfil no encontrado" });

  const b = req.body ?? {};
  // Honeypot anti-spam: un bot que llena todo cae aquí.
  if (b.website) return res.status(400).json({ error: "Solicitud inválida" });

  const name = String(b.name ?? "").trim();
  const phone = String(b.phone ?? "").trim();
  const email = String(b.email ?? "").trim() || null;
  const motivo = String(b.motivo ?? "").trim().slice(0, 400);
  // Edad: obligatoria. Muchos profesionales atienden por rango (niños,
  // adolescentes, adultos) y necesitan saberlo ANTES de confirmar.
  const age = Number.parseInt(String(b.age ?? ""), 10);
  const date = String(b.date ?? "");
  const time = String(b.time ?? "");
  const modality = b.modality === "tele" ? "tele" : "individual";

  if (name.length < 3) return res.status(400).json({ error: "Nombre requerido" });
  if (phone.replace(/\D/g, "").length < 10) return res.status(400).json({ error: "Teléfono válido requerido" });
  if (!Number.isInteger(age) || age < 1 || age > 120) return res.status(400).json({ error: "Indica tu edad" });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !GRID.includes(time)) {
    return res.status(400).json({ error: "Fecha u hora inválida" });
  }
  const when = new Date(`${date}T${time}:00`);
  if (!(when > new Date())) return res.status(400).json({ error: "El horario ya pasó" });

  // ¿Slot aún libre? (carrera entre dos visitantes)
  const clash = db.prepare(`
    SELECT id FROM appointments
    WHERE professional_id = ? AND date = ? AND time = ? AND status != 'cancelada'
  `).get(p.id, date, time);
  if (clash) return res.status(409).json({ error: "Ese horario acaba de ocuparse. Elige otro." });

  // Paciente: reusar por teléfono dentro del workspace, o crear mínimo.
  const digits = phone.replace(/\D/g, "");
  let patient = db.prepare(`
    SELECT id, name FROM patients
    WHERE workspace_id = ? AND replace(replace(replace(coalesce(phone,''),' ',''),'+',''),'-','') LIKE '%' || ?
    LIMIT 1
  `).get(p.workspace_id, digits.slice(-10));

  // whatsapp_opt_in=1: el visitante entrega su número expresamente para
  // ser contactado por esa vía (le decimos "te confirmará por WhatsApp").
  if (!patient) {
    const pid = `P-${p.workspace_id}W${Date.now().toString(36).toUpperCase()}`;
    db.prepare(`
      INSERT INTO patients (id, workspace_id, professional_id, name, phone, email, age,
                            professional, modality, status, reason, whatsapp_opt_in, whatsapp_opt_in_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'activo', ?, 1, datetime('now'))
    `).run(pid, p.workspace_id, p.id, name, phone, email, age, p.name, modality,
           motivo ? `[reserva-web] ${motivo}` : "[reserva-web] Solicitud desde perfil público");
    patient = { id: pid, name };
  } else {
    // Paciente ya existente por teléfono: completamos la edad si faltaba.
    db.prepare("UPDATE patients SET age = COALESCE(age, ?) WHERE id = ?").run(age, patient.id);
  }

  const info = db.prepare(`
    INSERT INTO appointments (workspace_id, sede_id, professional_id, patient_id, date, time,
                              duration_min, patient_name, professional, modality, room, status, notes)
    VALUES (?, NULL, ?, ?, ?, ?, 50, ?, ?, ?, ?, 'solicitada', ?)
  `).run(p.workspace_id, p.id, patient.id, date, time, patient.name, p.name,
         modality, modality === "tele" ? null : "Por confirmar",
         `[reserva-web]${motivo ? ` ${motivo}` : ""}`);

  // Si es online, el enlace se crea ya; viajará en la confirmación.
  ensureMeetingUrl(db.prepare("SELECT * FROM appointments WHERE id = ?").get(info.lastInsertRowid));
  console.log(`[public-booking] solicitud appt=${info.lastInsertRowid} prof=${p.slug} patient=${patient.id} ${date} ${time}`);

  // Aviso al PROFESIONAL por WhatsApp via Laura (best-effort, async).
  try {
    notifyBookingRequested({
      professional: { name: p.name, phone: p.phone },
      patient: { name: patient.name, phone, age },
      appointment: { id: info.lastInsertRowid, date, time, modality },
      motivo,
    });
  } catch (e) {
    console.warn(`[public-booking] notify fail: ${e?.message}`);
  }
  // Y por correo (profesional + visitante). Best-effort, no bloquea.
  sendBookingRequestEmails({
    professional: { name: p.name, email: p.email },
    patient: { name: patient.name, phone, email, age },
    appointment: { date, time, modality },
    motivo,
  }).catch((e) => console.warn(`[public-booking] mail fail: ${e?.message}`));

  res.status(201).json({
    ok: true,
    appointment_id: info.lastInsertRowid,
    status: "solicitada",
    message: `${p.name.split(" ")[0]} confirmará tu cita por WhatsApp.`,
  });
});

export default router;
