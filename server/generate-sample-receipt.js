/**
 * Genera 4 PDFs de muestra del recibo (un fixture por estado/método) en
 * notas_claude/. No requiere DB ni servidor — solo importa el renderer.
 *
 * Uso: cd server && node generate-sample-receipt.js
 */
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import PdfPrinter from "pdfmake";
import { buildReceiptDoc } from "./src/lib/receiptTemplates.js";

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

const ws = { id: 1, name: "Consulta Psic. Nathaly Ferrer", mode: "individual" };
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

const LOGO_PATH = path.join(__dirname, "uploads", "logos", "1.png");
const HAS_LOGO = fs.existsSync(LOGO_PATH);

const baseCtx = {
  ws,
  prof,
  settings,
  showLogo: false,
  showName: true,
  logoPath: null,
  // Bounding box; el template usa `fit` así que se respeta la proporción real.
  logoSize: { width: 220, height: 80 },
};

// Variante del primer fixture con logo subido — para validar el layout
// vertical (logo arriba + nombre debajo) cuando el psicólogo carga su logo.
const ctxWithLogo = HAS_LOGO ? {
  ...baseCtx,
  showLogo: true,
  logoPath: LOGO_PATH,
} : baseCtx;

// ── Fixtures ──────────────────────────────────────────────────────────────
const fixtures = [
  {
    file: "recibo-pagada-tarjeta.pdf",
    inv: {
      id: "F-2026-0108",
      patient_id: "PAC-00312",
      patient_name: "Laura Restrepo Vélez",
      professional: prof.name,
      concept: "Sesión de psicoterapia individual",
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
    },
  },
  {
    file: "recibo-pendiente-transferencia.pdf",
    inv: {
      id: "F-2026-0109",
      patient_id: "PAC-00318",
      patient_name: "Camilo Ortega Ruiz",
      professional: prof.name,
      concept: "Sesión de pareja",
      amount: 220000,
      method: "Transferencia",
      bank: "Bancolombia",
      eps: null,
      payment_reference: null,
      payment_notes: "Transferencia confirmada por el paciente; pendiente de conciliar en estado de cuenta.",
      status: "pendiente",
      date: "2026-04-25",
      modality: "Virtual",
      paid_at: null,
      created_at: new Date("2026-04-25T10:00:00").toISOString(),
    },
  },
  {
    file: "recibo-borrador-sin-pago.pdf",
    inv: {
      id: "F-2026-0110",
      patient_id: "PAC-00404",
      patient_name: "Sofía Mendoza Galván",
      professional: prof.name,
      concept: "Evaluación psicológica inicial",
      amount: 250000,
      method: null,
      bank: null,
      eps: null,
      payment_reference: null,
      payment_notes: null,
      status: "borrador",
      date: "2026-05-02",
      modality: "Presencial",
      paid_at: null,
      created_at: new Date("2026-05-02T09:00:00").toISOString(),
    },
  },
  {
    file: "recibo-convenio-eps.pdf",
    inv: {
      id: "F-2026-0111",
      patient_id: "PAC-00277",
      patient_name: "Juan Esteban Pareja Henao",
      professional: prof.name,
      concept: "Sesión de seguimiento (convenio)",
      amount: 95000,
      method: "Convenio",
      bank: null,
      eps: "Sura EPS",
      payment_reference: "AUT-2026-44218",
      payment_notes: "Autorización vigente hasta 30 jun 2026.",
      status: "pagada",
      date: "2026-04-22",
      modality: "Telepsicología",
      paid_at: new Date("2026-04-22T17:30:00").toISOString(),
      created_at: new Date("2026-04-22T17:30:00").toISOString(),
    },
  },
];

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
    for (const [i, f] of fixtures.entries()) {
      // El primer fixture sale CON logo (variante de validación visual);
      // el resto sin logo.
      const base = i === 0 ? ctxWithLogo : baseCtx;
      const ctx = { ...base, inv: f.inv };
      const out = await writeOne(f.file, buildReceiptDoc(ctx));
      console.log("OK", out);
    }
  } catch (e) {
    console.error("[gen]", e);
    process.exit(1);
  }
})();
