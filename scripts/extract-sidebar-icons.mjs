#!/usr/bin/env node
/**
 * Extrae los SVGs de los iconos del sidebar desde lucide-react para
 * usarlos en diseños externos (Figma, og:image, etc).
 *
 * Lucide guarda cada icono como un array de [tag, attrs] dentro de
 * un .js. Reconstruimos el SVG estándar (viewBox 24, stroke 2, etc.).
 *
 * Uso:
 *   node scripts/extract-sidebar-icons.mjs
 *
 * Salida: public/branding/icons/<slug>.svg
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const LUCIDE_DIR = path.join(ROOT, "node_modules", "lucide-react", "dist", "esm", "icons");
const OUT_DIR = path.join(ROOT, "public", "branding", "icons");

// Iconos del sidebar (los nombres deben coincidir con los .js de
// lucide-react/dist/esm/icons/, en kebab-case).
const ICONS = [
  { label: "Inicio", slug: "inicio", file: "layout-dashboard" },
  { label: "Agenda", slug: "agenda", file: "calendar-days" },
  { label: "Pacientes", slug: "pacientes", file: "users" },
  { label: "Tareas", slug: "tareas", file: "list-todo" },
  { label: "Historia clínica", slug: "historia-clinica", file: "clipboard-list" },
  { label: "Tests psicométricos", slug: "tests-psicometricos", file: "brain" },
  { label: "Documentos", slug: "documentos", file: "folder" },
  { label: "Recibos", slug: "recibos", file: "receipt" },
  { label: "Reportes", slug: "reportes", file: "chart-column" },
  { label: "Configuración", slug: "configuracion", file: "settings" },
  { label: "Novedades", slug: "novedades", file: "megaphone" },
  // Topbar / acciones globales
  { label: "Notificaciones", slug: "notificaciones", file: "bell" },
  { label: "Buscar (⌘K)", slug: "buscar", file: "search" },
  { label: "Tema oscuro", slug: "tema-oscuro", file: "moon" },
  { label: "Tema claro", slug: "tema-claro", file: "sun" },
];

function attrsToString(attrs) {
  return Object.entries(attrs)
    .filter(([k]) => k !== "key") // 'key' es solo para React, no para SVG
    .map(([k, v]) => `${k}="${v}"`)
    .join(" ");
}

/**
 * Parse del archivo lucide. Captura el array __iconNode con regex
 * (es JS válido pero no podemos importarlo en CommonJS desde un .mjs
 * sin meternos en eval). El formato es estable: cada entry es
 *   ["tag", { d: "...", key: "..." }],
 */
function parseIconFile(filePath) {
  const src = fs.readFileSync(filePath, "utf8");
  const match = src.match(/const\s+__iconNode\s*=\s*\[([\s\S]*?)\];/);
  if (!match) throw new Error(`No se encontró __iconNode en ${filePath}`);
  // eval seguro: el contenido es un array literal JS sin código ejecutable.
  // eslint-disable-next-line no-new-func
  const arr = new Function(`return [${match[1]}];`)();
  return arr;
}

function buildSvg(nodes) {
  const inner = nodes.map(([tag, attrs]) => `  <${tag} ${attrsToString(attrs)} />`).join("\n");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
${inner}
</svg>
`;
}

fs.mkdirSync(OUT_DIR, { recursive: true });
console.log(`Salida: ${path.relative(ROOT, OUT_DIR)}`);
console.log();

let ok = 0, fail = 0;
for (const icon of ICONS) {
  const srcPath = path.join(LUCIDE_DIR, `${icon.file}.js`);
  if (!fs.existsSync(srcPath)) {
    console.error(`  ✗ ${icon.label}: no existe ${icon.file}.js`);
    fail++;
    continue;
  }
  try {
    const nodes = parseIconFile(srcPath);
    const svg = buildSvg(nodes);
    fs.writeFileSync(path.join(OUT_DIR, `${icon.slug}.svg`), svg);
    console.log(`  ✓ ${icon.label.padEnd(28)} → ${icon.slug}.svg`);
    ok++;
  } catch (err) {
    console.error(`  ✗ ${icon.label}: ${err.message}`);
    fail++;
  }
}

// Bonus: copiamos el favicon como "logo-psicomorfosis.svg" para
// completar la set. El componente Logo de la app es un SVG inline en
// React; el favicon es el SVG estable equivalente.
const FAVICON = path.join(ROOT, "public", "favicon.svg");
if (fs.existsSync(FAVICON)) {
  fs.copyFileSync(FAVICON, path.join(OUT_DIR, "logo-psicomorfosis.svg"));
  console.log(`  ✓ Logo Psicomorfosis       → logo-psicomorfosis.svg`);
  ok++;
}

console.log();
console.log(`Listo. ${ok} iconos generados${fail ? `, ${fail} fallidos` : ""}.`);
console.log(`Cada SVG usa stroke="currentColor", así heredan el color CSS.`);
