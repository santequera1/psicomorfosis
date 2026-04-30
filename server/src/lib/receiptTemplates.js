/**
 * Plantillas de recibo en pdfmake JSON.
 * Cada función exporta una `docDefinition` lista para createPdfKitDocument.
 *
 * Datos compartidos (mismo `ctx` en todas):
 *   inv         -> row de la tabla invoices
 *   ws          -> { name, mode } del workspace
 *   prof        -> { name, title, email, phone } del profesional
 *   settings    -> objeto { key: value } de settings del workspace
 *   logoPath    -> path en disk del logo PNG/JPG, o null
 *   showLogo    -> bool
 *   showName    -> bool
 *   logoSize    -> { width, height } según orientation (h/v/sq)
 *
 * Dos templates por ahora: "minimal" (el original limpio) y "esquina_verde"
 * (basado en el HTML de referencia del usuario, con header dark teal).
 */

function fmtCop(n) {
  return new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(n);
}

function fmtDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso.length === 10 ? iso + "T00:00:00" : iso);
  return d.toLocaleDateString("es-CO", { day: "numeric", month: "long", year: "numeric" });
}

function fmtDateShort(iso) {
  if (!iso) return "—";
  const d = new Date(iso.length === 10 ? iso + "T00:00:00" : iso);
  // "16 abr 2026" — 1 línea, sin "de" para no truncarse en columnas estrechas.
  const day = d.getDate();
  const months = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
  return `${day} ${months[d.getMonth()]} ${d.getFullYear()}`;
}

function methodSummary(inv) {
  const parts = [inv.method];
  if (inv.method === "Transferencia" && inv.bank) parts.push(`· ${inv.bank}`);
  if (inv.method === "Convenio" && inv.eps) parts.push(`· ${inv.eps}`);
  return parts.join(" ");
}

function initialsOf(name) {
  if (!name) return "—";
  return name.trim().split(/\s+/).slice(0, 2).map((n) => n[0]).join("").toUpperCase();
}

/** Header con logo + nombre, según preferencias del usuario. */
function brandHeader(ctx, theme) {
  const items = [];
  if (ctx.showLogo && ctx.logoPath) {
    items.push({ image: ctx.logoPath, ...ctx.logoSize });
  }
  if (ctx.showName) {
    items.push({ text: ctx.ws?.name ?? "Psicomorfosis", style: theme.brandText });
  }
  return items;
}

// ════════════════════════════════════════════════════════════════════════════
// TEMPLATE 1: minimal — limpio, profesional, igual al que ya teníamos.
// ════════════════════════════════════════════════════════════════════════════
export function templateMinimal(ctx) {
  const { inv, ws, settings } = ctx;
  const brandColor = "#4a3a8c";

  return {
    pageSize: "A4",
    pageMargins: [42, 50, 42, 50],
    info: { title: `Recibo ${inv.id}`, author: ws?.name ?? "Psicomorfosis", creator: "Psicomorfosis" },
    defaultStyle: { font: "Roboto", fontSize: 10.5, lineHeight: 1.4, color: "#1f1f1f" },
    content: [
      // Header
      {
        columns: [
          [
            ...brandHeader(ctx, {
              brandText: { fontSize: 16, bold: true, color: brandColor },
            }),
            settings.address ? { text: settings.address, fontSize: 9, color: "#666", margin: [0, 4, 0, 0] } : null,
            settings.phone ? { text: `Tel: ${settings.phone}`, fontSize: 9, color: "#666" } : null,
            settings.city ? { text: settings.city, fontSize: 9, color: "#666" } : null,
          ].filter(Boolean),
          [
            { text: "RECIBO", fontSize: 11, bold: true, color: brandColor, alignment: "right", margin: [0, 4, 0, 2] },
            { text: inv.id, fontSize: 10, alignment: "right", color: "#1f1f1f", bold: true },
            { text: fmtDate(inv.date), fontSize: 9, alignment: "right", color: "#666" },
          ],
        ],
        margin: [0, 0, 0, 20],
      },
      { canvas: [{ type: "line", x1: 0, y1: 0, x2: 515, y2: 0, lineWidth: 0.5, lineColor: "#d4d4d4" }] },

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
                { text: fmtCop(inv.amount), fontSize: 22, bold: true, color: brandColor },
              ],
              fillColor: "#f5f3ff",
              margin: [16, 14, 16, 14],
            },
          ]],
        },
        layout: "noBorders",
      },

      { text: "Detalle de pago", fontSize: 9, color: "#888", margin: [0, 22, 0, 6] },
      {
        table: {
          widths: ["35%", "*"],
          body: [
            [{ text: "Método", color: "#888", fontSize: 9 }, { text: methodSummary(inv), fontSize: 10 }],
            [{ text: "Estado", color: "#888", fontSize: 9 }, { text: inv.status === "pagada" ? "PAGADO" : inv.status.toUpperCase(), fontSize: 10, bold: true, color: inv.status === "pagada" ? "#1f6b46" : "#7a5b00" }],
            ...(inv.paid_at ? [[{ text: "Fecha de pago", color: "#888", fontSize: 9 }, { text: fmtDate(inv.paid_at), fontSize: 10 }]] : []),
            ...(inv.payment_reference ? [[{ text: "Referencia", color: "#888", fontSize: 9 }, { text: inv.payment_reference, fontSize: 10, font: "Roboto" }]] : []),
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
}

// ════════════════════════════════════════════════════════════════════════════
// TEMPLATE 2: esquina_verde — header dark teal, layout 2 columnas para
// paciente/terapeuta con avatares, total en banda gris claro. Inspirado en
// el HTML de referencia que adjuntó el usuario.
// ════════════════════════════════════════════════════════════════════════════
export function templateEsquinaVerde(ctx) {
  const { inv, ws, prof, settings } = ctx;

  // Paleta del HTML de referencia
  const COLORS = {
    headerBg: "#1a2e25",      // dark teal
    accent:   "#2a5c42",      // green
    soft:     "#9fd4b8",      // light green (texto sobre dark)
    midText:  "#6b9980",      // mid gray-green
    softBg:   "#f5f9f7",      // soft bg
    border:   "#dde8e3",
    rowDiv:   "#edf3f0",
    pInk:     "#1a2e25",
    tInk:     "#3d5e50",
    placeholder: "#9fb8ad",
    avPaciBg: "#e1f5ee",
    avPaciFg: "#0f6e56",
    avTeraBg: "#1a2e25",
    avTeraFg: "#9fd4b8",
  };

  const statusBadge = (() => {
    const map = {
      pagada:    { bg: COLORS.accent, fg: COLORS.soft, label: "PAGADO" },
      pendiente: { bg: "#fef3c7",     fg: "#92400e",   label: "PENDIENTE" },
      vencida:   { bg: "#fee2e2",     fg: "#991b1b",   label: "VENCIDO" },
      borrador:  { bg: "#e5e7eb",     fg: "#374151",   label: "BORRADOR" },
    };
    return map[inv.status] ?? map.borrador;
  })();

  // Personas: bloques en columnas
  const personasBlock = {
    columns: [
      // Paciente (izq)
      [
        { text: "PACIENTE", style: "tinyHead" },
        {
          margin: [0, 8, 0, 0],
          columns: [
            { width: 36, ...avatarCircle(initialsOf(inv.patient_name), COLORS.avPaciBg, COLORS.avPaciFg) },
            { width: "*", text: [
              { text: (inv.patient_name || "—") + "\n", fontSize: 12, bold: true, color: COLORS.pInk },
              { text: (inv.patient_id ? `ID: ${inv.patient_id}` : "Sin ID"), fontSize: 9, color: COLORS.midText },
            ], margin: [10, 4, 0, 0] },
          ],
        },
      ],
      // Separator
      { width: 1, canvas: [{ type: "line", x1: 0, y1: 0, x2: 0, y2: 70, lineWidth: 0.5, lineColor: COLORS.border }] },
      // Terapeuta (der)
      [
        { text: "TERAPEUTA", style: "tinyHead" },
        {
          margin: [0, 8, 0, 0],
          columns: [
            { width: 36, ...avatarCircle(initialsOf(prof?.name ?? inv.professional), COLORS.avTeraBg, COLORS.avTeraFg) },
            { width: "*", text: [
              { text: (prof?.name ?? inv.professional ?? "—") + "\n", fontSize: 12, bold: true, color: COLORS.pInk },
              ...(prof?.title ? [{ text: prof.title + "\n", fontSize: 9, color: COLORS.midText }] : []),
              ...(prof?.title && prof.title.match(/Lic|TP|tarjeta/i) ? [] : (prof?.title ? [] : [])),
            ], margin: [10, 4, 0, 0] },
          ],
        },
      ],
    ],
    columnGap: 20,
    margin: [32, 24, 32, 24],
  };

  // Tabla de servicios — por ahora un solo concepto (futuro: array)
  // Modalidad del servicio (Presencial/Virtual/Tele) — distinta del método
  // de pago. Si no está definida, omitimos el chip.
  const modality = inv.modality ?? "";
  const modalityCell = modality
    ? {
        stack: [{
          text: modality,
          fontSize: 10,
          color: COLORS.avPaciFg,
          fillColor: COLORS.avPaciBg,
          alignment: "center",
          margin: [4, 4, 4, 4],
        }],
        alignment: "left",
        border: [false, false, false, false],
        margin: [0, 4, 0, 0],
      }
    : { text: "—", fontSize: 10, color: COLORS.placeholder, border: [false, false, false, false], margin: [0, 6, 0, 0] };

  const servicesTable = {
    margin: [32, 0, 32, 0],
    table: {
      widths: ["*", 78, 75, 75],
      headerRows: 1,
      body: [
        [
          { text: "CONCEPTO", style: "thHead", fillColor: COLORS.softBg },
          { text: "MODALIDAD", style: "thHead", fillColor: COLORS.softBg },
          { text: "FECHA", style: "thHead", fillColor: COLORS.softBg },
          { text: "VALOR", style: "thHead", fillColor: COLORS.softBg, alignment: "right" },
        ],
        [
          {
            stack: [
              { text: inv.concept, fontSize: 12, color: COLORS.pInk, bold: true },
              ...(inv.payment_notes ? [{ text: inv.payment_notes, fontSize: 9, color: COLORS.placeholder, italics: true, margin: [0, 4, 0, 0] }] : []),
            ],
            border: [false, false, false, false],
          },
          modalityCell,
          { text: fmtDateShort(inv.date), fontSize: 10, color: COLORS.tInk, border: [false, false, false, false], margin: [0, 6, 0, 0] },
          { text: fmtCop(inv.amount), fontSize: 12, bold: true, color: COLORS.pInk, alignment: "right", border: [false, false, false, false], margin: [0, 6, 0, 0] },
        ],
      ],
    },
    layout: {
      hLineColor: COLORS.rowDiv,
      hLineWidth: () => 0.5,
      vLineWidth: () => 0,
      paddingTop: () => 10,
      paddingBottom: () => 10,
      paddingLeft: () => 12,
      paddingRight: () => 12,
    },
  };

  const paymentBlock = {
    margin: [32, 22, 32, 0],
    columns: [
      [
        { text: "MÉTODO DE PAGO", style: "tinyHead" },
        { text: methodSummary(inv), fontSize: 11, color: COLORS.pInk, bold: true, margin: [0, 6, 0, 0] },
        ...(inv.paid_at ? [{ text: `Pagado el ${fmtDate(inv.paid_at)}`, fontSize: 10, color: COLORS.midText, margin: [0, 2, 0, 0] }] : []),
      ],
      ...(inv.payment_reference ? [
        [
          { text: "REFERENCIA", style: "tinyHead", alignment: "right" },
          { text: inv.payment_reference, fontSize: 11, color: COLORS.tInk, alignment: "right", margin: [0, 6, 0, 0] },
        ],
      ] : []),
    ],
  };

  const totalBlock = {
    margin: [0, 24, 0, 0],
    table: {
      widths: ["*"],
      body: [[
        {
          fillColor: COLORS.softBg,
          margin: [32, 18, 32, 18],
          columns: [
            [
              { text: "TOTAL PAGADO", style: "tinyHead" },
              { text: "1 servicio", fontSize: 10, color: COLORS.placeholder, margin: [0, 2, 0, 0] },
            ],
            { text: fmtCop(inv.amount), fontSize: 24, bold: true, color: COLORS.pInk, alignment: "right" },
          ],
        },
      ]],
    },
    layout: "noBorders",
  };

  const footer = {
    margin: [32, 16, 32, 0],
    columns: [
      [
        ...(settings.email ? [{ text: settings.email, fontSize: 10, color: COLORS.midText }] : []),
        ...(settings.address ? [{ text: settings.address, fontSize: 10, color: COLORS.placeholder, margin: [0, 2, 0, 0] }] : []),
        { text: "Comprobante de pago — no constituye factura electrónica DIAN", fontSize: 8, italics: true, color: COLORS.placeholder, margin: [0, 12, 0, 0] },
      ],
    ],
  };

  return {
    pageSize: "A4",
    pageMargins: [0, 0, 0, 32],
    info: { title: `Recibo ${inv.id}`, author: ws?.name ?? "Psicomorfosis", creator: "Psicomorfosis" },
    defaultStyle: { font: "Roboto", fontSize: 10.5, lineHeight: 1.4, color: COLORS.pInk },
    styles: {
      tinyHead: { fontSize: 9, bold: true, color: COLORS.midText, characterSpacing: 0.5 },
      thHead:   { fontSize: 9, bold: true, color: COLORS.midText, characterSpacing: 0.5 },
    },
    content: [
      // Header dark teal completo de borde a borde
      {
        margin: [0, 0, 0, 0],
        table: {
          widths: ["*"],
          body: [[
            {
              fillColor: COLORS.headerBg,
              margin: [32, 28, 32, 28],
              columns: [
                {
                  width: "*",
                  stack: [
                    {
                      columns: [
                        ctx.showLogo && ctx.logoPath
                          ? { width: ctx.logoSize.width, image: ctx.logoPath, height: ctx.logoSize.height }
                          : { width: 0, text: "" },
                        ctx.showName
                          ? { width: "*", text: ws?.name ?? "Psicomorfosis", color: "#ffffff", fontSize: 18, bold: true, margin: [ctx.showLogo && ctx.logoPath ? 12 : 0, 4, 0, 0] }
                          : { width: 0, text: "" },
                      ],
                    },
                    ...(ws?.mode === "organization"
                      ? [{ text: "Centro de psicología clínica", fontSize: 11, color: COLORS.soft, margin: [ctx.showLogo && ctx.logoPath ? ctx.logoSize.width + 12 : 0, 4, 0, 0] }]
                      : [{ text: "Consultorio de psicología clínica", fontSize: 11, color: COLORS.soft, margin: [ctx.showLogo && ctx.logoPath ? ctx.logoSize.width + 12 : 0, 4, 0, 0] }]),
                  ],
                },
                {
                  width: "auto",
                  stack: [
                    { text: statusBadge.label, color: statusBadge.fg, fillColor: statusBadge.bg, fontSize: 9, bold: true, alignment: "center", margin: [10, 4, 10, 4], characterSpacing: 0.5 },
                    { text: inv.id, color: COLORS.soft, fontSize: 12, bold: true, alignment: "right", margin: [0, 8, 0, 0] },
                    { text: `Emitido: ${fmtDateShort(inv.created_at ?? inv.date)}`, color: "#4e7a63", fontSize: 9, alignment: "right", margin: [0, 2, 0, 0] },
                  ],
                },
              ],
            },
          ]],
        },
        layout: "noBorders",
      },
      personasBlock,
      { canvas: [{ type: "line", x1: 32, y1: 0, x2: 563, y2: 0, lineWidth: 0.5, lineColor: COLORS.border }] },
      { text: "DETALLE DE SERVICIOS", style: "tinyHead", margin: [32, 22, 32, 12] },
      servicesTable,
      paymentBlock,
      totalBlock,
      footer,
    ],
  };
}

/** Helper para dibujar un avatar circular con iniciales (canvas + texto). */
function avatarCircle(initials, bg, fg) {
  return {
    stack: [
      {
        canvas: [
          { type: "ellipse", x: 18, y: 18, color: bg, r1: 18, r2: 18 },
        ],
        absolutePosition: { x: 0, y: 0 },
      },
      {
        text: initials,
        color: fg,
        fontSize: 12,
        bold: true,
        alignment: "center",
        margin: [0, 11, 0, 0],
      },
    ],
    width: 36,
    height: 36,
  };
}

function methodTagText(method) {
  // Normalizar para mostrar (mantener legible)
  return method || "—";
}

/**
 * Despachador. Devuelve la docDefinition según `template`.
 * Acepta: 'minimal' | 'esquina_verde'. Default minimal.
 */
export function buildReceiptDoc(ctx) {
  const t = (ctx.settings?.receipt_template ?? "minimal").toLowerCase();
  if (t === "esquina_verde") return templateEsquinaVerde(ctx);
  return templateMinimal(ctx);
}
