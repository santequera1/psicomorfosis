/**
 * Setup del worker de PDF.js para PDFSlick.
 *
 * Servimos el worker desde `/pdfjs-worker.mjs` (en public/, copia del
 * archivo de node_modules/pdfjs-dist/build/) en lugar de dejar que
 * Vite lo procese con hash bajo `/assets/`. Razón:
 *
 *   El worker viene de la lib pdfjs-dist y su contenido es estable
 *   entre builds. Si Vite lo procesa con `?url`, el hash content-based
 *   queda fijo (ej: pdf.worker.min-CrMmvqMo.mjs) build tras build.
 *   Eso es problemático si en cualquier momento el worker se sirvió
 *   con MIME incorrecto y `Cache-Control: immutable` (como pasó en
 *   el incidente del 18 jun 2026): el browser cachea esa versión rota
 *   PARA SIEMPRE y la URL fija nunca cambia para invalidarla.
 *
 *   Con un path estable bajo public/ + query versionado (?v=N) podemos:
 *     - Forzar a TODOS los browsers a descargar fresh subiendo el
 *       número de versión (cambio de query = URL nueva = cache miss).
 *     - Servir desde el location `/` de nginx, sin `immutable`.
 *
 * Subir WORKER_VERSION invalida globalmente — útil para emergencias
 * de cache. Aumentar también si se actualiza pdfjs-dist y el contenido
 * del archivo cambia.
 */
import { GlobalWorkerOptions } from "pdfjs-dist";

const WORKER_VERSION = "1";
const WORKER_URL = `/pdfjs-worker.mjs?v=${WORKER_VERSION}`;

let configured = false;

/**
 * Idempotente: si se llama dos veces (ej: HMR durante dev), no rompe.
 * Setea el workerSrc global de pdfjs-dist y lo deja listo para que
 * `usePDFSlick` lo use al instanciar PDFs.
 */
export function ensurePdfSlickSetup(): void {
  if (configured) return;
  GlobalWorkerOptions.workerSrc = WORKER_URL;
  configured = true;
}
