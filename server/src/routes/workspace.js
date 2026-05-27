import { Router } from "express";
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

router.patch("/professionals/:id", (req, res) => {
  const existing = db.prepare("SELECT * FROM professionals WHERE id = ? AND workspace_id = ?").get(req.params.id, req.user.workspace_id);
  if (!existing) return res.status(404).json({ error: "Profesional no encontrado" });
  const m = { ...existing, ...req.body };
  db.prepare("UPDATE professionals SET name = ?, title = ?, email = ?, phone = ?, approach = ?, active = ? WHERE id = ?")
    .run(m.name, m.title, m.email, m.phone, m.approach, m.active ? 1 : 0, req.params.id);
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
  res.json({
    sessionsByModality: statsModalityLast30d(ws),
    reasons: statsReasons(ws),
    revenue7d: statsRevenue7d(ws),
    retention: statsRetention(ws, 6),
    sessionsByDow: statsSessionsByDayOfWeek(ws),
    patientsByRisk: statsPatientsByRisk(ws),
    patientsByAge: statsPatientsByAge(ws),
    patientsBySex: statsPatientsBySex(ws),
    testsByMonth: statsTestsByMonth(ws, 6),
    topPatients: statsTopPatientsBySessions(ws),
    revenueByMethod: statsRevenueByMethod(ws),
    revenueByAccount: statsRevenueByAccount(ws),
    operational: statsOperationalKpis(ws),
  });
});

// ─── Helpers de stats avanzadas ───────────────────────────────────────────

/** Cuántas sesiones atendidas hay por día de la semana (últimos 90 días). */
function statsSessionsByDayOfWeek(ws) {
  const rows = db.prepare(`
    SELECT date FROM appointments
    WHERE workspace_id = ? AND status = 'atendida'
      AND date >= date('now', '-90 days')
  `).all(ws);
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

/** Tests psicométricos completados por mes (últimos N meses). */
function statsTestsByMonth(ws, months = 6) {
  const buckets = [];
  const now = new Date();
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const next = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
    buckets.push({
      mes: MONTHS_LABEL[d.getMonth()],
      from: d.toISOString().slice(0, 10),
      to: next.toISOString().slice(0, 10),
      value: 0,
    });
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

/** Top 5 pacientes por número de sesiones atendidas (últimos 90 días). */
function statsTopPatientsBySessions(ws) {
  return db.prepare(`
    SELECT a.patient_id AS id, a.patient_name AS name, COUNT(*) AS sessions
    FROM appointments a
    WHERE a.workspace_id = ? AND a.status = 'atendida'
      AND a.date >= date('now', '-90 days')
      AND a.patient_id IS NOT NULL
    GROUP BY a.patient_id, a.patient_name
    ORDER BY sessions DESC
    LIMIT 5
  `).all(ws);
}

/** Ingresos por método de pago (últimos 30 días). */
function statsRevenueByMethod(ws) {
  return db.prepare(`
    SELECT method, SUM(amount) AS value, COUNT(*) AS count FROM invoices
    WHERE workspace_id = ? AND status = 'pagada'
      AND date >= date('now', '-30 days')
      AND method IS NOT NULL
    GROUP BY method
    ORDER BY value DESC
  `).all(ws);
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
function statsRevenueByAccount(ws) {
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
      AND i.date >= date('now', '-90 days')
    GROUP BY
      CASE
        WHEN i.bank_account_id IS NOT NULL THEN 'acc:' || i.bank_account_id
        WHEN lower(i.method) = 'efectivo'  THEN 'cash'
        ELSE 'none'
      END
    ORDER BY value DESC
  `).all(ws);

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

/** KPIs operativos derivados: tasa de asistencia/cancelación, duración promedio. */
function statsOperationalKpis(ws) {
  const totals = db.prepare(`
    SELECT
      COUNT(*) AS total,
      SUM(CASE WHEN status = 'atendida'   THEN 1 ELSE 0 END) AS atendida,
      SUM(CASE WHEN status = 'cancelada'  THEN 1 ELSE 0 END) AS cancelada,
      SUM(CASE WHEN status = 'no_show'    THEN 1 ELSE 0 END) AS no_show,
      AVG(duration_min) AS avg_duration
    FROM appointments
    WHERE workspace_id = ? AND date >= date('now', '-90 days')
  `).get(ws);
  const total = totals?.total ?? 0;
  return {
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

export default router;
