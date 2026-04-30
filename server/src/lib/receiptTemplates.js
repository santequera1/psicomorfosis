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
// TEMPLATE 1: minimal — estilo "letterhead clínico" sobrio.
// Marca presente solo como acento (banda superior fina + título y total en
// teal). Sin header pesado, dos columnas para Recibí de / Atendido por,
// total grande solo tipográfico, tabla de pago como grid sin bordes, firma
// centrada al pie con línea fina.
// ════════════════════════════════════════════════════════════════════════════
export function templateMinimal(ctx) {
  const { inv, ws, prof, settings } = ctx;

  const COLORS = {
    primary:   "#4c7476", // brand-700 — accent
    primaryDk: "#3e5b5d", // brand-800
    soft:      "#dbecec", // brand-100
    softer:    "#ecf6f6", // brand-50
    ink:       "#20272f", // ink-900
    inkSoft:   "#414951", // ink-700
    midText:   "#636a71", // ink-500
    mute:      "#80878f", // ink-400
    border:    "#dbecec",
  };

  // Bloque de marca arriba a la izquierda (con logo opcional + nombre).
  // Si el usuario apagó "mostrar nombre", solo va el logo. Si apagó ambos,
  // queda un espacio vacío arriba (raro pero respeta la preferencia).
  const brandStack = (() => {
    const items = [];
    if (ctx.showLogo && ctx.logoPath) {
      items.push({
        columns: [
          { width: ctx.logoSize.width, image: ctx.logoPath, height: ctx.logoSize.height },
          ctx.showName
            ? {
                width: "*",
                stack: [
                  { text: ws?.name ?? "Psicomorfosis", fontSize: 18, bold: true, color: COLORS.ink, characterSpacing: -0.2 },
                  { text: ws?.mode === "organization" ? "Centro de psicología clínica" : "Consultorio de psicología clínica", fontSize: 10, color: COLORS.midText, margin: [0, 2, 0, 0] },
                ],
                margin: [12, 0, 0, 0],
              }
            : { width: "*", text: "" },
        ],
        columnGap: 0,
      });
    } else if (ctx.showName) {
      items.push({ text: ws?.name ?? "Psicomorfosis", fontSize: 18, bold: true, color: COLORS.ink, characterSpacing: -0.2 });
      items.push({ text: ws?.mode === "organization" ? "Centro de psicología clínica" : "Consultorio de psicología clínica", fontSize: 10, color: COLORS.midText, margin: [0, 2, 0, 0] });
    }
    return items;
  })();

  return {
    pageSize: "A4",
    pageMargins: [56, 50, 56, 40],
    info: { title: `Recibo ${inv.id}`, author: ws?.name ?? "Psicomorfosis", creator: "Psicomorfosis" },
    defaultStyle: { font: "Roboto", fontSize: 10.5, lineHeight: 1.4, color: COLORS.inkSoft },
    styles: {
      label:        { fontSize: 9, color: COLORS.midText, characterSpacing: 1.2, bold: true },
      sectionTitle: { fontSize: 10, color: COLORS.primary, bold: true, characterSpacing: 1.0 },
    },

    // Banda fina teal en el borde superior — acento de marca discreto.
    background: function (currentPage, pageSize) {
      return [
        { canvas: [{ type: "rect", x: 0, y: 0, w: pageSize.width, h: 3, color: COLORS.primary }] },
      ];
    },

    content: [
      // Cabecera: marca a la izq, recibo + ID + fecha a la der
      {
        columns: [
          { width: "*", stack: brandStack },
          {
            width: "auto",
            stack: [
              { text: "RECIBO DE PAGO", style: "label", alignment: "right" },
              { text: inv.id, fontSize: 14, bold: true, color: COLORS.primary, alignment: "right", margin: [0, 4, 0, 0], characterSpacing: 0.4 },
              { text: fmtDate(inv.date), fontSize: 10, color: COLORS.midText, alignment: "right", margin: [0, 2, 0, 0] },
            ],
          },
        ],
      },

      // Línea separadora fina bajo la cabecera
      { canvas: [{ type: "line", x1: 0, y1: 0, x2: 483, y2: 0, lineWidth: 0.5, lineColor: COLORS.border }], margin: [0, 16, 0, 0] },

      // Bloque Paciente / Profesional en 2 columnas (estilo carta formal)
      {
        margin: [0, 20, 0, 0],
        columns: [
          {
            width: "*",
            stack: [
              { text: "RECIBÍ DE", style: "label" },
              { text: inv.patient_name || "—", fontSize: 16, bold: true, color: COLORS.ink, margin: [0, 6, 0, 0] },
              ...(inv.patient_id ? [{ text: `ID: ${inv.patient_id}`, fontSize: 9, color: COLORS.mute, margin: [0, 3, 0, 0] }] : []),
            ],
          },
          {
            width: "*",
            stack: [
              { text: "ATENDIDO POR", style: "label" },
              { text: prof?.name ?? inv.professional ?? "—", fontSize: 13, bold: true, color: COLORS.ink, margin: [0, 6, 0, 0] },
              ...(prof?.title ? [{ text: prof.title, fontSize: 9, color: COLORS.mute, margin: [0, 3, 0, 0] }] : []),
            ],
          },
        ],
        columnGap: 30,
      },

      // POR CONCEPTO DE
      { text: "POR CONCEPTO DE", style: "label", margin: [0, 22, 0, 0] },
      { text: inv.concept, fontSize: 13, color: COLORS.ink, margin: [0, 6, 0, 0] },
      ...(inv.modality ? [{ text: `Modalidad: ${inv.modality}`, fontSize: 10, color: COLORS.midText, margin: [0, 3, 0, 0] }] : []),

      // VALOR — solo tipografía, sin caja de fondo
      {
        margin: [0, 24, 0, 0],
        stack: [
          { text: "VALOR TOTAL", style: "label" },
          { text: fmtCop(inv.amount), fontSize: 30, bold: true, color: COLORS.primary, margin: [0, 4, 0, 0], characterSpacing: -0.3 },
        ],
      },

      // Línea fina antes del detalle de pago
      { canvas: [{ type: "line", x1: 0, y1: 0, x2: 483, y2: 0, lineWidth: 0.5, lineColor: COLORS.border }], margin: [0, 22, 0, 0] },

      // DETALLE DE PAGO — grid limpio sin bordes
      { text: "DETALLE DE PAGO", style: "sectionTitle", margin: [0, 18, 0, 10] },
      {
        table: {
          widths: ["32%", "*"],
          body: [
            [{ text: "Método de pago", color: COLORS.mute, fontSize: 9, border: [false, false, false, false] }, { text: methodSummary(inv), fontSize: 11, color: COLORS.ink, border: [false, false, false, false] }],
            ...(inv.bank ? [[{ text: "Banco", color: COLORS.mute, fontSize: 9, border: [false, false, false, false] }, { text: inv.bank, fontSize: 11, color: COLORS.ink, border: [false, false, false, false] }]] : []),
            ...(inv.eps ? [[{ text: "EPS / Convenio", color: COLORS.mute, fontSize: 9, border: [false, false, false, false] }, { text: inv.eps, fontSize: 11, color: COLORS.ink, border: [false, false, false, false] }]] : []),
            [{ text: "Estado", color: COLORS.mute, fontSize: 9, border: [false, false, false, false] }, {
              text: inv.status === "pagada" ? "Pagado" : inv.status.charAt(0).toUpperCase() + inv.status.slice(1),
              fontSize: 11,
              bold: true,
              color: inv.status === "pagada" ? COLORS.primary : "#7a5b00",
              border: [false, false, false, false],
            }],
            ...(inv.paid_at ? [[{ text: "Fecha de pago", color: COLORS.mute, fontSize: 9, border: [false, false, false, false] }, { text: fmtDate(inv.paid_at), fontSize: 11, color: COLORS.ink, border: [false, false, false, false] }]] : []),
            ...(inv.payment_reference ? [[{ text: "Referencia", color: COLORS.mute, fontSize: 9, border: [false, false, false, false] }, { text: inv.payment_reference, fontSize: 11, color: COLORS.inkSoft, border: [false, false, false, false] }]] : []),
            ...(inv.payment_notes ? [[{ text: "Notas", color: COLORS.mute, fontSize: 9, border: [false, false, false, false] }, { text: inv.payment_notes, fontSize: 10, italics: true, color: COLORS.midText, border: [false, false, false, false] }]] : []),
          ],
        },
        layout: { paddingTop: () => 5, paddingBottom: () => 5, paddingLeft: () => 0, paddingRight: () => 0 },
      },

      // Firma centrada al pie
      {
        margin: [0, 36, 0, 0],
        columns: [
          { width: "*", text: "" },
          {
            width: 220,
            stack: [
              { canvas: [{ type: "line", x1: 0, y1: 0, x2: 220, y2: 0, lineWidth: 0.5, lineColor: COLORS.midText }] },
              { text: prof?.name ?? inv.professional ?? "", fontSize: 10, alignment: "center", color: COLORS.ink, bold: true, margin: [0, 6, 0, 0] },
              { text: ws?.name ?? "", fontSize: 9, alignment: "center", color: COLORS.midText },
              ...(settings.phone ? [{ text: settings.phone, fontSize: 9, alignment: "center", color: COLORS.mute, margin: [0, 2, 0, 0] }] : []),
            ],
          },
          { width: "*", text: "" },
        ],
      },

      // Disclaimer al pie
      { text: "Este documento es un comprobante de pago, no constituye factura electrónica DIAN.", fontSize: 8, italics: true, color: COLORS.mute, alignment: "center", margin: [0, 22, 0, 0] },
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

  // Paleta de marca Psicomorfosis: teal apagado (brand 200°), sage (155°),
  // ink neutro. Convertida desde los tokens oklch de src/styles.css a hex
  // aproximado (pdfmake no acepta oklch). Tonos clínicos y pulidos.
  const COLORS = {
    headerBg: "#2c4243",      // brand-900 (teal muy oscuro)
    accent:   "#4c7476",      // brand-700 — PRIMARY
    soft:     "#98b8ba",      // brand-400 (texto soft sobre dark)
    midText:  "#636a71",      // ink-500 (etiquetas y micro-info)
    softBg:   "#ecf6f6",      // brand-50 (filas/total)
    border:   "#dbecec",      // brand-100
    rowDiv:   "#dbecec",      // brand-100
    pInk:     "#20272f",      // ink-900 (textos primarios)
    tInk:     "#414951",      // ink-700 (texto secundario en tabla)
    placeholder: "#80878f",   // ink-400
    avPaciBg: "#dbecec",      // brand-100
    avPaciFg: "#3e5b5d",      // brand-800
    avTeraBg: "#2c4243",      // brand-900
    avTeraFg: "#98b8ba",      // brand-400
  };

  // Roboto no tiene el glifo ✓ (U+2713) ni los emoji ⏳/⚠ — salían como
  // cuadritos vacíos. Construimos el check con un canvas pequeño, y los
  // demás estados quedan solo con texto (el color ya transmite el estado).
  const statusBadge = (() => {
    const map = {
      pagada:    { bg: COLORS.accent, fg: "#ffffff", label: "PAGADO",    check: true  },
      pendiente: { bg: "#fef3c7",     fg: "#92400e", label: "PENDIENTE", check: false },
      vencida:   { bg: "#fee2e2",     fg: "#991b1b", label: "VENCIDO",   check: false },
      borrador:  { bg: "#e5e7eb",     fg: "#374151", label: "BORRADOR",  check: false },
    };
    return map[inv.status] ?? map.borrador;
  })();

  // Color del chip de modalidad — distinto por tipo (presencial verde,
  // virtual azul, tele ámbar). Si no hay valor, devuelve null y se omite.
  function modalityChip(modality) {
    if (!modality) return null;
    const m = modality.toLowerCase();
    // Presencial (sage) por default, Virtual (lavender), Tele (ámbar suave)
    let bg = "#cad9ce", fg = "#3e5b5d";          // sage-200 / brand-800
    if (m.includes("virtual")) { bg = "#eee8f6"; fg = "#5e4d7a"; }   // lavender-100 / lavender-700
    else if (m.includes("tele")) { bg = "#fef3c7"; fg = "#92400e"; }
    return { label: modality, bg, fg };
  }

  // Avatar como bloque alineado: canvas + texto centrado vía margin negativo.
  // Esta técnica funciona en pdfmake sin sacar el bloque del flow del PDF
  // (a diferencia de absolutePosition, que rompe la paginación).
  function avatarBlock(initials, bg, fg) {
    return {
      width: 44,
      stack: [
        { canvas: [{ type: "ellipse", x: 22, y: 22, color: bg, r1: 22, r2: 22 }] },
        { text: initials, color: fg, fontSize: 14, bold: true, alignment: "center", margin: [0, -30, 0, 0] },
      ],
    };
  }

  // Logo del header: si hay imagen subida la usamos. Si no, dibujamos un
  // círculo con borde light + iniciales (placeholder elegante que se ve
  // similar a una marca real).
  function headerLogoBlock() {
    if (ctx.showLogo && ctx.logoPath) {
      return { width: ctx.logoSize.width, image: ctx.logoPath, height: ctx.logoSize.height };
    }
    if (!ctx.showLogo) return { width: 0, text: "" };
    // Placeholder: círculo con iniciales del workspace
    const initials = initialsOf(ws?.name);
    return {
      width: 36,
      stack: [
        {
          canvas: [
            { type: "ellipse", x: 18, y: 18, color: COLORS.headerBg, r1: 18, r2: 18, lineWidth: 1.2, lineColor: COLORS.soft },
          ],
        },
        { text: initials, color: COLORS.soft, fontSize: 13, bold: true, alignment: "center", margin: [0, -25, 0, 0] },
      ],
    };
  }

  // Icono de tarjeta de crédito (canvas vector) — solo si method=Tarjeta.
  // Tamaño y proporciones similares a una tarjeta real.
  function paymentMethodIcon() {
    if ((inv.method ?? "").toLowerCase() !== "tarjeta") return null;
    return {
      width: 50,
      canvas: [
        { type: "rect", x: 0, y: 0, w: 46, h: 30, r: 4, color: COLORS.headerBg },
        { type: "rect", x: 0, y: 9, w: 46, h: 7, color: COLORS.accent },
        { type: "rect", x: 5, y: 21, w: 16, h: 5, r: 1.5, color: COLORS.soft },
      ],
    };
  }

  const personasBlock = {
    columns: [
      [
        { text: "PACIENTE", style: "tinyHead" },
        {
          margin: [0, 10, 0, 0],
          columns: [
            avatarBlock(initialsOf(inv.patient_name), COLORS.avPaciBg, COLORS.avPaciFg),
            {
              width: "*",
              text: [
                { text: (inv.patient_name || "—") + "\n", fontSize: 13, bold: true, color: COLORS.pInk },
                { text: (inv.patient_id ? `ID: ${inv.patient_id}` : "Sin ID"), fontSize: 9, color: COLORS.midText },
              ],
              margin: [12, 4, 0, 0],
            },
          ],
          columnGap: 0,
        },
      ],
      { width: 1, canvas: [{ type: "line", x1: 0, y1: 0, x2: 0, y2: 70, lineWidth: 0.5, lineColor: COLORS.border }] },
      [
        { text: "TERAPEUTA", style: "tinyHead" },
        {
          margin: [0, 10, 0, 0],
          columns: [
            avatarBlock(initialsOf(prof?.name ?? inv.professional), COLORS.avTeraBg, COLORS.avTeraFg),
            {
              width: "*",
              text: [
                { text: (prof?.name ?? inv.professional ?? "—") + "\n", fontSize: 13, bold: true, color: COLORS.pInk },
                ...(prof?.title ? [{ text: prof.title + "\n", fontSize: 9, color: COLORS.midText }] : []),
              ],
              margin: [12, 4, 0, 0],
            },
          ],
          columnGap: 0,
        },
      ],
    ],
    columnGap: 20,
    margin: [36, 28, 36, 28],
  };

  // Modalidad como chip coloreado por tipo
  const chip = modalityChip(inv.modality);
  const modalityCell = chip
    ? {
        stack: [{
          text: chip.label,
          fontSize: 9,
          color: chip.fg,
          fillColor: chip.bg,
          alignment: "center",
          margin: [6, 4, 6, 4],
        }],
        border: [false, false, false, false],
        margin: [0, 4, 0, 0],
      }
    : { text: "—", fontSize: 10, color: COLORS.placeholder, border: [false, false, false, false], margin: [0, 6, 0, 0], alignment: "center" };

  const servicesTable = {
    margin: [36, 0, 36, 0],
    table: {
      widths: ["*", 78, 75, 75],
      headerRows: 1,
      body: [
        [
          { text: "CONCEPTO", style: "thHead", fillColor: COLORS.softBg },
          { text: "MODALIDAD", style: "thHead", fillColor: COLORS.softBg, alignment: "center" },
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
      paddingTop: () => 12,
      paddingBottom: () => 12,
      paddingLeft: () => 12,
      paddingRight: () => 12,
    },
  };

  // MÉTODO DE PAGO con icono opcional
  const cardIcon = paymentMethodIcon();
  const paymentBlock = {
    margin: [36, 24, 36, 0],
    columns: [
      {
        width: "*",
        stack: [
          { text: "MÉTODO DE PAGO", style: "tinyHead" },
          {
            margin: [0, 8, 0, 0],
            columns: cardIcon
              ? [
                  cardIcon,
                  {
                    width: "*",
                    text: [
                      { text: methodSummary(inv), fontSize: 11, color: COLORS.pInk, bold: true },
                      ...(inv.paid_at ? [{ text: `\n${(inv.method ?? "").toLowerCase() === "tarjeta" ? "Pagado" : "Recibido"} el ${fmtDate(inv.paid_at)}`, fontSize: 9, color: COLORS.midText }] : []),
                    ],
                    margin: [10, 0, 0, 0],
                  },
                ]
              : [
                  {
                    width: "*",
                    text: [
                      { text: methodSummary(inv), fontSize: 11, color: COLORS.pInk, bold: true },
                      ...(inv.paid_at ? [{ text: `\nPagado el ${fmtDate(inv.paid_at)}`, fontSize: 9, color: COLORS.midText }] : []),
                    ],
                  },
                ],
          },
        ],
      },
      ...(inv.payment_reference
        ? [{
            width: "auto",
            stack: [
              { text: "REFERENCIA", style: "tinyHead", alignment: "right" },
              {
                margin: [0, 8, 0, 0],
                table: {
                  widths: ["auto"],
                  body: [[{
                    text: inv.payment_reference,
                    fontSize: 10,
                    color: COLORS.tInk,
                    fillColor: COLORS.softBg,
                    margin: [10, 5, 10, 5],
                    border: [false, false, false, false],
                  }]],
                },
                layout: "noBorders",
              },
            ],
          }]
        : []),
    ],
  };

  const totalBlock = {
    margin: [0, 28, 0, 0],
    table: {
      widths: ["*"],
      body: [[
        {
          fillColor: COLORS.softBg,
          margin: [36, 20, 36, 20],
          columns: [
            [
              { text: "TOTAL PAGADO", style: "tinyHead" },
              { text: "1 servicio", fontSize: 10, color: COLORS.placeholder, margin: [0, 2, 0, 0] },
            ],
            { text: fmtCop(inv.amount), fontSize: 28, bold: true, color: COLORS.pInk, alignment: "right" },
          ],
        },
      ]],
    },
    layout: "noBorders",
  };

  // Footer: contacto a la izquierda + fecha de generación a la derecha,
  // separados por un margen suave. Igual a la referencia.
  const generatedOn = fmtDateShort(new Date().toISOString());
  const footer = {
    margin: [36, 20, 36, 0],
    columns: [
      {
        width: "*",
        stack: [
          ...(settings.email ? [{ text: settings.email, fontSize: 10, color: COLORS.midText }] : []),
          ...(settings.address || settings.city ? [{
            text: [settings.address, settings.city].filter(Boolean).join(" · "),
            fontSize: 10, color: COLORS.placeholder, margin: [0, 2, 0, 0],
          }] : []),
        ],
      },
      {
        width: "auto",
        text: `Documento generado el ${generatedOn}`,
        fontSize: 9,
        color: COLORS.placeholder,
        alignment: "right",
        margin: [0, 4, 0, 0],
      },
    ],
  };

  return {
    pageSize: "A4",
    pageMargins: [0, 0, 0, 40],
    info: { title: `Recibo ${inv.id}`, author: ws?.name ?? "Psicomorfosis", creator: "Psicomorfosis" },
    defaultStyle: { font: "Roboto", fontSize: 10.5, lineHeight: 1.4, color: COLORS.pInk },
    styles: {
      tinyHead: { fontSize: 9, bold: true, color: COLORS.midText, characterSpacing: 1.2 },
      thHead:   { fontSize: 9, bold: true, color: COLORS.midText, characterSpacing: 1.2 },
    },
    content: [
      // Header dark teal (banda de borde a borde)
      {
        margin: [0, 0, 0, 0],
        table: {
          widths: ["*"],
          body: [[
            {
              fillColor: COLORS.headerBg,
              margin: [36, 32, 36, 32],
              columns: [
                {
                  width: "*",
                  columns: [
                    headerLogoBlock(),
                    {
                      width: "*",
                      stack: ctx.showName
                        ? [
                            { text: ws?.name ?? "Psicomorfosis", color: "#ffffff", fontSize: 20, bold: true, characterSpacing: 0, margin: [0, 0, 0, 0] },
                            { text: ws?.mode === "organization" ? "Centro de psicología clínica" : "Consultorio de psicología clínica", fontSize: 10, color: COLORS.soft, margin: [0, 4, 0, 0] },
                          ]
                        : [],
                      margin: [ctx.showLogo ? 12 : 0, 0, 0, 0],
                    },
                  ],
                  columnGap: 0,
                },
                {
                  width: "auto",
                  stack: [
                    // Badge de estado — el check va como canvas (no unicode)
                    // dentro de una tabla de 1 fila para mantener fillColor.
                    {
                      table: {
                        widths: ["auto"],
                        body: [[{
                          columns: [
                            ...(statusBadge.check
                              ? [{
                                  width: 12,
                                  canvas: [
                                    // Check (✓) dibujado a mano: dos líneas
                                    { type: "polyline", lineWidth: 1.6, lineColor: statusBadge.fg, points: [{ x: 0, y: 5 }, { x: 4, y: 9 }, { x: 11, y: 1 }] },
                                  ],
                                  margin: [0, 3, 0, 0],
                                }]
                              : []),
                            {
                              width: "auto",
                              text: statusBadge.label,
                              color: statusBadge.fg,
                              fontSize: 9,
                              bold: true,
                              characterSpacing: 0.6,
                              margin: [statusBadge.check ? 4 : 0, 0, 0, 0],
                            },
                          ],
                          fillColor: statusBadge.bg,
                          margin: [12, 5, 12, 5],
                          border: [false, false, false, false],
                        }]],
                      },
                      layout: "noBorders",
                      alignment: "right",
                    },
                    { text: inv.id, color: COLORS.soft, fontSize: 12, bold: true, alignment: "right", margin: [0, 10, 0, 0], characterSpacing: 0.4 },
                    { text: `Emitido: ${fmtDateShort(inv.created_at ?? inv.date)}`, color: COLORS.soft, fontSize: 9, alignment: "right", margin: [0, 2, 0, 0] },
                  ],
                },
              ],
            },
          ]],
        },
        layout: "noBorders",
      },
      personasBlock,
      { canvas: [{ type: "line", x1: 36, y1: 0, x2: 559, y2: 0, lineWidth: 0.75, lineColor: COLORS.border }] },
      { text: "DETALLE DE SERVICIOS", style: "tinyHead", margin: [36, 22, 36, 12] },
      servicesTable,
      paymentBlock,
      totalBlock,
      footer,
    ],
  };
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
