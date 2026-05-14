import { Router } from "express";
import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import multer from "multer";
import { db } from "../db.js";
import { signToken, requireAuth, requirePatient, verifyToken } from "../auth.js";
import { calculateScore } from "../psych_test_definitions.js";
import { applyPatientSignature, buildInterpolationContext } from "./documents.js";
import { sendPatientInviteEmail } from "../mailer.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DOCS_DIR = path.join(__dirname, "..", "..", "uploads", "documents");

const router = Router();

const INVITE_DAYS = 5;
const TOKEN_BYTES = 24;

function safeJSON(s) {
  if (!s) return null;
  try { return JSON.parse(s); } catch { return null; }
}

// ════════════════════════════════════════════════════════════════════════════
// GENERAR INVITACIÓN (staff)
// ════════════════════════════════════════════════════════════════════════════

/**
 * POST /api/patients/:id/invite (montado bajo /api/patients en index.js)
 * Crea o renueva un token de invitación para que el paciente active su cuenta.
 * Devuelve URL absoluta + texto sugerido para WhatsApp.
 */
router.post("/patients/:id/invite", requireAuth, (req, res) => {
  if (req.user.role === "paciente") return res.status(403).json({ error: "Solo staff" });
  const patient = db.prepare("SELECT * FROM patients WHERE id = ? AND workspace_id = ?")
    .get(req.params.id, req.user.workspace_id);
  if (!patient) return res.status(404).json({ error: "Paciente no encontrado" });
  if (!patient.email) return res.status(400).json({ error: "El paciente debe tener email para invitarlo al portal" });

  // Si ya existe usuario para este paciente, no se puede re-invitar — usar reset password.
  const existingUser = db.prepare("SELECT id FROM users WHERE patient_id = ? AND workspace_id = ?")
    .get(patient.id, req.user.workspace_id);
  if (existingUser) {
    return res.status(409).json({
      error: "Este paciente ya tiene cuenta activa. Si olvidó la contraseña, use el flujo de recuperación.",
      already_active: true,
    });
  }

  // Invalidar invitaciones previas no usadas
  db.prepare("DELETE FROM patient_invites WHERE patient_id = ? AND used_at IS NULL").run(patient.id);

  const token = crypto.randomBytes(TOKEN_BYTES).toString("hex");
  const expiresAt = new Date(Date.now() + INVITE_DAYS * 24 * 60 * 60 * 1000).toISOString();

  db.prepare(`
    INSERT INTO patient_invites (workspace_id, patient_id, token, expires_at, created_by_user_id)
    VALUES (?, ?, ?, ?, ?)
  `).run(req.user.workspace_id, patient.id, token, expiresAt, req.user.id);

  // Construir URL absoluta — preferir el header host si está detrás de proxy
  const base = req.headers["x-forwarded-host"]
    ? `${req.headers["x-forwarded-proto"] ?? "https"}://${req.headers["x-forwarded-host"]}`
    : `${req.protocol}://${req.get("host")}`;
  const url = `${base}/p/activar/${token}`;

  // Datos para construir el mensaje WhatsApp
  const ws = db.prepare("SELECT name FROM workspaces WHERE id = ?").get(req.user.workspace_id);
  const prof = req.user.name || "Tu psicóloga";
  const greetingName = patient.preferred_name || patient.name.split(" ")[0];
  const whatsappText = [
    `Hola ${greetingName}, soy ${prof}.`,
    ``,
    `Te invito al portal de ${ws?.name || "Psicomorfosis"} para que puedas:`,
    `• Ver tus próximas citas`,
    `• Acceder a tus tareas terapéuticas`,
    `• Recibir documentos importantes`,
    ``,
    `Crea tu contraseña aquí (válido por ${INVITE_DAYS} días):`,
    url,
    ``,
    `¡Te espero!`,
  ].join("\n");

  // Indicador de qué pasará con el email — el frontend lo usa para mostrarle
  // al psicólogo si tiene que compartir el link manualmente o si ya se envió.
  // 'queued': hay email + SMTP configurado → se enviará en background.
  // 'no_smtp': SMTP no configurado → caer al flujo manual (QR/WhatsApp).
  // (no_email no aplica acá porque exigimos email al inicio del endpoint.)
  const smtpReady = !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
  const emailStatus = smtpReady ? "queued" : "no_smtp";

  // Enviar el email DESPUÉS de responder al frontend — la red al servidor
  // SMTP puede tardar 500ms-2s y el psicólogo no debería esperar por eso.
  // El paciente ya quedó invitado en la DB; el email es notificación.
  if (smtpReady) {
    const profRow = req.user.professional_id
      ? db.prepare("SELECT name, email FROM professionals WHERE id = ?").get(req.user.professional_id)
      : null;
    const professionalForEmail = profRow ?? { name: req.user.name ?? null, email: null };
    setImmediate(() => {
      sendPatientInviteEmail({
        patient,
        professional: professionalForEmail,
        workspaceName: ws?.name ?? null,
        url,
        daysValid: INVITE_DAYS,
        replyTo: professionalForEmail.email || undefined,
      }).catch((e) => console.warn(`[invite] sendPatientInviteEmail rejected: ${e?.message ?? e}`));
    });
  }

  res.status(201).json({
    token,
    url,
    expires_at: expiresAt,
    days_valid: INVITE_DAYS,
    whatsapp_text: whatsappText,
    email_status: emailStatus,
    email_to: patient.email,
  });
});

// ════════════════════════════════════════════════════════════════════════════
// FLUJO PÚBLICO — el paciente activa su cuenta
// ════════════════════════════════════════════════════════════════════════════

/**
 * GET /api/patient-invite/:token
 * Devuelve metadata para mostrar la pantalla de bienvenida del paciente
 * (nombre del paciente, profesional, clínica). Sin auth.
 */
router.get("/patient-invite/:token", (req, res) => {
  const inv = db.prepare("SELECT * FROM patient_invites WHERE token = ?").get(req.params.token);
  if (!inv) return res.status(404).json({ error: "Invitación no encontrada" });
  if (inv.used_at) return res.status(409).json({ error: "Esta invitación ya fue usada", used: true });
  if (new Date(inv.expires_at).getTime() < Date.now()) {
    return res.status(410).json({ error: "Esta invitación expiró. Pide a tu psicóloga una nueva." });
  }

  const patient = db.prepare("SELECT id, name, preferred_name, email FROM patients WHERE id = ?").get(inv.patient_id);
  const ws = db.prepare("SELECT name FROM workspaces WHERE id = ?").get(inv.workspace_id);
  const prof = patient ? db.prepare(`
    SELECT p.name, p.title FROM professionals p
    INNER JOIN patients pt ON pt.professional_id = p.id
    WHERE pt.id = ? LIMIT 1
  `).get(patient.id) : null;
  const settings = Object.fromEntries(
    db.prepare("SELECT key, value FROM settings WHERE workspace_id = ?").all(inv.workspace_id)
      .map((s) => [s.key, s.value])
  );

  res.json({
    valid: true,
    patient: patient ? {
      id: patient.id,
      name: patient.name,
      preferred_name: patient.preferred_name,
      email: patient.email,
    } : null,
    professional: prof ? { name: prof.name, title: prof.title } : null,
    clinic: { name: ws?.name, city: settings.city, address: settings.address },
    expires_at: inv.expires_at,
  });
});

/**
 * POST /api/patient-invite/:token/activate
 * Crea el user del paciente con la contraseña que eligió. Devuelve JWT del paciente.
 */
router.post("/patient-invite/:token/activate", (req, res) => {
  const { password, accepted_legal, legal_version } = req.body ?? {};
  if (!password || typeof password !== "string" || password.length < 8) {
    return res.status(400).json({ error: "La contraseña debe tener al menos 8 caracteres." });
  }
  // Consentimiento informado obligatorio para tratamiento de datos
  // sensibles (Ley 1581/2012 + Decreto 1377/2013). El front bloquea el
  // submit, este check protege contra clientes que llamen el endpoint
  // directo. No se activa la cuenta sin aceptar.
  if (accepted_legal !== true) {
    return res.status(400).json({
      error: "Debes aceptar el aviso de privacidad y los términos para activar tu cuenta.",
    });
  }
  const inv = db.prepare("SELECT * FROM patient_invites WHERE token = ?").get(req.params.token);
  if (!inv) return res.status(404).json({ error: "Invitación no encontrada" });
  if (inv.used_at) return res.status(409).json({ error: "Esta invitación ya fue usada" });
  if (new Date(inv.expires_at).getTime() < Date.now()) {
    return res.status(410).json({ error: "Esta invitación expiró" });
  }
  const patient = db.prepare("SELECT * FROM patients WHERE id = ?").get(inv.patient_id);
  if (!patient || !patient.email) {
    return res.status(400).json({ error: "El paciente no tiene email asociado." });
  }

  // Username = email (único)
  const existing = db.prepare("SELECT id FROM users WHERE username = ?").get(patient.email);
  if (existing) {
    return res.status(409).json({ error: "Ya existe una cuenta con este correo. Usa el flujo de inicio de sesión." });
  }

  const hash = bcrypt.hashSync(password, 10);
  const now = new Date().toISOString();
  // Versión por defecto: si el cliente no la mandó usamos la fecha de
  // hoy (los documentos legales tienen "Última actualización" como
  // identificador, no número de versión semver).
  const acceptedVersion = (typeof legal_version === "string" && legal_version.trim()) || now.slice(0, 10);

  const tx = db.transaction(() => {
    const ins = db.prepare(`
      INSERT INTO users (workspace_id, username, password_hash, name, email, role, patient_id)
      VALUES (?, ?, ?, ?, ?, 'paciente', ?)
    `).run(inv.workspace_id, patient.email, hash, patient.name, patient.email, patient.id);
    db.prepare("UPDATE patient_invites SET used_at = ? WHERE id = ?").run(now, inv.id);
    // Auditoría del consentimiento: si la SIC pregunta, podemos probar
    // qué versión del documento aceptó y cuándo.
    db.prepare(
      "UPDATE patients SET legal_accepted_at = ?, legal_accepted_version = ? WHERE id = ?"
    ).run(now, acceptedVersion, patient.id);
    return ins.lastInsertRowid;
  });
  const userId = tx();

  const token = signToken({
    id: userId,
    workspace_id: inv.workspace_id,
    username: patient.email,
    role: "paciente",
    name: patient.name,
    patient_id: patient.id,
  });

  res.status(201).json({
    token,
    user: {
      id: userId,
      name: patient.name,
      email: patient.email,
      role: "paciente",
      patient_id: patient.id,
      workspace_id: inv.workspace_id,
    },
  });
});

/**
 * POST /api/auth/patient/login (montado bajo /api/auth)
 * Login del paciente. Email + password. Verifica que role='paciente'.
 */
router.post("/auth/patient/login", (req, res) => {
  const { email, password } = req.body ?? {};
  if (!email || !password) return res.status(400).json({ error: "Email y contraseña requeridos" });
  const user = db.prepare("SELECT * FROM users WHERE username = ? AND role = 'paciente'").get(email);
  if (!user) return res.status(401).json({ error: "Credenciales inválidas" });
  if (!bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: "Credenciales inválidas" });
  }
  const token = signToken({
    id: user.id,
    workspace_id: user.workspace_id,
    username: user.username,
    role: "paciente",
    name: user.name,
    patient_id: user.patient_id,
  });
  res.json({
    token,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: "paciente",
      patient_id: user.patient_id,
      workspace_id: user.workspace_id,
    },
  });
});

// ════════════════════════════════════════════════════════════════════════════
// PORTAL DEL PACIENTE — endpoints para el paciente autenticado
// ════════════════════════════════════════════════════════════════════════════

/**
 * GET /api/portal/me — datos completos del paciente + su psicóloga + clínica.
 */
router.get("/portal/me", requirePatient, (req, res) => {
  const p = db.prepare("SELECT * FROM patients WHERE id = ? AND workspace_id = ?")
    .get(req.user.patient_id, req.user.workspace_id);
  if (!p) return res.status(404).json({ error: "Paciente no encontrado" });
  const prof = p.professional_id
    ? db.prepare("SELECT id, name, title, phone, email, signature_url FROM professionals WHERE id = ?").get(p.professional_id)
    : null;
  const ws = db.prepare("SELECT name, mode FROM workspaces WHERE id = ?").get(p.workspace_id);
  const settings = Object.fromEntries(
    db.prepare("SELECT key, value FROM settings WHERE workspace_id = ?").all(p.workspace_id)
      .map((s) => [s.key, s.value])
  );

  res.json({
    patient: {
      id: p.id,
      name: p.name,
      preferredName: p.preferred_name,
      pronouns: p.pronouns,
      doc: p.doc,
      age: p.age,
      phone: p.phone,
      email: p.email,
      address: p.address,
      modality: p.modality,
      photo_url: p.photo_url,
      reason: p.reason,
    },
    professional: prof,
    clinic: {
      name: ws?.name,
      city: settings.city,
      address: settings.address,
      phone: settings.phone,
      consultorio: settings.consultorio_name,
    },
  });
});

/**
 * PATCH /api/portal/me — el paciente edita su perfil (campos limitados).
 * No puede cambiar: nombre legal, doc, modalidad, profesional, status, riesgo.
 */
router.patch("/portal/me", requirePatient, (req, res) => {
  const { phone, email, address, photo_url, preferred_name, pronouns } = req.body ?? {};
  const fields = [];
  const params = [];
  if (phone !== undefined)          { fields.push("phone = ?");          params.push(phone); }
  if (email !== undefined)          { fields.push("email = ?");          params.push(email); }
  if (address !== undefined)        { fields.push("address = ?");        params.push(address); }
  if (photo_url !== undefined)      { fields.push("photo_url = ?");      params.push(photo_url); }
  if (preferred_name !== undefined) { fields.push("preferred_name = ?"); params.push(preferred_name); }
  if (pronouns !== undefined)       { fields.push("pronouns = ?");       params.push(pronouns); }
  if (fields.length === 0) return res.json({ ok: true });
  fields.push("updated_at = CURRENT_TIMESTAMP");
  params.push(req.user.patient_id);
  db.prepare(`UPDATE patients SET ${fields.join(", ")} WHERE id = ?`).run(...params);
  res.json({ ok: true });
});

/**
 * GET /api/portal/appointments — citas del paciente, futuras + pasadas.
 */
router.get("/portal/appointments", requirePatient, (req, res) => {
  const rows = db.prepare(`
    SELECT a.*, pr.name AS professional_name, s.name AS sede_name, s.address AS sede_address
    FROM appointments a
    LEFT JOIN professionals pr ON a.professional_id = pr.id
    LEFT JOIN sedes s ON a.sede_id = s.id
    WHERE a.patient_id = ? AND a.workspace_id = ?
    ORDER BY a.date DESC, a.time DESC
  `).all(req.user.patient_id, req.user.workspace_id);
  res.json(rows);
});

/**
 * GET /api/portal/tasks — tareas del paciente. Une dos fuentes:
 *  - therapy_tasks: prescripciones terapéuticas legacy (módulo psiquiatría).
 *  - tareas (kanban): tareas internas del equipo vinculadas al paciente,
 *    excluyendo las marcadas como `private` (notas personales del psicólogo)
 *    y las archivadas/borradas. Se les pone prefijo `tarea-` en el id para
 *    distinguir el origen al completar.
 */
router.get("/portal/tasks", requirePatient, (req, res) => {
  const therapy = db.prepare(`
    SELECT * FROM therapy_tasks
    WHERE patient_id = ? AND workspace_id = ?
    ORDER BY due_at ASC
  `).all(req.user.patient_id, req.user.workspace_id);

  const kanban = db.prepare(`
    SELECT id, title, description, type, status, priority, due_date, completed_at, created_at,
           template_document_id, submission_document_id, submitted_at
    FROM tareas
    WHERE patient_id = ? AND workspace_id = ?
      AND visibility != 'private'
      AND archived_at IS NULL
      AND deleted_at IS NULL
    ORDER BY due_date ASC, created_at DESC
  `).all(req.user.patient_id, req.user.workspace_id);

  // Helper local: descriptor mínimo de un doc adjunto a una tarea — solo
  // metadatos para que el portal sepa si hay archivo, su nombre legible y
  // si es descargable. El binario va por GET /api/portal/documents/:id/file.
  const docStmt = db.prepare(`
    SELECT id, name, original_name, filename, mime, size_bytes, kind
    FROM documents WHERE id = ?
  `);
  const docDesc = (docId) => (docId ? docStmt.get(docId) ?? null : null);

  // Mapear las kanban al shape que espera el portal.
  const kanbanMapped = kanban.map((t) => ({
    id: `tarea-${t.id}`,
    title: t.title,
    description: t.description,
    type: t.type ?? "interna",
    status: t.status === "DONE" ? "completada" : "asignada",
    adherence: t.status === "DONE" ? 100 : 0,
    due_at: t.due_date ?? null,
    completed_at: t.completed_at ?? null,
    created_at: t.created_at,
    source: "team",
    // Adjuntos del flujo Moodle (null si la tarea no usa archivos).
    template_document: docDesc(t.template_document_id),
    submission_document: docDesc(t.submission_document_id),
    submitted_at: t.submitted_at ?? null,
  }));

  // Anotar las terapéuticas con source para que el front pueda diferenciar.
  const therapyMapped = therapy.map((t) => ({ ...t, source: "therapy" }));

  res.json([...kanbanMapped, ...therapyMapped]);
});

/**
 * POST /api/portal/tasks/:id/complete — marca la tarea como completada.
 * El id puede ser numérico (therapy_tasks) o `tarea-N` (tareas kanban).
 */
router.post("/portal/tasks/:id/complete", requirePatient, (req, res) => {
  const rawId = req.params.id;

  if (typeof rawId === "string" && rawId.startsWith("tarea-")) {
    const tareaId = parseInt(rawId.slice(6), 10);
    if (!Number.isFinite(tareaId)) return res.status(400).json({ error: "ID inválido" });
    const r = db.prepare(`
      UPDATE tareas
      SET status = 'DONE', completed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND patient_id = ? AND workspace_id = ?
        AND visibility != 'private'
    `).run(tareaId, req.user.patient_id, req.user.workspace_id);
    if (r.changes === 0) return res.status(404).json({ error: "Tarea no encontrada" });
    return res.json({ ok: true });
  }

  const r = db.prepare(`
    UPDATE therapy_tasks SET status = 'completada', adherence = 100
    WHERE id = ? AND patient_id = ? AND workspace_id = ?
  `).run(rawId, req.user.patient_id, req.user.workspace_id);
  if (r.changes === 0) return res.status(404).json({ error: "Tarea no encontrada" });
  res.json({ ok: true });
});

// ════════════════════════════════════════════════════════════════════════════
// ENTREGA DE TAREAS — flujo Moodle: paciente sube archivo como respuesta
// ════════════════════════════════════════════════════════════════════════════

// Reutilizamos DOCS_DIR para que el archivo viva junto al resto de docs del
// workspace y se sirva por el mismo endpoint /api/portal/documents/:id/file
// que ya construimos para los compartidos. Mismas restricciones de tipo y
// tamaño que el upload del staff — consistencia entre quien sube qué.
const PORTAL_ALLOWED_EXTS = /\.(pdf|docx?|jpe?g|png|webp|gif|txt)$/i;
const portalUpload = multer({
  storage: multer.diskStorage({
    destination: (req, _file, cb) => {
      const dir = path.join(DOCS_DIR, String(req.user.workspace_id));
      fs.mkdirSync(dir, { recursive: true });
      cb(null, dir);
    },
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      const id = crypto.randomBytes(6).toString("hex");
      cb(null, `${Date.now()}-${id}${ext}`);
    },
  }),
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!PORTAL_ALLOWED_EXTS.test(file.originalname)) {
      return cb(new Error("Tipo de archivo no permitido. Acepta: PDF, DOC, DOCX, JPG, PNG, WEBP, GIF, TXT."));
    }
    cb(null, true);
  },
});

const newDocId = (wsId) => `D-${wsId}-${Date.now().toString(36)}-${crypto.randomBytes(2).toString("hex")}`;

/**
 * POST /api/portal/tasks/:id/submit — el paciente entrega un archivo como
 * respuesta a una tarea con plantilla.
 *
 * Validaciones:
 *  - Solo tareas con prefijo "tarea-" (las terapéuticas no aceptan archivo).
 *  - La tarea debe pertenecer al paciente autenticado y al workspace.
 *  - No debe estar archivada/borrada ni marcada como private.
 *  - Si ya hay una entrega anterior, la archivamos (soft) — el psicólogo
 *    siempre ve la última. Sin esto, perderíamos auditoría si el paciente
 *    re-entrega por error.
 *
 * Comportamiento:
 *  - Crea row en `documents` (kind='file', patient_id, workspace_id,
 *    shared_with_patient=1 porque el paciente lo subió y debe poder verlo).
 *  - Actualiza tareas.submission_document_id + submitted_at, y mueve el
 *    status a 'IN_REVIEW' para que aparezca en la columna correspondiente
 *    del kanban (las que esperan revisión del psicólogo).
 *  - Inserta notification para el workspace ("paciente X entregó tarea Y").
 */
router.post("/portal/tasks/:id/submit", requirePatient, portalUpload.single("file"), (req, res) => {
  const rawId = req.params.id;
  if (typeof rawId !== "string" || !rawId.startsWith("tarea-")) {
    if (req.file) { try { fs.unlinkSync(req.file.path); } catch { /* orphan ok */ } }
    return res.status(400).json({ error: "Solo las tareas con archivo aceptan entrega" });
  }
  const tareaId = parseInt(rawId.slice(6), 10);
  if (!Number.isFinite(tareaId)) {
    if (req.file) { try { fs.unlinkSync(req.file.path); } catch { /* orphan ok */ } }
    return res.status(400).json({ error: "ID de tarea inválido" });
  }
  if (!req.file) return res.status(400).json({ error: "Archivo requerido" });

  const task = db.prepare(`
    SELECT id, title, template_document_id, submission_document_id, status, patient_id, workspace_id
    FROM tareas
    WHERE id = ? AND patient_id = ? AND workspace_id = ?
      AND visibility != 'private'
      AND archived_at IS NULL AND deleted_at IS NULL
  `).get(tareaId, req.user.patient_id, req.user.workspace_id);
  if (!task) {
    try { fs.unlinkSync(req.file.path); } catch { /* orphan ok */ }
    return res.status(404).json({ error: "Tarea no encontrada o no asignada a ti" });
  }

  const patient = db.prepare("SELECT id, name, preferred_name FROM patients WHERE id = ?").get(req.user.patient_id);
  const patientLabel = patient?.preferred_name || patient?.name || "Paciente";
  const now = new Date().toISOString();
  const docId = newDocId(req.user.workspace_id);
  // Nombre legible para que el psicólogo identifique la entrega en /documentos:
  // "<título de la tarea> — entrega de <paciente>".
  const docName = `${task.title} — entrega de ${patientLabel}`;

  const tx = db.transaction(() => {
    // Si ya había entrega, la archivamos en lugar de borrarla (auditoría).
    if (task.submission_document_id) {
      db.prepare("UPDATE documents SET archived_at = ?, updated_at = ? WHERE id = ?")
        .run(now, now, task.submission_document_id);
    }

    // Insertamos el documento que representa la entrega.
    db.prepare(`
      INSERT INTO documents (
        id, workspace_id, name, type, kind,
        patient_id, patient_name,
        filename, original_name, mime, size_bytes, size_kb,
        status, professional, shared_with_patient,
        created_at, updated_at
      ) VALUES (?, ?, ?, 'otro', 'file', ?, ?, ?, ?, ?, ?, ?, 'firmado', ?, 1, ?, ?)
    `).run(
      docId, req.user.workspace_id, docName,
      req.user.patient_id, patient?.name ?? null,
      req.file.filename, req.file.originalname, req.file.mimetype, req.file.size,
      Math.round(req.file.size / 1024),
      patientLabel,
      now, now,
    );

    // Enlazamos la tarea con la nueva entrega y la movemos a IN_REVIEW para
    // que el psicólogo la vea en la columna de "Por revisar" del kanban.
    db.prepare(`
      UPDATE tareas
      SET submission_document_id = ?, submitted_at = ?, status = 'IN_REVIEW', updated_at = ?
      WHERE id = ?
    `).run(docId, now, now, tareaId);

    // Notificación para que el psicólogo se entere sin tener que abrir el
    // tablero. Sigue el mismo patrón que tareas.js usa al asignar tarea.
    db.prepare(`
      INSERT INTO notifications (id, workspace_id, type, title, description, at, read, urgent)
      VALUES (?, ?, 'tarea_entregada', ?, ?, ?, 0, 0)
    `).run(
      `NTK-submit-${tareaId}-${Date.now()}`, req.user.workspace_id,
      "Entrega de tarea recibida",
      `${patientLabel} entregó "${task.title}".`,
      now,
    );
  });
  tx();

  const submission = db.prepare("SELECT * FROM documents WHERE id = ?").get(docId);
  const updatedTask = db.prepare("SELECT * FROM tareas WHERE id = ?").get(tareaId);

  // Emit websocket para que el psicólogo refresque el kanban sin polling.
  req.app.get("io")?.to(`ws-${req.user.workspace_id}`).emit("task:submitted", {
    task_id: tareaId,
    submission_document_id: docId,
    submitted_at: now,
  });

  res.status(201).json({
    ok: true,
    task: {
      id: `tarea-${updatedTask.id}`,
      status: updatedTask.status === "DONE" ? "completada" : "asignada",
      submitted_at: updatedTask.submitted_at,
      submission_document: {
        id: submission.id,
        name: submission.name,
        original_name: submission.original_name,
        filename: submission.filename,
        mime: submission.mime,
        size_bytes: submission.size_bytes,
      },
    },
  });
});

/**
 * GET /api/portal/tests — tests asignados al paciente.
 * Devuelve tanto pendientes como completados (para histórico). Cada uno trae
 * la definición completa del test inline para que la UI pueda renderizar el
 * aplicador sin un fetch extra.
 */
router.get("/portal/tests", requirePatient, (req, res) => {
  const apps = db.prepare(`
    SELECT * FROM test_applications
    WHERE patient_id = ? AND workspace_id = ?
    ORDER BY status = 'pendiente' DESC, COALESCE(completed_at, assigned_at, date) DESC
  `).all(req.user.patient_id, req.user.workspace_id);

  // Anotar cada aplicación con la definición completa de su test
  const testCache = new Map();
  const result = apps.map((a) => {
    let def = testCache.get(a.test_code);
    if (def === undefined) {
      const t = db.prepare("SELECT * FROM psych_tests WHERE code = ?").get(a.test_code);
      def = t ? {
        id: t.id,
        code: t.code,
        name: t.name,
        short_name: t.short_name,
        items: t.items,
        minutes: t.minutes,
        category: t.category,
        description: t.description,
        ...(t.questions_json ? safeJSON(t.questions_json) : {}),
      } : null;
      testCache.set(a.test_code, def);
    }
    return {
      ...a,
      answers_json: a.answers_json ? safeJSON(a.answers_json) : null,
      alerts_json: a.alerts_json ? safeJSON(a.alerts_json) : null,
      definition: def,
    };
  });

  res.json(result);
});

/**
 * PATCH /api/portal/tests/:id/progress — el paciente guarda respuestas
 * parciales para retomar después. Cambia status pendiente → en_curso.
 * NO marca completada — eso es exclusivo del submit.
 */
router.patch("/portal/tests/:id/progress", requirePatient, (req, res) => {
  const app = db.prepare("SELECT * FROM test_applications WHERE id = ? AND patient_id = ? AND workspace_id = ?")
    .get(req.params.id, req.user.patient_id, req.user.workspace_id);
  if (!app) return res.status(404).json({ error: "Test no encontrado" });
  if (app.status === "completado") return res.status(409).json({ error: "Ya completaste este test" });

  const { answers } = req.body ?? {};
  if (!answers || typeof answers !== "object") return res.status(400).json({ error: "answers requerido" });

  const previous = app.answers_json ? safeJSON(app.answers_json) : {};
  const merged = { ...previous, ...answers };
  const answeredCount = Object.keys(merged).filter((k) => merged[k] != null).length;
  const nowIso = new Date().toISOString();

  db.prepare(`
    UPDATE test_applications
    SET answers_json = ?,
        answered_items = ?,
        status = CASE WHEN status = 'pendiente' THEN 'en_curso' ELSE status END,
        started_at = COALESCE(started_at, ?),
        paused_at = ?
    WHERE id = ?
  `).run(JSON.stringify(merged), answeredCount, nowIso, nowIso, req.params.id);

  res.json({ ok: true, answered_items: answeredCount });
});

/**
 * POST /api/portal/tests/:id/submit — el paciente envía sus respuestas.
 * Calcula score, marca completada, genera alerta al psicólogo si aplica.
 */
router.post("/portal/tests/:id/submit", requirePatient, (req, res) => {
  const app = db.prepare("SELECT * FROM test_applications WHERE id = ? AND patient_id = ? AND workspace_id = ?")
    .get(req.params.id, req.user.patient_id, req.user.workspace_id);
  if (!app) return res.status(404).json({ error: "Test no encontrado" });
  if (app.status === "completado") return res.status(409).json({ error: "Ya completaste este test" });

  const test = db.prepare("SELECT * FROM psych_tests WHERE code = ?").get(app.test_code);
  if (!test || !test.questions_json) return res.status(500).json({ error: "Definición del test no disponible" });
  const def = safeJSON(test.questions_json);

  const { answers } = req.body ?? {};
  if (!answers || typeof answers !== "object") return res.status(400).json({ error: "Respuestas requeridas" });

  const missing = def.questions.filter((q) => answers[q.id] == null);
  if (missing.length > 0) {
    return res.status(400).json({ error: `Faltan ${missing.length} respuestas`, missing: missing.map((q) => q.id) });
  }

  const calc = calculateScore(def, answers);
  const completedAt = new Date().toISOString();

  db.prepare(`
    UPDATE test_applications
    SET status = 'completado', score = ?, level = ?, interpretation = ?,
        answers_json = ?, alerts_json = ?,
        completed_at = ?, date = ?, applied_by = 'paciente'
    WHERE id = ?
  `).run(
    calc.score, calc.level, calc.label,
    JSON.stringify(answers),
    Object.keys(calc.alerts).length > 0 ? JSON.stringify(calc.alerts) : null,
    completedAt, completedAt.slice(0, 10),
    req.params.id
  );

  // Si hay alerta crítica → notificar al psicólogo
  if (calc.alerts.critical_response) {
    db.prepare(`
      INSERT INTO notifications (id, workspace_id, type, title, description, at, read, urgent)
      VALUES (?, ?, 'alerta', ?, ?, ?, 0, 1)
    `).run(
      `N-test-${req.params.id}-${Date.now()}`,
      app.workspace_id,
      `Respuesta crítica en ${test.code}`,
      `${app.patient_name} marcó una respuesta clínicamente significativa. Revisar lo antes posible.`,
      completedAt
    );
  }

  // Devolver al paciente solo el resultado básico — sin interpretación detallada
  // (eso es para discutir con su psicóloga).
  res.json({
    ok: true,
    score: calc.score,
    level: calc.level,
    label: calc.label,
    has_critical_response: !!calc.alerts.critical_response,
  });
});

/**
 * GET /api/portal/documents — documentos compartidos con el paciente
 * (todos los documentos donde patient_id es el suyo y status no es eliminado).
 *
 * Anota cada doc con `pending_signature_request_id` si tiene una solicitud
 * de firma abierta para este paciente — eso permite a la UI mostrar el
 * botón "Firmar ahora" sin tener que hacer un fetch extra.
 */
router.get("/portal/documents", requirePatient, (req, res) => {
  // El paciente ve solo lo que el psicólogo decidió compartir, o lo que él
  // mismo firmó (un doc firmado siempre debe poder consultarse aunque después
  // se "des-comparta"). El resto queda privado del lado clínico.
  const rows = db.prepare(`
    SELECT id, name, type, kind, mime, size_kb, status, signed_at, created_at, updated_at, professional
    FROM documents
    WHERE patient_id = ? AND workspace_id = ? AND archived_at IS NULL
      AND (shared_with_patient = 1 OR signed_at IS NOT NULL)
    ORDER BY created_at DESC
  `).all(req.user.patient_id, req.user.workspace_id);

  // Buscamos sign_requests abiertas (no firmadas, no expiradas) por este
  // paciente para anotar cuáles docs son "firmables desde el portal".
  const openRequests = db.prepare(`
    SELECT id, document_id FROM document_sign_requests
    WHERE patient_id = ? AND workspace_id = ? AND signed_at IS NULL AND expires_at > ?
  `).all(req.user.patient_id, req.user.workspace_id, new Date().toISOString());
  const byDocId = new Map(openRequests.map((r) => [r.document_id, r.id]));

  res.json(rows.map((r) => ({
    ...r,
    pending_signature_request_id: byDocId.get(r.id) ?? null,
  })));
});

/**
 * GET /api/portal/documents/:id — vista de un documento compartido con el
 * paciente, en modo READ-ONLY. Sirve para que el paciente lea informes /
 * consentimientos / etc que la psicóloga le compartió, sin permitir editar
 * ni firmar (eso vive en /portal/documents/:id/signing).
 *
 * Sólo devuelve docs con shared_with_patient=1 o ya firmados, del paciente
 * autenticado, no archivados. El status "borrador" no se filtra: la
 * psicóloga ya decidió compartirlo, el status interno (borrador/pendiente
 * firma) es irrelevante para el paciente y la UI no debe mostrarlo.
 */
router.get("/portal/documents/:id", requirePatient, (req, res) => {
  const doc = db.prepare(`
    SELECT * FROM documents
    WHERE id = ? AND patient_id = ? AND workspace_id = ?
      AND archived_at IS NULL
      AND (shared_with_patient = 1 OR signed_at IS NOT NULL)
  `).get(req.params.id, req.user.patient_id, req.user.workspace_id);
  if (!doc) return res.status(404).json({ error: "Documento no encontrado" });

  const ws = db.prepare("SELECT name FROM workspaces WHERE id = ?").get(req.user.workspace_id);
  const settings = Object.fromEntries(
    db.prepare("SELECT key, value FROM settings WHERE workspace_id = ?").all(req.user.workspace_id)
      .map((s) => [s.key, s.value])
  );

  // Si hay sign-request abierta, anotarla para que la UI pueda ofrecer
  // "Firmar" directo desde el viewer en vez de hacer un segundo fetch.
  const sr = db.prepare(`
    SELECT id FROM document_sign_requests
    WHERE document_id = ? AND patient_id = ? AND signed_at IS NULL AND expires_at > ?
    ORDER BY created_at DESC LIMIT 1
  `).get(doc.id, req.user.patient_id, new Date().toISOString());

  // Para variables como {{paciente.nombre}} en el body — mismo contexto
  // que se usa en /signing para mantener la paridad de render.
  const variableContext = buildInterpolationContext(
    req.user.workspace_id,
    doc.patient_id,
    doc.professional,
  );

  res.json({
    document: {
      id: doc.id,
      name: doc.name,
      type: doc.type,
      kind: doc.kind,
      mime: doc.mime,
      filename: doc.filename,
      original_name: doc.original_name,
      size_bytes: doc.size_bytes,
      body_json: safeJSON(doc.body_json),
      body_text: doc.body_text,
      professional: doc.professional,
      signed_at: doc.signed_at,
      created_at: doc.created_at,
      updated_at: doc.updated_at,
    },
    clinic: { name: ws?.name, city: settings.city, address: settings.address },
    pending_signature_request_id: sr?.id ?? null,
    variable_context: variableContext,
  });
});

/**
 * GET /api/portal/documents/:id/file — sirve el archivo físico (PDF, imagen,
 * docx) de un documento compartido con el paciente. Verifica ownership y
 * el flag shared_with_patient antes de transmitir. El staff no usa esta ruta;
 * tiene su propia /api/documents/:id/file detrás de requireAuth.
 *
 * Acepta token via Authorization header o ?t=<token>, ya que los <iframe>/<img>
 * que renderizan PDFs/imágenes no pueden adjuntar headers fácilmente. El
 * middleware del router de portal ya valida la sesión del paciente.
 */
// Variante tolerante de requirePatient que acepta ?t=<token> además del
// header Authorization. Necesaria para <iframe src=...> y <img src=...>
// donde el browser no puede adjuntar headers.
function requirePatientOrToken(req, res, next) {
  const header = req.headers.authorization ?? "";
  const headerToken = header.startsWith("Bearer ") ? header.slice(7) : null;
  const token = headerToken ?? req.query.t ?? null;
  if (!token) return res.status(401).json({ error: "Missing token" });
  const payload = verifyToken(token);
  if (!payload) return res.status(401).json({ error: "Invalid or expired token" });
  if (payload.role !== "paciente" || !payload.patient_id) {
    return res.status(403).json({ error: "Acceso solo para pacientes" });
  }
  req.user = payload;
  next();
}

router.get("/portal/documents/:id/file", requirePatientOrToken, (req, res) => {
  const doc = db.prepare(`
    SELECT id, workspace_id, filename, original_name, mime, kind, archived_at, shared_with_patient, signed_at
    FROM documents
    WHERE id = ? AND patient_id = ? AND workspace_id = ?
  `).get(req.params.id, req.user.patient_id, req.user.workspace_id);
  if (!doc || doc.archived_at) return res.status(404).json({ error: "Documento no encontrado" });
  // Antes exigíamos kind='file', pero los .docx que la psicóloga sube como
  // plantilla de tarea se convierten a kind='editor' (mammoth → TipTap) y
  // dejan el .docx original en disco. El paciente NECESITA descargar ese
  // .docx para llenarlo. Lo único que importa para servir el archivo físico
  // es que tenga `filename` apuntando a algo real en disco.
  if (!doc.filename) return res.status(404).json({ error: "Este documento no tiene archivo descargable" });
  if (!doc.shared_with_patient && !doc.signed_at) return res.status(403).json({ error: "No tienes acceso a este documento" });

  const filePath = path.join(DOCS_DIR, String(doc.workspace_id), doc.filename);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: "Archivo físico no encontrado" });

  // inline para que el navegador renderice PDFs/imágenes; ?download=1 fuerza descarga.
  const downloadName = doc.original_name || doc.filename;
  const disposition = req.query.download
    ? `attachment; filename="${encodeURIComponent(downloadName)}"`
    : `inline; filename="${encodeURIComponent(downloadName)}"`;
  res.setHeader("Content-Disposition", disposition);
  if (doc.mime) res.setHeader("Content-Type", doc.mime);
  fs.createReadStream(filePath).pipe(res);
});

// ════════════════════════════════════════════════════════════════════════════
// FIRMA DEL PACIENTE DESDE EL PORTAL (autenticado por sesión, sin token)
// Reutiliza el helper applyPatientSignature de documents.js para asegurar
// paridad con el flujo de /firmar/$token.
// ════════════════════════════════════════════════════════════════════════════

/**
 * GET /api/portal/me/signature — firma guardada del paciente actual.
 */
router.get("/portal/me/signature", requirePatient, (req, res) => {
  const row = db.prepare("SELECT signature_url FROM users WHERE id = ?").get(req.user.id);
  res.json({ signature_url: row?.signature_url ?? null });
});

/**
 * DELETE /api/portal/me/signature — borrar la firma guardada.
 * El paciente conserva control total sobre sus datos.
 */
router.delete("/portal/me/signature", requirePatient, (req, res) => {
  db.prepare("UPDATE users SET signature_url = NULL WHERE id = ?").run(req.user.id);
  res.json({ ok: true });
});

/**
 * GET /api/portal/documents/:id/signing — info para firmar un documento
 * desde el portal. Solo se devuelve si:
 *   - el documento pertenece al paciente actual
 *   - existe una sign_request abierta (no firmada y no expirada)
 *
 * Devuelve el body del documento + clínica + firma guardada (si la hay)
 * para que la UI pueda renderizar todo en un fetch.
 */
router.get("/portal/documents/:id/signing", requirePatient, (req, res) => {
  const doc = db.prepare(`
    SELECT * FROM documents
    WHERE id = ? AND patient_id = ? AND workspace_id = ? AND archived_at IS NULL
  `).get(req.params.id, req.user.patient_id, req.user.workspace_id);
  if (!doc) return res.status(404).json({ error: "Documento no encontrado" });

  const sr = db.prepare(`
    SELECT * FROM document_sign_requests
    WHERE document_id = ? AND patient_id = ? AND signed_at IS NULL AND expires_at > ?
    ORDER BY created_at DESC LIMIT 1
  `).get(doc.id, req.user.patient_id, new Date().toISOString());
  if (!sr) {
    if (doc.status === "firmado") return res.status(409).json({ error: "Este documento ya fue firmado", signed: true });
    return res.status(404).json({ error: "No hay una solicitud de firma abierta para este documento. Pídele a tu psicóloga que reenvíe el documento." });
  }

  const patient = db.prepare("SELECT name, preferred_name, doc FROM patients WHERE id = ?").get(req.user.patient_id);
  const ws = db.prepare("SELECT name FROM workspaces WHERE id = ?").get(req.user.workspace_id);
  const settings = Object.fromEntries(
    db.prepare("SELECT key, value FROM settings WHERE workspace_id = ?").all(req.user.workspace_id)
      .map((s) => [s.key, s.value])
  );
  const userRow = db.prepare("SELECT signature_url FROM users WHERE id = ?").get(req.user.id);

  // Contexto de variables resuelto: igual que el endpoint del psicólogo
  // /api/documents/:id/variables, pero accesible desde el portal del
  // paciente. Sin esto, el DocumentEditor del portal mostraba placeholders
  // literales {{paciente.nombre}} en lugar de los valores reales.
  const variableContext = buildInterpolationContext(
    req.user.workspace_id,
    doc.patient_id,
    doc.professional,
  );

  res.json({
    valid: true,
    document: {
      id: doc.id,
      name: doc.name,
      type: doc.type,
      kind: doc.kind,
      body_json: safeJSON(doc.body_json),
      body_text: doc.body_text,
      professional: doc.professional,
      created_at: doc.created_at,
    },
    patient,
    clinic: { name: ws?.name, city: settings.city, address: settings.address },
    expires_at: sr.expires_at,
    saved_signature_url: userRow?.signature_url ?? null,
    variable_context: variableContext,
  });
});

/**
 * POST /api/portal/documents/:id/sign — aplica la firma del paciente.
 *
 * Body: {
 *   signature_data_url: "data:image/png;base64,...",
 *   geolocation?: { lat, lng, accuracy? },
 *   save_signature?: boolean   // si true, guarda la firma para próxima vez
 * }
 *
 * Reutiliza applyPatientSignature para mantener paridad con el flujo de
 * token (mismo certificado, mismo audit log, misma notificación).
 */
router.post("/portal/documents/:id/sign", requirePatient, (req, res) => {
  const { signature_data_url, geolocation, save_signature } = req.body ?? {};

  const doc = db.prepare(`
    SELECT * FROM documents
    WHERE id = ? AND patient_id = ? AND workspace_id = ? AND archived_at IS NULL
  `).get(req.params.id, req.user.patient_id, req.user.workspace_id);
  if (!doc) return res.status(404).json({ error: "Documento no encontrado" });

  const sr = db.prepare(`
    SELECT * FROM document_sign_requests
    WHERE document_id = ? AND patient_id = ? AND signed_at IS NULL AND expires_at > ?
    ORDER BY created_at DESC LIMIT 1
  `).get(doc.id, req.user.patient_id, new Date().toISOString());
  if (!sr) return res.status(404).json({ error: "No hay una solicitud de firma abierta para este documento" });

  const ip = req.headers["x-forwarded-for"]?.toString().split(",")[0].trim()
    || req.headers["x-real-ip"]?.toString()
    || req.socket.remoteAddress
    || "";
  const userAgent = req.headers["user-agent"] || "";

  const result = applyPatientSignature({
    signRequest: sr,
    signatureDataUrl: signature_data_url,
    geolocation,
    ip,
    userAgent,
  });
  if (result.error) return res.status(result.status).json({ error: result.error });

  // Persistir la firma si el paciente lo pidió.
  if (save_signature && typeof signature_data_url === "string" && signature_data_url.startsWith("data:image/")) {
    db.prepare("UPDATE users SET signature_url = ? WHERE id = ?").run(signature_data_url, req.user.id);
  }

  res.json(result);
});

export default router;
