/**
 * Setup del worker de PDF.js para PDFSlick.
 *
 * PDF.js corre el render en un Worker para no bloquear el main thread.
 * Vite tiene que saber DÓNDE servir el archivo del worker. Lo importamos
 * con `?url` para que Vite lo procese como asset estático y nos devuelva
 * la URL final (incluye el hash de build, vive bajo /_build/assets/...
 * en producción).
 *
 * Sin este setup, PDFSlick intenta cargar el worker desde un CDN o
 * desde la URL relativa al script — ambas fallan en producción detrás
 * de nginx con cache-control agresivo.
 */
// eslint-disable-next-line import/no-unresolved
import workerSrc from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { GlobalWorkerOptions } from "pdfjs-dist";

let configured = false;

/**
 * Idempotente: si se llama dos veces (ej: HMR durante dev), no rompe.
 * Setea el workerSrc global de pdfjs-dist y lo deja listo para que
 * `usePDFSlick` lo use al instanciar PDFs.
 */
export function ensurePdfSlickSetup(): void {
  if (configured) return;
  GlobalWorkerOptions.workerSrc = workerSrc;
  configured = true;
}
