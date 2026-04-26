import { Router } from "express";
import express from "express";
import { db } from "../db.js";
import { requireAuth } from "../auth.js";

const router = Router();
router.use(requireAuth);

// Workspace actual con resumen (sedes + profesionales)
router.get("/", (req, res) => {
  const wsId = req.user.workspace_id;
  const ws = db.prepare("SELECT id, name, mode FROM workspaces WHERE id = ?").get(wsId);
  const sedes = db.prepare("SELECT * FROM sedes WHERE workspace_id = ? ORDER BY name").all(wsId);
  const professionals = db.prepare("SELECT * FROM professionals WHERE workspace_id = ? ORDER BY name").all(wsId);

  // Unir sedes a cada profesional
  const pSedes = db.prepare("SELECT professional_id, sede_id FROM professional_sedes WHERE professional_id IN (SELECT id FROM professionals WHERE workspace_id = ?)").all(wsId);
  const bySedeMap = new Map();
  for (const row of pSedes) {
    if (!bySedeMap.has(row.professional_id)) bySedeMap.set(row.professional_id, []);
    bySedeMap.get(row.professional_id).push(row.sede_id);
  }

  res.json({
    ...ws,
    sedes,
    professionals: professionals.map((p) => ({
      ...p,
      active: !!p.active,
      sedeIds: bySedeMap.get(p.id) ?? [],
    })),
  });
});

// Cambiar modo / nombre del workspace
router.patch("/", (req, res) => {
  const wsId = req.user.workspace_id;
  const { name, mode } = req.body ?? {};
  if (mode && !["individual", "organization"].includes(mode)) {
    return res.status(400).json({ error: "mode inválido" });
  }
  const sql = [];
  const args = [];
  if (name) { sql.push("name = ?"); args.push(name); }
  if (mode) { sql.push("mode = ?"); args.push(mode); }
  if (sql.length === 0) return res.status(400).json({ error: "Nada que actualizar" });
  db.prepare(`UPDATE workspaces SET ${sql.join(", ")} WHERE id = ?`).run(...args, wsId);
  res.json(db.prepare("SELECT id, name, mode FROM workspaces WHERE id = ?").get(wsId));
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

export default router;
