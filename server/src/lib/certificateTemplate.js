/**
 * Plantilla de certificado de atención/pago para EPS, declaración de renta, etc.
 *
 * Diferencia con el recibo individual: agrega varios recibos pagados de un
 * paciente en un rango de fechas. Útil cuando el paciente paga de bolsillo y
 * necesita reembolso de su aseguradora, o para soporte de gastos médicos.
 *
 * Reusa los helpers de receiptTemplates.js para mantener la misma identidad
 * visual (color base, tipografía, header/footer).
 *
 * ctx esperado:
 *   invoices  -> array de filas de la tabla invoices (status='pagada')
 *   patient   -> { id, name, doc, age, phone, email }
 *   ws        -> { name, mode }
 *   prof      -> { name, title, email, phone } o null
 *   settings  -> objeto { receipt_brand_color, address, city, phone, email, ... }
 *   logoPath  -> path en disco del logo, o null
 *   showLogo  -> bool
 *   showName  -> bool
 *   logoSize  -> { width, height } bounding box
 *   range     -> { from: 'YYYY-MM-DD', to: 'YYYY-MM-DD' }
 *   issuedAt  -> Date — momento de emisión (default: ahora)
 */

import {
  fmtCop, fmtDate, fmtDateShort, joinAddress, tintWithWhite, isValidHex,
} from "./receiptTemplates.js";

export function buildCertificateDoc(ctx) {
  const { invoices, patient, ws, prof, settings, range } = ctx;
  const issuedAt = ctx.issuedAt instanceof Date ? ctx.issuedAt : new Date();

  // Paleta — misma derivación que receiptTemplates para consistencia visual.
  const brand = isValidHex(settings.receipt_brand_color) ? settings.receipt_brand_color : "#2e4142";
  const C = {
    bg:      "#ffffff",
    ink:     "#1a2425",
    inkSoft: "#5a6b6c",
    mute:    "#9aa8a8",
    border:  "#e2ebeb",
    brand,
    brandBg: tintWithWhite(brand, 0.92),
    onBrand: tintWithWhite(brand, 0.65),
  };

  const PAD = 50;
  const CONTENT_W = 595 - PAD * 2;

  // ── HEADER full-bleed ──────────────────────────────────────────────────
  const headerLeftStack = [];
  const hasLogo = ctx.showLogo && ctx.logoPath;
  if (hasLogo) {
    headerLeftStack.push({ image: ctx.logoPath, fit: [ctx.logoSize.width, ctx.logoSize.height] });
  } else if (ctx.showName) {
    headerLeftStack.push({ text: "CERTIFICADO", fontSize: 8.5, color: C.onBrand, characterSpacing: 1.8 });
  }
  if (ctx.showName) {
    headerLeftStack.push({
      text: ws?.name ?? "Psicomorfosis",
      color: "#ffffff",
      fontSize: 18,
      bold: true,
      margin: [0, hasLogo ? 14 : 6, 0, 0],
    });
    headerLeftStack.push({
      text: ws?.mode === "organization" ? "Centro de psicología clínica" : "Consultorio de psicología clínica",
      fontSize: 9.5,
      color: C.onBrand,
      margin: [0, 3, 0, 0],
    });
  }
  const headerLeftBlock = { width: "*", stack: headerLeftStack };

  const headerRight = {
    width: "auto",
    stack: [
      { text: "CERTIFICADO DE ATENCIÓN", color: C.onBrand, fontSize: 9, bold: true, alignment: "right", characterSpacing: 0.8 },
      { text: `Emitido ${fmtDateShort(issuedAt.toISOString())}`, color: C.onBrand, fontSize: 9, alignment: "right", margin: [0, 6, 0, 0] },
    ],
  };

  const header = {
    table: {
      widths: ["*"],
      body: [[{
        fillColor: C.brand,
        margin: [PAD, 30, PAD, 30],
        columns: [headerLeftBlock, headerRight],
        columnGap: 20,
      }]],
    },
    layout: "noBorders",
  };

  // ── INTRO + Datos del paciente ─────────────────────────────────────────
  const fromLong = fmtDate(range.from);
  const toLong = fmtDate(range.to);
  const profName = prof?.name ?? "El profesional firmante";
  const profTitle = prof?.title ? `, identificado(a) con ${prof.title}` : "";

  const intro = {
    margin: [PAD, 30, PAD, 0],
    text: [
      { text: profName, bold: true, color: C.ink },
      profTitle,
      { text: ", hace constar que el(la) paciente abajo identificado(a) recibió atención psicológica en este consultorio durante el período comprendido entre " },
      { text: fromLong, bold: true, color: C.ink },
      " y ",
      { text: toLong, bold: true, color: C.ink },
      ", con los servicios y pagos relacionados a continuación:",
    ],
    fontSize: 10.5,
    color: C.inkSoft,
    lineHeight: 1.5,
  };

  const persona = (label, value, meta) => ({
    width: "*",
    stack: [
      { text: label, fontSize: 8.5, color: C.mute },
      { text: value || "—", fontSize: 12, bold: true, color: C.ink, margin: [0, 4, 0, 0] },
      ...(meta ? [{ text: meta, fontSize: 9.5, color: C.mute, margin: [0, 2, 0, 0] }] : []),
    ],
  });
  const personaBlock = {
    margin: [PAD, 24, PAD, 0],
    columns: [
      persona("Paciente", patient?.name, patient?.doc ? `Documento ${patient.doc}` : null),
      persona("Profesional", prof?.name, prof?.title ?? null),
    ],
    columnGap: 36,
  };

  const separator = (top) => ({
    canvas: [{ type: "line", x1: 0, y1: 0, x2: CONTENT_W, y2: 0, lineWidth: 0.5, lineColor: C.border }],
    margin: [PAD, top, PAD, 0],
  });

  // ── TABLA DE SESIONES ──────────────────────────────────────────────────
  const tableHeader = [
    { text: "Fecha", style: "tableHead" },
    { text: "Concepto", style: "tableHead" },
    { text: "Modalidad", style: "tableHead" },
    { text: "Recibo", style: "tableHead" },
    { text: "Valor", style: "tableHead", alignment: "right" },
  ];
  const tableRows = invoices.map((inv) => [
    { text: fmtDateShort(inv.date), style: "tableCell" },
    { text: inv.concept || "Sesión", style: "tableCell" },
    { text: inv.modality || "—", style: "tableCell" },
    { text: inv.id, style: "tableCell" },
    { text: fmtCop(inv.amount), style: "tableCell", alignment: "right" },
  ]);
  const total = invoices.reduce((sum, inv) => sum + (Number(inv.amount) || 0), 0);

  const sessionsTable = {
    margin: [PAD, 22, PAD, 0],
    table: {
      widths: ["auto", "*", "auto", "auto", "auto"],
      headerRows: 1,
      body: [tableHeader, ...tableRows],
    },
    layout: {
      hLineColor: () => C.border,
      hLineWidth: (i) => (i === 0 || i === 1 ? 0.8 : 0.4),
      vLineWidth: () => 0,
      paddingTop: () => 7,
      paddingBottom: () => 7,
      paddingLeft: () => 8,
      paddingRight: () => 8,
      fillColor: (i) => (i === 0 ? C.brandBg : null),
    },
  };

  // ── TOTAL banda ────────────────────────────────────────────────────────
  const totalBlock = {
    margin: [0, 22, 0, 0],
    table: {
      widths: ["*"],
      body: [[{
        fillColor: C.brandBg,
        margin: [PAD, 18, PAD, 18],
        columns: [
          {
            width: "*",
            stack: [
              { text: "TOTAL CERTIFICADO", fontSize: 9, bold: true, color: C.brand, characterSpacing: 1.4 },
              {
                text: `${invoices.length} servicio${invoices.length === 1 ? "" : "s"} pagado${invoices.length === 1 ? "" : "s"}`,
                fontSize: 9.5, color: C.inkSoft, margin: [0, 3, 0, 0],
              },
            ],
          },
          {
            width: "auto",
            text: fmtCop(total),
            fontSize: 26,
            bold: true,
            color: C.brand,
            alignment: "right",
            characterSpacing: -0.3,
          },
        ],
      }]],
    },
    layout: "noBorders",
  };

  // ── FIRMA / pie ────────────────────────────────────────────────────────
  const signatureBlock = {
    margin: [PAD, 40, PAD, 0],
    columns: [
      { width: "*", text: "" },
      {
        width: 230,
        stack: [
          { canvas: [{ type: "line", x1: 0, y1: 0, x2: 230, y2: 0, lineWidth: 0.5, lineColor: C.inkSoft }] },
          { text: prof?.name ?? "________________", fontSize: 11, bold: true, color: C.ink, alignment: "center", margin: [0, 6, 0, 0] },
          ...(prof?.title ? [{ text: prof.title, fontSize: 9.5, color: C.mute, alignment: "center", margin: [0, 2, 0, 0] }] : []),
          ...(prof?.email ? [{ text: prof.email, fontSize: 9, color: C.mute, alignment: "center", margin: [0, 2, 0, 0] }] : []),
        ],
      },
      { width: "*", text: "" },
    ],
  };

  const addressLine = joinAddress(settings.address, settings.city);
  const footerLeft = [];
  if (settings.email) footerLeft.push(settings.email);
  if (addressLine) footerLeft.push(addressLine);
  const footer = {
    margin: [PAD, 24, PAD, 0],
    columns: [
      { width: "*", text: footerLeft.join("  ·  "), fontSize: 9, color: C.mute },
      { width: "auto", text: `Generado ${fmtDateShort(issuedAt.toISOString())}`, fontSize: 9, color: C.mute, alignment: "right" },
    ],
  };

  const disclaimer = {
    margin: [PAD, 8, PAD, 0],
    text: "Este certificado deja constancia de la atención prestada y los pagos recibidos. No constituye factura electrónica DIAN.",
    fontSize: 8,
    color: C.mute,
    italics: true,
  };

  return {
    pageSize: "A4",
    pageMargins: [0, 0, 0, 40],
    info: {
      title: `Certificado ${patient?.name ?? "paciente"} ${range.from} a ${range.to}`,
      author: ws?.name ?? "Psicomorfosis",
      creator: "Psicomorfosis",
    },
    defaultStyle: { font: "Roboto", fontSize: 10, lineHeight: 1.4, color: C.ink },
    styles: {
      tableHead: { fontSize: 9, bold: true, color: C.brand, characterSpacing: 0.6 },
      tableCell: { fontSize: 10, color: C.ink },
    },
    content: [
      header,
      intro,
      personaBlock,
      separator(22),
      sessionsTable,
      totalBlock,
      signatureBlock,
      footer,
      disclaimer,
    ],
  };
}
