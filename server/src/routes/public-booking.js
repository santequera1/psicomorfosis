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
import crypto from "node:crypto";
import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import { db } from "../db.js";
import { notifyBookingRequested, toE164Co } from "../lib/psicobot.js";
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
// Slots horarios según el "Horario de atención" que el profesional
// configura en Configuración (settings: work_days CSV en inglés,
// work_start_hour, work_end_hour). Si no lo ha configurado, L-V de 8 a
// 18 — el comportamiento de siempre. Reporte de Nathaly (31 ago 2026):
// habilitó el sábado y el enlace público seguía sin ofrecerlo, porque
// esto era una grilla fija.
const DAY_INDEX = { sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6 };
function scheduleFor(professionalId) {
  const prof = db.prepare("SELECT workspace_id FROM professionals WHERE id = ?").get(professionalId);
  const setts = prof
    ? Object.fromEntries(db.prepare(
        "SELECT key, value FROM settings WHERE workspace_id = ? AND key IN ('work_days', 'work_start_hour', 'work_end_hour')",
      ).all(prof.workspace_id).map((r) => [r.key, r.value]))
    : {};
  const days = new Set(
    String(setts.work_days ?? "monday,tuesday,wednesday,thursday,friday")
      .split(",").map((d) => DAY_INDEX[d.trim().toLowerCase()]).filter((n) => n !== undefined),
  );
  if (days.size === 0) [1, 2, 3, 4, 5].forEach((n) => days.add(n));
  let start = parseInt(String(setts.work_start_hour ?? "8"), 10);
  let end = parseInt(String(setts.work_end_hour ?? "18"), 10);
  if (!Number.isFinite(start) || start < 0 || start > 23) start = 8;
  if (!Number.isFinite(end) || end < start || end > 24) end = Math.min(start + 9, 23);
  // "Hora de fin" = ÚLTIMA hora agendable, INCLUSIVE. Nathaly (31 ago)
  // puso fin 19:00 esperando recibir pacientes a las 7 pm y el enlace
  // solo ofrecía hasta las 6 — así lo lee quien configura, y así lo
  // dice ahora la vista previa de Configuración.
  const slots = [];
  const lastStart = Math.min(end, 23);
  for (let h = start; h <= lastStart; h++) slots.push(String(h).padStart(2, "0") + ":00");
  return { days, slots };
}

/** ¿Ese día/hora cae dentro del horario de atención del profesional? */
export function isBookableSlot(professionalId, date, time) {
  const sched = scheduleFor(professionalId);
  const d = new Date(`${date}T12:00:00`);
  return sched.slots.includes(String(time)) && sched.days.has(d.getDay());
}

/**
 * Huecos libres de un profesional (misma grilla que el perfil público).
 * También la usa el portal del paciente para pedir cambio de hora.
 * `excludeAppointmentId`: la cita que se está moviendo no se cuenta como
 * ocupada (si no, su propio horario nunca aparecería).
 */
export function computeAvailability(professionalId, { days = 14, excludeAppointmentId = null } = {}) {
  const sched = scheduleFor(professionalId);
  // "Hoy" en Bogotá: con toISOString (UTC) el "desde mañana" se corría un
  // día a partir de las 7 pm hora Colombia.
  const hoyBogota = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const base = new Date(`${hoyBogota}T12:00:00`);
  const out = [];
  // Margen amplio: un profesional que solo atiende 1-2 días por semana
  // necesita mirar más lejos para juntar `days` días con huecos.
  for (let i = 1; i <= days * 7 && out.length < days; i++) {
    const d = new Date(base.getTime() + i * 86_400_000); // desde mañana
    if (!sched.days.has(d.getDay())) continue;
    const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const taken = new Set(
      db.prepare(`
        SELECT time FROM appointments
        WHERE professional_id = ? AND date = ? AND status != 'cancelada' AND id != ?
      `).all(professionalId, date, excludeAppointmentId ?? -1).map((r) => String(r.time).slice(0, 5)),
    );
    const slots = sched.slots.filter((t) => !taken.has(t));
    if (slots.length) out.push({ date, slots });
  }
  return { days: out, duration_min: 50 };
}

router.get("/professionals/:slug/availability", readLimiter, (req, res) => {
  const p = publicProfessional(req.params.slug);
  if (!p) return res.status(404).json({ error: "Perfil no encontrado" });
  const days = Math.min(Number(req.query.days) || 14, 30);
  res.json(computeAvailability(p.id, { days }));
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
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(String(time)) || !isBookableSlot(p.id, date, time)) {
    return res.status(400).json({ error: "Ese horario no está disponible. Elige uno del calendario." });
  }
  // Hora de Colombia explícita: sin zona el servidor (UTC) rechazaba como
  // "ya pasó" cualquier reserva de las próximas 5 horas.
  const when = new Date(`${date}T${time}:00-05:00`);
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
      INSERT INTO patients (id, workspace_id, professional_id, name, phone, email, age, doc, pronouns,
                            professional, modality, status, reason, risk, risk_type, whatsapp_opt_in, whatsapp_opt_in_at, whatsapp_opt_in_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, '', '', ?, ?, 'activo', ?, 'none', '[]', 1, datetime('now'), 'paciente')
    `).run(pid, p.workspace_id, p.id, String(name).replace(/\s+/g, " ").trim(), (digits.length === 10 && digits.startsWith("3")) ? `+57${digits}` : (toE164Co(digits) ?? phone), email, age, p.name, modality,
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

  db.prepare("UPDATE appointments SET created_at = datetime('now') WHERE id = ?").run(info.lastInsertRowid);
  // Si es online, el enlace se crea ya; viajará en la confirmación.
  ensureMeetingUrl(db.prepare("SELECT * FROM appointments WHERE id = ?").get(info.lastInsertRowid));
  console.log(`[public-booking] solicitud appt=${info.lastInsertRowid} prof=${p.slug} patient=${patient.id} ${date} ${time}`);

  // Notificación en la app (campana): id "appt-<id>-solicitud" → el Topbar
  // extrae el número y abre /agenda?appt=<id> con el botón "Confirmar cita".
  // Se marca leída cuando la cita deja de estar solicitada (PATCH/DELETE).
  try {
    db.prepare(`
      INSERT OR IGNORE INTO notifications (id, workspace_id, type, title, description, at, read, urgent)
      VALUES (?, ?, 'cita', ?, ?, CURRENT_TIMESTAMP, 0, 1)
    `).run(
      `appt-${info.lastInsertRowid}-solicitud`,
      p.workspace_id,
      `Solicitud de cita: ${patient.name} · ${date} ${time}`,
      `Desde tu perfil público (${modality === "tele" ? "videollamada" : "presencial"})${motivo ? ` · "${String(motivo).slice(0, 80)}"` : ""}. Confírmala o propón otro horario.`,
    );
  } catch (e) {
    console.warn(`[public-booking] notif fail: ${e?.message}`);
  }

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

/**
 * Métrica anónima del perfil público (visitas y clics). Sin cookies ni
 * datos personales: para deduplicar visitas se guarda un hash de
 * conexión+día que no permite identificar a nadie. Nunca falla hacia el
 * visitante: cualquier problema responde ok y se descarta.
 */
const metricLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `pmetric:${ipKeyGenerator(req)}`,
  message: { ok: false },
});
const METRIC_TYPES = new Set(["visit", "click_agendar", "click_whatsapp", "click_social", "click_link"]);
router.post("/profile-metric", metricLimiter, (req, res) => {
  try {
    const { slug, type, source, network } = req.body ?? {};
    if (!METRIC_TYPES.has(String(type))) return res.json({ ok: true });
    const p = publicProfessional(String(slug ?? ""));
    if (!p) return res.json({ ok: true });
    const day = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
    const src = source ? String(source).slice(0, 80) : null;
    const net = network ? String(network).slice(0, 30) : null;
    if (type === "visit") {
      const ua = String(req.headers["user-agent"] ?? "");
      if (/bot|crawler|spider|preview|facebookexternalhit|slurp|whatsapp\//i.test(ua)) return res.json({ ok: true });
      const ip = String(req.headers["x-real-ip"] ?? req.ip ?? "");
      const visitor = crypto.createHash("sha256").update(`${ip}|${ua}|${day}|psm-metric`).digest("hex").slice(0, 24);
      db.prepare("INSERT OR IGNORE INTO profile_events (professional_id, workspace_id, type, source, day, visitor) VALUES (?, ?, 'visit', ?, ?, ?)")
        .run(p.id, p.workspace_id, src, day, visitor);
    } else {
      db.prepare("INSERT INTO profile_events (professional_id, workspace_id, type, source, network, day) VALUES (?, ?, ?, ?, ?, ?)")
        .run(p.id, p.workspace_id, String(type), src, net, day);
    }
  } catch (e) {
    console.warn(`[profile-metric] ${e?.message}`);
  }
  res.json({ ok: true });
});

/**
 * Sitemap para buscadores: páginas públicas + perfiles activos. nginx lo
 * expone como https://psicomorfosis.co/sitemap.xml.
 */
router.get("/sitemap.xml", (req, res) => {
  const base = "https://psicomorfosis.co";
  const today = new Date().toISOString().slice(0, 10);
  const urls = ["/", "/inicio", "/privacidad", "/terminos"].map((u) => ({ loc: base + u, priority: u === "/" ? "1.0" : "0.7" }));
  for (const pr of db.prepare("SELECT slug FROM professionals WHERE public_enabled = 1 AND slug IS NOT NULL AND slug != ''").all()) {
    urls.push({ loc: `${base}/perfil/${pr.slug}`, priority: "0.8" });
  }
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    urls.map((u) => `  <url><loc>${u.loc}</loc><lastmod>${today}</lastmod><priority>${u.priority}</priority></url>`).join("\n") +
    `\n</urlset>\n`;
  res.set("Content-Type", "application/xml; charset=utf-8");
  res.set("Cache-Control", "public, max-age=3600");
  res.send(xml);
});

export default router;
