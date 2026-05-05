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
 * Un solo template visual: `templateEsquinaVerde`. `templateMinimal` queda
 * como alias por compatibilidad con el dispatcher y settings antiguos.
 */

// Helpers exportados — reusados también por certificateTemplate.js (Fase 4).
export function fmtCop(n) {
  return new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(n ?? 0);
}

export function fmtDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso.length === 10 ? iso + "T00:00:00" : iso);
  return d.toLocaleDateString("es-CO", { day: "numeric", month: "long", year: "numeric" });
}

export function fmtDateShort(iso) {
  if (!iso) return "—";
  const d = new Date(iso.length === 10 ? iso + "T00:00:00" : iso);
  const day = d.getDate();
  const months = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
  return `${day} ${months[d.getMonth()]} ${d.getFullYear()}`;
}

function methodSummary(inv) {
  const parts = [];
  if (inv.method) parts.push(inv.method);
  if (inv.method === "Transferencia" && inv.bank) parts.push(`· ${inv.bank}`);
  if (inv.method === "Convenio" && inv.eps) parts.push(`· ${inv.eps}`);
  return parts.length ? parts.join(" ") : "Sin método";
}

export function joinAddress(address, city) {
  const a = (address ?? "").trim();
  const c = (city ?? "").trim();
  if (!a && !c) return "";
  if (!a) return c;
  if (!c) return a;
  if (a.toLowerCase().includes(c.toLowerCase())) return a;
  return `${a} · ${c}`;
}

// Mezcla un hex con blanco (`ratio` = porcentaje de blanco). Devuelve hex.
// Permite derivar la paleta completa (background tintado + texto sobre brand)
// a partir de un único color base elegido por el usuario.
export function tintWithWhite(hex, ratio) {
  const h = (hex || "").replace("#", "");
  if (h.length !== 6) return hex;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  const mix = (c) => Math.round(c * (1 - ratio) + 255 * ratio);
  const toHex = (n) => Math.max(0, Math.min(255, n)).toString(16).padStart(2, "0");
  return `#${toHex(mix(r))}${toHex(mix(g))}${toHex(mix(b))}`;
}

export function isValidHex(s) {
  return typeof s === "string" && /^#[0-9a-f]{6}$/i.test(s);
}

// ════════════════════════════════════════════════════════════════════════════
// TEMPLATE: recibo profesional (un solo diseño).
// Header dark teal full-bleed con logo opcional + nombre y, a la derecha, una
// píldora de estado, ID del recibo y fecha. Bloque paciente/profesional con
// jerarquía tipográfica (sin avatares ni labels en versalita gritando).
// Concepto + valor en una línea (la tabla solo aparecería con >1 servicio,
// que el modelo actual no soporta). Banda de TOTAL teal-claro al pie con el
// monto grande en teal-900. Footer 1 línea + disclaimer DIAN.
// ════════════════════════════════════════════════════════════════════════════
export function templateEsquinaVerde(ctx) {
  const { inv, ws, prof, settings } = ctx;

  // Paleta — 5 tokens neutros + 3 derivados del color de marca elegido por
  // el usuario (`settings.receipt_brand_color`). Si no hay setting o el hex
  // es inválido, cae al teal por defecto.
  const brand = isValidHex(settings.receipt_brand_color) ? settings.receipt_brand_color : "#2e4142";
  const C = {
    bg:      "#ffffff",
    ink:     "#1a2425",
    inkSoft: "#5a6b6c",
    mute:    "#9aa8a8",
    border:  "#e2ebeb",
    brand,                                  // header + total + ID
    brandBg: tintWithWhite(brand, 0.92),    // banda del total
    onBrand: tintWithWhite(brand, 0.65),    // texto secundario sobre header
  };

  // Píldora de estado: fondo sólido + texto, sin iconos. La de "pagada" usa
  // fondo blanco (alto contraste sobre el header brand) — las demás llevan
  // su propia paleta semántica.
  const STATUS = {
    pagada:    { bg: "#ffffff", fg: C.brand,    label: "PAGADO"    },
    pendiente: { bg: "#fef3c7", fg: "#92400e",  label: "PENDIENTE" },
    vencida:   { bg: "#fee2e2", fg: "#991b1b",  label: "VENCIDO"   },
    borrador:  { bg: "#e5e7eb", fg: "#374151",  label: "BORRADOR"  },
  };
  const status = STATUS[inv.status] ?? STATUS.borrador;

  const PAD = 50; // padding lateral del cuerpo + del header full-bleed
  const CONTENT_W = 595 - PAD * 2; // A4 ancho - paddings

  // ── HEADER ──────────────────────────────────────────────────────────────
  // Layout vertical a la izquierda: logo arriba (si está), nombre debajo y
  // subtítulo del consultorio. A la derecha: pill de estado, ID y fecha de
  // emisión. Tabla full-bleed con fillColor brand.
  const headerLeftStack = [];
  const hasLogo = ctx.showLogo && ctx.logoPath;
  if (hasLogo) {
    // `fit` preserva la proporción del logo dentro del bounding box, en lugar
    // de forzar width+height (que estiraba/aplastaba logos no cuadrados).
    headerLeftStack.push({ image: ctx.logoPath, fit: [ctx.logoSize.width, ctx.logoSize.height] });
  } else if (ctx.showName) {
    // Sin logo: una micro-etiqueta editorial encima del nombre para dar contexto.
    headerLeftStack.push({ text: "RECIBO", fontSize: 8.5, color: C.onBrand, characterSpacing: 1.8 });
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

  const statusPill = {
    table: {
      widths: ["auto"],
      body: [[{
        text: status.label,
        color: status.fg,
        fillColor: status.bg,
        fontSize: 8.5,
        bold: true,
        characterSpacing: 0.8,
        margin: [10, 4, 10, 4],
        border: [false, false, false, false],
      }]],
    },
    layout: "noBorders",
  };

  const headerRight = {
    width: "auto",
    stack: [
      // Pill alineada a la derecha vía un columns spacer.
      { columns: [{ width: "*", text: "" }, statusPill] },
      { text: inv.id, color: "#ffffff", fontSize: 13, bold: true, alignment: "right", margin: [0, 12, 0, 0], characterSpacing: 0.3 },
      { text: `Emitido ${fmtDateShort(inv.created_at ?? inv.date)}`, color: C.onBrand, fontSize: 9, alignment: "right", margin: [0, 2, 0, 0] },
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

  // ── PERSONAS ────────────────────────────────────────────────────────────
  // Sin avatares, sin línea vertical en medio: solo tipografía. Label chico
  // gris arriba, nombre Medium, meta gris debajo. columnGap se encarga.
  const persona = (label, name, meta) => ({
    width: "*",
    stack: [
      { text: label, fontSize: 8.5, color: C.mute },
      { text: name || "—", fontSize: 13, bold: true, color: C.ink, margin: [0, 4, 0, 0] },
      ...(meta ? [{ text: meta, fontSize: 9.5, color: C.mute, margin: [0, 2, 0, 0] }] : []),
    ],
  });
  const personas = {
    margin: [PAD, 26, PAD, 0],
    columns: [
      persona("Paciente", inv.patient_name, inv.patient_id ? `ID ${inv.patient_id}` : null),
      persona("Profesional", prof?.name ?? inv.professional, prof?.title ?? null),
    ],
    columnGap: 36,
  };

  // ── SEPARADOR ───────────────────────────────────────────────────────────
  const separator = (top) => ({
    canvas: [{ type: "line", x1: 0, y1: 0, x2: CONTENT_W, y2: 0, lineWidth: 0.5, lineColor: C.border }],
    margin: [PAD, top, PAD, 0],
  });

  // ── CONCEPTO + VALOR (una sola línea) ───────────────────────────────────
  const conceptMeta = [];
  if (inv.modality) conceptMeta.push(inv.modality);
  conceptMeta.push(fmtDateShort(inv.date));
  const conceptBlock = {
    margin: [PAD, 22, PAD, 0],
    columns: [
      {
        width: "*",
        stack: [
          { text: inv.concept || "—", fontSize: 12, bold: true, color: C.ink },
          { text: conceptMeta.join(" · "), fontSize: 9.5, color: C.mute, margin: [0, 3, 0, 0] },
        ],
      },
      {
        width: "auto",
        text: fmtCop(inv.amount),
        fontSize: 13,
        bold: true,
        color: C.ink,
        alignment: "right",
        margin: [0, 2, 0, 0],
      },
    ],
  };

  // ── MÉTODO DE PAGO ──────────────────────────────────────────────────────
  // Una línea: "Método · Banco/EPS · Ref XXX" + meta gris debajo con la
  // fecha de pago si aplica. Sin iconos, sin tabla.
  const methodLine = (() => {
    const parts = [methodSummary(inv)];
    if (inv.payment_reference) parts.push(`Ref ${inv.payment_reference}`);
    return parts.join(" · ");
  })();
  const methodMeta = inv.status === "pagada" && inv.paid_at ? `Pagado el ${fmtDate(inv.paid_at)}` : null;
  const showMethod = !!inv.method || inv.status === "pagada";
  const paymentBlock = showMethod ? {
    margin: [PAD, 16, PAD, 0],
    stack: [
      { text: "Método de pago", fontSize: 8.5, color: C.mute },
      { text: methodLine, fontSize: 11, color: C.ink, margin: [0, 4, 0, 0] },
      ...(methodMeta ? [{ text: methodMeta, fontSize: 9.5, color: C.mute, margin: [0, 2, 0, 0] }] : []),
    ],
  } : null;

  // ── NOTAS (solo si existen) ─────────────────────────────────────────────
  const notesBlock = inv.payment_notes ? {
    margin: [PAD, 12, PAD, 0],
    text: [
      { text: "Notas: ", fontSize: 9.5, color: C.mute, italics: true },
      { text: inv.payment_notes, fontSize: 9.5, color: C.inkSoft, italics: true },
    ],
  } : null;

  // ── TOTAL (banda full-bleed teal-50, monto en teal-900) ─────────────────
  const totalLabel = inv.status === "pagada" ? "TOTAL PAGADO" : "TOTAL";
  const totalBlock = {
    margin: [0, 28, 0, 0],
    table: {
      widths: ["*"],
      body: [[{
        fillColor: C.brandBg,
        margin: [PAD, 20, PAD, 20],
        columns: [
          {
            width: "*",
            stack: [
              { text: totalLabel, fontSize: 9, bold: true, color: C.brand, characterSpacing: 1.4 },
              { text: "1 servicio", fontSize: 9.5, color: C.inkSoft, margin: [0, 3, 0, 0] },
            ],
          },
          {
            width: "auto",
            text: fmtCop(inv.amount),
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

  // ── FOOTER + DISCLAIMER ─────────────────────────────────────────────────
  const addressLine = joinAddress(settings.address, settings.city);
  const footerLeftItems = [];
  if (settings.email) footerLeftItems.push(settings.email);
  if (addressLine) footerLeftItems.push(addressLine);
  const footer = {
    margin: [PAD, 18, PAD, 0],
    columns: [
      { width: "*", text: footerLeftItems.join("  ·  "), fontSize: 9, color: C.mute },
      { width: "auto", text: `Generado ${fmtDateShort(new Date().toISOString())}`, fontSize: 9, color: C.mute, alignment: "right" },
    ],
  };
  const disclaimer = {
    margin: [PAD, 8, PAD, 0],
    text: "Comprobante de pago — no constituye factura electrónica DIAN.",
    fontSize: 8,
    color: C.mute,
    italics: true,
  };

  return {
    pageSize: "A4",
    pageMargins: [0, 0, 0, 40],
    info: { title: `Recibo ${inv.id}`, author: ws?.name ?? "Psicomorfosis", creator: "Psicomorfosis" },
    defaultStyle: { font: "Roboto", fontSize: 10, lineHeight: 1.4, color: C.ink },
    content: [
      header,
      personas,
      separator(22),
      conceptBlock,
      separator(18),
      ...(paymentBlock ? [paymentBlock] : []),
      ...(notesBlock ? [notesBlock] : []),
      totalBlock,
      footer,
      disclaimer,
    ],
  };
}

// Alias por compatibilidad: settings antiguos pueden tener
// `receipt_template = "minimal"` y no queremos romper esos workspaces.
export const templateMinimal = templateEsquinaVerde;

/**
 * Despachador. Devuelve la docDefinition según `template`.
 * Acepta cualquier valor — siempre devuelve el template unificado.
 */
export function buildReceiptDoc(ctx) {
  return templateEsquinaVerde(ctx);
}
