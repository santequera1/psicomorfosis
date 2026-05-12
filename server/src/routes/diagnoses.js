/**
 * Diagnósticos clínicos estructurados.
 *
 * Acompaña al bloque "Impresión diagnóstica" de la historia clínica.
 * Cada paciente puede tener N diagnósticos asignados (típicamente 1-3),
 * con uno marcado como "principal" opcionalmente.
 *
 * El catálogo precargado (server/src/diagnoses-catalog.js) cubre los
 * ~30 dx más comunes en clínica privada colombiana con códigos
 * paralelos CIE-11 y DSM-5-TR. Si la psicóloga necesita uno fuera del
 * catálogo, puede agregar con system="Otro" y nombre libre.
 *
 * NO es un historial — el archivado es soft (archived_at). Las
 * versiones antiguas (cuando un dx se "elimina") permanecen en DB
 * pero ocultas del paciente. Si la SIC o un perito necesita ver
 * todos los dx que un paciente tuvo a lo largo del tiempo, queda
 * trazabilidad completa.
 */

import { Router } from "express";
import { db } from "../db.js";
import { requireAuth } from "../auth.js";
import { DIAGNOSIS_CATALOG, DIAGNOSIS_CATEGORIES, filterCatalogBySystem } from "../diagnoses-catalog.js";

const router = Router();
router.use(requireAuth);

const VALID_SYSTEMS = new Set(["CIE-11", "DSM-5-TR", "Otro"]);

function toDiagnosis(row) {
  if (!row) return null;
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    patientId: row.patient_id,
    code: row.code,
    system: row.system,
    name: row.name,
    catalogId: row.catalog_id,
    isPrimary: !!row.is_primary,
    note: row.note,
    addedById: row.added_by_id,
    addedByName: row.added_by_name,
    createdAt: row.created_at,
    archivedAt: row.archived_at,
  };
}

/**
 * GET /api/diagnoses/catalog?system=CIE-11
 *
 * Devuelve el catálogo curado. Si pasa ?system=CIE-11 o DSM-5-TR, filtra
 * solo las entradas que tienen código para ese sistema. Sin filtro,
 * devuelve todas con sus códigos paralelos.
 */
router.get("/catalog", (req, res) => {
  const { system } = req.query;
  if (system && system !== "all") {
    if (!VALID_SYSTEMS.has(system)) {
      return res.status(400).json({ error: "system inválido" });
    }
    if (system === "Otro") {
      // "Otro" no tiene catálogo — la psicóloga escribe libre.
      return res.json({ categories: [], entries: [] });
    }
    return res.json({
      categories: DIAGNOSIS_CATEGORIES,
      entries: filterCatalogBySystem(system),
    });
  }
  // Sin filtro: devolvemos todas con sus códigos paralelos.
  res.json({
    categories: DIAGNOSIS_CATEGORIES,
    entries: DIAGNOSIS_CATALOG,
  });
});

/**
 * GET /api/patients/:patientId/diagnoses
 * Lista diagnósticos vigentes del paciente (no archivados).
 */
router.get("/patients/:patientId/diagnoses", (req, res) => {
  const rows = db.prepare(`
    SELECT * FROM clinical_diagnoses
    WHERE workspace_id = ? AND patient_id = ? AND archived_at IS NULL
    ORDER BY is_primary DESC, created_at ASC
  `).all(req.user.workspace_id, req.params.patientId);
  res.json(rows.map(toDiagnosis));
});

/**
 * POST /api/patients/:patientId/diagnoses
 * Body: { code, system, name, catalogId?, isPrimary?, note? }
 */
router.post("/patients/:patientId/diagnoses", (req, res) => {
  const { code, system, name, catalogId, isPrimary, note } = req.body ?? {};
  if (!code || !system || !name) {
    return res.status(400).json({ error: "code, system y name son requeridos" });
  }
  if (!VALID_SYSTEMS.has(system)) {
    return res.status(400).json({ error: "system inválido" });
  }

  // Verificar paciente
  const patient = db.prepare("SELECT id FROM patients WHERE id = ? AND workspace_id = ?")
    .get(req.params.patientId, req.user.workspace_id);
  if (!patient) return res.status(404).json({ error: "Paciente no encontrado" });

  // Si se marca como principal, primero desmarcamos cualquier otro
  // primary vigente. La regla es: máximo 1 primary activo por paciente.
  const tx = db.transaction(() => {
    if (isPrimary) {
      db.prepare(`
        UPDATE clinical_diagnoses SET is_primary = 0
        WHERE patient_id = ? AND workspace_id = ? AND archived_at IS NULL
      `).run(req.params.patientId, req.user.workspace_id);
    }
    const r = db.prepare(`
      INSERT INTO clinical_diagnoses
        (workspace_id, patient_id, code, system, name, catalog_id, is_primary, note, added_by_id, added_by_name)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      req.user.workspace_id, req.params.patientId,
      String(code).trim(), system, String(name).trim(),
      catalogId ?? null,
      isPrimary ? 1 : 0,
      note ?? null,
      req.user.id, req.user.name ?? null,
    );
    return r.lastInsertRowid;
  });
  const id = tx();
  const row = db.prepare("SELECT * FROM clinical_diagnoses WHERE id = ?").get(id);
  req.app.get("io")?.to(`ws-${req.user.workspace_id}`).emit("diagnosis:created", toDiagnosis(row));
  res.status(201).json(toDiagnosis(row));
});

/**
 * PATCH /api/diagnoses/:id
 * Body: { isPrimary?, note?, name?, code? }
 *
 * Permite editar metadata. El system y catalogId NO se editan: si la
 * psicóloga quiere cambiar de sistema, mejor archivar el dx y agregar
 * uno nuevo (preserva auditoría limpia).
 */
router.patch("/diagnoses/:id", (req, res) => {
  const existing = db.prepare("SELECT * FROM clinical_diagnoses WHERE id = ? AND workspace_id = ?")
    .get(req.params.id, req.user.workspace_id);
  if (!existing) return res.status(404).json({ error: "Diagnóstico no encontrado" });
  if (existing.archived_at) return res.status(409).json({ error: "Diagnóstico archivado" });

  const { isPrimary, note, name, code } = req.body ?? {};
  const sets = [];
  const args = [];

  if (isPrimary !== undefined) {
    // Si se marca este como primary, desmarcar los demás del paciente
    if (isPrimary) {
      db.prepare(`
        UPDATE clinical_diagnoses SET is_primary = 0
        WHERE patient_id = ? AND workspace_id = ? AND archived_at IS NULL AND id != ?
      `).run(existing.patient_id, req.user.workspace_id, existing.id);
    }
    sets.push("is_primary = ?");
    args.push(isPrimary ? 1 : 0);
  }
  if (note !== undefined) {
    sets.push("note = ?");
    args.push(note || null);
  }
  if (typeof name === "string" && name.trim().length > 0) {
    sets.push("name = ?");
    args.push(name.trim());
  }
  if (typeof code === "string" && code.trim().length > 0) {
    sets.push("code = ?");
    args.push(code.trim());
  }
  if (sets.length === 0) {
    return res.status(400).json({ error: "Nada para actualizar" });
  }
  args.push(req.params.id);
  db.prepare(`UPDATE clinical_diagnoses SET ${sets.join(", ")} WHERE id = ?`).run(...args);
  const row = db.prepare("SELECT * FROM clinical_diagnoses WHERE id = ?").get(req.params.id);
  req.app.get("io")?.to(`ws-${req.user.workspace_id}`).emit("diagnosis:updated", toDiagnosis(row));
  res.json(toDiagnosis(row));
});

/**
 * DELETE /api/diagnoses/:id
 *
 * Soft delete (archived_at). Si el dx era principal, NO promovemos
 * automáticamente otro a principal — la psicóloga decide explícitamente
 * cuál es el nuevo primary.
 */
router.delete("/diagnoses/:id", (req, res) => {
  const existing = db.prepare("SELECT id FROM clinical_diagnoses WHERE id = ? AND workspace_id = ?")
    .get(req.params.id, req.user.workspace_id);
  if (!existing) return res.status(404).json({ error: "Diagnóstico no encontrado" });
  db.prepare("UPDATE clinical_diagnoses SET archived_at = CURRENT_TIMESTAMP WHERE id = ?")
    .run(req.params.id);
  req.app.get("io")?.to(`ws-${req.user.workspace_id}`).emit("diagnosis:archived", { id: Number(req.params.id) });
  res.json({ ok: true });
});

export default router;
