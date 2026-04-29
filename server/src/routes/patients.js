import { Router } from "express";
import { db } from "../db.js";
import { requireAuth } from "../auth.js";

const router = Router();
router.use(requireAuth);

const VALID_RISK_TYPES = new Set([
  "suicida", "autolesion", "heteroagresion", "abandono_tto", "reagudizacion", "descompensacion",
]);

function safeParseArray(s) {
  try {
    const v = JSON.parse(s);
    return Array.isArray(v) ? v.filter((x) => VALID_RISK_TYPES.has(x)) : [];
  } catch { return []; }
}

function serializeRiskTypes(arr) {
  if (!Array.isArray(arr)) return null;
  const cleaned = arr.filter((x) => VALID_RISK_TYPES.has(x));
  return cleaned.length ? JSON.stringify(cleaned) : null;
}

function rowToPatient(r) {
  if (!r) return null;
  return {
    id: r.id,
    name: r.name,
    preferredName: r.preferred_name ?? undefined,
    pronouns: r.pronouns,
    doc: r.doc,
    age: r.age,
    phone: r.phone,
    email: r.email,
    professional: r.professional,
    professionalId: r.professional_id ?? undefined,
    sedeId: r.sede_id ?? undefined,
    modality: r.modality,
    status: r.status,
    reason: r.reason,
    // lastContact y nextSession se derivan de appointments — vienen del JOIN
    // (campos derived_*) si están disponibles, sino de la columna del paciente
    // como fallback (legacy seed strings).
    lastContact: r.derived_last_contact ?? r.last_contact,
    nextSession: r.derived_next_session ?? r.next_session ?? undefined,
    risk: r.risk,
    riskTypes: r.risk_type ? safeParseArray(r.risk_type) : [],
    tags: r.tags ? r.tags.split(",").map((s) => s.trim()).filter(Boolean) : undefined,
    archivedAt: r.archived_at ?? undefined,
  };
}

/**
 * Formatea un datetime de cita ('YYYY-MM-DD' + 'HH:MM') a una etiqueta humana
 * relativa: "Hoy · 11:30", "Mañana · 09:00", "Lun 27 abr · 15:00", "Hace 2 días", etc.
 * Decide el formato según si la fecha es futura o pasada.
 */
function formatRelativeAppointment(dateStr, timeStr, mode) {
  if (!dateStr) return null;
  const dt = new Date(`${dateStr}T${(timeStr || "00:00").slice(0, 5)}:00`);
  const now = new Date();
  const startOfDay = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
  const today = startOfDay(now);
  const target = startOfDay(dt);
  const diffDays = Math.round((target.getTime() - today.getTime()) / 86400000);
  const time = timeStr ? ` · ${timeStr.slice(0, 5)}` : "";
  if (mode === "future") {
    if (diffDays === 0) return `Hoy${time}`;
    if (diffDays === 1) return `Mañana${time}`;
    if (diffDays > 1 && diffDays <= 6) {
      const day = dt.toLocaleDateString("es-CO", { weekday: "short" });
      return `${day.charAt(0).toUpperCase() + day.slice(1)}${time}`;
    }
    return `${dt.toLocaleDateString("es-CO", { day: "numeric", month: "short" })}${time}`;
  }
  // mode === "past"
  if (diffDays === 0) return "Hoy";
  if (diffDays === -1) return "Ayer";
  if (diffDays >= -6) return `Hace ${-diffDays} días`;
  return dt.toLocaleDateString("es-CO", { day: "numeric", month: "short" });
}

/**
 * Calcula y enriquece cada paciente con `derived_next_session` y
 * `derived_last_contact` derivados de la tabla appointments. Esto asegura que
 * la lista siempre refleje el estado real (citas atendidas pasadas vs futuras
 * confirmadas/pendientes), no strings vencidos del seed.
 */
function enrichWithAppointments(patients, workspaceId) {
  if (patients.length === 0) return patients;
  // Próxima cita (futura, no cancelada/atendida)
  const nextStmt = db.prepare(`
    SELECT date, time FROM appointments
    WHERE workspace_id = ? AND patient_id = ?
      AND (date > date('now', 'localtime')
           OR (date = date('now', 'localtime') AND time >= strftime('%H:%M', 'now', 'localtime')))
      AND status NOT IN ('cancelada', 'atendida')
    ORDER BY date ASC, time ASC
    LIMIT 1
  `);
  // Última cita atendida (pasada)
  const lastStmt = db.prepare(`
    SELECT date, time FROM appointments
    WHERE workspace_id = ? AND patient_id = ?
      AND (date < date('now', 'localtime')
           OR (date = date('now', 'localtime') AND time < strftime('%H:%M', 'now', 'localtime')))
      AND status = 'atendida'
    ORDER BY date DESC, time DESC
    LIMIT 1
  `);
  return patients.map((p) => {
    const next = nextStmt.get(workspaceId, p.id);
    const last = lastStmt.get(workspaceId, p.id);
    return {
      ...p,
      derived_next_session: next ? formatRelativeAppointment(next.date, next.time, "future") : null,
      derived_last_contact: last ? formatRelativeAppointment(last.date, last.time, "past") : null,
    };
  });
}

router.get("/", (req, res) => {
  const { q, status, modality, risk, professional_id, sede_id, include_archived } = req.query;
  let sql = "SELECT * FROM patients WHERE workspace_id = ?";
  const args = [req.user.workspace_id];
  if (!include_archived || include_archived === "false") {
    sql += " AND archived_at IS NULL";
  }
  if (q) { sql += " AND (name LIKE ? OR doc LIKE ? OR reason LIKE ? OR id LIKE ?)"; const like = `%${q}%`; args.push(like, like, like, like); }
  if (status) { sql += " AND status = ?"; args.push(status); }
  if (modality) { sql += " AND modality = ?"; args.push(modality); }
  if (risk) { sql += " AND risk = ?"; args.push(risk); }
  if (professional_id) { sql += " AND professional_id = ?"; args.push(professional_id); }
  if (sede_id) { sql += " AND sede_id = ?"; args.push(sede_id); }
  sql += " ORDER BY name ASC";
  const rows = db.prepare(sql).all(...args);
  res.json(enrichWithAppointments(rows, req.user.workspace_id).map(rowToPatient));
});

// Archivar (soft delete) — recomendado para historias clínicas
router.post("/:id/archive", (req, res) => {
  const now = new Date().toISOString();
  const r = db.prepare("UPDATE patients SET archived_at = ?, updated_at = ? WHERE id = ? AND workspace_id = ?")
    .run(now, now, req.params.id, req.user.workspace_id);
  if (r.changes === 0) return res.status(404).json({ error: "Paciente no encontrado" });
  const row = db.prepare("SELECT * FROM patients WHERE id = ?").get(req.params.id);
  req.app.get("io")?.to(`ws-${req.user.workspace_id}`).emit("patient:archived", rowToPatient(row));
  res.json(rowToPatient(row));
});

// Restaurar paciente archivado
router.post("/:id/restore", (req, res) => {
  const r = db.prepare("UPDATE patients SET archived_at = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND workspace_id = ?")
    .run(req.params.id, req.user.workspace_id);
  if (r.changes === 0) return res.status(404).json({ error: "Paciente no encontrado" });
  res.json(rowToPatient(db.prepare("SELECT * FROM patients WHERE id = ?").get(req.params.id)));
});

router.get("/:id", (req, res) => {
  const row = db.prepare("SELECT * FROM patients WHERE id = ? AND workspace_id = ?").get(req.params.id, req.user.workspace_id);
  if (!row) return res.status(404).json({ error: "Paciente no encontrado" });
  const [enriched] = enrichWithAppointments([row], req.user.workspace_id);
  res.json(rowToPatient(enriched));
});

function nextPatientId(wsId) {
  const row = db.prepare("SELECT id FROM patients WHERE workspace_id = ? ORDER BY id DESC LIMIT 1").get(wsId);
  if (!row) return `P-${wsId}000`;
  const num = parseInt(row.id.replace(/\D/g, ""), 10);
  return `P-${(num + 1).toString().padStart(4, "0")}`;
}

router.post("/", (req, res) => {
  const p = req.body ?? {};
  const id = p.id ?? nextPatientId(req.user.workspace_id);
  db.prepare(`
    INSERT INTO patients (id, workspace_id, sede_id, professional_id, name, preferred_name, pronouns, doc, age, phone, email, professional, modality, status, reason, last_contact, next_session, risk, risk_type, tags)
    VALUES (@id, @workspace_id, @sede_id, @professional_id, @name, @preferred_name, @pronouns, @doc, @age, @phone, @email, @professional, @modality, @status, @reason, @last_contact, @next_session, @risk, @risk_type, @tags)
  `).run({
    id,
    workspace_id: req.user.workspace_id,
    sede_id: p.sedeId ?? null,
    professional_id: p.professionalId ?? null,
    name: p.name ?? "",
    preferred_name: p.preferredName ?? null,
    pronouns: p.pronouns ?? "",
    doc: p.doc ?? "",
    age: p.age ?? 0,
    phone: p.phone ?? "",
    email: p.email ?? "",
    professional: p.professional ?? "",
    modality: p.modality ?? "individual",
    status: p.status ?? "activo",
    reason: p.reason ?? "",
    last_contact: p.lastContact ?? "Hoy",
    next_session: p.nextSession ?? null,
    risk: p.risk ?? "none",
    risk_type: serializeRiskTypes(p.riskTypes),
    tags: Array.isArray(p.tags) ? p.tags.join(",") : null,
  });
  const row = db.prepare("SELECT * FROM patients WHERE id = ?").get(id);
  req.app.get("io")?.to(`ws-${req.user.workspace_id}`).emit("patient:created", rowToPatient(row));
  res.status(201).json(rowToPatient(row));
});

router.patch("/:id", (req, res) => {
  const existing = db.prepare("SELECT * FROM patients WHERE id = ? AND workspace_id = ?").get(req.params.id, req.user.workspace_id);
  if (!existing) return res.status(404).json({ error: "Paciente no encontrado" });
  const p = req.body ?? {};
  const mapped = {
    name: p.name ?? existing.name,
    preferred_name: p.preferredName ?? existing.preferred_name,
    pronouns: p.pronouns ?? existing.pronouns,
    doc: p.doc ?? existing.doc,
    age: p.age ?? existing.age,
    phone: p.phone ?? existing.phone,
    email: p.email ?? existing.email,
    professional: p.professional ?? existing.professional,
    professional_id: p.professionalId ?? existing.professional_id,
    sede_id: p.sedeId ?? existing.sede_id,
    modality: p.modality ?? existing.modality,
    status: p.status ?? existing.status,
    reason: p.reason ?? existing.reason,
    last_contact: p.lastContact ?? existing.last_contact,
    next_session: p.nextSession ?? existing.next_session,
    risk: p.risk ?? existing.risk,
    risk_type: p.riskTypes !== undefined ? serializeRiskTypes(p.riskTypes) : existing.risk_type,
    tags: Array.isArray(p.tags) ? p.tags.join(",") : existing.tags,
  };
  db.prepare(`
    UPDATE patients SET
      name=@name, preferred_name=@preferred_name, pronouns=@pronouns, doc=@doc, age=@age,
      phone=@phone, email=@email, professional=@professional, professional_id=@professional_id,
      sede_id=@sede_id, modality=@modality, status=@status, reason=@reason,
      last_contact=@last_contact, next_session=@next_session, risk=@risk, risk_type=@risk_type, tags=@tags,
      updated_at=CURRENT_TIMESTAMP
    WHERE id=@id
  `).run({ ...mapped, id: req.params.id });
  const row = db.prepare("SELECT * FROM patients WHERE id = ?").get(req.params.id);
  req.app.get("io")?.to(`ws-${req.user.workspace_id}`).emit("patient:updated", rowToPatient(row));
  res.json(rowToPatient(row));
});

router.delete("/:id", (req, res) => {
  const r = db.prepare("DELETE FROM patients WHERE id = ? AND workspace_id = ?").run(req.params.id, req.user.workspace_id);
  if (r.changes === 0) return res.status(404).json({ error: "No encontrado" });
  req.app.get("io")?.to(`ws-${req.user.workspace_id}`).emit("patient:deleted", { id: req.params.id });
  res.status(204).end();
});

export default router;
