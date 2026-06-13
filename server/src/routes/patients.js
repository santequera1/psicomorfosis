import { Router } from "express";
import bcrypt from "bcryptjs";
import crypto from "node:crypto";
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
    address: r.address ?? undefined,
    sex: r.sex ?? undefined,
    archivedAt: r.archived_at ?? undefined,
    insuranceProvider: r.insurance_provider ?? undefined,
    insurancePlan: r.insurance_plan ?? undefined,
    insurancePolicy: r.insurance_policy ?? undefined,
    insuranceValidUntil: r.insurance_valid_until ?? undefined,
    // Estado del portal del paciente. Lo enriquecemos con enrichWithPortalStatus
    // antes de pasarle el row a rowToPatient — viene en r.portal_status / r.portal_*.
    portalStatus: r.portal_status ?? "not_invited",
    portalActivatedAt: r.portal_activated_at ?? null,
    portalLastLoginAt: r.portal_last_login_at ?? null,
    portalInviteExpiresAt: r.portal_invite_expires_at ?? null,
  };
}

/**
 * Enriquece cada paciente con el estado de su cuenta del portal:
 *   - "active":      tiene una row en users con password_hash (ya activó)
 *   - "invited":     tiene una patient_invites abierta (no usada, no expirada)
 *   - "not_invited": no se ha generado invitación o la última expiró
 *
 * Para "active" también devolvemos legal_accepted_at (proxy de activación) y
 * last_login_at (si disponible) para que el psicólogo vea actividad reciente.
 * Para "invited" devolvemos expires_at para saber cuántos días quedan.
 */
function enrichWithPortalStatus(patients, workspaceId) {
  if (patients.length === 0) return patients;
  const userStmt = db.prepare(`
    SELECT patient_id, last_login_at FROM users
    WHERE workspace_id = ? AND role = 'paciente' AND patient_id = ?
      AND password_hash IS NOT NULL AND length(password_hash) > 0
  `);
  const inviteStmt = db.prepare(`
    SELECT expires_at FROM patient_invites
    WHERE workspace_id = ? AND patient_id = ?
      AND used_at IS NULL AND expires_at > ?
    ORDER BY created_at DESC LIMIT 1
  `);
  const nowIso = new Date().toISOString();
  return patients.map((p) => {
    const u = userStmt.get(workspaceId, p.id);
    if (u) {
      return {
        ...p,
        portal_status: "active",
        portal_activated_at: p.legal_accepted_at ?? null,
        portal_last_login_at: u.last_login_at ?? null,
      };
    }
    const inv = inviteStmt.get(workspaceId, p.id, nowIso);
    if (inv) {
      return { ...p, portal_status: "invited", portal_invite_expires_at: inv.expires_at };
    }
    return { ...p, portal_status: "not_invited" };
  });
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
  // Próxima cita (futura, no cancelada/atendida).
  //
  // Las citas se guardan con `date` y `time` en hora local de Colombia
  // (lo que el psicólogo escogió en la agenda). El servidor está en UTC,
  // así que `date('now', 'localtime')` daba la fecha UTC del VPS — eso
  // hacía que las citas del día de hoy hora Colombia se trataran como
  // pasadas a partir de las 19:00 hora Colombia (= 00:00 UTC del día
  // siguiente). Forzamos `-5 hours` para alinear el "hoy" del query a
  // hora Bogotá. Colombia no aplica horario de verano, así que el offset
  // es estable.
  const nextStmt = db.prepare(`
    SELECT date, time FROM appointments
    WHERE workspace_id = ? AND patient_id = ?
      AND (date > date('now', '-5 hours')
           OR (date = date('now', '-5 hours') AND time >= strftime('%H:%M', 'now', '-5 hours')))
      AND status NOT IN ('cancelada', 'atendida')
    ORDER BY date ASC, time ASC
    LIMIT 1
  `);
  // Última cita atendida (pasada).
  const lastApptStmt = db.prepare(`
    SELECT date, time FROM appointments
    WHERE workspace_id = ? AND patient_id = ?
      AND (date < date('now', '-5 hours')
           OR (date = date('now', '-5 hours') AND time < strftime('%H:%M', 'now', '-5 hours')))
      AND status = 'atendida'
    ORDER BY date DESC, time DESC
    LIMIT 1
  `);
  // Última nota clínica — cualquier tipo de nota indica contacto clínico.
  // created_at se guarda en UTC; se ajusta a hora Colombia (-5 h).
  const lastNoteStmt = db.prepare(`
    SELECT date(created_at, '-5 hours') AS date FROM clinical_notes
    WHERE workspace_id = ? AND patient_id = ?
    ORDER BY created_at DESC
    LIMIT 1
  `);
  return patients.map((p) => {
    const next = nextStmt.get(workspaceId, p.id);
    const lastAppt = lastApptStmt.get(workspaceId, p.id);
    const lastNote = lastNoteStmt.get(workspaceId, p.id);

    // Tomar el más reciente entre última cita atendida y última nota.
    let last = null;
    if (lastAppt?.date && lastNote?.date) {
      last = lastAppt.date >= lastNote.date
        ? lastAppt
        : { date: lastNote.date, time: null };
    } else if (lastAppt?.date) {
      last = lastAppt;
    } else if (lastNote?.date) {
      last = { date: lastNote.date, time: null };
    }

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
  const enriched = enrichWithAppointments(rows, req.user.workspace_id);
  const withPortal = enrichWithPortalStatus(enriched, req.user.workspace_id);
  res.json(withPortal.map(rowToPatient));
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
  const [withPortal] = enrichWithPortalStatus([enriched], req.user.workspace_id);
  res.json(rowToPatient(withPortal));
});

function nextPatientId(wsId) {
  // BUG-fix 13 jun 2026: la versión anterior usaba ORDER BY id DESC con
  // string comparison + filtro por workspace y caía con UNIQUE constraint
  // cuando el siguiente número calculado YA existía en OTRO workspace
  // (la PK es global, no por workspace). Caso real: nathaly@ws=1 con
  // pacientes P-1000..P-1010 + paciente P-1011 en ws=2 → cada intento
  // generaba P-1011 y rebotaba.
  //
  // Fix: tomar el MAX numérico GLOBAL (entre todos los workspaces) y
  // sumar 1, con retry-loop por si dos requests concurrentes pegan al
  // mismo número. El prefijo deja de incluir el workspace_id (no
  // aporta — el id solo necesita ser único, no decir de qué consulta es).

  // Buscamos el MAX numérico DENTRO del workspace para mantener el
  // patrón visual "P-1XXX para ws=1, P-2XXX para ws=2…". El CAST hace
  // que el orden sea numérico, no lexicográfico (era el primer bug).
  // SUBSTR(id, 3) quita "P-". GLOB descarta IDs malformados legacy.
  const wsMax = db.prepare(`
    SELECT MAX(CAST(SUBSTR(id, 3) AS INTEGER)) AS m
    FROM patients
    WHERE workspace_id = ? AND id GLOB 'P-[0-9]*'
  `).get(wsId);

  // Si no hay pacientes en este workspace todavía, partimos de wsId*1000.
  let n = wsMax?.m ? wsMax.m + 1 : wsId * 1000;
  let id = `P-${n}`;
  // Retry-loop: si el ID candidato existe en CUALQUIER workspace
  // (PK global), incrementamos hasta encontrar uno libre. Cubre el caso
  // de IDs creados manualmente o por seeds cruzados.
  while (db.prepare("SELECT 1 FROM patients WHERE id = ?").get(id)) {
    id = `P-${++n}`;
  }
  return id;
}

router.post("/", (req, res) => {
  const p = req.body ?? {};
  const id = p.id ?? nextPatientId(req.user.workspace_id);
  db.prepare(`
    INSERT INTO patients (id, workspace_id, sede_id, professional_id, name, preferred_name, pronouns, doc, age, phone, email, professional, modality, status, reason, last_contact, next_session, risk, risk_type, tags, address, sex, insurance_provider, insurance_plan, insurance_policy, insurance_valid_until)
    VALUES (@id, @workspace_id, @sede_id, @professional_id, @name, @preferred_name, @pronouns, @doc, @age, @phone, @email, @professional, @modality, @status, @reason, @last_contact, @next_session, @risk, @risk_type, @tags, @address, @sex, @insurance_provider, @insurance_plan, @insurance_policy, @insurance_valid_until)
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
    address: p.address ? String(p.address).trim() || null : null,
    sex: p.sex === "M" || p.sex === "F" ? p.sex : null,
    insurance_provider: p.insuranceProvider ?? null,
    insurance_plan: p.insurancePlan ?? null,
    insurance_policy: p.insurancePolicy ?? null,
    insurance_valid_until: p.insuranceValidUntil ?? null,
  });
  const row = db.prepare("SELECT * FROM patients WHERE id = ?").get(id);
  req.app.get("io")?.to(`ws-${req.user.workspace_id}`).emit("patient:created", rowToPatient(row));
  res.status(201).json(rowToPatient(row));
});

router.patch("/:id", (req, res) => {
  const existing = db.prepare("SELECT * FROM patients WHERE id = ? AND workspace_id = ?").get(req.params.id, req.user.workspace_id);
  if (!existing) return res.status(404).json({ error: "Paciente no encontrado" });
  const p = req.body ?? {};
  // Para los campos de seguro usamos `?? existing.x` solo cuando el campo NO
  // viene en el body. Si viene como null o "", se respeta (permite limpiar).
  const pickInsurance = (key, col) => Object.prototype.hasOwnProperty.call(p, key) ? (p[key] || null) : existing[col];
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
    address: Object.prototype.hasOwnProperty.call(p, "address")
      ? (p.address ? String(p.address).trim() || null : null)
      : existing.address,
    sex: Object.prototype.hasOwnProperty.call(p, "sex")
      ? (p.sex === "M" || p.sex === "F" ? p.sex : null)
      : existing.sex,
    insurance_provider: pickInsurance("insuranceProvider", "insurance_provider"),
    insurance_plan: pickInsurance("insurancePlan", "insurance_plan"),
    insurance_policy: pickInsurance("insurancePolicy", "insurance_policy"),
    insurance_valid_until: pickInsurance("insuranceValidUntil", "insurance_valid_until"),
  };
  db.prepare(`
    UPDATE patients SET
      name=@name, preferred_name=@preferred_name, pronouns=@pronouns, doc=@doc, age=@age,
      phone=@phone, email=@email, professional=@professional, professional_id=@professional_id,
      sede_id=@sede_id, modality=@modality, status=@status, reason=@reason,
      last_contact=@last_contact, next_session=@next_session, risk=@risk, risk_type=@risk_type, tags=@tags,
      address=@address, sex=@sex,
      insurance_provider=@insurance_provider, insurance_plan=@insurance_plan,
      insurance_policy=@insurance_policy, insurance_valid_until=@insurance_valid_until,
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

// ════════════════════════════════════════════════════════════════════════════
// CONTACTOS DE EMERGENCIA — anidados al paciente
// ════════════════════════════════════════════════════════════════════════════

function rowToEmergencyContact(r) {
  if (!r) return null;
  return {
    id: r.id,
    patientId: r.patient_id,
    name: r.name,
    relation: r.relation ?? "",
    phone: r.phone ?? "",
    priority: r.priority ?? 0,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

/** Verifica que el paciente exista y sea del workspace del usuario. */
function assertPatientInWorkspace(patientId, workspaceId) {
  const p = db.prepare("SELECT id FROM patients WHERE id = ? AND workspace_id = ?").get(patientId, workspaceId);
  return !!p;
}

router.get("/:patientId/emergency-contacts", (req, res) => {
  if (!assertPatientInWorkspace(req.params.patientId, req.user.workspace_id)) {
    return res.status(404).json({ error: "Paciente no encontrado" });
  }
  const rows = db.prepare(
    "SELECT * FROM emergency_contacts WHERE patient_id = ? AND workspace_id = ? ORDER BY priority ASC, id ASC"
  ).all(req.params.patientId, req.user.workspace_id);
  res.json(rows.map(rowToEmergencyContact));
});

router.post("/:patientId/emergency-contacts", (req, res) => {
  if (!assertPatientInWorkspace(req.params.patientId, req.user.workspace_id)) {
    return res.status(404).json({ error: "Paciente no encontrado" });
  }
  const c = req.body ?? {};
  if (!c.name || !String(c.name).trim()) {
    return res.status(400).json({ error: "El nombre es obligatorio" });
  }
  const r = db.prepare(`
    INSERT INTO emergency_contacts (workspace_id, patient_id, name, relation, phone, priority)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    req.user.workspace_id,
    req.params.patientId,
    String(c.name).trim(),
    c.relation ? String(c.relation).trim() : null,
    c.phone ? String(c.phone).trim() : null,
    Number.isFinite(c.priority) ? c.priority : 0,
  );
  const row = db.prepare("SELECT * FROM emergency_contacts WHERE id = ?").get(r.lastInsertRowid);
  res.status(201).json(rowToEmergencyContact(row));
});

// PATCH y DELETE viven en el mismo router pero por id de contacto
// (no anidado al paciente — el id es global). Para mantener seguridad
// validamos que el contacto pertenezca al workspace.
router.patch("/emergency-contacts/:id", (req, res) => {
  const existing = db.prepare(
    "SELECT * FROM emergency_contacts WHERE id = ? AND workspace_id = ?"
  ).get(req.params.id, req.user.workspace_id);
  if (!existing) return res.status(404).json({ error: "Contacto no encontrado" });
  const c = req.body ?? {};
  db.prepare(`
    UPDATE emergency_contacts SET
      name = @name,
      relation = @relation,
      phone = @phone,
      priority = @priority,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = @id
  `).run({
    id: existing.id,
    name: c.name !== undefined ? String(c.name).trim() : existing.name,
    relation: c.relation !== undefined ? (c.relation ? String(c.relation).trim() : null) : existing.relation,
    phone: c.phone !== undefined ? (c.phone ? String(c.phone).trim() : null) : existing.phone,
    priority: Number.isFinite(c.priority) ? c.priority : existing.priority,
  });
  const row = db.prepare("SELECT * FROM emergency_contacts WHERE id = ?").get(existing.id);
  res.json(rowToEmergencyContact(row));
});

router.delete("/emergency-contacts/:id", (req, res) => {
  const r = db.prepare(
    "DELETE FROM emergency_contacts WHERE id = ? AND workspace_id = ?"
  ).run(req.params.id, req.user.workspace_id);
  if (r.changes === 0) return res.status(404).json({ error: "Contacto no encontrado" });
  res.status(204).end();
});

/**
 * POST /api/patients/:id/reset-password
 *
 * Restablece la contraseña del portal del paciente.
 * Permitido para:
 *   - Cualquier staff con acceso al workspace del paciente (uso típico
 *     cuando un paciente llama porque olvidó su contraseña).
 *   - Platform admin desde cualquier workspace.
 *
 * Comportamiento: genera una contraseña temporal segura (12 chars
 * alfanuméricos, sin caracteres confusos como 0/O/l/I), actualiza el
 * hash, y la devuelve UNA SOLA VEZ al staff que lo pidió para que
 * pueda compartirla con el paciente (WhatsApp/SMS/in person).
 *
 * NO se envía email automático para evitar dependencia de SMTP y para
 * que el psicólogo controle el canal por donde se comparte.
 *
 * El paciente puede cambiarla después desde /p/perfil.
 */
router.post("/:id/reset-password", (req, res) => {
  if (req.user.role === "paciente") {
    return res.status(403).json({ error: "Solo staff puede restablecer contraseñas" });
  }
  // Buscar paciente — platform admin puede actuar sobre cualquier workspace.
  const patient = req.user.is_platform_admin
    ? db.prepare("SELECT * FROM patients WHERE id = ?").get(req.params.id)
    : db.prepare("SELECT * FROM patients WHERE id = ? AND workspace_id = ?").get(req.params.id, req.user.workspace_id);
  if (!patient) return res.status(404).json({ error: "Paciente no encontrado" });

  const user = db.prepare(
    "SELECT id, username FROM users WHERE patient_id = ? AND workspace_id = ? AND role = 'paciente'"
  ).get(patient.id, patient.workspace_id);
  if (!user) {
    return res.status(400).json({
      error: "Este paciente no tiene cuenta activa en el portal. Usa el flujo de invitación.",
    });
  }

  // Generador de contraseña temporal: 12 chars del alfabeto
  // alfanumérico SIN caracteres confusos (0/O, 1/l/I). Evita errores
  // al dictarla por WhatsApp/llamada.
  const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  const tempPassword = Array.from(crypto.randomBytes(12))
    .map((b) => ALPHABET[b % ALPHABET.length])
    .join("");

  db.prepare("UPDATE users SET password_hash = ? WHERE id = ?")
    .run(bcrypt.hashSync(tempPassword, 10), user.id);

  res.json({
    ok: true,
    username: user.username,
    new_password: tempPassword,
    message: "Contraseña temporal generada. Compártela con el paciente; podrá cambiarla después.",
  });
});

export default router;
