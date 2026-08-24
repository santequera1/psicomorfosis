/**
 * Texto de archivos adjuntos para Laura (PDF y Word).
 *
 * El modelo no "ve" un PDF como ve una imagen: hay que extraerle el
 * texto y pasárselo en el mensaje. PDF vía pdfjs-dist (ya está en el
 * proyecto para el visor), Word vía mammoth (ya estaba para plantillas).
 * PDFs escaneados (solo imagen) no tienen texto: se avisa al usuario.
 *
 * Límites: 8 MB por archivo, 3 archivos, 40 000 caracteres de texto en
 * total (≈10 000 tokens) para no reventar el prompt.
 */
import { createRequire } from "node:module";

export const FILE_TYPES = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);
export const MAX_FILE_BYTES = 8 * 1024 * 1024;
export const MAX_FILES = 3;
export const MAX_TEXT_CHARS = 40_000;

const require = createRequire(import.meta.url);

async function pdfText(buffer) {
  // Build "legacy" = funciona en Node sin DOM. Import dinámico para no
  // cargar pdfjs en cada arranque del servidor. Con tope de tiempo: un
  // PDF patológico no puede colgar el hilo del API.
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const task = pdfjs.getDocument({ data: new Uint8Array(buffer), useSystemFonts: true, isEvalSupported: false });
  const timeout = new Promise((_, rej) => setTimeout(() => rej(new Error("tiempo de lectura agotado")), 12_000));
  let doc;
  try {
    doc = await Promise.race([task.promise, timeout]);
    const parts = [];
    const pages = Math.min(doc.numPages, 40);
    const work = (async () => {
      for (let i = 1; i <= pages; i++) {
        const page = await doc.getPage(i);
        const content = await page.getTextContent();
        const line = content.items.map((it) => ("str" in it ? it.str : "")).join(" ").replace(/\s+/g, " ").trim();
        if (line) parts.push(`[Página ${i}]\n${line}`);
      }
    })();
    await Promise.race([work, timeout]);
    if (doc.numPages > pages) parts.push(`… (${doc.numPages - pages} páginas más no leídas)`);
    return parts.join("\n\n");
  } finally {
    try { await (doc?.destroy?.() ?? task.destroy?.()); } catch { /* noop */ }
  }
}

async function docxText(buffer) {
  const mammoth = require("mammoth");
  const r = await mammoth.extractRawText({ buffer });
  return String(r.value ?? "").replace(/\n{3,}/g, "\n\n").trim();
}

/**
 * files: [{ name, media_type, data (base64) }]
 * Devuelve { text, notes } — `text` listo para pegar al mensaje del
 * usuario, `notes` avisos (archivo sin texto, truncado…).
 */
export async function extractFilesText(files) {
  if (!Array.isArray(files) || files.length === 0) return { text: "", notes: [] };
  const chunks = [];
  const notes = [];
  let budget = MAX_TEXT_CHARS;
  for (const f of files.slice(0, MAX_FILES)) {
    const name = String(f?.name ?? "archivo").slice(0, 120);
    try {
      const buf = Buffer.from(String(f?.data ?? ""), "base64");
      if (buf.length > MAX_FILE_BYTES) { notes.push(`${name}: supera 8 MB, no se leyó.`); continue; }
      let text = f.media_type === "application/pdf" ? await pdfText(buf) : await docxText(buf);
      if (!text || text.replace(/\s/g, "").length < 20) {
        notes.push(`${name}: no tiene texto extraíble (¿escaneado? adjúntalo como imagen).`);
        continue;
      }
      if (text.length > budget) { text = text.slice(0, budget) + "\n… (texto truncado)"; notes.push(`${name}: texto truncado por longitud.`); }
      budget -= text.length;
      chunks.push(`[Archivo adjunto: ${name}]\n${text}\n[Fin de ${name}]`);
      if (budget <= 0) break;
    } catch (e) {
      notes.push(`${name}: no se pudo leer (${String(e?.message ?? e).slice(0, 80)}).`);
    }
  }
  return { text: chunks.join("\n\n"), notes };
}
