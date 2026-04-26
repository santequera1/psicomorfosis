import { Router } from "express";
import multer from "multer";
import path from "node:path";
import fs from "node:fs";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import mammoth from "mammoth";
import { db } from "../db.js";
import { requireAuth, verifyToken } from "../auth.js";

const router = Router();

// Auth tolerante: acepta header Authorization o query param ?t=<token>.
// Necesario para que el editor pueda mostrar imágenes inline (<img src=...>)
// sin que el navegador tenga forma de adjuntar el header.
function requireAuthOrToken(req, res, next) {
  const header = req.headers.authorization ?? "";
  const headerToken = header.startsWith("Bearer ") ? header.slice(7) : null;
  const token = headerToken ?? req.query.t ?? null;
  if (!token) return res.status(401).json({ error: "Missing token" });
  const payload = verifyToken(token);
  if (!payload) return res.status(401).json({ error: "Invalid or expired token" });
  req.user = payload;
  next();
}

// Las rutas /:id/file usan requireAuthOrToken; el resto usa requireAuth normal.
// Aplicamos por ruta porque la mayoría requiere headers estrictos.
router.use((req, res, next) => {
  if (req.path.endsWith("/file") || req.path.match(/^\/[^/]+\/file$/)) {
    return requireAuthOrToken(req, res, next);
  }
  return requireAuth(req, res, next);
});

// ─── Almacenamiento en disco ────────────────────────────────────────────────
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DOCS_DIR = path.join(__dirname, "..", "..", "uploads", "documents");
const ASSETS_DIR = path.join(__dirname, "..", "..", "uploads", "assets");

function makeDiskStorage(rootDir) {
  return multer.diskStorage({
    destination: (req, _file, cb) => {
      const dir = path.join(rootDir, String(req.user.workspace_id));
      fs.mkdirSync(dir, { recursive: true });
      cb(null, dir);
    },
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      const id = crypto.randomBytes(6).toString("hex");
      cb(null, `${Date.now()}-${id}${ext}`);
    },
  });
}

// Validamos por extensión + mime para mayor robustez. Algunos browsers envían
// mimes inconsistentes (ej Word desde Windows = application/octet-stream), así
// que el .ext es la fuente de verdad principal.
// Aceptamos .doc legacy en uploads pero NO se intenta parsear (mammoth no lo
// soporta, requiere LibreOffice headless). Se guarda como archivo binario y la
// UI muestra "Vista previa no disponible · convierte a .docx para editar".
const ALLOWED_EXTS = /\.(pdf|docx?|jpe?g|png|webp|gif|txt)$/i;
const IMG_EXTS = /\.(jpe?g|png|webp|gif)$/i;
const DOCX_EXTS = /\.docx$/i;
const DOC_LEGACY_EXTS = /\.doc$/i;

// Documents: PDFs, DOCX, imágenes adjuntas, txt.
const upload = multer({
  storage: makeDiskStorage(DOCS_DIR),
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_EXTS.test(file.originalname)) {
      return cb(new Error("Tipo de archivo no permitido. Acepta: PDF, DOC, DOCX, JPG, PNG, WEBP, GIF, TXT."));
    }
    cb(null, true);
  },
});

// Solo Word para plantillas y "Subir Word para edición".
const uploadDocx = multer({
  storage: makeDiskStorage(DOCS_DIR),
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!DOCX_EXTS.test(file.originalname)) {
      return cb(new Error("Solo se permite .docx (Microsoft Word moderno). Si tu archivo es .doc, ábrelo en Word y guárdalo como .docx."));
    }
    cb(null, true);
  },
});

// Assets inline del editor: imágenes Y adjuntos (PDF/DOCX/etc).
const ASSET_EXTS = /\.(jpe?g|png|webp|gif|pdf|docx?|xlsx?|pptx?|txt|csv|zip)$/i;
const uploadAsset = multer({
  storage: makeDiskStorage(ASSETS_DIR),
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!ASSET_EXTS.test(file.originalname)) {
      return cb(new Error("Tipo no permitido. Acepta: imagen, PDF, Word, Excel, PowerPoint, TXT, CSV, ZIP."));
    }
    cb(null, true);
  },
});

/**
 * Convierte un .docx a TipTap doc state usando mammoth.
 * Mammoth genera HTML semántico; lo parseamos a una estructura TipTap simple.
 * Pierde formato visual avanzado (columnas, tablas complejas, fuentes custom)
 * pero conserva: encabezados H1-H3, párrafos, negrita/cursiva/subrayado,
 * listas con viñetas, listas numeradas, tablas básicas, imágenes (omitidas
 * en esta versión).
 */
async function docxToTipTap(buffer) {
  const result = await mammoth.convertToHtml(
    { buffer },
    {
      styleMap: [
        "p[style-name='Heading 1'] => h1",
        "p[style-name='Heading 2'] => h2",
        "p[style-name='Heading 3'] => h3",
        "p[style-name='Title'] => h1",
        "b => strong",
        "i => em",
      ],
      ignoreEmptyParagraphs: false,
      // Omitimos imágenes embebidas (el flujo de imágenes va por assets inline)
      convertImage: mammoth.images.imgElement(() => Promise.resolve({ src: "" })),
    }
  );
  const html = result.value;
  return htmlToTipTap(html);
}

/** HTML → TipTap doc state (parser simple, no DOM). */
function htmlToTipTap(html) {
  // Sanitizar básico
  let h = html.replace(/<style[\s\S]*?<\/style>/gi, "").replace(/<script[\s\S]*?<\/script>/gi, "");
  // Decodificar entidades comunes
  const decode = (s) => s
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));

  // Tokenizar bloques top-level
  const blocks = [];
  const blockRegex = /<(h1|h2|h3|h4|p|ul|ol|table|hr|blockquote)([^>]*)>([\s\S]*?)<\/\1>|<(hr|br)\s*\/?>/gi;
  let m;
  while ((m = blockRegex.exec(h)) !== null) {
    const tag = (m[1] || m[4]).toLowerCase();
    const inner = m[3] ?? "";
    if (tag === "h1" || tag === "h2" || tag === "h3" || tag === "h4") {
      const level = Math.min(parseInt(tag.slice(1), 10), 3);
      blocks.push({ type: "heading", attrs: { level }, content: parseInline(inner, decode) });
    } else if (tag === "p") {
      const content = parseInline(inner, decode);
      blocks.push(content.length === 0 ? { type: "paragraph" } : { type: "paragraph", content });
    } else if (tag === "ul") {
      blocks.push({ type: "bulletList", content: parseListItems(inner, decode) });
    } else if (tag === "ol") {
      blocks.push({ type: "orderedList", content: parseListItems(inner, decode) });
    } else if (tag === "blockquote") {
      blocks.push({ type: "blockquote", content: [{ type: "paragraph", content: parseInline(inner, decode) }] });
    } else if (tag === "hr") {
      blocks.push({ type: "horizontalRule" });
    } else if (tag === "table") {
      const rows = parseTableRows(inner, decode);
      if (rows.length > 0) blocks.push({ type: "table", content: rows });
    }
  }
  return { type: "doc", content: blocks.length > 0 ? blocks : [{ type: "paragraph" }] };
}

function parseListItems(html, decode) {
  const items = [];
  const r = /<li([^>]*)>([\s\S]*?)<\/li>/gi;
  let m;
  while ((m = r.exec(html)) !== null) {
    const content = parseInline(m[2], decode);
    items.push({
      type: "listItem",
      content: [{ type: "paragraph", content: content.length > 0 ? content : [] }],
    });
  }
  return items;
}

function parseTableRows(html, decode) {
  const rows = [];
  const r = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let m;
  while ((m = r.exec(html)) !== null) {
    const cells = [];
    const cr = /<(td|th)[^>]*>([\s\S]*?)<\/\1>/gi;
    let cm;
    while ((cm = cr.exec(m[1])) !== null) {
      const isHeader = cm[1].toLowerCase() === "th";
      cells.push({
        type: isHeader ? "tableHeader" : "tableCell",
        attrs: { colspan: 1, rowspan: 1, colwidth: null },
        content: [{ type: "paragraph", content: parseInline(cm[2], decode) }],
      });
    }
    if (cells.length > 0) rows.push({ type: "tableRow", content: cells });
  }
  return rows;
}

function parseInline(html, decode) {
  // Estrategia: parser muy simple: convierto cada segmento de texto a node
  // {type:'text', text, marks: [...]} con marcas según las tags que lo envuelvan.
  // Soporta strong, em, u, s, a (link), code.
  const out = [];
  const len = html.length;
  let i = 0;
  const stack = []; // marcas activas
  const buf = [];
  const flush = () => {
    if (buf.length === 0) return;
    const text = decode(buf.join(""));
    if (text.length === 0) { buf.length = 0; return; }
    const marks = stack.map((m) => ({ type: m.type, attrs: m.attrs }));
    out.push(marks.length > 0 ? { type: "text", text, marks } : { type: "text", text });
    buf.length = 0;
  };
  while (i < len) {
    if (html[i] === "<") {
      const close = html.indexOf(">", i);
      if (close === -1) { buf.push(html.slice(i)); break; }
      const tagBody = html.slice(i + 1, close).trim();
      flush();
      if (tagBody.startsWith("/")) {
        // cierre
        stack.pop();
      } else if (/^br\s*\/?$/i.test(tagBody)) {
        out.push({ type: "hardBreak" });
      } else {
        const m = tagBody.match(/^([a-z0-9]+)(\s+(.*))?$/i);
        if (m) {
          const tag = m[1].toLowerCase();
          const attrs = m[3] ?? "";
          if (tag === "strong" || tag === "b") stack.push({ type: "bold" });
          else if (tag === "em" || tag === "i") stack.push({ type: "italic" });
          else if (tag === "u") stack.push({ type: "underline" });
          else if (tag === "s" || tag === "del" || tag === "strike") stack.push({ type: "strike" });
          else if (tag === "code") stack.push({ type: "code" });
          else if (tag === "a") {
            const hrefM = attrs.match(/href=["']?([^"'\s>]+)/i);
            stack.push({ type: "link", attrs: { href: hrefM ? hrefM[1] : "" } });
          } else {
            stack.push({ type: "_ignored", attrs: {} });
          }
        }
      }
      i = close + 1;
    } else {
      buf.push(html[i]);
      i++;
    }
  }
  flush();
  // Filtrar marks _ignored
  return out.map((n) => {
    if (n.marks) {
      const filtered = n.marks.filter((m) => m.type !== "_ignored");
      return filtered.length === 0 ? { type: n.type, text: n.text } : { ...n, marks: filtered };
    }
    return n;
  });
}

// ─── Helpers ────────────────────────────────────────────────────────────────
const now = () => new Date().toISOString();
const ws = (req) => req.user.workspace_id;
const newDocId = (wsId) => `D-${wsId}-${Date.now().toString(36)}-${crypto.randomBytes(2).toString("hex")}`;

function safeJSON(s) {
  if (!s) return null;
  try { return JSON.parse(s); } catch { return null; }
}

function rowToDoc(r) {
  if (!r) return null;
  return {
    ...r,
    body_json: safeJSON(r.body_json),
    // URL pública para imágenes (img tags no pueden mandar Authorization).
    // Solo se calcula para mime image/* — el resto debe pasar por /api/.../file.
    public_url: r.kind === "file" && r.mime?.startsWith("image/") && r.filename
      ? `/api/uploads/documents/${r.workspace_id}/${r.filename}`
      : null,
  };
}

/**
 * Resuelve el contexto de interpolación de variables en plantillas.
 * Soporta {{paciente.*}}, {{profesional.*}}, {{clinica.*}}, {{fecha.*}}.
 */
function buildInterpolationContext(workspaceId, patientId, professionalName) {
  const ws = db.prepare("SELECT * FROM workspaces WHERE id = ?").get(workspaceId);
  const settingsRows = db.prepare("SELECT key, value FROM settings WHERE workspace_id = ?").all(workspaceId);
  const settings = Object.fromEntries(settingsRows.map((s) => [s.key, s.value]));

  let patient = null;
  if (patientId) {
    patient = db.prepare("SELECT * FROM patients WHERE id = ? AND workspace_id = ?").get(patientId, workspaceId);
  }
  let prof = null;
  if (professionalName) {
    prof = db.prepare("SELECT * FROM professionals WHERE workspace_id = ? AND name = ?").get(workspaceId, professionalName);
  }
  if (!prof) {
    prof = db.prepare("SELECT * FROM professionals WHERE workspace_id = ? LIMIT 1").get(workspaceId);
  }

  const today = new Date();
  const longDate = today.toLocaleDateString("es-CO", { day: "numeric", month: "long", year: "numeric" });

  return {
    paciente: {
      nombre: patient?.name ?? "________________",
      documento: patient?.doc ?? "________________",
      edad: patient?.age != null ? String(patient.age) : "______",
      telefono: patient?.phone ?? "________________",
      email: patient?.email ?? "________________",
      modalidad: patient?.modality ?? "individual",
    },
    profesional: {
      nombre: prof?.name ?? "________________",
      tarjeta_profesional: prof?.title ?? "________________",
      email: prof?.email ?? "",
      telefono: prof?.phone ?? "",
      enfoque: prof?.approach ?? "",
    },
    clinica: {
      razon_social: ws?.name ?? "Psicomorfosis",
      direccion: settings.address ?? "",
      telefono: settings.phone ?? "",
      ciudad: settings.city ?? "",
      consultorio: settings.consultorio_name ?? "",
    },
    fecha: {
      hoy: today.toISOString().slice(0, 10),
      larga: longDate,
    },
    sesion: {
      fecha: today.toISOString().slice(0, 10),
    },
  };
}

/**
 * Recorre un documento TipTap y reemplaza placeholders {{ruta.dentro.del.contexto}}
 * en los nodes de tipo 'text'. No altera la estructura, solo el contenido.
 */
function interpolateDoc(node, ctx) {
  if (!node) return node;
  if (node.type === "text" && typeof node.text === "string") {
    return { ...node, text: node.text.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, key) => {
      const parts = key.split(".");
      let val = ctx;
      for (const p of parts) {
        if (val == null) return "";
        val = val[p];
      }
      return val == null ? "" : String(val);
    })};
  }
  if (Array.isArray(node.content)) {
    return { ...node, content: node.content.map((c) => interpolateDoc(c, ctx)) };
  }
  if (Array.isArray(node)) {
    return node.map((c) => interpolateDoc(c, ctx));
  }
  return node;
}

function extractText(node) {
  if (!node) return "";
  if (node.type === "text") return node.text ?? "";
  if (Array.isArray(node.content)) return node.content.map(extractText).join(" ");
  if (Array.isArray(node)) return node.map(extractText).join(" ");
  return "";
}

// ════════════════════════════════════════════════════════════════════════════
// PLANTILLAS — rutas literales antes que las dinámicas
// ════════════════════════════════════════════════════════════════════════════

router.get("/templates", (req, res) => {
  const { category } = req.query;
  let sql = `
    SELECT * FROM document_templates
    WHERE archived = 0 AND (workspace_id IS NULL OR workspace_id = ?)
  `;
  const args = [ws(req)];
  if (category) { sql += " AND category = ?"; args.push(category); }
  sql += " ORDER BY scope = 'system' DESC, uses_count DESC, name ASC";
  const rows = db.prepare(sql).all(...args).map((t) => ({
    ...t,
    body_json: safeJSON(t.body_json),
    archived: !!t.archived,
  }));
  res.json(rows);
});

router.get("/templates/:id", (req, res) => {
  const row = db.prepare(`
    SELECT * FROM document_templates
    WHERE id = ? AND (workspace_id IS NULL OR workspace_id = ?)
  `).get(req.params.id, ws(req));
  if (!row) return res.status(404).json({ error: "Plantilla no encontrada" });
  res.json({ ...row, body_json: safeJSON(row.body_json), archived: !!row.archived });
});

router.post("/templates", (req, res) => {
  const { name, description, category, body_json, scope } = req.body ?? {};
  if (!name || !body_json) return res.status(400).json({ error: "name y body_json requeridos" });
  const ins = db.prepare(`
    INSERT INTO document_templates (workspace_id, name, description, category, scope, body_json, body_text, created_by_user_id, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    ws(req), name, description ?? null, category ?? "otro",
    scope === "personal" ? "personal" : "workspace",
    JSON.stringify(body_json), extractText(body_json),
    req.user.id, now(), now()
  );
  const row = db.prepare("SELECT * FROM document_templates WHERE id = ?").get(ins.lastInsertRowid);
  res.status(201).json({ ...row, body_json: safeJSON(row.body_json), archived: !!row.archived });
});

/**
 * Clona una plantilla del sistema al workspace. Útil para personalizar:
 * cambiar el nombre del profesional, ajustar texto legal, etc., sin tocar
 * la del sistema (que sirve de base para todos los workspaces).
 */
router.post("/templates/:id/clone", (req, res) => {
  const orig = db.prepare(`
    SELECT * FROM document_templates
    WHERE id = ? AND (workspace_id IS NULL OR workspace_id = ?)
  `).get(req.params.id, ws(req));
  if (!orig) return res.status(404).json({ error: "Plantilla no encontrada" });
  const ins = db.prepare(`
    INSERT INTO document_templates (workspace_id, name, description, category, scope, body_json, body_text, legal_disclaimer, created_by_user_id, created_at, updated_at)
    VALUES (?, ?, ?, ?, 'workspace', ?, ?, ?, ?, ?, ?)
  `).run(
    ws(req),
    orig.name + (orig.scope === "system" ? " (personalizada)" : " (copia)"),
    orig.description, orig.category,
    orig.body_json, orig.body_text, orig.legal_disclaimer,
    req.user.id, now(), now()
  );
  const row = db.prepare("SELECT * FROM document_templates WHERE id = ?").get(ins.lastInsertRowid);
  res.status(201).json({ ...row, body_json: safeJSON(row.body_json), archived: !!row.archived });
});

/**
 * Crea una plantilla nueva desde un .docx. Solo Word permitido.
 * El archivo se conserva en disco para descarga futura, y body_json se rellena
 * convirtiendo el texto vía mammoth.
 */
router.post("/templates/from-docx", uploadDocx.single("file"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "Archivo .docx requerido" });
  const { name, description, category } = req.body ?? {};
  const finalName = name || req.file.originalname.replace(/\.[^.]+$/, "");
  try {
    const buf = fs.readFileSync(path.join(DOCS_DIR, String(ws(req)), req.file.filename));
    const doc = await docxToTipTap(buf);
    const text = extractText(doc);
    const ins = db.prepare(`
      INSERT INTO document_templates (workspace_id, name, description, category, scope, body_json, body_text, created_by_user_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, 'workspace', ?, ?, ?, ?, ?)
    `).run(
      ws(req), finalName, description ?? null, category ?? "otro",
      JSON.stringify(doc), text, req.user.id, now(), now()
    );
    const row = db.prepare("SELECT * FROM document_templates WHERE id = ?").get(ins.lastInsertRowid);
    res.status(201).json({ ...row, body_json: safeJSON(row.body_json), archived: !!row.archived });
  } catch (err) {
    console.error("[templates/from-docx] parse failed:", err);
    res.status(400).json({ error: "No se pudo leer el archivo .docx. Verifica que esté en formato Word moderno." });
  }
});

router.patch("/templates/:id", (req, res) => {
  // Permite editar plantillas del workspace. Si es del sistema, devolvemos
  // un hint para que el frontend la clone primero.
  const t = db.prepare("SELECT * FROM document_templates WHERE id = ? AND workspace_id = ?").get(req.params.id, ws(req));
  if (!t) {
    const sys = db.prepare("SELECT id FROM document_templates WHERE id = ? AND workspace_id IS NULL").get(req.params.id);
    if (sys) return res.status(409).json({ error: "Plantilla del sistema. Clónala primero (POST /templates/:id/clone) para personalizarla.", needs_clone: true });
    return res.status(404).json({ error: "Plantilla no encontrada" });
  }

  const fields = [];
  const params = [];
  if (req.body.name !== undefined) { fields.push("name = ?"); params.push(req.body.name); }
  if (req.body.description !== undefined) { fields.push("description = ?"); params.push(req.body.description); }
  if (req.body.category !== undefined) { fields.push("category = ?"); params.push(req.body.category); }
  if (req.body.body_json !== undefined) {
    fields.push("body_json = ?"); params.push(JSON.stringify(req.body.body_json));
    fields.push("body_text = ?"); params.push(extractText(req.body.body_json));
  }
  if (fields.length === 0) return res.json({ ...t, body_json: safeJSON(t.body_json), archived: !!t.archived });
  fields.push("updated_at = ?"); params.push(now());
  params.push(req.params.id);
  db.prepare(`UPDATE document_templates SET ${fields.join(", ")} WHERE id = ?`).run(...params);
  const row = db.prepare("SELECT * FROM document_templates WHERE id = ?").get(req.params.id);
  res.json({ ...row, body_json: safeJSON(row.body_json), archived: !!row.archived });
});

router.delete("/templates/:id", (req, res) => {
  const r = db.prepare("DELETE FROM document_templates WHERE id = ? AND workspace_id = ?").run(req.params.id, ws(req));
  if (r.changes === 0) return res.status(404).json({ error: "No se puede borrar (plantilla del sistema o no existe)" });
  res.json({ ok: true });
});

// ════════════════════════════════════════════════════════════════════════════
// UPLOAD de archivo físico
// ════════════════════════════════════════════════════════════════════════════

router.post("/upload", upload.single("file"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "Archivo requerido" });
  const { patient_id, patient_name, type } = req.body ?? {};
  const id = newDocId(ws(req));
  const baseName = req.body.name || req.file.originalname.replace(/\.[^.]+$/, "");
  const isDocx = /\.docx$/i.test(req.file.originalname) ||
    req.file.mimetype === "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

  // Si es Word: convertir a TipTap doc state y guardar como kind=editor.
  // El archivo .docx original se conserva en disco (filename) por si se quiere descargar.
  if (isDocx) {
    try {
      const buf = fs.readFileSync(path.join(DOCS_DIR, String(ws(req)), req.file.filename));
      const doc = await docxToTipTap(buf);
      const text = extractText(doc);
      db.prepare(`
        INSERT INTO documents (
          id, workspace_id, name, type, kind,
          patient_id, patient_name,
          body_json, body_text,
          filename, original_name, mime, size_bytes, size_kb,
          status, professional, created_at, updated_at
        ) VALUES (?, ?, ?, ?, 'editor', ?, ?, ?, ?, ?, ?, ?, ?, ?, 'borrador', ?, ?, ?)
      `).run(
        id, ws(req), baseName, type ?? "informe",
        patient_id || null, patient_name || null,
        JSON.stringify(doc), text,
        req.file.filename, req.file.originalname, req.file.mimetype, req.file.size,
        Math.round(req.file.size / 1024),
        req.user.name ?? "",
        now(), now()
      );
    } catch (err) {
      console.warn("[documents] docx parse failed, falling back to file:", err.message);
      // fallback a kind=file
      db.prepare(`
        INSERT INTO documents (id, workspace_id, name, type, kind, patient_id, patient_name, filename, original_name, mime, size_bytes, size_kb, status, professional, created_at, updated_at)
        VALUES (?, ?, ?, ?, 'file', ?, ?, ?, ?, ?, ?, ?, 'firmado', ?, ?, ?)
      `).run(id, ws(req), baseName, type ?? "otro", patient_id || null, patient_name || null,
             req.file.filename, req.file.originalname, req.file.mimetype, req.file.size,
             Math.round(req.file.size / 1024), req.user.name ?? "", now(), now());
    }
  } else {
    db.prepare(`
      INSERT INTO documents (
        id, workspace_id, name, type, kind,
        patient_id, patient_name,
        filename, original_name, mime, size_bytes, size_kb,
        status, professional, created_at, updated_at
      ) VALUES (?, ?, ?, ?, 'file', ?, ?, ?, ?, ?, ?, ?, 'firmado', ?, ?, ?)
    `).run(
      id, ws(req), baseName, type ?? "otro",
      patient_id || null, patient_name || null,
      req.file.filename, req.file.originalname, req.file.mimetype, req.file.size,
      Math.round(req.file.size / 1024),
      req.user.name ?? "",
      now(), now()
    );
  }

  const row = db.prepare("SELECT * FROM documents WHERE id = ?").get(id);
  req.app.get("io")?.to(`ws-${ws(req)}`).emit("document:created", rowToDoc(row));
  res.status(201).json(rowToDoc(row));
});

// ─── Assets inline (imágenes del editor) ────────────────────────────────────
// Separados de Documents para que no contaminen la lista principal.
router.post("/assets", uploadAsset.single("file"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "Imagen requerida" });
  const { document_id } = req.body ?? {};
  const ins = db.prepare(`
    INSERT INTO document_assets (workspace_id, document_id, filename, original_name, mime, size_bytes, uploaded_by_user_id, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    ws(req), document_id || null,
    req.file.filename, req.file.originalname, req.file.mimetype, req.file.size,
    req.user.id, now()
  );
  res.status(201).json({
    id: ins.lastInsertRowid,
    public_url: `/api/uploads/assets/${ws(req)}/${req.file.filename}`,
    mime: req.file.mimetype,
    size_bytes: req.file.size,
  });
});

// Servir archivo con autenticación. content-disposition inline para preview,
// ?download=1 fuerza descarga con nombre legible.
router.get("/:id/file", (req, res) => {
  const d = db.prepare("SELECT * FROM documents WHERE id = ? AND workspace_id = ?").get(req.params.id, ws(req));
  if (!d) return res.status(404).json({ error: "Documento no encontrado" });
  if (d.kind !== "file" || !d.filename) return res.status(400).json({ error: "Este documento no tiene archivo asociado" });
  const filePath = path.join(DOCS_DIR, String(d.workspace_id), d.filename);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: "Archivo no encontrado en disco" });
  const niceName = `${(d.name || "documento").replace(/[^\w\-. ]/g, "_")}${path.extname(d.original_name || d.filename)}`;
  res.setHeader("Content-Type", d.mime || "application/octet-stream");
  res.setHeader("Content-Disposition", `${req.query.download ? "attachment" : "inline"}; filename="${niceName}"`);
  fs.createReadStream(filePath).pipe(res);
});

// ════════════════════════════════════════════════════════════════════════════
// Documentos: listado + CRUD
// ════════════════════════════════════════════════════════════════════════════

router.get("/", (req, res) => {
  const { patient_id, type, status, q, include_archived } = req.query;
  let sql = "SELECT * FROM documents WHERE workspace_id = ?";
  const args = [ws(req)];
  if (!include_archived || include_archived === "false") {
    sql += " AND archived_at IS NULL";
  }
  if (patient_id) { sql += " AND patient_id = ?"; args.push(patient_id); }
  if (type)       { sql += " AND type = ?";       args.push(type); }
  if (status)     { sql += " AND status = ?";     args.push(status); }
  if (q)          { sql += " AND (name LIKE ? OR patient_name LIKE ? OR body_text LIKE ?)"; args.push(`%${q}%`, `%${q}%`, `%${q}%`); }
  sql += " ORDER BY updated_at DESC";
  res.json(db.prepare(sql).all(...args).map(rowToDoc));
});

router.get("/:id", (req, res) => {
  const d = db.prepare("SELECT * FROM documents WHERE id = ? AND workspace_id = ?").get(req.params.id, ws(req));
  if (!d) return res.status(404).json({ error: "Documento no encontrado" });
  res.json(rowToDoc(d));
});

/**
 * Crear documento in-app (kind='editor').
 * - Si template_id viene: clona el body de la plantilla y lo interpola con el paciente.
 * - Si body_json viene: lo usa tal cual.
 * - Si nada: crea un body vacío.
 */
router.post("/", (req, res) => {
  const { name, type, patient_id, patient_name, template_id, body_json } = req.body ?? {};
  if (!name) return res.status(400).json({ error: "name requerido" });

  let finalBody = body_json ?? { type: "doc", content: [{ type: "paragraph" }] };
  let resolvedType = type ?? "informe";
  let resolvedTemplateId = null;

  if (template_id) {
    const tpl = db.prepare(`
      SELECT * FROM document_templates
      WHERE id = ? AND archived = 0 AND (workspace_id IS NULL OR workspace_id = ?)
    `).get(template_id, ws(req));
    if (!tpl) return res.status(404).json({ error: "Plantilla no encontrada" });
    const tplBody = safeJSON(tpl.body_json);
    if (tplBody) {
      const ctx = buildInterpolationContext(ws(req), patient_id, req.user.name);
      finalBody = interpolateDoc(tplBody, ctx);
    }
    resolvedType = tpl.category || resolvedType;
    resolvedTemplateId = tpl.id;
    db.prepare("UPDATE document_templates SET uses_count = uses_count + 1 WHERE id = ?").run(tpl.id);
  }

  const id = newDocId(ws(req));
  const text = extractText(finalBody);
  db.prepare(`
    INSERT INTO documents (
      id, workspace_id, name, type, kind,
      patient_id, patient_name,
      body_json, body_text, template_id,
      status, professional, created_at, updated_at
    ) VALUES (?, ?, ?, ?, 'editor', ?, ?, ?, ?, ?, 'borrador', ?, ?, ?)
  `).run(
    id, ws(req), name, resolvedType,
    patient_id ?? null, patient_name ?? null,
    JSON.stringify(finalBody), text, resolvedTemplateId,
    req.user.name ?? "",
    now(), now()
  );
  const row = db.prepare("SELECT * FROM documents WHERE id = ?").get(id);
  req.app.get("io")?.to(`ws-${ws(req)}`).emit("document:created", rowToDoc(row));
  res.status(201).json(rowToDoc(row));
});

/**
 * Editar metadata del documento o body. Si está firmado, solo se permite cambiar
 * status='archivado' para sacarlo de la vista activa.
 */
router.patch("/:id", (req, res) => {
  const d = db.prepare("SELECT * FROM documents WHERE id = ? AND workspace_id = ?").get(req.params.id, ws(req));
  if (!d) return res.status(404).json({ error: "Documento no encontrado" });

  // Si está firmado, no se puede cambiar nada salvo archivar (a través de /archive)
  if (d.signed_at && (req.body.body_json !== undefined || req.body.name !== undefined || req.body.type !== undefined)) {
    return res.status(409).json({ error: "Documento firmado: no se puede modificar. Use 'Crear nueva versión'." });
  }

  const fields = [];
  const params = [];
  for (const k of ["name", "type", "patient_id", "patient_name", "status"]) {
    if (req.body[k] !== undefined) { fields.push(`${k} = ?`); params.push(req.body[k]); }
  }
  if (req.body.body_json !== undefined) {
    fields.push("body_json = ?"); params.push(JSON.stringify(req.body.body_json));
    fields.push("body_text = ?"); params.push(extractText(req.body.body_json));
  }
  if (fields.length === 0) return res.json(rowToDoc(d));
  fields.push("updated_at = ?"); params.push(now());
  params.push(req.params.id);

  db.prepare(`UPDATE documents SET ${fields.join(", ")} WHERE id = ?`).run(...params);
  const row = db.prepare("SELECT * FROM documents WHERE id = ?").get(req.params.id);
  req.app.get("io")?.to(`ws-${ws(req)}`).emit("document:updated", rowToDoc(row));
  res.json(rowToDoc(row));
});

router.post("/:id/sign", (req, res) => {
  const d = db.prepare("SELECT * FROM documents WHERE id = ? AND workspace_id = ?").get(req.params.id, ws(req));
  if (!d) return res.status(404).json({ error: "Documento no encontrado" });
  if (d.signed_at) return res.status(409).json({ error: "Documento ya firmado" });
  const signedAt = now();
  db.prepare(`
    UPDATE documents SET signed_at = ?, signed_by_user_id = ?, status = 'firmado', updated_at = ?
    WHERE id = ?
  `).run(signedAt, req.user.id, signedAt, req.params.id);
  const row = db.prepare("SELECT * FROM documents WHERE id = ?").get(req.params.id);
  req.app.get("io")?.to(`ws-${ws(req)}`).emit("document:signed", rowToDoc(row));
  res.json(rowToDoc(row));
});

router.post("/:id/archive", (req, res) => {
  const d = db.prepare("SELECT * FROM documents WHERE id = ? AND workspace_id = ?").get(req.params.id, ws(req));
  if (!d) return res.status(404).json({ error: "Documento no encontrado" });
  db.prepare("UPDATE documents SET archived_at = ?, updated_at = ? WHERE id = ?").run(now(), now(), req.params.id);
  res.json({ ok: true });
});

router.post("/:id/restore", (req, res) => {
  const d = db.prepare("SELECT * FROM documents WHERE id = ? AND workspace_id = ?").get(req.params.id, ws(req));
  if (!d) return res.status(404).json({ error: "Documento no encontrado" });
  db.prepare("UPDATE documents SET archived_at = NULL, updated_at = ? WHERE id = ?").run(now(), req.params.id);
  const row = db.prepare("SELECT * FROM documents WHERE id = ?").get(req.params.id);
  res.json(rowToDoc(row));
});

router.delete("/:id", (req, res) => {
  const d = db.prepare("SELECT * FROM documents WHERE id = ? AND workspace_id = ?").get(req.params.id, ws(req));
  if (!d) return res.status(404).json({ error: "Documento no encontrado" });
  // Si tiene archivo físico, lo borramos también
  if (d.kind === "file" && d.filename) {
    const filePath = path.join(DOCS_DIR, String(d.workspace_id), d.filename);
    fs.promises.unlink(filePath).catch(() => null);
  }
  db.prepare("DELETE FROM documents WHERE id = ?").run(req.params.id);
  req.app.get("io")?.to(`ws-${ws(req)}`).emit("document:deleted", { id: req.params.id });
  res.json({ ok: true });
});

export default router;
