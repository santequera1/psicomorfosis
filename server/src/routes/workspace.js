import { Router } from "express";
import { notifyStaffWhatsappLinked, toE164Co } from "../lib/psicobot.js";
import express from "express";
import bcrypt from "bcryptjs";
import { db } from "../db.js";
import { requireAuth } from "../auth.js";

const router = Router();
router.use(requireAuth);

// Workspace actual con resumen (sedes + profesionales)
router.get("/", (req, res) => {
  const wsId = req.user.workspace_id;
  const ws = db.prepare("SELECT id, name, mode, specialties, max_patients FROM workspaces WHERE id = ?").get(wsId);
  const sedes = db.prepare("SELECT * FROM sedes WHERE workspace_id = ? ORDER BY name").all(wsId);
  const professionals = db.prepare("SELECT * FROM professionals WHERE workspace_id = ? ORDER BY name").all(wsId);

  // Unir sedes a cada profesional
  const pSedes = db.prepare("SELECT professional_id, sede_id FROM professional_sedes WHERE professional_id IN (SELECT id FROM professionals WHERE workspace_id = ?)").all(wsId);
  const bySedeMap = new Map();
  for (const row of pSedes) {
    if (!bySedeMap.has(row.professional_id)) bySedeMap.set(row.professional_id, []);
    bySedeMap.get(row.professional_id).push(row.sede_id);
  }

  // specialties llega como JSON-string; parseamos defensivamente.
  let specialties = [];
  if (ws?.specialties) {
    try {
      const parsed = JSON.parse(ws.specialties);
      if (Array.isArray(parsed)) specialties = parsed.filter((x) => typeof x === "string");
    } catch { /* leave [] */ }
  }

  res.json({
    id: ws?.id,
    name: ws?.name,
    mode: ws?.mode,
    specialties,
    maxPatients: ws?.max_patients ?? null,
    sedes,
    professionals: professionals.map((p) => ({
      ...p,
      active: !!p.active,
      sedeIds: bySedeMap.get(p.id) ?? [],
    })),
  });
});

// Cambiar modo / nombre / especialidades / capacidad del workspace.
// El staff edita estos campos desde /configuracion. specialties: array de
// strings (1-30 items); max_patients: entero >=0 o null para "sin tope".
router.patch("/", (req, res) => {
  const wsId = req.user.workspace_id;
  const { name, mode, specialties, max_patients } = req.body ?? {};
  if (mode && !["individual", "organization"].includes(mode)) {
    return res.status(400).json({ error: "mode inválido" });
  }
  const sql = [];
  const args = [];
  if (name) { sql.push("name = ?"); args.push(name); }
  if (mode) { sql.push("mode = ?"); args.push(mode); }
  if (Array.isArray(specialties)) {
    const cleaned = specialties
      .filter((x) => typeof x === "string")
      .map((x) => x.trim())
      .filter((x) => x.length > 0)
      .slice(0, 30);
    sql.push("specialties = ?");
    args.push(cleaned.length ? JSON.stringify(cleaned) : null);
  } else if (specialties === null) {
    sql.push("specialties = ?");
    args.push(null);
  }
  if (max_patients === null) {
    sql.push("max_patients = ?");
    args.push(null);
  } else if (Number.isInteger(max_patients) && max_patients >= 0) {
    sql.push("max_patients = ?");
    args.push(max_patients);
  }
  if (sql.length === 0) return res.status(400).json({ error: "Nada que actualizar" });
  db.prepare(`UPDATE workspaces SET ${sql.join(", ")} WHERE id = ?`).run(...args, wsId);
  // Devolvemos los campos básicos refrescados para el cliente.
  const fresh = db.prepare("SELECT id, name, mode, specialties, max_patients FROM workspaces WHERE id = ?").get(wsId);
  let parsedSpecs = [];
  if (fresh?.specialties) {
    try {
      const p = JSON.parse(fresh.specialties);
      if (Array.isArray(p)) parsedSpecs = p;
    } catch { /* */ }
  }
  res.json({
    id: fresh.id, name: fresh.name, mode: fresh.mode,
    specialties: parsedSpecs, maxPatients: fresh.max_patients ?? null,
  });
});

/**
 * DELETE /api/workspace/me/all-data
 *
 * Elimina por completo el workspace del usuario autenticado y todos los
 * datos asociados (pacientes, sesiones, historia clínica, tests, recibos,
 * documentos, tareas, etc.). Operación irreversible — implementa el
 * derecho de supresión del art. 8 lit. e) Ley 1581/2012 (Habeas Data) y
 * la cláusula octava del Acuerdo de Beta.
 *
 * Doble validación:
 *   1. Confirmación literal: el cliente debe enviar `confirmText: "ELIMINAR"`.
 *   2. Reingreso de contraseña actual (compare bcrypt) — evita que un
 *      atacante con sesión activa pero sin password elimine la cuenta.
 *
 * Solo el `super_admin` del workspace puede ejecutarla. Un platform admin
 * nunca puede borrar SU workspace por aquí porque su cuenta no maneja
 * datos clínicos; si quisiera borrarse, debería hacerlo desde /platform.
 *
 * Como todas las tablas hijas tienen `FOREIGN KEY ... ON DELETE CASCADE`
 * desde `workspaces`, basta con `DELETE FROM workspaces` para limpiar
 * todo en una sola transacción atómica.
 */
router.delete("/me/all-data", (req, res) => {
  const userId = req.user.id;
  const wsId = req.user.workspace_id;
  const { confirmText, currentPassword } = req.body ?? {};

  if (req.user.role !== "super_admin") {
    return res.status(403).json({
      error: "Solo el propietario de la cuenta puede eliminar todos los datos.",
    });
  }
  if (req.user.is_platform_admin) {
    return res.status(403).json({
      error: "Las cuentas de administración de plataforma no se eliminan por esta vía.",
    });
  }
  if (confirmText !== "ELIMINAR") {
    return res.status(400).json({
      error: 'Confirmación incorrecta. Debes escribir exactamente "ELIMINAR".',
    });
  }
  if (!currentPassword || typeof currentPassword !== "string") {
    return res.status(400).json({ error: "Debes reingresar tu contraseña." });
  }

  const user = db.prepare("SELECT id, password_hash FROM users WHERE id = ?").get(userId);
  if (!user || !bcrypt.compareSync(currentPassword, user.password_hash)) {
    return res.status(401).json({ error: "Contraseña incorrecta." });
  }

  // Snapshot mínimo para devolver constancia al cliente.
  const wsName = db.prepare("SELECT name FROM workspaces WHERE id = ?").get(wsId)?.name;

  // FK CASCADE limpia todas las tablas hijas en una sola transacción.
  const tx = db.transaction(() => {
    db.prepare("DELETE FROM workspaces WHERE id = ?").run(wsId);
  });
  try {
    tx();
  } catch (err) {
    console.error("[delete-account] error eliminando workspace", wsId, err);
    return res.status(500).json({ error: "No fue posible eliminar la cuenta. Intenta de nuevo." });
  }

  // Constancia auditable; el cliente puede mostrarla / descargarla como PDF.
  const deletedAt = new Date().toISOString();
  console.log(`[delete-account] workspace ${wsId} ("${wsName}") eliminado por user ${userId} a ${deletedAt}`);

  res.json({
    deleted: true,
    workspaceId: wsId,
    workspaceName: wsName,
    deletedAt,
    message: "Tu cuenta y todos tus datos fueron eliminados de la base de datos. Los respaldos que aún contengan información se sobrescribirán en el siguiente ciclo de rotación (máx. 14 días).",
  });
});

// ─── Sedes ────────────────────────────────────────────────────────────────
router.get("/sedes", (req, res) => {
  const rows = db.prepare("SELECT * FROM sedes WHERE workspace_id = ? ORDER BY name").all(req.user.workspace_id);
  res.json(rows.map((r) => ({ ...r, active: !!r.active })));
});

router.post("/sedes", (req, res) => {
  const { name, address, phone } = req.body ?? {};
  if (!name) return res.status(400).json({ error: "Nombre requerido" });
  const r = db.prepare("INSERT INTO sedes (workspace_id, name, address, phone) VALUES (?, ?, ?, ?)")
    .run(req.user.workspace_id, name, address ?? null, phone ?? null);
  res.status(201).json(db.prepare("SELECT * FROM sedes WHERE id = ?").get(r.lastInsertRowid));
});

router.patch("/sedes/:id", (req, res) => {
  const existing = db.prepare("SELECT * FROM sedes WHERE id = ? AND workspace_id = ?").get(req.params.id, req.user.workspace_id);
  if (!existing) return res.status(404).json({ error: "Sede no encontrada" });
  const merged = { ...existing, ...req.body };
  db.prepare("UPDATE sedes SET name = ?, address = ?, phone = ?, active = ? WHERE id = ?")
    .run(merged.name, merged.address, merged.phone, merged.active ? 1 : 0, req.params.id);
  res.json(db.prepare("SELECT * FROM sedes WHERE id = ?").get(req.params.id));
});

router.delete("/sedes/:id", (req, res) => {
  const r = db.prepare("DELETE FROM sedes WHERE id = ? AND workspace_id = ?").run(req.params.id, req.user.workspace_id);
  if (r.changes === 0) return res.status(404).json({ error: "No encontrada" });
  res.status(204).end();
});

// ─── Profesionales ────────────────────────────────────────────────────────
router.get("/professionals", (req, res) => {
  const rows = db.prepare("SELECT * FROM professionals WHERE workspace_id = ? ORDER BY name").all(req.user.workspace_id);
  const sedes = db.prepare("SELECT * FROM professional_sedes WHERE professional_id IN (SELECT id FROM professionals WHERE workspace_id = ?)").all(req.user.workspace_id);
  const map = new Map();
  for (const s of sedes) {
    if (!map.has(s.professional_id)) map.set(s.professional_id, []);
    map.get(s.professional_id).push(s.sede_id);
  }
  res.json(rows.map((p) => ({ ...p, active: !!p.active, sedeIds: map.get(p.id) ?? [] })));
});

router.post("/professionals", (req, res) => {
  const { name, title, email, phone, approach, sedeIds = [] } = req.body ?? {};
  if (!name) return res.status(400).json({ error: "Nombre requerido" });
  const r = db.prepare("INSERT INTO professionals (workspace_id, name, title, email, phone, approach) VALUES (?, ?, ?, ?, ?, ?)")
    .run(req.user.workspace_id, name, title ?? null, email ?? null, phone ?? null, approach ?? null);
  const profId = r.lastInsertRowid;
  const sedeIns = db.prepare("INSERT INTO professional_sedes (professional_id, sede_id) VALUES (?, ?)");
  for (const sId of sedeIds) sedeIns.run(profId, sId);
  res.status(201).json(db.prepare("SELECT * FROM professionals WHERE id = ?").get(profId));
});

/**
 * Slug público: minúsculas, sin tildes, guiones. Lo que va en la URL
 * /perfil/<slug>. Se valida aquí y no solo en el front porque es lo
 * que identifica al profesional de cara al público.
 */
export function normalizeSlug(raw) {
  return String(raw ?? "")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}
const RESERVED_SLUGS = new Set(["admin", "login", "inicio", "api", "p", "perfil", "legal", "platform", "psicomorfosis"]);

router.patch("/professionals/:id", (req, res) => {
  const existing = db.prepare("SELECT * FROM professionals WHERE id = ? AND workspace_id = ?").get(req.params.id, req.user.workspace_id);
  if (!existing) return res.status(404).json({ error: "Profesional no encontrado" });
  const m = { ...existing, ...req.body };
  // Teléfono en E.164 colombiano (+57…): así el bot y los avisos no
  // dependen de cómo lo escribió cada quien (con/sin 57, espacios, guiones).
  if (typeof m.phone === "string" && m.phone.trim()) m.phone = toE164Co(m.phone) ?? m.phone.trim();
  db.prepare("UPDATE professionals SET name = ?, title = ?, email = ?, phone = ?, approach = ?, active = ? WHERE id = ?")
    .run(m.name, m.title, m.email, m.phone, m.approach, m.active ? 1 : 0, req.params.id);

  // WhatsApp nuevo o cambiado → Laura le da la bienvenida y lo suscribe
  // a los avisos. Solo cuando el número queda con valor y es distinto.
  const digitsOf = (v) => String(v ?? "").replace(/\D/g, "");
  if (digitsOf(m.phone) && digitsOf(m.phone) !== digitsOf(existing.phone)) {
    const owner = db.prepare("SELECT id, name, workspace_id FROM users WHERE professional_id = ? AND role <> 'paciente' ORDER BY id LIMIT 1").get(existing.id)
      ?? { id: req.user.id, name: req.user.name, workspace_id: req.user.workspace_id };
    notifyStaffWhatsappLinked({ user: owner, professional: { id: existing.id, name: m.name, phone: m.phone } });
    // El aviso de la campanita ya cumplió su función.
    db.prepare("UPDATE notifications SET read = 1 WHERE workspace_id = ? AND id = ?").run(req.user.workspace_id, `ajuste-whatsapp-${owner.id}`);
  }

  // Perfil público (linktree). Solo se toca si el body trae alguno de
  // estos campos, para que el PATCH de "Perfil profesional" (nombre,
  // título…) no pise lo que la persona configuró en "Perfil público".
  const PUBLIC_FIELDS = ["slug", "public_enabled", "public_bio", "public_location", "public_instagram", "public_areas", "public_links", "public_photo_url", "public_socials", "public_bg"];
  if (PUBLIC_FIELDS.some((k) => k in (req.body ?? {}))) {
    const b = req.body;
    let slug = existing.slug;
    if ("slug" in b) {
      slug = normalizeSlug(b.slug) || null;
      if (slug && slug.length < 3) return res.status(400).json({ error: "El enlace debe tener al menos 3 caracteres" });
      if (slug && RESERVED_SLUGS.has(slug)) return res.status(400).json({ error: "Ese enlace está reservado, elige otro" });
      if (slug) {
        const taken = db.prepare("SELECT id FROM professionals WHERE slug = ? AND id <> ?").get(slug, existing.id);
        if (taken) return res.status(409).json({ error: "Ese enlace ya lo usa otro profesional" });
      }
    }
    const enabled = "public_enabled" in b ? (b.public_enabled ? 1 : 0) : existing.public_enabled;
    if (enabled && !slug) return res.status(400).json({ error: "Define el enlace de tu perfil antes de publicarlo" });

    // Enlaces: lista corta de {label,url}, solo http(s). Nada de javascript:.
    let links = existing.public_links;
    if ("public_links" in b) {
      const arr = Array.isArray(b.public_links) ? b.public_links : [];
      const clean = arr
        .map((l) => ({ label: String(l?.label ?? "").trim().slice(0, 40), url: String(l?.url ?? "").trim().slice(0, 300) }))
        .filter((l) => l.label && /^https?:\/\//i.test(l.url))
        .slice(0, 8);
      links = JSON.stringify(clean);
    }
    // Redes predeterminadas. Instagram y TikTok se guardan como usuario
    // (acepta @usuario o el enlace); el resto como URL completa; WhatsApp
    // como dígitos. Lo que no encaja se descarta en silencio — el
    // formulario ya avisa del formato.
    const handleOf = (v, host) => String(v ?? "").trim()
      .replace(new RegExp(`^https?://(www\\.)?${host}/`, "i"), "")
      .replace(/^@/, "").replace(/[/?#].*$/, "").slice(0, 60);
    const urlOf = (v, host) => {
      let x = String(v ?? "").trim();
      if (!x) return "";
      if (!/^https?:\/\//i.test(x)) x = "https://" + x;
      try {
        const u = new URL(x);
        return u.hostname.replace(/^www\./, "").endsWith(host) ? u.href.slice(0, 300) : "";
      } catch { return ""; }
    };
    let socials = existing.public_socials;
    if ("public_socials" in b && b.public_socials && typeof b.public_socials === "object") {
      const src = b.public_socials;
      const out = {
        instagram: handleOf(src.instagram, "instagram\\.com"),
        tiktok: handleOf(src.tiktok, "tiktok\\.com"),
        facebook: urlOf(src.facebook, "facebook.com") || urlOf(src.facebook, "fb.com"),
        youtube: urlOf(src.youtube, "youtube.com") || urlOf(src.youtube, "youtu.be"),
        linkedin: urlOf(src.linkedin, "linkedin.com"),
        whatsapp: String(src.whatsapp ?? "").replace(/\D/g, "").slice(0, 15),
      };
      for (const k of Object.keys(out)) if (!out[k]) delete out[k];
      socials = JSON.stringify(out);
    }
    // public_instagram se mantiene sincronizado por compatibilidad.
    let instagram = existing.public_instagram;
    if (socials !== existing.public_socials) {
      try { instagram = JSON.parse(socials || "{}").instagram || null; } catch { /* noop */ }
    } else if ("public_instagram" in b) {
      instagram = handleOf(b.public_instagram, "instagram\\.com") || null;
    }
    const BG_KEYS = new Set(["marca", "bruma", "salvia", "arena", "lavanda", "oceano", "terracota", "aurora", "papel"]);
    const bg = "public_bg" in b
      ? (BG_KEYS.has(String(b.public_bg)) ? String(b.public_bg) : null)
      : existing.public_bg;
    const areas = "public_areas" in b
      ? (Array.isArray(b.public_areas) ? b.public_areas : String(b.public_areas ?? "").split(","))
          .map((a) => String(a).trim()).filter(Boolean).slice(0, 12).join(",") || null
      : existing.public_areas;

    db.prepare(`
      UPDATE professionals
      SET slug = ?, public_enabled = ?, public_bio = ?, public_location = ?,
          public_instagram = ?, public_areas = ?, public_links = ?, public_photo_url = ?,
          public_socials = ?, public_bg = ?
      WHERE id = ?
    `).run(
      slug, enabled,
      "public_bio" in b ? (String(b.public_bio ?? "").trim().slice(0, 600) || null) : existing.public_bio,
      "public_location" in b ? (String(b.public_location ?? "").trim().slice(0, 80) || null) : existing.public_location,
      instagram, areas, links,
      "public_photo_url" in b ? (b.public_photo_url || null) : existing.public_photo_url,
      socials, bg,
      existing.id,
    );
  }
  // Actualizar sedes si vino el campo
  if (Array.isArray(req.body?.sedeIds)) {
    db.prepare("DELETE FROM professional_sedes WHERE professional_id = ?").run(req.params.id);
    const ins = db.prepare("INSERT INTO professional_sedes (professional_id, sede_id) VALUES (?, ?)");
    for (const sId of req.body.sedeIds) ins.run(req.params.id, sId);
  }
  res.json(db.prepare("SELECT * FROM professionals WHERE id = ?").get(req.params.id));
});

router.delete("/professionals/:id", (req, res) => {
  const r = db.prepare("DELETE FROM professionals WHERE id = ? AND workspace_id = ?").run(req.params.id, req.user.workspace_id);
  if (r.changes === 0) return res.status(404).json({ error: "No encontrado" });
  res.status(204).end();
});

/**
 * Devuelve la firma del profesional vinculado al usuario actual (vía
 * users.professional_id). Útil para que el editor de documentos sepa si ya
 * hay firma guardada. Devuelve { signature_url, name, tarjeta_profesional }.
 */
router.get("/me/signature", (req, res) => {
  if (!req.user.professional_id) {
    return res.status(404).json({ error: "Tu usuario no está vinculado a un profesional", linked: false });
  }
  const row = db.prepare("SELECT id, name, title, signature_url FROM professionals WHERE id = ? AND workspace_id = ?")
    .get(req.user.professional_id, req.user.workspace_id);
  if (!row) return res.status(404).json({ error: "Profesional no encontrado" });
  res.json({
    professional_id: row.id,
    name: row.name,
    tarjeta_profesional: row.title,
    signature_url: row.signature_url,
  });
});

/**
 * Guarda la firma del profesional como dataURL (base64). Acepta:
 *  - dataUrl: string "data:image/png;base64,..." (canvas o subida)
 *  - typed:   { text: "Firma de Juan", style?: "italic" } → genera SVG simple
 * La firma se almacena en disco bajo uploads/signatures/<professional_id>.png
 * para servir vía /api/uploads/signatures/... sin token (filename estable).
 */
router.put("/me/signature", express.json({ limit: "2mb" }), async (req, res) => {
  if (!req.user.professional_id) {
    return res.status(404).json({ error: "Tu usuario no está vinculado a un profesional" });
  }
  const { dataUrl, clear } = req.body ?? {};
  const fs = await import("node:fs");
  const path = await import("node:path");
  const sigDir = path.join(process.cwd(), "uploads", "signatures");
  fs.mkdirSync(sigDir, { recursive: true });

  if (clear) {
    db.prepare("UPDATE professionals SET signature_url = NULL WHERE id = ?").run(req.user.professional_id);
    return res.json({ ok: true, signature_url: null });
  }

  if (typeof dataUrl !== "string" || !dataUrl.startsWith("data:image/")) {
    return res.status(400).json({ error: "dataUrl inválida (esperado data:image/...;base64,...)" });
  }
  const m = dataUrl.match(/^data:image\/(png|jpeg|webp|svg\+xml);base64,(.+)$/);
  if (!m) return res.status(400).json({ error: "Formato de imagen no soportado" });
  const ext = m[1] === "jpeg" ? "jpg" : m[1] === "svg+xml" ? "svg" : m[1];
  const buf = Buffer.from(m[2], "base64");
  if (buf.length > 1024 * 1024) {
    return res.status(413).json({ error: "Firma demasiado grande (>1MB)" });
  }
  const filename = `${req.user.professional_id}.${ext}`;
  fs.writeFileSync(path.join(sigDir, filename), buf);
  // Borrar otras extensiones del mismo professional_id (por si cambia el formato)
  for (const e of ["png", "jpg", "webp", "svg"]) {
    if (e !== ext) {
      const old = path.join(sigDir, `${req.user.professional_id}.${e}`);
      if (fs.existsSync(old)) fs.unlinkSync(old);
    }
  }
  // Cache-buster para que el navegador refresque tras cambios
  const url = `/api/uploads/signatures/${filename}?v=${Date.now()}`;
  db.prepare("UPDATE professionals SET signature_url = ? WHERE id = ?").run(url, req.user.professional_id);
  res.json({ ok: true, signature_url: url });
});

/**
 * GET /api/workspace/me/photo — devuelve la URL de la foto de perfil
 * del usuario actual (null si no tiene).
 */
router.get("/me/photo", (req, res) => {
  const row = db.prepare("SELECT photo_url FROM users WHERE id = ?").get(req.user.id);
  res.json({ photo_url: row?.photo_url ?? null });
});

/**
 * PUT /api/workspace/me/photo
 * Body: { dataUrl: "data:image/png;base64,..." } | { clear: true }
 *
 * Mismo patrón que /me/signature pero a nivel users (cualquier rol
 * tiene foto, no solo profesionales). Escribe a uploads/avatars/<user_id>.<ext>.
 */
router.put("/me/photo", express.json({ limit: "3mb" }), async (req, res) => {
  const { dataUrl, clear } = req.body ?? {};
  const fs = await import("node:fs");
  const path = await import("node:path");
  const avatarsDir = path.join(process.cwd(), "uploads", "avatars");
  fs.mkdirSync(avatarsDir, { recursive: true });

  if (clear) {
    // Borrar el archivo físico si existe (cualquier extensión).
    for (const e of ["png", "jpg", "webp"]) {
      const p = path.join(avatarsDir, `${req.user.id}.${e}`);
      if (fs.existsSync(p)) fs.unlinkSync(p);
    }
    db.prepare("UPDATE users SET photo_url = NULL WHERE id = ?").run(req.user.id);
    return res.json({ ok: true, photo_url: null });
  }

  if (typeof dataUrl !== "string" || !dataUrl.startsWith("data:image/")) {
    return res.status(400).json({ error: "dataUrl inválida" });
  }
  const m = dataUrl.match(/^data:image\/(png|jpeg|webp);base64,(.+)$/);
  if (!m) return res.status(400).json({ error: "Solo PNG, JPG o WebP" });
  const ext = m[1] === "jpeg" ? "jpg" : m[1];
  const buf = Buffer.from(m[2], "base64");
  if (buf.length > 2 * 1024 * 1024) {
    return res.status(413).json({ error: "Imagen demasiado grande (>2MB)" });
  }
  const filename = `${req.user.id}.${ext}`;
  fs.writeFileSync(path.join(avatarsDir, filename), buf);
  // Limpiar otras extensiones del mismo user_id
  for (const e of ["png", "jpg", "webp"]) {
    if (e !== ext) {
      const old = path.join(avatarsDir, `${req.user.id}.${e}`);
      if (fs.existsSync(old)) fs.unlinkSync(old);
    }
  }
  const url = `/api/uploads/avatars/${filename}?v=${Date.now()}`;
  db.prepare("UPDATE users SET photo_url = ? WHERE id = ?").run(url, req.user.id);
  res.json({ ok: true, photo_url: url });
});

// ─── Preferencias de notificaciones ───────────────────────────────────────
//
// 4 tipos por ahora: appointment_reminder, clinical_risk_alert,
// daily_summary, payment_received. La tabla guarda solo overrides;
// si no hay fila, el default es habilitado.
const NOTIF_TYPES = ["appointment_reminder", "clinical_risk_alert", "daily_summary", "payment_received"];

router.get("/me/notification-prefs", (req, res) => {
  const rows = db.prepare(
    "SELECT type, enabled FROM user_notification_prefs WHERE user_id = ?"
  ).all(req.user.id);
  const map = new Map(rows.map((r) => [r.type, Boolean(r.enabled)]));
  const prefs = NOTIF_TYPES.map((type) => ({
    type,
    // Default true si no hay override en DB.
    enabled: map.has(type) ? map.get(type) : true,
  }));
  res.json({ prefs });
});

router.patch("/me/notification-prefs", express.json(), (req, res) => {
  const { type, enabled } = req.body ?? {};
  if (!NOTIF_TYPES.includes(type)) {
    return res.status(400).json({ error: "Tipo de notificación desconocido" });
  }
  if (typeof enabled !== "boolean") {
    return res.status(400).json({ error: "enabled debe ser boolean" });
  }
  db.prepare(`
    INSERT INTO user_notification_prefs (user_id, type, enabled, updated_at)
    VALUES (?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(user_id, type) DO UPDATE SET enabled = excluded.enabled, updated_at = CURRENT_TIMESTAMP
  `).run(req.user.id, type, enabled ? 1 : 0);
  res.json({ ok: true });
});

/**
 * PUT /api/workspace/receipt-logo
 * Body: { dataUrl: "data:image/png;base64,..." } | { clear: true }
 *
 * Guarda el logo de recibos en uploads/logos/<workspaceId>.<ext> y registra
 * la URL pública en settings('receipt_logo_url'). Aceptamos data URL para
 * tener un único endpoint con auth (sin multipart) y mantener el patrón
 * que ya usamos para firmas.
 */
router.put("/receipt-logo", express.json({ limit: "2mb" }), async (req, res) => {
  const { dataUrl, clear } = req.body ?? {};
  const fs = await import("node:fs");
  const path = await import("node:path");
  const logosDir = path.join(process.cwd(), "uploads", "logos");
  fs.mkdirSync(logosDir, { recursive: true });
  const wsId = req.user.workspace_id;

  // Helper upsert para settings
  const upsertSetting = (key, value) => {
    db.prepare(`
      INSERT INTO settings (workspace_id, key, value) VALUES (?, ?, ?)
      ON CONFLICT(workspace_id, key) DO UPDATE SET value = excluded.value
    `).run(wsId, key, value == null ? "" : String(value));
  };

  if (clear) {
    for (const e of ["png", "jpg", "webp", "svg"]) {
      const old = path.join(logosDir, `${wsId}.${e}`);
      if (fs.existsSync(old)) fs.unlinkSync(old);
    }
    upsertSetting("receipt_logo_url", "");
    return res.json({ ok: true, receipt_logo_url: null });
  }

  if (typeof dataUrl !== "string" || !dataUrl.startsWith("data:image/")) {
    return res.status(400).json({ error: "Esperaba data URL de imagen" });
  }
  const m = dataUrl.match(/^data:image\/(png|jpe?g|webp|svg\+xml);base64,(.+)$/);
  if (!m) return res.status(400).json({ error: "Formato de imagen no soportado" });
  const ext = m[1] === "jpeg" ? "jpg" : m[1] === "svg+xml" ? "svg" : m[1];
  const buf = Buffer.from(m[2], "base64");
  if (buf.length > 1024 * 1024) {
    return res.status(413).json({ error: "Logo demasiado grande (>1MB)" });
  }
  const filename = `${wsId}.${ext}`;
  fs.writeFileSync(path.join(logosDir, filename), buf);
  // Borrar otras extensiones del mismo workspace por si cambió formato
  for (const e of ["png", "jpg", "webp", "svg"]) {
    if (e !== ext) {
      const old = path.join(logosDir, `${wsId}.${e}`);
      if (fs.existsSync(old)) fs.unlinkSync(old);
    }
  }
  const url = `/api/uploads/logos/${filename}?v=${Date.now()}`;
  upsertSetting("receipt_logo_url", url);
  res.json({ ok: true, receipt_logo_url: url });
});

// ─── Helpers de stats compartidos entre /dashboard-stats y /reports-stats ──

const MODALITY_ORDER = ["individual", "pareja", "familiar", "grupal", "tele"];
const MODALITY_LABEL = {
  individual: "Individual", pareja: "Pareja", familiar: "Familiar",
  grupal: "Grupal", tele: "Tele",
};
const DAYS_LABEL = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
const MONTHS_LABEL = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

function statsModalityLast30d(ws) {
  const rows = db.prepare(`
    SELECT modality, COUNT(*) AS value
    FROM appointments
    WHERE workspace_id = ? AND date >= date('now', '-30 days')
    GROUP BY modality
  `).all(ws);
  const map = Object.fromEntries(rows.map((r) => [r.modality, r.value]));
  return MODALITY_ORDER
    .map((m) => ({ modality: MODALITY_LABEL[m], value: map[m] ?? 0 }))
    .filter((m) => m.value > 0);
}

function statsReasons(ws) {
  const rows = db.prepare(`
    SELECT reason FROM patients
    WHERE workspace_id = ? AND archived_at IS NULL AND reason IS NOT NULL AND reason != ''
  `).all(ws);
  const counts = new Map();
  for (const r of rows) {
    const key = r.reason.split(/[·,.\-]/)[0].trim().split(/\s+/).slice(0, 2).join(" ");
    if (!key) continue;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([reason, value]) => ({ reason, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 7);
}

function statsRevenue7d(ws) {
  const today = new Date();
  const startOfWeek = new Date(today);
  const dow = today.getDay();
  startOfWeek.setDate(today.getDate() - (dow === 0 ? 6 : dow - 1));
  startOfWeek.setHours(0, 0, 0, 0);
  const buckets = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(startOfWeek);
    d.setDate(startOfWeek.getDate() + i);
    buckets.push({ day: DAYS_LABEL[d.getDay()], iso: d.toISOString().slice(0, 10), value: 0 });
  }
  const paid = db.prepare(`
    SELECT date, amount FROM invoices
    WHERE workspace_id = ? AND status = 'pagada' AND date >= ? AND date <= ?
  `).all(ws, buckets[0].iso, buckets[6].iso);
  for (const r of paid) {
    const b = buckets.find((x) => x.iso === r.date);
    if (b) b.value += r.amount;
  }
  return buckets.map(({ day, value }) => ({ day, value }));
}

/** Citas por modalidad dentro de un rango [from, to] inclusive. */
function statsModalityRange(ws, from, to) {
  const rows = db.prepare(`
    SELECT modality, COUNT(*) AS value
    FROM appointments
    WHERE workspace_id = ? AND date >= ? AND date <= ?
    GROUP BY modality
  `).all(ws, from, to);
  const map = Object.fromEntries(rows.map((r) => [r.modality, r.value]));
  return MODALITY_ORDER
    .map((m) => ({ modality: MODALITY_LABEL[m], value: map[m] ?? 0 }))
    .filter((m) => m.value > 0);
}

/**
 * Serie de ingresos pagados para un rango: diaria hasta 31 días de span
 * (con etiqueta corta de día), mensual para rangos más largos. Mantiene
 * el shape { day, value } que ya pinta el chart de /reportes.
 */
function statsRevenueSeries(ws, from, to) {
  const start = new Date(`${from}T12:00:00`);
  const end = new Date(`${to}T12:00:00`);
  const spanDays = Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1;
  const paid = db.prepare(`
    SELECT date, amount FROM invoices
    WHERE workspace_id = ? AND status = 'pagada' AND date >= ? AND date <= ?
  `).all(ws, from, to);
  if (spanDays <= 31) {
    const buckets = [];
    for (let i = 0; i < spanDays; i++) {
      const d = new Date(start.getTime() + i * 86_400_000);
      const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      const label = spanDays <= 7
        ? DAYS_LABEL[d.getDay()]
        : `${d.getDate()} ${MONTHS_LABEL[d.getMonth()].toLowerCase()}`;
      buckets.push({ day: label, iso, value: 0 });
    }
    for (const r of paid) {
      const b = buckets.find((x) => x.iso === r.date);
      if (b) b.value += r.amount;
    }
    return buckets.map(({ day, value }) => ({ day, value }));
  }
  const buckets = [];
  const cur = new Date(start.getFullYear(), start.getMonth(), 1);
  while (cur <= end && buckets.length < 24) {
    buckets.push({
      day: `${MONTHS_LABEL[cur.getMonth()]} ${String(cur.getFullYear()).slice(2)}`,
      key: `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, "0")}`,
      value: 0,
    });
    cur.setMonth(cur.getMonth() + 1);
  }
  for (const r of paid) {
    const key = String(r.date).slice(0, 7);
    const b = buckets.find((x) => x.key === key);
    if (b) b.value += r.amount;
  }
  return buckets.map(({ day, value }) => ({ day, value }));
}

/**
 * Retención por mes (últimos N meses, default 6).
 * - nuevos:    pacientes registrados ese mes (created_at del mes)
 * - retenidos: pacientes con ≥1 cita atendida ese mes que NO son nuevos
 *              del mismo mes (heurística: "siguen viniendo")
 * - alta:      pacientes archivados ese mes con status='alta' al archivar
 *              (los que terminaron tratamiento con éxito)
 *
 * No es un audit log perfecto (cambios de status no se loguean), pero da
 * una distribución útil para el psicólogo. Si después agregamos audit log,
 * mejoramos la query sin cambiar el contrato.
 */
function statsRetention(ws, months = 6) {
  const buckets = [];
  const now = new Date();
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const next = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
    buckets.push({
      mes: MONTHS_LABEL[d.getMonth()],
      year: d.getFullYear(),
      from: d.toISOString().slice(0, 10),
      to: next.toISOString().slice(0, 10), // exclusivo
      nuevos: 0,
      retenidos: 0,
      alta: 0,
    });
  }

  // Nuevos por mes
  const newPatients = db.prepare(`
    SELECT id, created_at FROM patients WHERE workspace_id = ? AND created_at IS NOT NULL
  `).all(ws);
  const newIdsByMonth = new Map(); // monthKey -> Set<patientId>
  for (const p of newPatients) {
    const created = new Date(p.created_at);
    if (Number.isNaN(created.getTime())) continue;
    const key = `${created.getFullYear()}-${created.getMonth()}`;
    if (!newIdsByMonth.has(key)) newIdsByMonth.set(key, new Set());
    newIdsByMonth.get(key).add(p.id);
  }
  for (const b of buckets) {
    const d = new Date(b.from);
    const key = `${d.getFullYear()}-${d.getMonth()}`;
    b.nuevos = newIdsByMonth.get(key)?.size ?? 0;
    b._newSet = newIdsByMonth.get(key) ?? new Set();
  }

  // Retenidos por mes: pacientes con citas atendidas ese mes que no son nuevos
  for (const b of buckets) {
    const rows = db.prepare(`
      SELECT DISTINCT patient_id FROM appointments
      WHERE workspace_id = ? AND status = 'atendida' AND date >= ? AND date < ?
        AND patient_id IS NOT NULL
    `).all(ws, b.from, b.to);
    let retenidos = 0;
    for (const r of rows) {
      if (!b._newSet.has(r.patient_id)) retenidos++;
    }
    b.retenidos = retenidos;
  }

  // Alta por mes: pacientes con archived_at en el mes y status='alta'
  for (const b of buckets) {
    const r = db.prepare(`
      SELECT COUNT(*) AS n FROM patients
      WHERE workspace_id = ? AND archived_at >= ? AND archived_at < ?
        AND status = 'alta'
    `).get(ws, b.from, b.to);
    b.alta = r?.n ?? 0;
  }

  return buckets.map(({ mes, nuevos, retenidos, alta }) => ({ mes, nuevos, retenidos, alta }));
}

/**
 * GET /api/workspace/dashboard-stats
 * Datos reales para los charts del Inicio + pendientes operativos
 * (tests por revisar, pacientes sin seguimiento, etc.) que convierten
 * el dashboard en un centro operativo y no solo descriptivo.
 */
router.get("/dashboard-stats", (req, res) => {
  const ws = req.user.workspace_id;
  res.json({
    sessionsByModality: statsModalityLast30d(ws),
    reasons: statsReasons(ws),
    revenue7d: statsRevenue7d(ws),
    pendingItems: statsPendingItems(ws),
    patientsWithoutFollowup: statsPatientsWithoutFollowup(ws, 14),
  });
});

/**
 * Items operativos pendientes que el psicólogo debería atender hoy.
 * Vienen agrupados para que el dashboard muestre badges con counts.
 *  - testsToReview: aplicaciones completadas pero el psicólogo aún
 *    no las abrió desde la lista (heuristic: completadas en últimos
 *    7 días — proxy razonable de "nuevo por revisar").
 *  - testsAssignedPending: tests asignados al paciente que aún no
 *    completa (status=pendiente o en_curso).
 *  - openTasks: tareas internas del kanban con paciente vinculado
 *    en estado TODO o IN_PROGRESS, no archivadas.
 *  - openSignRequests: solicitudes de firma de documento sin firmar
 *    y no expiradas.
 */
function statsPendingItems(ws) {
  const testsToReview = db.prepare(`
    SELECT COUNT(*) AS n FROM test_applications
    WHERE workspace_id = ? AND status = 'completado'
      AND completed_at >= datetime('now', '-7 days')
  `).get(ws)?.n ?? 0;
  const testsAssignedPending = db.prepare(`
    SELECT COUNT(*) AS n FROM test_applications
    WHERE workspace_id = ? AND status IN ('pendiente', 'en_curso')
  `).get(ws)?.n ?? 0;
  const openTasks = db.prepare(`
    SELECT COUNT(*) AS n FROM tareas
    WHERE workspace_id = ? AND status IN ('TODO', 'IN_PROGRESS')
      AND archived_at IS NULL AND deleted_at IS NULL
  `).get(ws)?.n ?? 0;
  const openSignRequests = db.prepare(`
    SELECT COUNT(*) AS n FROM document_sign_requests
    WHERE workspace_id = ? AND signed_at IS NULL AND expires_at > ?
  `).get(ws, new Date().toISOString())?.n ?? 0;
  return { testsToReview, testsAssignedPending, openTasks, openSignRequests };
}

/**
 * Pacientes activos cuya última cita atendida fue hace más de N días
 * (default 14). Caso clínicamente útil: quién se está despegando del
 * tratamiento. No incluye pacientes sin ninguna cita atendida nunca
 * (esos son distintos — son "pacientes nuevos sin sesión todavía").
 */
function statsPatientsWithoutFollowup(ws, days = 14) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  const cutoffIso = cutoff.toISOString().slice(0, 10);
  const rows = db.prepare(`
    SELECT
      p.id, p.name, p.preferred_name, p.risk, p.professional,
      MAX(a.date) AS last_session_date
    FROM patients p
    LEFT JOIN appointments a
      ON a.patient_id = p.id
      AND a.workspace_id = p.workspace_id
      AND a.status = 'atendida'
    WHERE p.workspace_id = ?
      AND p.archived_at IS NULL
      AND p.status = 'activo'
    GROUP BY p.id
    HAVING last_session_date IS NOT NULL AND last_session_date < ?
    ORDER BY last_session_date ASC
    LIMIT 8
  `).all(ws, cutoffIso);
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    preferredName: r.preferred_name,
    risk: r.risk,
    professional: r.professional,
    lastSessionDate: r.last_session_date,
    daysSince: Math.floor((Date.now() - new Date(`${r.last_session_date}T00:00:00`).getTime()) / (1000 * 60 * 60 * 24)),
  }));
}

/**
 * GET /api/workspace/reports-stats
 * Stats avanzadas para la página /reportes.
 *
 * Incluye los datos del dashboard básico + retención + distribuciones
 * demográficas y operativas que los psicólogos suelen pedir:
 * sesiones por día de semana, distribución por riesgo/edad/sexo,
 * tests aplicados por mes, top pacientes por engagement, ingresos por
 * método de pago, y KPIs derivados (tasa de asistencia/cancelación,
 * duración promedio de sesión).
 */
router.get("/reports-stats", (req, res) => {
  const ws = req.user.workspace_id;
  // Rango opcional (?from=YYYY-MM-DD&to=YYYY-MM-DD, inclusive) — pedido
  // 1 sep 2026: "solo me sale info de este mes… un filtro de fecha a
  // fecha". Default: últimos 90 días terminando hoy (Bogotá), que era el
  // comportamiento histórico de la página. Las distribuciones de
  // pacientes (riesgo/edad/sexo/motivos) y la retención son fotos del
  // presente y no se filtran por rango.
  const parseDay = (v) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);
  const hoy = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  let to = parseDay(req.query.to) ?? hoy;
  let from = parseDay(req.query.from);
  if (!from) {
    const d = new Date(`${to}T12:00:00`);
    d.setDate(d.getDate() - 89);
    from = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }
  if (from > to) [from, to] = [to, from];
  res.json({
    range: { from, to },
    sessionsByModality: statsModalityRange(ws, from, to),
    reasons: statsReasons(ws),
    revenue7d: statsRevenueSeries(ws, from, to),
    retention: statsRetention(ws, 6),
    sessionsByDow: statsSessionsByDayOfWeek(ws, from, to),
    patientsByRisk: statsPatientsByRisk(ws),
    patientsByAge: statsPatientsByAge(ws),
    patientsBySex: statsPatientsBySex(ws),
    testsByMonth: statsTestsByMonth(ws, from, to),
    topPatients: statsTopPatientsBySessions(ws, from, to),
    revenueByMethod: statsRevenueByMethod(ws, from, to),
    revenueByAccount: statsRevenueByAccount(ws, from, to),
    operational: statsOperationalKpis(ws, from, to),
  });
});

// ─── Novedades / anuncios in-app ──────────────────────────────────────────
//
// Anuncios globales — todos los staff ven los mismos. announcement_reads
// trackea qué usuario marcó cada uno como leído. El frontend usa esto
// para mostrar un badge en el botón y auto-abrir el modal la primera
// vez. Aún no hay UI admin: los anuncios se crean con SQL directo en
// el VPS (INSERT INTO announcements ...).

/**
 * GET /api/workspace/announcements
 * Devuelve las activas con flag isRead para el user actual y un
 * `unreadCount` resumen para que el frontend pinte el badge sin
 * recorrer toda la lista.
 */
router.get("/announcements", (req, res) => {
  const userId = req.user.id;
  const items = db.prepare(`
    SELECT a.id, a.title, a.body, a.category,
           a.image_url AS imageUrl,
           a.published_at AS publishedAt,
           CASE WHEN r.user_id IS NULL THEN 0 ELSE 1 END AS isRead
    FROM announcements a
    LEFT JOIN announcement_reads r
      ON r.announcement_id = a.id AND r.user_id = ?
    WHERE a.active = 1
    ORDER BY a.published_at DESC
    LIMIT 30
  `).all(userId).map((r) => ({ ...r, isRead: Boolean(r.isRead) }));
  const unreadCount = items.filter((x) => !x.isRead).length;
  res.json({ items, unreadCount });
});

/**
 * POST /api/workspace/announcements/:id/read
 * Idempotente: si el user ya leyó este anuncio, no falla.
 */
router.post("/announcements/:id/read", (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: "id inválido" });
  const exists = db.prepare("SELECT 1 FROM announcements WHERE id = ?").get(id);
  if (!exists) return res.status(404).json({ error: "anuncio no encontrado" });
  db.prepare(`
    INSERT OR IGNORE INTO announcement_reads (user_id, announcement_id)
    VALUES (?, ?)
  `).run(req.user.id, id);
  res.json({ ok: true });
});

// ─── Helpers de stats avanzadas ───────────────────────────────────────────

/** Cuántas sesiones atendidas hay por día de la semana en el rango. */
function statsSessionsByDayOfWeek(ws, from, to) {
  const rows = db.prepare(`
    SELECT date FROM appointments
    WHERE workspace_id = ? AND status = 'atendida'
      AND date >= ? AND date <= ?
  `).all(ws, from, to);
  const counts = [0, 0, 0, 0, 0, 0, 0]; // Dom..Sáb (JS getDay)
  for (const r of rows) {
    const d = new Date(`${r.date}T00:00:00`);
    if (!Number.isNaN(d.getTime())) counts[d.getDay()]++;
  }
  // Devolvemos en orden Lun-Dom para que el chart se lea naturalmente.
  const order = [1, 2, 3, 4, 5, 6, 0];
  return order.map((idx) => ({ day: DAYS_LABEL[idx], value: counts[idx] }));
}

/** Distribución de pacientes activos por nivel de riesgo. */
function statsPatientsByRisk(ws) {
  const rows = db.prepare(`
    SELECT risk, COUNT(*) AS value FROM patients
    WHERE workspace_id = ? AND archived_at IS NULL
    GROUP BY risk
  `).all(ws);
  const LEVELS = ["none", "low", "moderate", "high", "critical"];
  const LABEL = { none: "Sin riesgo", low: "Bajo", moderate: "Moderado", high: "Alto", critical: "Crítico" };
  const map = Object.fromEntries(rows.map((r) => [r.risk ?? "none", r.value]));
  return LEVELS.map((k) => ({ level: LABEL[k], key: k, value: map[k] ?? 0 }));
}

/** Distribución de pacientes activos por rango etario. */
function statsPatientsByAge(ws) {
  const rows = db.prepare(`
    SELECT age FROM patients WHERE workspace_id = ? AND archived_at IS NULL
  `).all(ws);
  const buckets = [
    { range: "<18",   min: 0,  max: 17 },
    { range: "18-25", min: 18, max: 25 },
    { range: "26-35", min: 26, max: 35 },
    { range: "36-50", min: 36, max: 50 },
    { range: "50+",   min: 51, max: 200 },
  ];
  return buckets.map((b) => ({
    range: b.range,
    value: rows.filter((r) => r.age != null && r.age >= b.min && r.age <= b.max).length,
  }));
}

/** Distribución por sexo asignado al nacer (M/F/Sin dato). */
function statsPatientsBySex(ws) {
  const rows = db.prepare(`
    SELECT sex, COUNT(*) AS value FROM patients
    WHERE workspace_id = ? AND archived_at IS NULL
    GROUP BY sex
  `).all(ws);
  const map = Object.fromEntries(rows.map((r) => [r.sex ?? "_unk", r.value]));
  return [
    { sex: "Masculino",  key: "M", value: map["M"] ?? 0 },
    { sex: "Femenino",   key: "F", value: map["F"] ?? 0 },
    { sex: "Sin dato",   key: "_unk", value: map["_unk"] ?? 0 },
  ].filter((s) => s.value > 0);
}

/** Tests psicométricos completados por mes, sobre los meses del rango. */
function statsTestsByMonth(ws, from, to) {
  const start = new Date(`${from}T12:00:00`);
  const end = new Date(`${to}T12:00:00`);
  const buckets = [];
  const cur = new Date(start.getFullYear(), start.getMonth(), 1);
  while (cur <= end && buckets.length < 24) {
    const next = new Date(cur.getFullYear(), cur.getMonth() + 1, 1);
    const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    buckets.push({
      mes: buckets.length === 0 || cur.getMonth() === 0
        ? `${MONTHS_LABEL[cur.getMonth()]} ${String(cur.getFullYear()).slice(2)}`
        : MONTHS_LABEL[cur.getMonth()],
      from: iso(cur),
      to: iso(next),
      value: 0,
    });
    cur.setMonth(cur.getMonth() + 1);
  }
  const rows = db.prepare(`
    SELECT completed_at FROM test_applications
    WHERE workspace_id = ? AND status = 'completado' AND completed_at IS NOT NULL
  `).all(ws);
  for (const r of rows) {
    const d = new Date(r.completed_at);
    if (Number.isNaN(d.getTime())) continue;
    const iso = d.toISOString().slice(0, 10);
    const b = buckets.find((x) => iso >= x.from && iso < x.to);
    if (b) b.value++;
  }
  return buckets.map(({ mes, value }) => ({ mes, value }));
}

/** Top 5 pacientes por número de sesiones atendidas en el rango. */
function statsTopPatientsBySessions(ws, from, to) {
  return db.prepare(`
    SELECT a.patient_id AS id, a.patient_name AS name, COUNT(*) AS sessions
    FROM appointments a
    WHERE a.workspace_id = ? AND a.status = 'atendida'
      AND a.date >= ? AND a.date <= ?
      AND a.patient_id IS NOT NULL
    GROUP BY a.patient_id, a.patient_name
    ORDER BY sessions DESC
    LIMIT 5
  `).all(ws, from, to);
}

/** Ingresos por método de pago en el rango. */
function statsRevenueByMethod(ws, from, to) {
  return db.prepare(`
    SELECT method, SUM(amount) AS value, COUNT(*) AS count FROM invoices
    WHERE workspace_id = ? AND status = 'pagada'
      AND date >= ? AND date <= ?
      AND method IS NOT NULL
    GROUP BY method
    ORDER BY value DESC
  `).all(ws, from, to);
}

/**
 * Desglose de ingresos por cuenta bancaria (90d). Responde a "¿en qué
 * cuenta me pagan más?". Los pagos en efectivo (o sin cuenta vinculada)
 * se agrupan bajo una fila sintética con bankId='efectivo' para que el
 * frontend los muestre con un chip distinto.
 *
 * LEFT JOIN porque un invoice puede tener method='transferencia' pero
 * sin bank_account_id (cuenta borrada, o registrado antes del wallet).
 * Esos caen al grupo "Sin cuenta asignada".
 */
function statsRevenueByAccount(ws, from, to) {
  const rows = db.prepare(`
    SELECT
      i.bank_account_id          AS accountId,
      ba.bank_id                 AS bankId,
      ba.label                   AS label,
      ba.last4                   AS last4,
      ba.account_type            AS accountType,
      ba.brand                   AS brand,
      i.method                   AS method,
      SUM(i.amount)              AS value,
      COUNT(*)                   AS count
    FROM invoices i
    LEFT JOIN bank_accounts ba ON ba.id = i.bank_account_id
    WHERE i.workspace_id = ? AND i.status = 'pagada'
      AND i.date >= ? AND i.date <= ?
    GROUP BY
      CASE
        WHEN i.bank_account_id IS NOT NULL THEN 'acc:' || i.bank_account_id
        WHEN lower(i.method) = 'efectivo'  THEN 'cash'
        ELSE 'none'
      END
    ORDER BY value DESC
  `).all(ws, from, to);

  // Normalizamos a una forma que el frontend pinta directo: cada fila
  // sabe si es una cuenta real (con bankId para el chip), efectivo, o
  // "sin cuenta". El bucket lo decide el backend para no duplicar la
  // lógica del CASE en el cliente.
  return rows.map((r) => {
    if (r.accountId) {
      return {
        bucket: "account",
        accountId: r.accountId,
        bankId: r.bankId,
        label: r.label,
        last4: r.last4,
        accountType: r.accountType,
        brand: r.brand ?? "none",
        value: r.value ?? 0,
        count: r.count ?? 0,
      };
    }
    const isCash = (r.method ?? "").toLowerCase() === "efectivo";
    return {
      bucket: isCash ? "cash" : "none",
      accountId: null,
      bankId: isCash ? "efectivo" : null,
      label: isCash ? "Efectivo" : "Sin cuenta asignada",
      last4: null,
      accountType: null,
      brand: "none",
      value: r.value ?? 0,
      count: r.count ?? 0,
    };
  });
}

/** KPIs operativos derivados del rango: asistencia, cancelación, duración, $ pagado. */
function statsOperationalKpis(ws, from, to) {
  const totals = db.prepare(`
    SELECT
      COUNT(*) AS total,
      SUM(CASE WHEN status = 'atendida'   THEN 1 ELSE 0 END) AS atendida,
      SUM(CASE WHEN status = 'cancelada'  THEN 1 ELSE 0 END) AS cancelada,
      SUM(CASE WHEN status = 'no_show'    THEN 1 ELSE 0 END) AS no_show,
      AVG(duration_min) AS avg_duration
    FROM appointments
    WHERE workspace_id = ? AND date >= ? AND date <= ?
  `).get(ws, from, to);
  const paidSum = db.prepare(`
    SELECT COALESCE(SUM(amount), 0) AS s FROM invoices
    WHERE workspace_id = ? AND status = 'pagada' AND date >= ? AND date <= ?
  `).get(ws, from, to).s;
  const total = totals?.total ?? 0;
  return {
    paid_sum: paidSum,
    total_period: total,
    attendance_rate: total > 0 ? Math.round(((totals?.atendida ?? 0) / total) * 100) : 0,
    cancel_rate:     total > 0 ? Math.round(((totals?.cancelada ?? 0) / total) * 100) : 0,
    no_show_rate:    total > 0 ? Math.round(((totals?.no_show ?? 0) / total) * 100) : 0,
    // Si no hay citas en los últimos 90 días devolvemos null en vez de
    // un default inventado (50 min). El frontend muestra "—" cuando es
    // null para no engañar al usuario con un promedio falso.
    avg_duration_min: total > 0 && totals?.avg_duration
      ? Math.round(totals.avg_duration)
      : null,
    total_last_90d: total,
  };
}

/**
 * GET /api/workspace/perfil-publico/stats — "Tu perfil este mes" para el
 * profesional del usuario: visitas y clics (profile_events) + embudo de
 * citas llegadas por el enlace (marcadas [reserva-web]) + $ cobrado a
 * esos pacientes. Atribución honesta: solo lo que entró por el enlace.
 */
router.get("/perfil-publico/stats", (req, res) => {
  const pros = db.prepare("SELECT id, email, slug, public_enabled FROM professionals WHERE workspace_id = ? AND active = 1 ORDER BY id").all(req.user.workspace_id);
  const mine = pros.find((pr) => pr.email && req.user.email && pr.email.toLowerCase() === String(req.user.email).toLowerCase()) ?? pros[0];
  if (!mine) return res.json(null);
  const month = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota", year: "numeric", month: "2-digit" }).format(new Date());
  const ev = (type) => db.prepare("SELECT COUNT(*) AS n FROM profile_events WHERE professional_id = ? AND type = ? AND day LIKE ?").get(mine.id, type, month + "%").n;
  // Citas del enlace, del mes (por fecha de creación; las anteriores a la
  // columna created_at cuentan por la fecha de la cita).
  const apptCount = (extra) => db.prepare(
    `SELECT COUNT(*) AS n FROM appointments WHERE professional_id = ? AND notes LIKE '[reserva-web]%' AND substr(COALESCE(created_at, date), 1, 7) = ? ${extra}`,
  ).get(mine.id, month).n;
  const cobrado = db.prepare(`
    SELECT COALESCE(SUM(i.amount), 0) AS s
    FROM invoices i JOIN patients p ON p.id = i.patient_id
    WHERE i.workspace_id = ? AND i.status = 'pagada' AND p.reason LIKE '[reserva-web]%'
      AND substr(COALESCE(i.paid_at, i.date), 1, 7) = ?
  `).get(req.user.workspace_id, month).s;
  res.json({
    month,
    enabled: !!(mine.public_enabled && mine.slug),
    slug: mine.slug ?? null,
    visits: ev("visit"),
    clicksAgendar: ev("click_agendar"),
    clicksWhatsapp: ev("click_whatsapp"),
    clicksSocial: ev("click_social") + ev("click_link"),
    solicitudes: apptCount(""),
    confirmadas: apptCount("AND status IN ('confirmada', 'atendida', 'en_curso')"),
    atendidas: apptCount("AND status = 'atendida'"),
    canceladas: apptCount("AND status IN ('cancelada', 'no_show')"),
    cobrado,
    sources: db.prepare("SELECT COALESCE(source, 'directo') AS source, COUNT(*) AS n FROM profile_events WHERE professional_id = ? AND type = 'visit' AND day LIKE ? GROUP BY 1 ORDER BY 2 DESC LIMIT 5").all(mine.id, month + "%"),
  });
});

export default router;
