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
 *      consume el dashboard del asesor legal. CRUD de versiones
 *      (draft/published), publicación, audit log de aceptaciones.
 *
 * Las versiones nunca se editan después de publicadas: para corregir
 * un texto ya vigente se crea una versión nueva basada en la anterior.
 * Esto preserva la trazabilidad de qué texto exacto vio cada usuario.
 */

import { Router } from "express";
import { writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { db } from "../db.js";
import { requireAuth, requireLegalAdmin } from "../auth.js";
import { LEGAL_DOCUMENTS_SEED } from "../legal-seed.js";

const router = Router();

// ─── Helpers ──────────────────────────────────────────────────────────

/** Quita HTML para guardar también una versión en texto plano. */
function stripHtml(html) {
  return String(html ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

/**
 * Snapshot fuera-de-DB de una versión recién publicada.
 *
 * Motivación: si la DB se pierde, se reseembrase por accidente o un
 * bug borra versiones, queremos que el trabajo del asesor legal
 * NO desaparezca. Por eso, cada vez que se publica una versión,
 * escribimos también el HTML completo + metadata a disco como un
 * archivo HTML standalone, legible sin la app. Estos snapshots viven
 * junto a los backups SQLite (mismo directorio padre por simetría
 * operacional) y los cubre el script de backup diario gracias a que
 * estarán dentro de uploads/ o un directorio similar — en realidad
 * los snapshots viven en ~/backups/psicomorfosis/legal-versions/
 * que NO está dentro de uploads, pero el operador puede tar-zippearlo
 * cuando quiera; lo importante es que existen como segunda copia
 * persistente fuera del SQLite.
 *
 * El path se puede sobreescribir con la env var LEGAL_SNAPSHOT_DIR.
 * Por default usa ~/backups/psicomorfosis/legal-versions/.
 *
 * IMPORTANTE: esta función NO debe romper el endpoint si falla. Es
 * un best-effort: si el disco está lleno, los permisos están mal o
 * cualquier otra cosa, logueamos y seguimos — la publicación en la
 * DB ya quedó hecha. Por eso usamos try/catch interno y no propaga.
 */
function snapshotPublishedVersion(versionId) {
  try {
    const row = db.prepare(`
      SELECT v.id, v.version_label, v.body_html, v.summary_of_changes,
             v.published_at, v.published_by,
             d.slug, d.title,
             u.name AS publisher_name, u.username AS publisher_username
      FROM legal_document_versions v
      JOIN legal_documents d ON d.id = v.document_id
      LEFT JOIN users u ON u.id = v.published_by
      WHERE v.id = ?
    `).get(versionId);
    if (!row) return;

    const baseDir = process.env.LEGAL_SNAPSHOT_DIR
      || path.join(os.homedir(), "backups", "psicomorfosis", "legal-versions");
    const docDir = path.join(baseDir, row.slug);
    mkdirSync(docDir, { recursive: true });

    // Nombre del archivo: <version_label>__id<ID>__<timestampSlug>.html
    // El timestamp evita colisiones si dos versiones distintas comparten
    // version_label (raro pero posible si el asesor repite etiqueta).
    const tsSlug = String(row.published_at || new Date().toISOString())
      .replace(/[:.]/g, "-");
    const safeLabel = String(row.version_label).replace(/[^a-zA-Z0-9._-]/g, "_");
    const filename = `${safeLabel}__id${row.id}__${tsSlug}.html`;
    const fullPath = path.join(docDir, filename);

    const html = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<title>${row.title} — ${row.version_label}</title>
<style>
  body { font-family: -apple-system, system-ui, "Inter", sans-serif; max-width: 780px; margin: 2rem auto; padding: 0 1rem; color: #1a1a1a; line-height: 1.55; }
  header.snapshot-meta { background: #f5f5f4; border: 1px solid #d6d3d1; border-radius: 8px; padding: 1rem 1.25rem; margin-bottom: 2rem; font-size: 0.875rem; color: #44403c; }
  header.snapshot-meta h1 { margin: 0 0 0.5rem 0; font-size: 1.1rem; color: #1a1a1a; }
  header.snapshot-meta dl { margin: 0; display: grid; grid-template-columns: max-content 1fr; gap: 0.25rem 1rem; }
  header.snapshot-meta dt { font-weight: 600; }
  h2 { margin-top: 2rem; }
</style>
</head>
<body>
<header class="snapshot-meta">
<h1>Snapshot legal · ${row.title}</h1>
<dl>
<dt>Documento</dt><dd>${row.slug}</dd>
<dt>Versión</dt><dd>${row.version_label} (ID interno ${row.id})</dd>
<dt>Publicado el</dt><dd>${row.published_at ?? "(sin fecha)"}</dd>
<dt>Publicado por</dt><dd>${row.publisher_name ?? "—"} (${row.publisher_username ?? "?"})</dd>
<dt>Resumen de cambios</dt><dd>${row.summary_of_changes ?? "(no especificado)"}</dd>
</dl>
<p style="margin-top:1rem;margin-bottom:0;font-style:italic;color:#78716c;">
Snapshot generado automáticamente al publicar esta versión. Si la versión
en la base de datos se pierde, este archivo conserva el contenido íntegro
para restauración manual.
</p>
</header>
<main>
${row.body_html ?? ""}
</main>
</body>
</html>`;

    writeFileSync(fullPath, html, "utf-8");
    console.log(`[legal-snapshot] OK → ${fullPath}`);
  } catch (err) {
    // Best-effort: no debe romper la publicación. Sólo loguea.
    console.warn(`[legal-snapshot] FALLÓ para version ${versionId}: ${err.message}`);
  }
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
  // Cache corto + revalidación obligatoria. Los documentos legales son de
  // baja frecuencia de cambio pero alta criticidad: cuando el asesor
  // publica una nueva versión, queremos que la página pública la refleje
  // de inmediato. ETag basado en version_id+published_at permite que el
  // browser revalide rápido sin descargar el body si no cambió.
  res.set("Cache-Control", "public, max-age=30, must-revalidate");
  res.set("ETag", `W/"legal-${v.id}-${v.published_at ?? ""}"`);
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

/** Body completo de una versión (HTML para editar) + presencia. */
router.get("/admin/versions/:id", (req, res) => {
  const v = db.prepare(`
    SELECT v.*, d.slug, d.title AS document_title,
           lu.name AS last_modified_by_name
    FROM legal_document_versions v
    JOIN legal_documents d ON d.id = v.document_id
    LEFT JOIN users lu ON lu.id = v.last_modified_by
    WHERE v.id = ?
  `).get(Number(req.params.id));
  if (!v) return res.status(404).json({ error: "No encontrado" });

  // Editores activos en los últimos 60s (excluyendo al que pregunta —
  // al asesor no le interesa verse a sí misma como "editando ahora").
  const activeEditors = db.prepare(`
    SELECT user_id, user_name, last_seen_at
    FROM legal_document_editors
    WHERE version_id = ?
      AND user_id != ?
      AND last_seen_at >= datetime('now', '-60 seconds')
    ORDER BY last_seen_at DESC
  `).all(v.id, req.user.id);

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
    lastModifiedBy: v.last_modified_by
      ? { id: v.last_modified_by, name: v.last_modified_by_name }
      : null,
    lastModifiedAt: v.last_modified_at,
    activeEditors: activeEditors.map((e) => ({
      userId: e.user_id,
      name: e.user_name,
      lastSeenAt: e.last_seen_at,
    })),
  });
});

/**
 * POST /api/legal/admin/versions/:id/heartbeat
 *
 * Marca al usuario actual como "editando ahora" en esa versión. El
 * frontend lo llama cada 30s mientras tiene el editor abierto. Si en
 * 60s no hay otro heartbeat, la entrada deja de aparecer en
 * activeEditors. Devuelve la lista actualizada para que el cliente
 * la pinte sin tener que hacer un GET aparte.
 *
 * Solo aplica a versiones en estado 'draft' — no tiene sentido
 * trackear presencia sobre versiones publicadas/archivadas (no se
 * editan).
 */
router.post("/admin/versions/:id/heartbeat", (req, res) => {
  const versionId = Number(req.params.id);
  const v = db.prepare("SELECT id, status FROM legal_document_versions WHERE id = ?")
    .get(versionId);
  if (!v) return res.status(404).json({ error: "No encontrado" });
  if (v.status !== "draft") {
    // Idempotente: respondemos OK pero sin tracking porque no aplica.
    return res.json({ activeEditors: [] });
  }

  // UPSERT: si la fila existe, actualizamos last_seen_at; si no,
  // insertamos. SQLite usa INSERT ... ON CONFLICT.
  db.prepare(`
    INSERT INTO legal_document_editors (version_id, user_id, user_name, last_seen_at)
    VALUES (?, ?, ?, datetime('now'))
    ON CONFLICT(version_id, user_id) DO UPDATE SET
      last_seen_at = datetime('now'),
      user_name = excluded.user_name
  `).run(versionId, req.user.id, req.user.name ?? "Asesor legal");

  // Devolvemos editores activos excluyendo al que llama. Mismo query
  // que en el GET, así el cliente no necesita un fetch separado.
  const activeEditors = db.prepare(`
    SELECT user_id, user_name, last_seen_at
    FROM legal_document_editors
    WHERE version_id = ?
      AND user_id != ?
      AND last_seen_at >= datetime('now', '-60 seconds')
    ORDER BY last_seen_at DESC
  `).all(versionId, req.user.id);

  res.json({
    activeEditors: activeEditors.map((e) => ({
      userId: e.user_id,
      name: e.user_name,
      lastSeenAt: e.last_seen_at,
    })),
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

/**
 * POST /api/legal/admin/documents/:slug/reset
 *
 * "Restablecer a plantilla inicial". Borra TODAS las versiones del
 * documento (draft, published y archived) y crea una nueva draft v1
 * con el body original del seed (LEGAL_DOCUMENTS_SEED). Útil para
 * volver a un estado limpio durante pruebas o cuando los cambios
 * acumulados ya no aportan.
 *
 * Operación destructiva: pierde el historial completo del documento
 * en cuestión. No afecta a otros documentos. Solo legal_admin.
 */
router.post("/admin/documents/:slug/reset", (req, res) => {
  const doc = db.prepare("SELECT * FROM legal_documents WHERE slug = ?")
    .get(req.params.slug);
  if (!doc) return res.status(404).json({ error: "Documento no encontrado" });

  // El body inicial viene del catálogo en código fuente — no del último
  // estado de la DB. Así "restablecer" significa siempre "volver a la
  // plantilla que el equipo de desarrollo definió", no "volver a la
  // primera versión que el asesor vio". Si algún slug no está en el
  // catálogo (ej: alguien creó documentos legales custom en el futuro),
  // devolvemos error en lugar de borrar sin tener qué recrear.
  const seedDoc = LEGAL_DOCUMENTS_SEED.find((s) => s.slug === doc.slug);
  if (!seedDoc) {
    return res.status(400).json({
      error: "Este documento no tiene plantilla inicial en el catálogo. No se puede restablecer.",
    });
  }

  const newVersionId = db.transaction(() => {
    // Borra acceptances primero (FK CASCADE las borraría igual, pero
    // ser explícitos deja claro qué pasa). En modelo de aceptación
    // bloqueante: si el asesor restablece, las aceptaciones previas
    // quedan huérfanas y los usuarios tendrán que re-aceptar la próxima
    // publicación. Esto es coherente con "restablecer = empezar de cero".
    db.prepare("DELETE FROM legal_acceptances WHERE document_id = ?").run(doc.id);
    db.prepare("DELETE FROM legal_document_versions WHERE document_id = ?").run(doc.id);
    const r = db.prepare(`
      INSERT INTO legal_document_versions
        (document_id, version_label, body_html, body_text, status, created_by, summary_of_changes)
      VALUES (?, ?, ?, ?, 'draft', ?, ?)
    `).run(
      doc.id, "2026-v1", seedDoc.body_html, stripHtml(seedDoc.body_html),
      req.user.id,
      "Restablecido a plantilla inicial.",
    );
    return r.lastInsertRowid;
  })();

  res.json({ versionId: newVersionId, reset: true });
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
  // Trackeamos quién y cuándo editó por última vez para que otros
  // legal_admins vean "María editó esto hace 5 min" al abrir el doc.
  updates.push("last_modified_by = ?", "last_modified_at = ?");
  args.push(req.user.id, new Date().toISOString());
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
  // Snapshot fuera-de-DB. Fuera de la transacción a propósito: si el
  // filesystem falla no queremos rollback de una publicación válida.
  snapshotPublishedVersion(v.id);
  res.json({ ok: true, publishedAt: now });
});

/**
 * DELETE /api/legal/admin/versions/:id
 *
 * Elimina una versión específica del documento, sin importar su estado
 * (draft, published o archived). El cleanup es total: borra también las
 * aceptaciones de la versión por FK CASCADE.
 *
 * Reglas de seguridad:
 *   - Si la versión es la publicada vigente y existe una archivada
 *     anterior, la archivada vuelve a publicada para mantener el doc
 *     con una versión vigente.
 *   - Si era la única versión del documento, se queda sin versiones —
 *     el seedLegalDocuments del próximo arranque (o un click en
 *     "Restablecer a plantilla inicial") recreará la draft v1.
 *   - El recuento previo de aceptaciones se devuelve al cliente para
 *     que pueda mostrar feedback ("X aceptaciones eliminadas").
 *
 * Antes este endpoint solo permitía borrar drafts (regla de
 * inmutabilidad para auditoría). En la práctical asesor necesita
 * limpiar versiones de prueba y rehacer historial sin tener que
 * pedir SQL en VPS, así que abrimos el borrado individual con
 * advertencia clara en la UI.
 */
router.delete("/admin/versions/:id", (req, res) => {
  const v = db.prepare("SELECT * FROM legal_document_versions WHERE id = ?")
    .get(Number(req.params.id));
  if (!v) return res.status(404).json({ error: "No encontrado" });

  const acceptances = db.prepare(
    "SELECT COUNT(*) AS n FROM legal_acceptances WHERE version_id = ?"
  ).get(v.id).n;

  const wasPublished = v.status === "published";

  db.transaction(() => {
    db.prepare("DELETE FROM legal_document_versions WHERE id = ?").run(v.id);

    // Si lo que borramos era la versión vigente, "promovemos" la
    // archived más reciente a published para que el documento no quede
    // sin contenido público. Si no hay archived, queda sin published
    // (la página pública mostrará "documento no publicado" hasta que
    // alguien publique de nuevo).
    if (wasPublished) {
      const lastArchived = db.prepare(`
        SELECT id, published_at FROM legal_document_versions
        WHERE document_id = ? AND status = 'archived'
        ORDER BY published_at DESC LIMIT 1
      `).get(v.document_id);
      if (lastArchived) {
        db.prepare(`
          UPDATE legal_document_versions
          SET status = 'published'
          WHERE id = ?
        `).run(lastArchived.id);
      }
    }
  })();

  res.json({ ok: true, acceptancesRemoved: acceptances });
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
