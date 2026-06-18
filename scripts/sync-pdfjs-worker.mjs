#!/usr/bin/env node
/**
 * Sincroniza el worker de pdfjs-dist a public/pdfjs-worker.mjs.
 *
 * Por qué está en public/ y no procesado por Vite con `?url`:
 *   ver src/lib/pdfslick-setup.ts (sección WORKER_VERSION).
 *
 * Uso:
 *   node scripts/sync-pdfjs-worker.mjs
 *
 * Cuándo correr:
 *   - Al actualizar la versión de `pdfjs-dist` en package.json.
 *   - Si el archivo en public/ se borró por error.
 *
 * Después de regenerar, si el contenido cambió, recordá bumpear
 * WORKER_VERSION en src/lib/pdfslick-setup.ts para que los browsers
 * de los usuarios descarguen la versión nueva (en lugar de servir
 * la versión vieja cacheada por path).
 */

import { copyFileSync, statSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const src = resolve(root, "node_modules/pdfjs-dist/build/pdf.worker.min.mjs");
const dest = resolve(root, "public/pdfjs-worker.mjs");

if (!existsSync(src)) {
  console.error(`✗ No existe ${src}`);
  console.error("  ¿Corriste npm install primero?");
  process.exit(1);
}

const before = existsSync(dest) ? statSync(dest).size : 0;
copyFileSync(src, dest);
const after = statSync(dest).size;

console.log(`✓ ${dest}`);
console.log(`  ${(after / 1024).toFixed(1)} KB${before && before !== after ? ` (antes: ${(before / 1024).toFixed(1)} KB)` : ""}`);
if (before && before !== after) {
  console.log("");
  console.log("⚠ El contenido del worker cambió. Recordá bumpear WORKER_VERSION");
  console.log("  en src/lib/pdfslick-setup.ts para invalidar el cache de los browsers.");
}
