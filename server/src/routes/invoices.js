/**
 * Recibos (lo llamamos "invoices" internamente por compatibilidad de schema,
 * pero la UI los presenta como recibos — la app no emite facturas DIAN aún).
 *
 * Schema relevante:
 *   id, workspace_id, patient_id, patient_name, professional, concept, amount,
 *   method, status ('pendiente'|'pagada'|'vencida'|'borrador'), date,
 *   bank, eps, payment_reference, payment_notes, paid_at, created_at
 */
import { Router } from "express";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import PdfPrinter from "pdfmake";
import { db } from "../db.js";
import { requireAuth } from "../auth.js";
import { buildReceiptDoc } from "../lib/receiptTemplates.js";
import { buildCertificateDoc } from "../lib/certificateTemplate.js";

const router = Router();
router.use(requireAuth);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FONTS_DIR = path.join(__dirname, "..", "..", "fonts");
const LOGOS_DIR = path.join(__dirname, "..", "..", "uploads", "logos");
const printer = new PdfPrinter({
  Roboto: {
    normal:      path.join(FONTS_DIR, "Roboto-Regular.ttf"),
    bold:        path.join(FONTS_DIR, "Roboto-Medium.ttf"),
    italics:     path.join(FONTS_DIR, "Roboto-Italic.ttf"),
    bolditalics: path.join(FONTS_DIR, "Roboto-MediumItalic.ttf"),
  },
});

/** Si hay logo subido, devuelve el path en disk; si no, null. */
function findLogoPath(workspaceId) {
  for (const ext of ["png", "jpg", "webp"]) {
    const p = path.join(LOGOS_DIR, `${workspaceId}.${ext}`);
    if (fs.existsSync(p)) return p;
  }
  // SVG no es soportado por pdfmake nativo, lo ignoramos
  return null;
}

function rowToInvoice(r) {
  if (!r) return null;
  return {
    id: r.id,
    patient_id: r.patient_id,
    patient_name: r.patient_name,
    professional: r.professional,
    concept: r.concept,
    amount: r.amount,
    method: r.method,
    status: r.status,
    date: r.date,
    modality: r.modality ?? null,
    bank: r.bank ?? null,
    eps: r.eps ?? null,
    payment_reference: r.payment_reference ?? null,
    payment_notes: r.payment_notes ?? null,
    paid_at: r.paid_at ?? null,
    created_at: r.created_at ?? null,
  };
}

function nextReceiptId(workspaceId) {
  const year = new Date().getFullYear();
  const prefix = `R-${year}-`;
  const last = db.prepare(`
    SELECT id FROM invoices
    WHERE workspace_id = ? AND id LIKE ?
    ORDER BY id DESC LIMIT 1
  `).get(workspaceId, `${prefix}%`);
  let n = 1;
  if (last) {
    const m = last.id.match(/-(\d+)$/);
    if (m) n = parseInt(m[1], 10) + 1;
  }
  return `${prefix}${String(n).padStart(4, "0")}`;
}

router.get("/", (req, res) => {
  const { status, q, patient_id } = req.query;
  let sql = "SELECT * FROM invoices WHERE workspace_id = ?";
  const args = [req.user.workspace_id];
  if (status) { sql += " AND status = ?"; args.push(status); }
  if (patient_id) { sql += " AND patient_id = ?"; args.push(patient_id); }
  if (q) { sql += " AND (patient_name LIKE ? OR concept LIKE ? OR id LIKE ?)"; args.push(`%${q}%`, `%${q}%`, `%${q}%`); }
  sql += " ORDER BY date DESC, id DESC";
  res.json(db.prepare(sql).all(...args).map(rowToInvoice));
});

// Reporte rápido — debe ir ANTES de /:id para que no lo intercepte
router.get("/summary", (req, res) => {
  const ws = req.user.workspace_id;
  const row = db.prepare(`
    SELECT
      COALESCE(SUM(CASE WHEN status = 'pagada'    THEN amount END), 0) AS paid,
      COALESCE(SUM(CASE WHEN status = 'pendiente' THEN amount END), 0) AS pending,
      COALESCE(SUM(CASE WHEN status = 'vencida'   THEN amount END), 0) AS overdue,
      COUNT(*) AS total
    FROM invoices WHERE workspace_id = ?
  `).get(ws);
  res.json(row);
});

router.get("/:id", (req, res) => {
  const r = db.prepare("SELECT * FROM invoices WHERE id = ? AND workspace_id = ?")
    .get(req.params.id, req.user.workspace_id);
  if (!r) return res.status(404).json({ error: "Recibo no encontrado" });
  res.json(rowToInvoice(r));
});

router.post("/", (req, res) => {
  const i = req.body ?? {};
  const id = i.id ?? nextReceiptId(req.user.workspace_id);
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO invoices (
      id, workspace_id, patient_id, patient_name, professional, concept, amount,
      method, status, date, modality, bank, eps, payment_reference, payment_notes, paid_at, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id, req.user.workspace_id,
    i.patient_id ?? i.patientId ?? null,
    i.patient_name ?? i.patientName ?? "",
    i.professional ?? req.user.name ?? "",
    i.concept ?? "Sesión",
    Math.max(0, Math.round(Number(i.amount ?? 0))),
    i.method ?? "Efectivo",
    i.status ?? "pendiente",
    i.date ?? new Date().toISOString().slice(0, 10),
    i.modality ?? null,
    i.bank ?? null,
    i.eps ?? null,
    i.payment_reference ?? null,
    i.payment_notes ?? null,
    i.status === "pagada" ? (i.paid_at ?? now) : null,
    now,
  );
  const row = db.prepare("SELECT * FROM invoices WHERE id = ?").get(id);
  res.status(201).json(rowToInvoice(row));
});

router.patch("/:id", (req, res) => {
  const existing = db.prepare("SELECT * FROM invoices WHERE id = ? AND workspace_id = ?")
    .get(req.params.id, req.user.workspace_id);
  if (!existing) return res.status(404).json({ error: "Recibo no encontrado" });
  const b = req.body ?? {};
  const m = {
    patient_id: b.patient_id !== undefined ? (b.patient_id || null) : existing.patient_id,
    patient_name: b.patient_name !== undefined ? (b.patient_name || "") : existing.patient_name,
    concept: b.concept ?? existing.concept,
    amount: b.amount !== undefined ? Math.max(0, Math.round(Number(b.amount))) : existing.amount,
    method: b.method ?? existing.method,
    status: b.status ?? existing.status,
    date: b.date ?? existing.date,
    modality: b.modality !== undefined ? (b.modality || null) : existing.modality,
    bank: b.bank !== undefined ? (b.bank || null) : existing.bank,
    eps: b.eps !== undefined ? (b.eps || null) : existing.eps,
    payment_reference: b.payment_reference !== undefined ? (b.payment_reference || null) : existing.payment_reference,
    payment_notes: b.payment_notes !== undefined ? (b.payment_notes || null) : existing.payment_notes,
  };
  // paid_at: si pasa a pagada y no tenía paid_at, ponerle uno
  let paidAt = existing.paid_at;
  if (m.status === "pagada" && !paidAt) paidAt = b.paid_at ?? new Date().toISOString();
  if (m.status !== "pagada") paidAt = null;

  db.prepare(`
    UPDATE invoices SET
      patient_id=?, patient_name=?, concept=?, amount=?, method=?, status=?, date=?,
      modality=?, bank=?, eps=?, payment_reference=?, payment_notes=?, paid_at=?
    WHERE id=? AND workspace_id=?
  `).run(
    m.patient_id, m.patient_name, m.concept, m.amount, m.method, m.status, m.date,
    m.modality, m.bank, m.eps, m.payment_reference, m.payment_notes, paidAt,
    req.params.id, req.user.workspace_id,
  );
  const row = db.prepare("SELECT * FROM invoices WHERE id = ?").get(req.params.id);
  res.json(rowToInvoice(row));
});

router.delete("/:id", (req, res) => {
  const r = db.prepare("DELETE FROM invoices WHERE id = ? AND workspace_id = ?")
    .run(req.params.id, req.user.workspace_id);
  if (r.changes === 0) return res.status(404).json({ error: "Recibo no encontrado" });
  res.status(204).end();
});

/**
 * GET /api/invoices/preview-pdf
 * Query: template, show_logo, show_name, orientation
 * Genera un PDF de muestra con datos placeholder usando los settings
 * pasados por query (sin persistir nada). Sirve para que el psicólogo vea
 * cómo quedará un recibo con la configuración nueva ANTES de guardarla.
 * El logo y el nombre vienen del workspace real, así que el preview se
 * siente personal.
 */
router.get("/preview-pdf", (req, res) => {
  try {
    const ws = db.prepare("SELECT id, name, mode FROM workspaces WHERE id = ?").get(req.user.workspace_id);
    const settings = Object.fromEntries(
      db.prepare("SELECT key, value FROM settings WHERE workspace_id = ?").all(req.user.workspace_id)
        .map((s) => [s.key, s.value])
    );

    // Settings desde query (preview en vivo) sobreescriben los persistidos.
    // brand_color es opcional — el template lo deriva en paleta completa.
    const previewSettings = {
      ...settings,
      receipt_template: req.query.template || settings.receipt_template || "minimal",
      ...(req.query.brand_color ? { receipt_brand_color: req.query.brand_color } : {}),
    };
    const showLogo = req.query.show_logo !== undefined ? req.query.show_logo === "1" : settings.receipt_show_logo !== "0";
    const showName = req.query.show_name !== undefined ? req.query.show_name === "1" : settings.receipt_show_name !== "0";
    const orientation = req.query.orientation || settings.receipt_logo_orientation || "horizontal";
    const logoPath = showLogo ? findLogoPath(req.user.workspace_id) : null;
    const LOGO_SIZES = {
      horizontal: { width: 117, height: 36 },
      vertical:   { width: 49,  height: 73 },
      square:     { width: 57,  height: 57 },
    };
    const logoSize = LOGO_SIZES[orientation] ?? LOGO_SIZES.horizontal;

    // Profesional: el primero del workspace si existe, si no datos genéricos
    const prof = db.prepare("SELECT name, title, email, phone FROM professionals WHERE workspace_id = ? LIMIT 1")
      .get(req.user.workspace_id) ?? { name: "Profesional", title: "Psicología clínica" };

    // Datos de muestra del recibo
    const today = new Date().toISOString().slice(0, 10);
    const inv = {
      id: "R-2026-0001",
      patient_id: "PAC-MUESTRA",
      patient_name: "Paciente de Ejemplo",
      professional: prof.name,
      concept: "Sesión individual TCC · 50 min",
      amount: 180000,
      method: "Tarjeta",
      bank: null,
      eps: null,
      payment_reference: "TXN-MUESTRA-12345",
      payment_notes: null,
      status: "pagada",
      date: today,
      paid_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
    };

    const ctx = { inv, ws, prof, settings: previewSettings, showLogo, showName, logoPath, logoSize };
    const docDef = buildReceiptDoc(ctx);
    const stream = printer.createPdfKitDocument(docDef);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="recibo-muestra.pdf"`);
    stream.pipe(res);
    stream.end();
  } catch (e) {
    console.error("[invoices/preview-pdf]", e);
    res.status(500).json({ error: "No se pudo generar el preview: " + (e?.message ?? e) });
  }
});

/**
 * GET /api/invoices/certificate
 * Query: patient_id (req), from (YYYY-MM-DD, opcional), to (YYYY-MM-DD, opcional)
 *
 * Agrega los recibos pagados de un paciente en el rango y genera un PDF
 * "certificado de atención" — útil para EPS, declaración de renta, etc.
 *
 * Por defecto cubre el año en curso (1 ene → hoy).
 */
router.get("/certificate", (req, res) => {
  try {
    const patientId = req.query.patient_id;
    if (!patientId) return res.status(400).json({ error: "patient_id requerido" });

    const today = new Date();
    const yyyy = today.getFullYear();
    const from = String(req.query.from || `${yyyy}-01-01`);
    const to = String(req.query.to || today.toISOString().slice(0, 10));

    // Validación mínima de fechas (formato YYYY-MM-DD).
    if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
      return res.status(400).json({ error: "Fechas inválidas. Formato YYYY-MM-DD." });
    }

    const patient = db.prepare("SELECT * FROM patients WHERE id = ? AND workspace_id = ?")
      .get(patientId, req.user.workspace_id);
    if (!patient) return res.status(404).json({ error: "Paciente no encontrado" });

    const invoices = db.prepare(`
      SELECT * FROM invoices
      WHERE workspace_id = ? AND patient_id = ? AND status = 'pagada'
        AND date >= ? AND date <= ?
      ORDER BY date ASC
    `).all(req.user.workspace_id, patientId, from, to);

    if (invoices.length === 0) {
      return res.status(404).json({ error: "No hay recibos pagados de este paciente en el período seleccionado." });
    }

    const ws = db.prepare("SELECT id, name, mode FROM workspaces WHERE id = ?").get(req.user.workspace_id);
    const settings = Object.fromEntries(
      db.prepare("SELECT key, value FROM settings WHERE workspace_id = ?").all(req.user.workspace_id)
        .map((s) => [s.key, s.value])
    );
    // Profesional firmante: el primero que atendió en esos recibos, sino el primero del workspace.
    const firstProfName = invoices.find((i) => i.professional)?.professional;
    const prof = firstProfName
      ? db.prepare("SELECT name, title, email, phone FROM professionals WHERE workspace_id = ? AND name = ?")
          .get(req.user.workspace_id, firstProfName)
      : db.prepare("SELECT name, title, email, phone FROM professionals WHERE workspace_id = ? LIMIT 1")
          .get(req.user.workspace_id);

    const showLogo = settings.receipt_show_logo !== "0";
    const showName = settings.receipt_show_name !== "0";
    const orientation = settings.receipt_logo_orientation ?? "horizontal";
    const logoPath = showLogo ? findLogoPath(req.user.workspace_id) : null;
    const LOGO_SIZES = {
      horizontal: { width: 117, height: 36 },
      vertical:   { width: 49,  height: 73 },
      square:     { width: 57,  height: 57 },
    };
    const logoSize = LOGO_SIZES[orientation] ?? LOGO_SIZES.horizontal;

    const ctx = {
      invoices, patient, ws, prof, settings,
      showLogo, showName, logoPath, logoSize,
      range: { from, to },
      issuedAt: new Date(),
    };
    const docDef = buildCertificateDoc(ctx);
    const stream = printer.createPdfKitDocument(docDef);

    const safeName = (patient.name || "paciente").replace(/[^\w\s-]/g, "").trim().replace(/\s+/g, "_").slice(0, 60);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="certificado_${safeName}_${from}_${to}.pdf"`);
    stream.on("error", (err) => {
      console.error("[invoices/certificate stream error]", err);
      if (!res.headersSent) res.status(500).json({ error: "Error generando certificado: " + (err?.message ?? err) });
      else res.destroy(err);
    });
    stream.pipe(res);
    stream.end();
  } catch (e) {
    console.error("[invoices/certificate]", e);
    res.status(500).json({ error: "No se pudo generar el certificado: " + (e?.message ?? e) });
  }
});

/**
 * GET /api/invoices/:id/pdf
 * Genera el PDF del recibo (no es factura electrónica DIAN — solo
 * comprobante de pago profesional). Texto seleccionable, A4.
 */
router.get("/:id/pdf", (req, res) => {
  console.log(`[invoices/pdf] HIT id=${req.params.id} ws=${req.user.workspace_id}`);
  try {
    const inv = db.prepare("SELECT * FROM invoices WHERE id = ? AND workspace_id = ?")
      .get(req.params.id, req.user.workspace_id);
    if (!inv) {
      console.log(`[invoices/pdf] not found id=${req.params.id}`);
      return res.status(404).json({ error: "Recibo no encontrado" });
    }
    console.log(`[invoices/pdf] inv loaded, building doc...`);

    const ws = db.prepare("SELECT id, name, mode FROM workspaces WHERE id = ?").get(req.user.workspace_id);
    const settings = Object.fromEntries(
      db.prepare("SELECT key, value FROM settings WHERE workspace_id = ?").all(req.user.workspace_id)
        .map((s) => [s.key, s.value])
    );
    // Profesional vinculado al recibo (match por nombre dentro del workspace)
    const prof = inv.professional
      ? db.prepare("SELECT name, title, email, phone FROM professionals WHERE workspace_id = ? AND name = ?")
          .get(req.user.workspace_id, inv.professional)
      : null;

    // Personalización del recibo (si no hay setting, defaults razonables)
    const showLogo = settings.receipt_show_logo !== "0"; // default: mostrar
    const showName = settings.receipt_show_name !== "0"; // default: mostrar
    const orientation = settings.receipt_logo_orientation ?? "horizontal";
    const logoPath = showLogo ? findLogoPath(req.user.workspace_id) : null;
    // Tamaño del logo según orientación (en pt PDF; A4 width ~595pt)
    const LOGO_SIZES = {
      horizontal: { width: 117, height: 36 },
      vertical:   { width: 49,  height: 73 },
      square:     { width: 57,  height: 57 },
    };
    const logoSize = LOGO_SIZES[orientation] ?? LOGO_SIZES.horizontal;

    const ctx = { inv, ws, prof, settings, showLogo, showName, logoPath, logoSize };
    console.log(`[invoices/pdf] ctx ready, template=${settings.receipt_template ?? "minimal"} logoPath=${logoPath}`);
    const docDef = buildReceiptDoc(ctx);
    console.log(`[invoices/pdf] docDef built, creating stream...`);
    const stream = printer.createPdfKitDocument(docDef);
    console.log(`[invoices/pdf] stream created, piping...`);
    const safe = (inv.patient_name || "recibo").replace(/[^\w\s-]/g, "").trim().replace(/\s+/g, "_").slice(0, 60);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${inv.id}_${safe}.pdf"`);
    // Log explícito de errores del stream — si pdfmake/pdfkit emite error
    // async durante el streaming (logo corrupto, fuente faltante, etc.)
    // sin esto el proceso muere callado y el cliente ve ERR_CONNECTION_RESET.
    stream.on("error", (err) => {
      console.error("[invoices/pdf stream error]", err);
      if (!res.headersSent) {
        res.status(500).json({ error: "Error generando PDF: " + (err?.message ?? err) });
      } else {
        res.destroy(err);
      }
    });
    stream.pipe(res);
    stream.end();
  } catch (e) {
    console.error("[invoices/pdf]", e);
    res.status(500).json({ error: "No se pudo generar el PDF: " + (e?.message ?? e) });
  }
});

export default router;
