/**
 * Rutas del sistema legal de Psicomorfosis.
 *
 * Tres bandas de endpoints según su consumidor:
 *
 *   1) /api/legal/public/*     — sin auth. Lo lee el sitio público
 *      (/privacidad, /terminos) y devuelve la última versión publicada
 *      del documento por slug. Cacheable.
 *
 *   2) /api/legal/me/*         — requiere auth. Para usuarios staff
 *      o pacientes. Endpoints: documentos pendientes de aceptar,
 *      registrar aceptación.
 *
 *   3) /api/legal/admin/*      — requiere auth + is_legal_admin. Lo
 *      consume el dashboard de la asesora legal. CRUD de versiones
 *      (draft/published), publicación, audit log de aceptaciones.
 *
 * Las versiones nunca se editan después de publicadas: para corregir
 * un texto ya vigente se crea una versión nueva basada en la anterior.
 * Esto preserva la trazabilidad de qué texto exacto vio cada usuario.
 */

import { Router } from "express";
import { db } from "../db.js";
import { requireAuth, requireLegalAdmin } from "../auth.js";

const router = Router();

// ─── Helpers ──────────────────────────────────────────────────────────

/** Quita HTML para guardar también una versión en texto plano. */
function stripHtml(html) {
  return String(html ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

/** Genera el siguiente label "2026-vN" para un documento. */
function nextVersionLabel(documentId) {
  const year = new Date().getFullYear();
  const row = db.prepare(`
    SELECT version_label FROM legal_document_versions
    WHERE document_id = ? AND version_label LIKE ?
    ORDER BY id DESC LIMIT 1
  `).get(documentId, `${year}-v%`);
  if (!row) return `${year}-v1`;
  const m = row.version_label.match(/v(\d+)/);
  const n = m ? Number(m[1]) + 1 : 1;
  return `${year}-v${n}`;
}

/** Lee la última versión PUBLICADA de un documento por slug. */
function getLatestPublished(slug) {
  return db.prepare(`
    SELECT v.id, v.version_label, v.body_html, v.body_text, v.published_at,
           v.summary_of_changes,
           d.id AS document_id, d.slug, d.title, d.description, d.public_path,
           d.requires_acceptance, d.acceptance_audience
    FROM legal_documents d
    JOIN legal_document_versions v
      ON v.document_id = d.id AND v.status = 'published'
    WHERE d.slug = ?
    ORDER BY v.published_at DESC
    LIMIT 1
  `).get(slug);
}

/** Determina la audiencia del usuario actual: staff | patient. */
function userAudience(user) {
  return user?.role === "paciente" ? "patient" : "staff";
}

// ─── /api/legal/public ────────────────────────────────────────────────
//
// Endpoints sin auth para que el sitio público y el portal del paciente
// los puedan leer. NO devuelve drafts — solo la última versión `published`.

router.get("/public/:slug", (req, res) => {
  const v = getLatestPublished(req.params.slug);
  if (!v) {
    return res.status(404).json({ error: "Documento no publicado" });
  }
  // ¿Existe alguna versión anterior (archived) de este documento? Si no,
  // es la primera publicación y la página pública omitirá el bloque de
  // "Cambios respecto a la versión anterior" — no hay cambios versus
  // una versión que nunca existió, y el summary de la primera publicación
  // típicamente es metadato técnico ("Importación inicial…") que no
  // aporta al lector externo.
  const prev = db.prepare(`
    SELECT 1 FROM legal_document_versions
    WHERE document_id = ? AND status = 'archived'
    LIMIT 1
  `).get(v.document_id);
  res.set("Cache-Control", "public, max-age=300"); // 5 min
  res.json({
    slug: v.slug,
    title: v.title,
    description: v.description,
    versionLabel: v.version_label,
    bodyHtml: v.body_html,
    publishedAt: v.published_at,
    summaryOfChanges: v.summary_of_changes,
    hasPreviousVersion: !!prev,
  });
});

/** Lista solo los documentos públicos publicados (sin body — para índice). */
router.get("/public", (_req, res) => {
  const rows = db.prepare(`
    SELECT d.slug, d.title, d.description, d.public_path,
           v.version_label, v.published_at
    FROM legal_documents d
    LEFT JOIN legal_document_versions v
      ON v.document_id = d.id AND v.status = 'published'
    WHERE d.public_path IS NOT NULL
    ORDER BY d.title
  `).all();
  res.set("Cache-Control", "public, max-age=300");
  res.json(rows.map((r) => ({
    slug: r.slug,
    title: r.title,
    description: r.description,
    publicPath: r.public_path,
    versionLabel: r.version_label,
    publishedAt: r.published_at,
  })));
});

// ─── /api/legal/me ────────────────────────────────────────────────────
//
// Endpoints para que el usuario autenticado vea qué documentos debe
// aceptar y registre su aceptación.

router.use("/me", requireAuth);

/**
 * GET /api/legal/me/pending
 *
 * Devuelve documentos que el usuario debe aceptar pero aún no aceptó
 * en su versión actual. Filtra por audiencia: solo trae los marcados
 * para el rol del usuario (staff o patient o both).
 *
 * Lógica: para cada documento con requires_acceptance=1 cuya
 * acceptance_audience aplique al usuario, busca si tiene una
 * aceptación de la última versión publicada. Si no, lo incluye.
 */
router.get("/me/pending", (req, res) => {
  const aud = userAudience(req.user);
  const userId = req.user.id;
  const patientId = req.user.patient_id ?? null;

  const docs = db.prepare(`
    SELECT d.id AS document_id, d.slug, d.title, d.description,
           v.id AS version_id, v.version_label, v.body_html, v.published_at,
           v.summary_of_changes
    FROM legal_documents d
    JOIN legal_document_versions v ON v.document_id = d.id AND v.status = 'published'
    WHERE d.requires_acceptance = 1
      AND (d.acceptance_audience = 'both' OR d.acceptance_audience = ?)
    ORDER BY d.title
  `).all(aud);

  // Filtramos solo los que NO tienen aceptación de esa versión.
  const checkAcc = db.prepare(`
    SELECT 1 FROM legal_acceptances
    WHERE version_id = ? AND (
      (user_id = ? AND ? IS NOT NULL) OR
      (patient_id = ? AND ? IS NOT NULL)
    )
    LIMIT 1
  `);
  const pending = [];
  for (const d of docs) {
    const accepted = checkAcc.get(
      d.version_id,
      userId, userId,
      patientId, patientId,
    );
    if (!accepted) {
      pending.push({
        documentId: d.document_id,
        slug: d.slug,
        title: d.title,
        description: d.description,
        versionId: d.version_id,
        versionLabel: d.version_label,
        bodyHtml: d.body_html,
        publishedAt: d.published_at,
        summaryOfChanges: d.summary_of_changes,
      });
    }
  }
  res.json({ pending });
});

/**
 * POST /api/legal/me/accept
 * body: { versionId: number }
 *
 * Registra la aceptación del usuario para esa versión. Idempotente:
 * si ya aceptó esa versión, devuelve la aceptación existente sin
 * duplicar fila.
 */
router.post("/me/accept", (req, res) => {
  const versionId = Number(req.body?.versionId);
  if (!Number.isFinite(versionId)) {
    return res.status(400).json({ error: "versionId requerido" });
  }
  const v = db.prepare(`
    SELECT id, document_id, status FROM legal_document_versions WHERE id = ?
  `).get(versionId);
  if (!v) return res.status(404).json({ error: "Versión no existe" });
  if (v.status !== "published") {
    return res.status(400).json({ error: "Solo se aceptan versiones publicadas" });
  }

  const userId = req.user.id;
  const patientId = req.user.patient_id ?? null;
  const ip = req.headers["x-forwarded-for"]?.toString().split(",")[0].trim() || req.ip || null;
  const userAgent = req.headers["user-agent"] ?? null;

  // Si ya aceptó esa versión, no duplicar.
  const existing = db.prepare(`
    SELECT id, accepted_at FROM legal_acceptances
    WHERE version_id = ? AND (
      (user_id = ? AND ? IS NOT NULL) OR
      (patient_id = ? AND ? IS NOT NULL)
    )
    LIMIT 1
  `).get(versionId, userId, userId, patientId, patientId);
  if (existing) {
    return res.json({ accepted: true, acceptanceId: existing.id, alreadyAccepted: true });
  }

  const r = db.prepare(`
    INSERT INTO legal_acceptances (user_id, patient_id, document_id, version_id, ip, user_agent)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(userId, patientId, v.document_id, versionId, ip, userAgent);

  res.json({ accepted: true, acceptanceId: r.lastInsertRowid });
});

// ─── /api/legal/admin ─────────────────────────────────────────────────
//
// Solo cuentas con is_legal_admin. CRUD de drafts, publicación y audit.

router.use("/admin", requireLegalAdmin);

/** Lista todos los documentos con resumen (última published + drafts pendientes). */
router.get("/admin/documents", (_req, res) => {
  const docs = db.prepare(`
    SELECT id, slug, title, description, public_path,
           requires_acceptance, acceptance_audience, created_at
    FROM legal_documents
    ORDER BY title
  `).all();

  const lastPub = db.prepare(`
    SELECT id, version_label, published_at
    FROM legal_document_versions
    WHERE document_id = ? AND status = 'published'
    ORDER BY published_at DESC LIMIT 1
  `);
  const draft = db.prepare(`
    SELECT id, version_label, created_at, summary_of_changes
    FROM legal_document_versions
    WHERE document_id = ? AND status = 'draft'
    ORDER BY id DESC LIMIT 1
  `);
  const accCount = db.prepare(`
    SELECT COUNT(*) AS n FROM legal_acceptances WHERE document_id = ?
  `);

  const out = docs.map((d) => ({
    id: d.id,
    slug: d.slug,
    title: d.title,
    description: d.description,
    publicPath: d.public_path,
    requiresAcceptance: !!d.requires_acceptance,
    acceptanceAudience: d.acceptance_audience,
    createdAt: d.created_at,
    latestPublished: lastPub.get(d.id) ?? null,
    pendingDraft: draft.get(d.id) ?? null,
    acceptancesCount: accCount.get(d.id).n,
  }));
  res.json(out);
});

/** Detalle de un documento + todas sus versiones (sin body, eso va por id). */
router.get("/admin/documents/:slug", (req, res) => {
  const doc = db.prepare(`
    SELECT * FROM legal_documents WHERE slug = ?
  `).get(req.params.slug);
  if (!doc) return res.status(404).json({ error: "No encontrado" });

  const versions = db.prepare(`
    SELECT v.id, v.version_label, v.status, v.summary_of_changes,
           v.created_at, v.published_at,
           cu.name AS created_by_name,
           pu.name AS published_by_name
    FROM legal_document_versions v
    LEFT JOIN users cu ON cu.id = v.created_by
    LEFT JOIN users pu ON pu.id = v.published_by
    WHERE v.document_id = ?
    ORDER BY v.id DESC
  `).all(doc.id);

  const acceptancesCount = db.prepare(`
    SELECT COUNT(*) AS n FROM legal_acceptances WHERE document_id = ?
  `).get(doc.id).n;

  res.json({
    id: doc.id,
    slug: doc.slug,
    title: doc.title,
    description: doc.description,
    publicPath: doc.public_path,
    requiresAcceptance: !!doc.requires_acceptance,
    acceptanceAudience: doc.acceptance_audience,
    acceptancesCount,
    versions,
  });
});

/** Body completo de una versión (HTML para editar). */
router.get("/admin/versions/:id", (req, res) => {
  const v = db.prepare(`
    SELECT v.*, d.slug, d.title AS document_title
    FROM legal_document_versions v
    JOIN legal_documents d ON d.id = v.document_id
    WHERE v.id = ?
  `).get(Number(req.params.id));
  if (!v) return res.status(404).json({ error: "No encontrado" });
  res.json({
    id: v.id,
    documentId: v.document_id,
    documentSlug: v.slug,
    documentTitle: v.document_title,
    versionLabel: v.version_label,
    bodyHtml: v.body_html,
    summaryOfChanges: v.summary_of_changes,
    status: v.status,
    createdAt: v.created_at,
    publishedAt: v.published_at,
  });
});

/**
 * POST /api/legal/admin/documents/:slug/draft
 *
 * Crea un nuevo borrador para el documento. Si ya existe un draft
 * pendiente, devuelve ese (no creamos múltiples drafts simultáneos
 * para mantener el modelo simple). El contenido inicial es el de la
 * última versión publicada (o cadena vacía si nunca se publicó).
 */
router.post("/admin/documents/:slug/draft", (req, res) => {
  const doc = db.prepare("SELECT * FROM legal_documents WHERE slug = ?")
    .get(req.params.slug);
  if (!doc) return res.status(404).json({ error: "Documento no encontrado" });

  // Si ya hay un draft, lo devolvemos (idempotente).
  const existingDraft = db.prepare(`
    SELECT id FROM legal_document_versions
    WHERE document_id = ? AND status = 'draft'
    ORDER BY id DESC LIMIT 1
  `).get(doc.id);
  if (existingDraft) {
    return res.json({ versionId: existingDraft.id, created: false });
  }

  // Base: última publicada o, si no hay, la última fila (puede ser draft inicial).
  const baseRow = db.prepare(`
    SELECT body_html FROM legal_document_versions
    WHERE document_id = ? AND status = 'published'
    ORDER BY published_at DESC LIMIT 1
  `).get(doc.id) ?? db.prepare(`
    SELECT body_html FROM legal_document_versions
    WHERE document_id = ? ORDER BY id DESC LIMIT 1
  `).get(doc.id);

  const body = baseRow?.body_html ?? "";
  const label = nextVersionLabel(doc.id);
  const r = db.prepare(`
    INSERT INTO legal_document_versions
      (document_id, version_label, body_html, body_text, status, created_by)
    VALUES (?, ?, ?, ?, 'draft', ?)
  `).run(doc.id, label, body, stripHtml(body), req.user.id);

  res.json({ versionId: r.lastInsertRowid, created: true });
});

/** Edita el body / summary del borrador. Solo drafts; publicadas son inmutables. */
router.patch("/admin/versions/:id", (req, res) => {
  const v = db.prepare("SELECT * FROM legal_document_versions WHERE id = ?")
    .get(Number(req.params.id));
  if (!v) return res.status(404).json({ error: "No encontrado" });
  if (v.status !== "draft") {
    return res.status(400).json({ error: "Solo se pueden editar borradores" });
  }
  const { bodyHtml, summaryOfChanges } = req.body ?? {};
  const updates = [];
  const args = [];
  if (typeof bodyHtml === "string") {
    updates.push("body_html = ?", "body_text = ?");
    args.push(bodyHtml, stripHtml(bodyHtml));
  }
  if (typeof summaryOfChanges === "string") {
    updates.push("summary_of_changes = ?");
    args.push(summaryOfChanges);
  }
  if (updates.length === 0) {
    return res.json({ ok: true, noop: true });
  }
  args.push(v.id);
  db.prepare(`UPDATE legal_document_versions SET ${updates.join(", ")} WHERE id = ?`).run(...args);
  res.json({ ok: true });
});

/**
 * POST /api/legal/admin/versions/:id/publish
 *
 * Publica el borrador: marca la versión `published`, archiva la versión
 * publicada anterior si existía. Atómico.
 */
router.post("/admin/versions/:id/publish", (req, res) => {
  const v = db.prepare("SELECT * FROM legal_document_versions WHERE id = ?")
    .get(Number(req.params.id));
  if (!v) return res.status(404).json({ error: "No encontrado" });
  if (v.status !== "draft") {
    return res.status(400).json({ error: "Solo se publican borradores" });
  }
  const now = new Date().toISOString();
  const tx = db.transaction(() => {
    // Archivar la publicada vigente.
    db.prepare(`
      UPDATE legal_document_versions SET status = 'archived'
      WHERE document_id = ? AND status = 'published'
    `).run(v.document_id);
    // Publicar el draft.
    db.prepare(`
      UPDATE legal_document_versions
      SET status = 'published', published_at = ?, published_by = ?
      WHERE id = ?
    `).run(now, req.user.id, v.id);
  });
  tx();
  res.json({ ok: true, publishedAt: now });
});

/**
 * DELETE /api/legal/admin/versions/:id
 *
 * Solo borradores pueden eliminarse. Las versiones publicadas / archivadas
 * son inmutables (necesario para auditoría).
 */
router.delete("/admin/versions/:id", (req, res) => {
  const v = db.prepare("SELECT * FROM legal_document_versions WHERE id = ?")
    .get(Number(req.params.id));
  if (!v) return res.status(404).json({ error: "No encontrado" });
  if (v.status !== "draft") {
    return res.status(400).json({ error: "Solo se eliminan borradores" });
  }
  db.prepare("DELETE FROM legal_document_versions WHERE id = ?").run(v.id);
  res.json({ ok: true });
});

/**
 * GET /api/legal/admin/acceptances
 *
 * Audit log de aceptaciones. Filtros opcionales por documento o usuario.
 * Pagina simple (LIMIT/OFFSET) para no traer toda la tabla.
 */
router.get("/admin/acceptances", (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 100, 500);
  const offset = Number(req.query.offset) || 0;
  const docSlug = req.query.slug ? String(req.query.slug) : null;

  const where = ["1=1"];
  const args = [];
  if (docSlug) {
    where.push("d.slug = ?");
    args.push(docSlug);
  }

  const rows = db.prepare(`
    SELECT a.id, a.accepted_at, a.ip, a.user_agent,
           a.user_id, a.patient_id,
           u.name AS user_name, u.email AS user_email,
           p.name AS patient_name,
           d.slug AS document_slug, d.title AS document_title,
           v.version_label
    FROM legal_acceptances a
    JOIN legal_documents d ON d.id = a.document_id
    JOIN legal_document_versions v ON v.id = a.version_id
    LEFT JOIN users u ON u.id = a.user_id
    LEFT JOIN patients p ON p.id = a.patient_id
    WHERE ${where.join(" AND ")}
    ORDER BY a.accepted_at DESC
    LIMIT ? OFFSET ?
  `).all(...args, limit, offset);

  const total = db.prepare(`
    SELECT COUNT(*) AS n FROM legal_acceptances a
    JOIN legal_documents d ON d.id = a.document_id
    WHERE ${where.join(" AND ")}
  `).get(...args).n;

  res.json({ rows, total, limit, offset });
});

export default router;
