/**
 * Renderer TipTap → PDF (server-side, sin Chromium).
 *
 * Convierte el body_json de un documento a la estructura de pdfmake y
 * devuelve un stream listo para hacer pipe a la respuesta HTTP. Se usa en
 * GET /api/documents/:id/pdf.
 *
 * Subset soportado del editor: paragraph, heading 1-3, bulletList,
 * orderedList, taskList, blockquote, codeBlock, horizontalRule, image,
 * table, callout (custom), attachment (custom), signature (custom),
 * variable (custom), text con marks bold/italic/underline/strike/link.
 *
 * Notas:
 * - Las variables {{paciente.nombre}} se resuelven con el ctx que se pasa.
 * - Las imágenes /api/uploads/... se leen del filesystem y se incrustan
 *   como base64 (pdfmake las necesita resueltas).
 * - Tipografía: Roboto (built-in en pdfmake/Roboto/vfs_fonts).
 */

import PdfPrinter from "pdfmake";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// pdfmake necesita fuentes TTF en disk. Las TTF de Roboto están commiteadas
// en server/fonts/ (Apache 2.0, ~1.2MB total).
const FONTS_DIR = path.join(__dirname, "..", "..", "fonts");
// Bold REAL (Roboto-Bold, peso 700). Antes "bold" mapeaba a Roboto-Medium
// (peso 500) y los títulos del PDF se veían planos, casi iguales al body.
// Fallback a Medium si el TTF Bold no está en disk (deploys viejos).
const boldTtf = fs.existsSync(path.join(FONTS_DIR, "Roboto-Bold.ttf"))
  ? "Roboto-Bold.ttf" : "Roboto-Medium.ttf";
const boldItalicTtf = fs.existsSync(path.join(FONTS_DIR, "Roboto-BoldItalic.ttf"))
  ? "Roboto-BoldItalic.ttf" : "Roboto-MediumItalic.ttf";
const fonts = {
  Roboto: {
    normal:      path.join(FONTS_DIR, "Roboto-Regular.ttf"),
    bold:        path.join(FONTS_DIR, boldTtf),
    italics:     path.join(FONTS_DIR, "Roboto-Italic.ttf"),
    bolditalics: path.join(FONTS_DIR, boldItalicTtf),
  },
};
// Serif para certificados (Libre Baskerville, OFL — ver fonts/LibreBaskerville-OFL.txt).
// Estáticas generadas desde la variable de Google Fonts (wght 400/700).
if (fs.existsSync(path.join(FONTS_DIR, "LibreBaskerville-Regular.ttf"))) {
  fonts.Serif = {
    normal:      path.join(FONTS_DIR, "LibreBaskerville-Regular.ttf"),
    bold:        path.join(FONTS_DIR, "LibreBaskerville-Bold.ttf"),
    italics:     path.join(FONTS_DIR, "LibreBaskerville-Italic.ttf"),
    bolditalics: path.join(FONTS_DIR, "LibreBaskerville-Bold.ttf"),
  };
}
const SERIF = fonts.Serif ? "Serif" : "Roboto";
const printer = new PdfPrinter(fonts);

// Color de marca (teal clínico de Psicomorfosis) para títulos, variables
// y links del PDF. Antes era un púrpura (#4a3a8c) fuera de la paleta.
const BRAND = "#2e5f66";
const INK = "#1f2937";
const MUTED = "#6b7280";

// Directorio donde están las imágenes inline (assets) subidas desde el editor.
const ASSETS_DIR = path.join(__dirname, "..", "..", "uploads", "assets");
const DOCS_DIR = path.join(__dirname, "..", "..", "uploads", "documents");
const SIGNATURES_DIR = path.join(__dirname, "..", "..", "uploads", "signatures");

/** Resuelve {{ruta.dotted}} contra el ctx. Si no encuentra valor, deja `{{key}}`. */
function resolveVar(key, ctx) {
  const parts = key.split(".");
  let v = ctx;
  for (const p of parts) {
    if (v == null) return "______________";
    v = v[p];
  }
  if (v == null || (typeof v === "string" && (!v.trim() || /^_+$/.test(v.trim())))) return "______________";
  return String(v);
}

/** Resuelve un asset URL relativo a un path absoluto en disk para pdfmake. */
function resolveImagePath(src, workspaceId) {
  if (!src) return null;
  // /api/uploads/assets/<ws>/<filename> o /api/uploads/documents/<ws>/<filename>
  const m = src.match(/\/api\/uploads\/(assets|documents)\/(\d+)\/(.+)$/);
  if (m) {
    const [, kind, ws, filename] = m;
    const root = kind === "assets" ? ASSETS_DIR : DOCS_DIR;
    const p = path.join(root, ws, filename);
    if (fs.existsSync(p)) return p;
  }
  // Firma guardada del profesional: /api/uploads/signatures/<archivo>?v=<cache-buster>
  const sig = src.match(/\/api\/uploads\/signatures\/([^/?#]+)/);
  if (sig) {
    const p = path.join(SIGNATURES_DIR, path.basename(sig[1]));
    if (fs.existsSync(p)) return p;
  }
  // data:image/...;base64,xxxx
  if (src.startsWith("data:image/")) return src;
  // URL externa: pdfmake no la soporta sin fetch — se omite
  void workspaceId;
  return null;
}

/** Convierte text + marks a la estructura inline de pdfmake. */
function textWithMarks(text, marks) {
  const node = { text };
  if (!marks || marks.length === 0) return node;
  for (const m of marks) {
    if (m.type === "bold") node.bold = true;
    else if (m.type === "italic") node.italics = true;
    else if (m.type === "underline") node.decoration = "underline";
    else if (m.type === "strike") node.decoration = "lineThrough";
    else if (m.type === "code") { node.font = undefined; node.background = "#f1efea"; }
    else if (m.type === "link") {
      const href = m.attrs?.href;
      if (href) { node.link = href; node.color = BRAND; node.decoration = "underline"; }
    }
  }
  return node;
}

/** Aplana un array de inline nodes (text/variable) a inline pdfmake. */
function inlineFromContent(contentArr, ctx) {
  if (!Array.isArray(contentArr)) return [];
  const out = [];
  for (const ch of contentArr) {
    if (!ch) continue;
    if (ch.type === "text") {
      out.push(textWithMarks(ch.text ?? "", ch.marks));
    } else if (ch.type === "variable") {
      const key = ch.attrs?.key ?? "";
      out.push({ text: resolveVar(key, ctx), color: BRAND, bold: true });
    } else if (ch.type === "hardBreak") {
      out.push({ text: "\n" });
    } else if (ch.type === "image") {
      // Imagen inline: la sacamos a un bloque aparte
      out.push({ text: "[imagen]", italics: true, color: "#888" });
    }
  }
  return out;
}

/** Convierte un node block-level a una entrada pdfmake (o null). */
function blockToPdf(node, ctx, workspaceId) {
  if (!node) return null;

  switch (node.type) {
    case "paragraph": {
      const inline = inlineFromContent(node.content, ctx);
      const align = node.attrs?.textAlign;
      return { text: inline.length ? inline : " ", margin: [0, 0, 0, 6], alignment: align || undefined };
    }
    case "heading": {
      const level = node.attrs?.level ?? 1;
      // Jerarquía tipográfica clara: H1 grande en tinta, H2 en color de
      // marca (separa secciones de un vistazo), H3 compacto en mayúsculas
      // con tracking — el patrón "overline" clásico de informes.
      const align = node.attrs?.textAlign;
      const inline = inlineFromContent(node.content, ctx);
      if (level === 3) {
        const upper = inline.map((n) => ({ ...n, text: String(n.text ?? "").toUpperCase() }));
        return {
          text: upper, fontSize: 10, bold: true, characterSpacing: 0.8,
          color: MUTED, margin: [0, 14, 0, 5], alignment: align || undefined,
        };
      }
      const style = level === 1
        ? { fontSize: 19, color: INK, margin: [0, 18, 0, 8] }
        : { fontSize: 14.5, color: BRAND, margin: [0, 16, 0, 6] };
      return { text: inline, bold: true, alignment: align || undefined, ...style };
    }
    case "bulletList": {
      return {
        ul: (node.content ?? []).map((li) => listItem(li, ctx, workspaceId)),
        margin: [0, 0, 0, 8],
      };
    }
    case "orderedList": {
      return {
        ol: (node.content ?? []).map((li) => listItem(li, ctx, workspaceId)),
        margin: [0, 0, 0, 8],
      };
    }
    case "taskList": {
      return {
        ul: (node.content ?? []).map((it) => {
          const checked = !!it.attrs?.checked;
          const inner = (it.content ?? []).map((c) => blockToPdf(c, ctx, workspaceId)).filter(Boolean);
          return [{ text: (checked ? "☑ " : "☐ "), bold: true }, ...inner];
        }),
        type: "none",
        margin: [0, 0, 0, 8],
      };
    }
    case "blockquote": {
      return {
        stack: (node.content ?? []).map((c) => blockToPdf(c, ctx, workspaceId)).filter(Boolean),
        italics: true,
        color: "#666",
        margin: [12, 0, 0, 8],
      };
    }
    case "codeBlock": {
      const t = (node.content ?? []).map((c) => c.text ?? "").join("");
      return {
        text: t,
        font: "Roboto",
        fontSize: 9,
        background: "#f1efea",
        margin: [0, 0, 0, 8],
      };
    }
    case "horizontalRule": {
      return {
        canvas: [{ type: "line", x1: 0, y1: 4, x2: 515, y2: 4, lineWidth: 0.5, lineColor: "#d4d4d4" }],
        margin: [0, 6, 0, 10],
      };
    }
    case "image": {
      const src = node.attrs?.src;
      const widthAttr = node.attrs?.width;
      const resolved = resolveImagePath(src, workspaceId);
      if (!resolved) return { text: "[imagen no disponible]", italics: true, color: "#888", margin: [0, 0, 0, 6] };
      // width "50%" -> ~257pt. Default máx 480pt.
      let width = 480;
      if (typeof widthAttr === "string" && widthAttr.endsWith("%")) {
        const pct = parseInt(widthAttr, 10) / 100;
        width = Math.round(515 * pct);
      }
      return { image: resolved, width, margin: [0, 4, 0, 8] };
    }
    case "table": {
      const rows = (node.content ?? []).map((row) =>
        (row.content ?? []).map((cell) => {
          const cellInner = (cell.content ?? []).map((c) => blockToPdf(c, ctx, workspaceId)).filter(Boolean);
          return cellInner.length ? cellInner : { text: "" };
        })
      );
      return {
        table: { body: rows.length ? rows : [[{ text: "" }]] },
        layout: { hLineColor: "#d4d4d4", vLineColor: "#d4d4d4", hLineWidth: () => 0.5, vLineWidth: () => 0.5 },
        margin: [0, 0, 0, 10],
      };
    }
    case "callout": {
      const variant = node.attrs?.variant ?? "info";
      const colors = {
        info:    { bg: "#e9e6f5", fg: BRAND },
        warning: { bg: "#fff4d6", fg: "#7a5b00" },
        danger:  { bg: "#fde8e8", fg: "#9b1c1c" },
        success: { bg: "#e2f4ec", fg: "#1f6b46" },
      };
      const c = colors[variant] ?? colors.info;
      return {
        table: {
          widths: ["*"],
          body: [[
            {
              stack: (node.content ?? []).map((cc) => blockToPdf(cc, ctx, workspaceId)).filter(Boolean),
              fillColor: c.bg,
              color: c.fg,
              margin: [10, 8, 10, 8],
            }
          ]],
        },
        layout: "noBorders",
        margin: [0, 4, 0, 10],
      };
    }
    case "attachment": {
      const name = node.attrs?.name ?? "archivo";
      const url = node.attrs?.url ?? "";
      return {
        text: [{ text: "📎 ", bold: true }, { text: name, link: url, color: BRAND, decoration: "underline" }],
        margin: [0, 4, 0, 8],
      };
    }
    case "signature": {
      const url = node.attrs?.url;
      const name = node.attrs?.name ?? "";
      const tarjeta = node.attrs?.tarjetaProfesional ?? "";
      const signedAt = node.attrs?.signedAt;
      const resolved = resolveImagePath(url, workspaceId);
      const blocks = [];
      if (resolved) {
        blocks.push({ image: resolved, width: 180, margin: [0, 4, 0, 4] });
      }
      blocks.push({
        text: [
          { text: name, bold: true },
          tarjeta ? { text: `\n${tarjeta}` } : null,
          signedAt ? { text: `\nFirmado el ${new Date(signedAt).toLocaleString("es-CO")}`, fontSize: 8, color: "#666" } : null,
        ].filter(Boolean),
        margin: [0, 0, 0, 8],
      });
      return { stack: blocks, margin: [0, 8, 0, 8] };
    }
    default:
      // Si tiene content, intentar recursivo; si no, devolver vacío
      if (Array.isArray(node.content)) {
        const inner = node.content.map((c) => blockToPdf(c, ctx, workspaceId)).filter(Boolean);
        if (inner.length) return { stack: inner };
      }
      return null;
  }
}

function listItem(node, ctx, workspaceId) {
  // Cada item es un listItem que contiene paragraphs/etc
  if (node.type === "listItem") {
    const inner = (node.content ?? []).map((c) => blockToPdf(c, ctx, workspaceId)).filter(Boolean);
    if (inner.length === 1) return inner[0];
    return { stack: inner };
  }
  return blockToPdf(node, ctx, workspaceId);
}

/**
 * Genera el documento PDF y devuelve el stream pdfkit listo para pipe.
 *
 * @param {object} doc        Row del documento (con body_json ya parseado)
 * @param {object} ctx        Contexto de variables (paciente, profesional, ...)
 * @param {object} header     Metadatos del membrete: clinicName, professional, dateLabel, patientName, patientId
 * @param {number} workspaceId  Para resolver paths de imágenes
 */
export function buildPdfStream(doc, ctx, header, workspaceId) {
  const body = doc.body_json && typeof doc.body_json === "object" ? doc.body_json : { type: "doc", content: [] };
  if (doc.type === "certificado") {
    return printer.createPdfKitDocument(buildCertificateDef(doc, body, ctx, header, workspaceId));
  }
  const blocks = (body.content ?? []).map((n) => blockToPdf(n, ctx, workspaceId)).filter(Boolean);

  const docDef = {
    pageSize: "A4",
    pageMargins: [42, 60, 42, 50],
    info: {
      title: doc.name,
      author: header.professional ?? "Psicomorfosis",
      creator: "Psicomorfosis",
      producer: "Psicomorfosis",
    },
    defaultStyle: { font: "Roboto", fontSize: 10.5, lineHeight: 1.45, color: INK },
    header: () => ({
      columns: [
        { text: header.clinicName ?? "Psicomorfosis", style: "headerClinic", margin: [42, 24, 0, 0] },
        { text: header.dateLabel ?? "", alignment: "right", margin: [0, 24, 42, 0], fontSize: 8, color: "#888" },
      ],
    }),
    footer: (currentPage, pageCount) => ({
      columns: [
        { text: header.documentName ?? "", margin: [42, 0, 0, 0], fontSize: 8, color: "#888" },
        { text: `${currentPage} / ${pageCount}`, alignment: "right", margin: [0, 0, 42, 0], fontSize: 8, color: "#888" },
      ],
      margin: [0, 16, 0, 0],
    }),
    content: [
      // Cabecera del doc: título grande + metadatos en línea + filete de
      // marca que separa el membrete del cuerpo (look de informe formal).
      { text: doc.name, fontSize: 21, bold: true, color: BRAND, margin: [0, 0, 0, 6] },
      (header.patientName || header.professional) ? {
        columns: [
          header.patientName
            ? { text: [{ text: "Paciente  ", bold: true, color: MUTED }, { text: `${header.patientName}${header.patientId ? ` (${header.patientId})` : ""}`, color: INK }], fontSize: 9 }
            : { text: "" },
          header.professional
            ? { text: [{ text: "Profesional  ", bold: true, color: MUTED }, { text: header.professional, color: INK }], fontSize: 9, alignment: "right" }
            : { text: "" },
        ],
        margin: [0, 0, 0, 8],
      } : null,
      {
        canvas: [{ type: "line", x1: 0, y1: 0, x2: 511, y2: 0, lineWidth: 1.2, lineColor: BRAND }],
        margin: [0, 0, 0, 16],
      },
      ...blocks,
    ].filter(Boolean),
    styles: {
      headerClinic: { font: "Roboto", fontSize: 10, bold: true, color: BRAND },
    },
  };

  return printer.createPdfKitDocument(docDef);
}

// ─── Certificados: diseño propio ───────────────────────────────────────
//
// Los certificados (type = 'certificado': asistencia, etc.) no usan el
// membrete de informe: marco doble, título serif centrado, cuerpo
// justificado y bloque de firma centrado. El contenido sigue saliendo de
// la plantilla del editor; aquí solo se le da forma de certificado.

const nodeText = (n) => (n?.content ?? []).map((c) => c.text ?? (c.type === "variable" ? "{{v}}" : "")).join("").trim();

function certificateParts(body) {
  let nodes = [...(body.content ?? [])];
  // La firma estampada (Configuración → Mi firma) se reubica en el bloque central.
  const signatures = nodes.filter((n) => n.type === "signature");
  nodes = nodes.filter((n) => n.type !== "signature" && n.type !== "horizontalRule");
  // El título lo pone el diseño: se quita el encabezado "Certificado…" de la plantilla.
  const firstHeading = nodes.findIndex((n) => n.type === "heading");
  if (firstHeading !== -1 && /certificad/i.test(nodeText(nodes[firstHeading]))) nodes.splice(firstHeading, 1);
  // La firma manual de la plantilla ("_____", nombre, T.P.) la reemplaza el bloque de firma.
  const lineIdx = nodes.findIndex((n) => n.type === "paragraph" && /^_{5,}$/.test(nodeText(n)));
  if (lineIdx !== -1) nodes = nodes.slice(0, lineIdx);
  // Sin párrafos vacíos al inicio ni al final.
  while (nodes.length && nodes[0].type === "paragraph" && !nodeText(nodes[0])) nodes.shift();
  while (nodes.length && nodes.at(-1).type === "paragraph" && !nodeText(nodes.at(-1))) nodes.pop();
  return { nodes, signature: signatures[0] ?? null };
}

function certificateBlock(node, ctx, workspaceId) {
  if (node.type === "heading") {
    const txt = inlineFromContent(node.content, ctx).map((n) => ({ ...n, text: String(n.text ?? "").toUpperCase(), color: BRAND, bold: true }));
    return { text: txt, font: "Roboto", fontSize: 10.5, characterSpacing: 2.5, alignment: "center", margin: [0, 14, 0, 12] };
  }
  if (node.type === "paragraph") {
    const inline = inlineFromContent(node.content, ctx).map((n) => (n.color === BRAND ? { ...n, color: INK } : n));
    if (!inline.length) return { text: " ", margin: [0, 0, 0, 4] };
    const isDate = /^dado en/i.test(nodeText(node));
    return isDate
      ? { text: inline, italics: true, color: MUTED, fontSize: 10.5, alignment: "center", margin: [0, 18, 0, 0] }
      // Alineación izquierda: el "justify" de pdfmake mete espacio extra donde
      // cambia la negrita ("Ferrer ,") — se nota justo en los datos variables.
      : { text: inline, margin: [0, 0, 0, 10] };
  }
  return blockToPdf(node, ctx, workspaceId);
}

function buildCertificateDef(doc, body, ctx, header, workspaceId) {
  const { nodes, signature } = certificateParts(body);
  const W = 595.28, H = 841.89;
  const prof = ctx?.profesional ?? {};
  const clinica = ctx?.clinica ?? {};
  const clinicName = clinica.consultorio || header.clinicName || "Psicomorfosis";
  const place = [clinica.direccion, clinica.ciudad].filter((v) => v && String(v).trim()).join(" · ");

  const sigUrl = signature?.attrs?.url;
  const sigImg = sigUrl ? resolveImagePath(sigUrl, workspaceId) : null;
  const signedAt = signature?.attrs?.signedAt || doc.signed_at;
  const tp = signature?.attrs?.tarjetaProfesional && /^T\.P\./.test(signature.attrs.tarjetaProfesional)
    ? signature.attrs.tarjetaProfesional
    : (prof.tarjeta_profesional ? `T.P. ${prof.tarjeta_profesional}` : "");
  const signerName = signature?.attrs?.name || prof.nombre || header.professional || "";

  // Adorno bajo el título: línea · rombo · línea (centrado en el ancho útil 439pt).
  const cx = (W - 78 * 2) / 2;
  const ornament = {
    canvas: [
      { type: "line", x1: cx - 62, y1: 4, x2: cx - 10, y2: 4, lineWidth: 0.6, lineColor: BRAND },
      { type: "polyline", closePath: true, color: BRAND, points: [{ x: cx, y: 0 }, { x: cx + 4, y: 4 }, { x: cx, y: 8 }, { x: cx - 4, y: 4 }] },
      { type: "line", x1: cx + 10, y1: 4, x2: cx + 62, y2: 4, lineWidth: 0.6, lineColor: BRAND },
    ],
    margin: [0, 12, 0, 26],
  };

  return {
    pageSize: "A4",
    pageMargins: [78, 72, 78, 78],
    info: { title: doc.name, author: signerName || "Psicomorfosis", creator: "Psicomorfosis", producer: "Psicomorfosis" },
    defaultStyle: { font: SERIF, fontSize: 11.5, lineHeight: 1.62, color: INK },
    // Marco doble + rombos en las esquinas, en todas las páginas.
    background: () => ({
      canvas: [
        { type: "rect", x: 26, y: 26, w: W - 52, h: H - 52, lineWidth: 1.4, lineColor: BRAND },
        { type: "rect", x: 33, y: 33, w: W - 66, h: H - 66, lineWidth: 0.4, lineColor: "#9fbcbf" },
        ...[[33, 33], [W - 33, 33], [33, H - 33], [W - 33, H - 33]].map(([x, y]) => ({
          type: "polyline", closePath: true, color: BRAND,
          points: [{ x, y: y - 5 }, { x: x + 5, y }, { x, y: y + 5 }, { x: x - 5, y }],
        })),
      ],
    }),
    footer: () => ({
      text: `Código de verificación ${doc.id}  ·  Emitido con Psicomorfosis`,
      alignment: "center", font: "Roboto", fontSize: 7.5, color: "#94a3a5", characterSpacing: 0.3,
      margin: [0, 34, 0, 0],
    }),
    content: [
      { text: String(clinicName).toUpperCase(), alignment: "center", font: "Roboto", bold: true, fontSize: 9, characterSpacing: 2.2, color: BRAND },
      place ? { text: place, alignment: "center", font: "Roboto", fontSize: 8, color: MUTED, margin: [0, 3, 0, 0] } : null,
      { text: "CERTIFICADO", alignment: "center", fontSize: 30, bold: true, characterSpacing: 5, color: BRAND, margin: [0, 28, 0, 0] },
      { text: "DE ASISTENCIA PSICOLÓGICA", alignment: "center", font: "Roboto", fontSize: 9.5, characterSpacing: 3.2, color: MUTED, margin: [0, 6, 0, 0] },
      ornament,
      ...nodes.map((n) => certificateBlock(n, ctx, workspaceId)).filter(Boolean),
      // Bloque de firma centrado
      {
        stack: [
          sigImg
            ? { image: sigImg, fit: [170, 62], alignment: "center", margin: [0, 0, 0, 2] }
            : { text: " ", margin: [0, 34, 0, 0] },
          { canvas: [{ type: "line", x1: cx - 100, y1: 0, x2: cx + 100, y2: 0, lineWidth: 0.7, lineColor: INK }], margin: [0, 2, 0, 6] },
          { text: signerName, alignment: "center", bold: true, fontSize: 11 },
          { text: ["Psicólogo(a)", tp].filter(Boolean).join("  ·  "), alignment: "center", font: "Roboto", fontSize: 8.5, color: MUTED, margin: [0, 2, 0, 0] },
          signedAt
            ? { text: `Firmado digitalmente el ${new Date(signedAt).toLocaleDateString("es-CO", { day: "numeric", month: "long", year: "numeric" })}`, alignment: "center", font: "Roboto", fontSize: 7.5, color: "#94a3a5", margin: [0, 4, 0, 0] }
            : null,
        ].filter(Boolean),
        margin: [0, 30, 0, 0],
        unbreakable: true,
      },
    ].filter(Boolean),
  };
}
