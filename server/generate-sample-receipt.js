/**
 * Genera un PDF de muestra del recibo (template esquina_verde) directamente
 * a un archivo en notas_claude/. No requiere DB ni servidor — solo importa
 * el renderer y le pasa datos hardcoded.
 *
 * Uso: cd server && node generate-sample-receipt.js
 */
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import PdfPrinter from "pdfmake";
import { templateEsquinaVerde, templateMinimal } from "./src/lib/receiptTemplates.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FONTS_DIR = path.join(__dirname, "fonts");
const printer = new PdfPrinter({
  Roboto: {
    normal:      path.join(FONTS_DIR, "Roboto-Regular.ttf"),
    bold:        path.join(FONTS_DIR, "Roboto-Medium.ttf"),
    italics:     path.join(FONTS_DIR, "Roboto-Italic.ttf"),
    bolditalics: path.join(FONTS_DIR, "Roboto-MediumItalic.ttf"),
  },
});

// Datos de muestra similares a la referencia que adjuntó el usuario
const inv = {
  id: "F-2026-0108",
  patient_id: "PAC-00312",
  patient_name: "Laura Molina",
  professional: "Nathaly Ferrer Pacheco",
  concept: "Sesión de Psicoterapia Individual",
  amount: 180000,
  method: "Tarjeta",
  bank: null,
  eps: null,
  payment_reference: "TXN-20260430-87341",
  payment_notes: null,
  status: "pagada",
  date: "2026-04-14",
  modality: "Presencial",
  paid_at: new Date("2026-04-30T15:00:00").toISOString(),
  created_at: new Date("2026-04-30T15:00:00").toISOString(),
};

const ws = {
  id: 1,
  name: "Consulta Psic. Nathaly Ferrer",
  mode: "individual",
};

const prof = {
  name: "Nathaly Ferrer Pacheco",
  title: "Psicóloga clínica · TP 34-7801",
  email: "nathaly@psicomorfosis.co",
  phone: "+57 304 219 0650",
};

const settings = {
  email: "contacto@psicomorfosis.co",
  address: "Cartagena de Indias · Torices",
  city: "Cartagena",
};

const ctx = {
  inv,
  ws,
  prof,
  settings,
  showLogo: true,    // muestra el placeholder con iniciales (no hay logo subido)
  showName: true,
  logoPath: null,
  logoSize: { width: 90, height: 28 },
};

const OUT_DIR = path.join(__dirname, "..", "notas_claude");
fs.mkdirSync(OUT_DIR, { recursive: true });

function writeOne(name, doc) {
  const out = path.join(OUT_DIR, name);
  const stream = printer.createPdfKitDocument(doc);
  const file = fs.createWriteStream(out);
  stream.pipe(file);
  stream.end();
  return new Promise((resolve, reject) => {
    file.on("finish", () => resolve(out));
    file.on("error", reject);
  });
}

(async () => {
  try {
    const a = await writeOne("recibo-esquina-verde.pdf", templateEsquinaVerde(ctx));
    console.log("✓", a);
    const b = await writeOne("recibo-minimal.pdf", templateMinimal(ctx));
    console.log("✓", b);
  } catch (e) {
    console.error("[gen]", e);
    process.exit(1);
  }
})();
