import { Router } from "express";
import { db } from "../db.js";
import { requireAuth } from "../auth.js";

const router = Router();
router.use(requireAuth);

const VALID_KINDS = new Set([
  "motivo", "antecedentes", "examen_mental", "cie11", "plan",
  "sesion", "evolucion", "privada",
]);

/**
 * Los bloques de historia clínica (motivo/antecedentes/examen_mental/cie11/plan) son "singleton":
 * siempre debe existir solo una versión "vigente" (la más reciente no-superseded).
 * Las notas tipo sesion/evolucion/privada son "stream": se agregan múltiples al historial.
 */
const BLOCK_KINDS = new Set(["motivo", "antecedentes", "examen_mental", "cie11", "plan"]);

// Sistemas de clasificación diagnóstica aceptados para el bloque
// 'cie11' (renombrado a "Diagnóstico" en el front). NULL = legacy.
// Para otros bloques (motivo, antecedentes, etc.) este campo es ignorado.
const VALID_DIAGNOSTIC_SYSTEMS = new Set(["CIE-11", "DSM-5-TR", "Otro"]);

function toNote(row) {
  if (!row) return null;
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    patientId: row.patient_id,
    authorId: row.author_id,
    authorName: row.author_name,
    kind: row.kind,
    content: row.content,
    diagnosticSystem: row.diagnostic_system ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    signedAt: row.signed_at,
    supersededById: row.superseded_by_id,
    isDraft: !row.signed_at,
    isSuperseded: !!row.superseded_by_id,
  };
}

// Lista notas de un paciente — excluye superseded por defecto.
// GET /api/patients/:patientId/notes?kind=motivo&include_superseded=true
router.get("/patients/:patientId/notes", (req, res) => {
  const { kind, include_superseded, include_archived } = req.query;
  let sql = "SELECT * FROM clinical_notes WHERE workspace_id = ? AND patient_id = ?";
  const args = [req.user.workspace_id, req.params.patientId];
  if (!include_superseded || include_superseded === "false") {
    sql += " AND superseded_by_id IS NULL";
  }
  if (!include_archived || include_archived === "false") {
    sql += " AND archived_at IS NULL";
  }
  if (kind) {
    if (!VALID_KINDS.has(kind)) return res.status(400).json({ error: "kind inválido" });
    sql += " AND kind = ?";
    args.push(kind);
  }
  sql += " ORDER BY created_at DESC";
  res.json(db.prepare(sql).all(...args).map(toNote));
});

// Crear nota (borrador)
router.post("/patients/:patientId/notes", (req, res) => {
  const { kind, content, diagnosticSystem } = req.body ?? {};
  if (!VALID_KINDS.has(kind)) return res.status(400).json({ error: "kind inválido" });
  if (!content && content !== "") return res.status(400).json({ error: "content requerido" });

  // diagnosticSystem solo aplica al bloque 'cie11' (= "Diagnóstico").
  // En otros bloques se ignora silenciosamente. Valor inválido → 400.
  let diagSystem = null;
  if (kind === "cie11" && diagnosticSystem != null && diagnosticSystem !== "") {
    if (!VALID_DIAGNOSTIC_SYSTEMS.has(diagnosticSystem)) {
      return res.status(400).json({ error: "diagnosticSystem inválido" });
    }
    diagSystem = diagnosticSystem;
  }

  // Validar que el paciente pertenezca al workspace
  const p = db.prepare("SELECT id FROM patients WHERE id = ? AND workspace_id = ?")
    .get(req.params.patientId, req.user.workspace_id);
  if (!p) return res.status(404).json({ error: "Paciente no encontrado" });

  const r = db.prepare(`
    INSERT INTO clinical_notes (workspace_id, patient_id, author_id, author_name, kind, content, diagnostic_system)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    req.user.workspace_id, req.params.patientId,
    req.user.id, req.user.name ?? null,
    kind, typeof content === "string" ? content : JSON.stringify(content),
    diagSystem,
  );
  const row = db.prepare("SELECT * FROM clinical_notes WHERE id = ?").get(r.lastInsertRowid);
  req.app.get("io")?.to(`ws-${req.user.workspace_id}`).emit("note:created", toNote(row));
  res.status(201).json(toNote(row));
});

// Editar nota — solo mientras sea borrador (signed_at IS NULL)
router.patch("/notes/:id", (req, res) => {
  const existing = db.prepare("SELECT * FROM clinical_notes WHERE id = ? AND workspace_id = ?")
    .get(req.params.id, req.user.workspace_id);
  if (!existing) return res.status(404).json({ error: "Nota no encontrada" });
  if (existing.signed_at) {
    return res.status(409).json({ error: "La nota ya está firmada. Usa supersede para crear una nueva versión." });
  }
  if (existing.superseded_by_id) {
    return res.status(409).json({ error: "Esta nota ya fue reemplazada." });
  }

  const { content, diagnosticSystem } = req.body ?? {};
  if (content === undefined && diagnosticSystem === undefined) {
    return res.status(400).json({ error: "Nada para actualizar (content o diagnosticSystem requeridos)" });
  }

  // Construcción dinámica del UPDATE: solo tocamos los campos enviados.
  const sets = [];
  const args = [];
  if (content !== undefined) {
    sets.push("content = ?");
    args.push(typeof content === "string" ? content : JSON.stringify(content));
  }
  if (diagnosticSystem !== undefined) {
    if (existing.kind !== "cie11") {
      return res.status(400).json({ error: "diagnosticSystem solo aplica al bloque de Diagnóstico" });
    }
    if (diagnosticSystem !== null && diagnosticSystem !== "" && !VALID_DIAGNOSTIC_SYSTEMS.has(diagnosticSystem)) {
      return res.status(400).json({ error: "diagnosticSystem inválido" });
    }
    sets.push("diagnostic_system = ?");
    args.push(diagnosticSystem || null);
  }
  sets.push("updated_at = CURRENT_TIMESTAMP");
  args.push(req.params.id);

  db.prepare(`UPDATE clinical_notes SET ${sets.join(", ")} WHERE id = ?`).run(...args);
  const row = db.prepare("SELECT * FROM clinical_notes WHERE id = ?").get(req.params.id);
  req.app.get("io")?.to(`ws-${req.user.workspace_id}`).emit("note:updated", toNote(row));
  res.json(toNote(row));
});

// Firmar nota (irreversible)
router.post("/notes/:id/sign", (req, res) => {
  const existing = db.prepare("SELECT * FROM clinical_notes WHERE id = ? AND workspace_id = ?")
    .get(req.params.id, req.user.workspace_id);
  if (!existing) return res.status(404).json({ error: "Nota no encontrada" });
  if (existing.signed_at) return res.status(409).json({ error: "Nota ya firmada" });

  const now = new Date().toISOString();
  db.prepare("UPDATE clinical_notes SET signed_at = ?, updated_at = ? WHERE id = ?")
    .run(now, now, req.params.id);
  const row = db.prepare("SELECT * FROM clinical_notes WHERE id = ?").get(req.params.id);
  req.app.get("io")?.to(`ws-${req.user.workspace_id}`).emit("note:signed", toNote(row));
  res.json(toNote(row));
});

/**
 * Reemplaza una nota firmada creando una nueva versión.
 * La nota original queda marcada con superseded_by_id = nueva.id (no se borra, cumple con Res. 1995/1999).
 */
router.post("/notes/:id/supersede", (req, res) => {
  const existing = db.prepare("SELECT * FROM clinical_notes WHERE id = ? AND workspace_id = ?")
    .get(req.params.id, req.user.workspace_id);
  if (!existing) return res.status(404).json({ error: "Nota no encontrada" });
  if (existing.superseded_by_id) return res.status(409).json({ error: "Esta nota ya fue reemplazada" });

  const { content, sign, diagnosticSystem } = req.body ?? {};
  if (content === undefined) return res.status(400).json({ error: "content requerido" });

  // El sistema diagnóstico se hereda de la nota previa salvo que el
  // caller envíe uno nuevo explícito. Esto mantiene continuidad cuando
  // el psicólogo actualiza la redacción pero no cambia de manual.
  let diagSystem = existing.diagnostic_system ?? null;
  if (existing.kind === "cie11" && diagnosticSystem !== undefined) {
    if (diagnosticSystem !== null && diagnosticSystem !== "" && !VALID_DIAGNOSTIC_SYSTEMS.has(diagnosticSystem)) {
      return res.status(400).json({ error: "diagnosticSystem inválido" });
    }
    diagSystem = diagnosticSystem || null;
  }

  const tx = db.transaction(() => {
    const now = new Date().toISOString();
    const ins = db.prepare(`
      INSERT INTO clinical_notes (workspace_id, patient_id, author_id, author_name, kind, content, diagnostic_system, created_at, updated_at, signed_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      existing.workspace_id, existing.patient_id,
      req.user.id, req.user.name ?? null,
      existing.kind,
      typeof content === "string" ? content : JSON.stringify(content),
      diagSystem,
      now, now,
      sign ? now : null
    );
    db.prepare("UPDATE clinical_notes SET superseded_by_id = ?, updated_at = ? WHERE id = ?")
      .run(ins.lastInsertRowid, now, req.params.id);
    return ins.lastInsertRowid;
  });
  const newId = tx();
  const row = db.prepare("SELECT * FROM clinical_notes WHERE id = ?").get(newId);
  req.app.get("io")?.to(`ws-${req.user.workspace_id}`).emit("note:superseded", { oldId: Number(req.params.id), new: toNote(row) });
  res.status(201).json(toNote(row));
});

/**
 * Eliminar una nota.
 * - Borradores (signed_at IS NULL): DELETE físico.
 * - Firmadas: archivado lógico (archived_at) — la nota desaparece de la UI
 *   pero el row se conserva en DB. Esto cumple Res. 1995/1999 que prohíbe
 *   alterar la historia clínica firmada pero permite excluirla de la vista
 *   activa, manteniendo trazabilidad para auditoría regulatoria.
 */
router.delete("/notes/:id", (req, res) => {
  const existing = db.prepare("SELECT * FROM clinical_notes WHERE id = ? AND workspace_id = ?")
    .get(req.params.id, req.user.workspace_id);
  if (!existing) return res.status(404).json({ error: "Nota no encontrada" });
  if (existing.superseded_by_id) {
    return res.status(409).json({ error: "Esta nota ya fue reemplazada por otra versión." });
  }
  if (existing.signed_at) {
    // Soft delete para notas firmadas — preserva audit trail.
    db.prepare("UPDATE clinical_notes SET archived_at = ? WHERE id = ?")
      .run(new Date().toISOString(), req.params.id);
    req.app.get("io")?.to(`ws-${req.user.workspace_id}`).emit("note:archived", { id: Number(req.params.id) });
    return res.json({ ok: true, archived: true });
  }
  db.prepare("DELETE FROM clinical_notes WHERE id = ?").run(req.params.id);
  req.app.get("io")?.to(`ws-${req.user.workspace_id}`).emit("note:deleted", { id: Number(req.params.id) });
  res.json({ ok: true, archived: false });
});

export default router;
