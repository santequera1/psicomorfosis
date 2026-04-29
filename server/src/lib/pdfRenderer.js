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
const fonts = {
  Roboto: {
    normal:      path.join(FONTS_DIR, "Roboto-Regular.ttf"),
    bold:        path.join(FONTS_DIR, "Roboto-Medium.ttf"),
    italics:     path.join(FONTS_DIR, "Roboto-Italic.ttf"),
    bolditalics: path.join(FONTS_DIR, "Roboto-MediumItalic.ttf"),
  },
};
const printer = new PdfPrinter(fonts);

// Directorio donde están las imágenes inline (assets) subidas desde el editor.
const ASSETS_DIR = path.join(__dirname, "..", "..", "uploads", "assets");
const DOCS_DIR = path.join(__dirname, "..", "..", "uploads", "documents");

/** Resuelve {{ruta.dotted}} contra el ctx. Si no encuentra valor, deja `{{key}}`. */
function resolveVar(key, ctx) {
  const parts = key.split(".");
  let v = ctx;
  for (const p of parts) {
    if (v == null) return `{{${key}}}`;
    v = v[p];
  }
  if (v == null || (typeof v === "string" && /^_+$/.test(v.trim()))) return `{{${key}}}`;
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
      if (href) { node.link = href; node.color = "#4a3a8c"; node.decoration = "underline"; }
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
      out.push({ text: resolveVar(key, ctx), color: "#4a3a8c", bold: true });
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
      const sizes = { 1: 20, 2: 16, 3: 13 };
      const align = node.attrs?.textAlign;
      return {
        text: inlineFromContent(node.content, ctx),
        fontSize: sizes[level] ?? 13,
        bold: true,
        margin: [0, 12, 0, 6],
        color: "#1f1f1f",
        alignment: align || undefined,
      };
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
        info:    { bg: "#e9e6f5", fg: "#4a3a8c" },
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
        text: [{ text: "📎 ", bold: true }, { text: name, link: url, color: "#4a3a8c", decoration: "underline" }],
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
    defaultStyle: { font: "Roboto", fontSize: 10.5, lineHeight: 1.4, color: "#1f1f1f" },
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
      // Bloque de cabecera del doc
      { text: doc.name, fontSize: 18, bold: true, color: "#4a3a8c", margin: [0, 0, 0, 4] },
      header.patientName
        ? { text: `Paciente: ${header.patientName}${header.patientId ? ` (${header.patientId})` : ""}`, fontSize: 9, color: "#666", margin: [0, 0, 0, 4] }
        : null,
      header.professional
        ? { text: `Profesional: ${header.professional}`, fontSize: 9, color: "#666", margin: [0, 0, 0, 14] }
        : null,
      ...blocks,
    ].filter(Boolean),
    styles: {
      headerClinic: { font: "Roboto", fontSize: 10, bold: true, color: "#4a3a8c" },
    },
  };

  return printer.createPdfKitDocument(docDef);
}
