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
import { fileURLToPath } from "node:url";
import PdfPrinter from "pdfmake";
import { db } from "../db.js";
import { requireAuth } from "../auth.js";

const router = Router();
router.use(requireAuth);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FONTS_DIR = path.join(__dirname, "..", "..", "fonts");
const printer = new PdfPrinter({
  Roboto: {
    normal:      path.join(FONTS_DIR, "Roboto-Regular.ttf"),
    bold:        path.join(FONTS_DIR, "Roboto-Medium.ttf"),
    italics:     path.join(FONTS_DIR, "Roboto-Italic.ttf"),
    bolditalics: path.join(FONTS_DIR, "Roboto-MediumItalic.ttf"),
  },
});

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
      method, status, date, bank, eps, payment_reference, payment_notes, paid_at, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
      bank=?, eps=?, payment_reference=?, payment_notes=?, paid_at=?
    WHERE id=? AND workspace_id=?
  `).run(
    m.patient_id, m.patient_name, m.concept, m.amount, m.method, m.status, m.date,
    m.bank, m.eps, m.payment_reference, m.payment_notes, paidAt,
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
 * GET /api/invoices/:id/pdf
 * Genera el PDF del recibo (no es factura electrónica DIAN — solo
 * comprobante de pago profesional). Texto seleccionable, A4.
 */
router.get("/:id/pdf", (req, res) => {
  try {
    const inv = db.prepare("SELECT * FROM invoices WHERE id = ? AND workspace_id = ?")
      .get(req.params.id, req.user.workspace_id);
    if (!inv) return res.status(404).json({ error: "Recibo no encontrado" });

    const ws = db.prepare("SELECT name FROM workspaces WHERE id = ?").get(req.user.workspace_id);
    const settings = Object.fromEntries(
      db.prepare("SELECT key, value FROM settings WHERE workspace_id = ?").all(req.user.workspace_id)
        .map((s) => [s.key, s.value])
    );
    const fmtCop = (n) => new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(n);
    const fmtDate = (iso) => {
      if (!iso) return "—";
      const d = new Date(iso.length === 10 ? iso + "T00:00:00" : iso);
      return d.toLocaleDateString("es-CO", { day: "numeric", month: "long", year: "numeric" });
    };

    const methodLine = (() => {
      const parts = [inv.method];
      if (inv.method === "Transferencia" && inv.bank) parts.push(`· ${inv.bank}`);
      if (inv.method === "Convenio EPS" && inv.eps) parts.push(`· ${inv.eps}`);
      if (inv.payment_reference) parts.push(`· Ref: ${inv.payment_reference}`);
      return parts.join(" ");
    })();

    const docDef = {
      pageSize: "A4",
      pageMargins: [42, 50, 42, 50],
      info: { title: `Recibo ${inv.id}`, author: ws?.name ?? "Psicomorfosis", creator: "Psicomorfosis" },
      defaultStyle: { font: "Roboto", fontSize: 10.5, lineHeight: 1.4, color: "#1f1f1f" },
      content: [
        // Cabecera con membrete
        {
          columns: [
            [
              { text: ws?.name ?? "Psicomorfosis", fontSize: 16, bold: true, color: "#4a3a8c" },
              settings.address ? { text: settings.address, fontSize: 9, color: "#666" } : null,
              settings.phone ? { text: `Tel: ${settings.phone}`, fontSize: 9, color: "#666" } : null,
              settings.city ? { text: settings.city, fontSize: 9, color: "#666" } : null,
            ].filter(Boolean),
            [
              { text: "RECIBO", fontSize: 11, bold: true, color: "#4a3a8c", alignment: "right", margin: [0, 4, 0, 2] },
              { text: inv.id, fontSize: 10, alignment: "right", color: "#1f1f1f", font: "Roboto", bold: true },
              { text: fmtDate(inv.date), fontSize: 9, alignment: "right", color: "#666" },
            ],
          ],
          margin: [0, 0, 0, 20],
        },
        { canvas: [{ type: "line", x1: 0, y1: 0, x2: 515, y2: 0, lineWidth: 0.5, lineColor: "#d4d4d4" }] },

        // Datos del paciente
        { text: "Recibí de", fontSize: 9, color: "#888", margin: [0, 18, 0, 4] },
        { text: inv.patient_name || "—", fontSize: 14, bold: true },
        { text: "por concepto de", fontSize: 9, color: "#888", margin: [0, 14, 0, 4] },
        { text: inv.concept, fontSize: 11 },

        // Total destacado
        {
          margin: [0, 22, 0, 0],
          table: {
            widths: ["*"],
            body: [[
              {
                text: [
                  { text: "Valor: ", fontSize: 11, color: "#666" },
                  { text: fmtCop(inv.amount), fontSize: 22, bold: true, color: "#4a3a8c" },
                ],
                fillColor: "#f5f3ff",
                margin: [16, 14, 16, 14],
              },
            ]],
          },
          layout: "noBorders",
        },

        // Detalle de pago
        { text: "Detalle de pago", fontSize: 9, color: "#888", margin: [0, 22, 0, 6] },
        {
          table: {
            widths: ["35%", "*"],
            body: [
              [{ text: "Método", color: "#888", fontSize: 9 }, { text: methodLine, fontSize: 10 }],
              [{ text: "Estado", color: "#888", fontSize: 9 }, { text: inv.status === "pagada" ? "PAGADO" : inv.status.toUpperCase(), fontSize: 10, bold: true, color: inv.status === "pagada" ? "#1f6b46" : "#7a5b00" }],
              ...(inv.paid_at ? [[{ text: "Fecha de pago", color: "#888", fontSize: 9 }, { text: fmtDate(inv.paid_at), fontSize: 10 }]] : []),
              ...(inv.payment_notes ? [[{ text: "Notas", color: "#888", fontSize: 9 }, { text: inv.payment_notes, fontSize: 10, italics: true }]] : []),
            ],
          },
          layout: { hLineColor: "#eee", vLineWidth: () => 0, hLineWidth: () => 0.5 },
        },

        // Pie de firma
        { text: "", margin: [0, 40, 0, 0] },
        {
          columns: [
            { text: "" },
            [
              { canvas: [{ type: "line", x1: 0, y1: 0, x2: 200, y2: 0, lineWidth: 0.5, lineColor: "#aaa" }] },
              { text: inv.professional ?? "", fontSize: 10, alignment: "left", margin: [0, 6, 0, 0] },
              { text: ws?.name ?? "", fontSize: 9, alignment: "left", color: "#666" },
            ],
          ],
        },

        { text: "Este documento es un recibo de pago, no constituye factura electrónica DIAN.", fontSize: 8, italics: true, color: "#aaa", margin: [0, 28, 0, 0] },
      ],
    };

    const stream = printer.createPdfKitDocument(docDef);
    const safe = (inv.patient_name || "recibo").replace(/[^\w\s-]/g, "").trim().replace(/\s+/g, "_").slice(0, 60);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${inv.id}_${safe}.pdf"`);
    stream.pipe(res);
    stream.end();
  } catch (e) {
    console.error("[invoices/pdf]", e);
    res.status(500).json({ error: "No se pudo generar el PDF: " + (e?.message ?? e) });
  }
});

export default router;
