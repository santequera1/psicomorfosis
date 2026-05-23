/**
 * Export del MCMI-II en formato Excel oficial (plantilla con fórmulas
 * de corrección mecanizada). Reemplaza al export CSV genérico para
 * MCMI-II porque las psicólogas usan estas plantillas como herramienta
 * de trabajo — el CSV las obligaba a pegar manualmente las respuestas
 * en su Excel local. Ahora descargan el Excel ya armado y solo abren.
 *
 * Estructura del template (hoja "Respuestas"):
 *   - C1: título, E2: subtítulo
 *   - C4 "Nombre del Paciente:", J4 = nombre del paciente
 *   - Y4 "Edad:", AA4 = edad
 *   - AD4 "Fecha:", AE4 = fecha (serial Excel)
 *   - Row 3: encabezados ITEM | RESPUESTA | V Y Z 1 2 3 4 5 6A 6B 7 8A 8B S C P A H N D B T SS CC PP X
 *   - Rows 5-179: A = item N (1..175), B = respuesta (1=V, 2=F, 0=Sin)
 *   - C..AB: fórmulas IF(Bn=1, peso) — solo dependen de columna B
 *
 * Hojas 2-4 ("Fórmulas", "Resultados", "Interpretación") tienen
 * fórmulas que cruzan con "Respuestas" y se recalculan al abrir.
 *
 * Templates separados por sexo (varones vs mujeres) porque las tablas
 * de Tasa Base (BR) del MCMI-II son diferentes según sexo biológico.
 * Se selecciona automáticamente según patient.sex; si no hay sex
 * registrado, default varones (sin warning — el psicólogo lo notará
 * en el título del archivo y puede pedirlo manual).
 */
import XLSX from "xlsx";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname_mx = dirname(fileURLToPath(import.meta.url));
const TEMPLATES_DIR = join(__dirname_mx, "..", "data", "millon-templates");
const TEMPLATE_VARONES = join(TEMPLATES_DIR, "Millon-varones.xls");
const TEMPLATE_MUJERES = join(TEMPLATES_DIR, "Millon-mujeres.xls");

/**
 * Convierte una fecha JS a serial de Excel (días desde 1899-12-30).
 * Lo usamos para AE4 (Fecha) que en la plantilla original tiene
 * formato número, no string.
 */
function jsDateToExcelSerial(d) {
  const epoch = new Date(Date.UTC(1899, 11, 30)); // Excel epoch
  const diffMs = d.getTime() - epoch.getTime();
  return Math.floor(diffMs / (24 * 60 * 60 * 1000));
}

/**
 * Carga la plantilla correspondiente al sexo del paciente, inyecta
 * los datos del paciente y las 175 respuestas, devuelve un Buffer
 * XLSX listo para servir.
 *
 * @param {{ patientName: string; age: number | null; sex: string | null; answers: Record<string, number>; evaluator?: string | null }} args
 * @returns {Buffer} XLSX buffer
 */
export function buildMillonExcel({ patientName, age, sex, answers, evaluator }) {
  const tplPath = sex === "F" ? TEMPLATE_MUJERES : TEMPLATE_VARONES;
  // SheetJS lee BIFF (.xls) y luego lo escribimos como .xlsx (formato
  // moderno). Las fórmulas IF() simples sobreviven la conversión bien.
  const wb = XLSX.read(readFileSync(tplPath), {
    type: "buffer",
    cellFormula: true,
    cellStyles: true,
    bookFiles: true,
  });

  const sheet = wb.Sheets["Respuestas"];
  if (!sheet) throw new Error("La plantilla no tiene hoja 'Respuestas'");

  // ── Datos del paciente ────────────────────────────────────────
  // J4 = nombre, AA4 = edad, AE4 = fecha (serial Excel).
  sheet["J4"] = { t: "s", v: patientName || "" };
  if (age != null && Number.isFinite(age)) {
    sheet["AA4"] = { t: "n", v: Number(age) };
  }
  sheet["AE4"] = { t: "n", v: jsDateToExcelSerial(new Date()) };

  // ── Evaluador en hoja Resultados ─────────────────────────────
  // La plantilla viene con "José Alberto Sotelo Martín" hardcoded
  // (autor original de la corrección mecanizada). Lo reemplazamos
  // con el nombre del psicólogo que está usando la app. La hoja
  // Interpretación tiene D20 = `=Resultados!B4` así que se actualiza
  // automáticamente — solo seteamos la celda fuente.
  if (evaluator && evaluator.trim()) {
    const resultados = wb.Sheets["Resultados"];
    if (resultados) {
      resultados["B4"] = { t: "s", v: evaluator.trim() };
    }
  }

  // ── Respuestas 1..175 en B5..B179 ────────────────────────────
  // answers viene como { "1": 1, "2": 2, ... } (1=V, 2=F). Si falta
  // un ítem lo dejamos en 0 (sin respuesta) — la plantilla lo
  // interpreta correctamente.
  for (let n = 1; n <= 175; n++) {
    const row = 4 + n; // fila 5 = item 1, fila 6 = item 2, ...
    const addr = `B${row}`;
    const v = Number(answers?.[String(n)]);
    const value = v === 1 || v === 2 ? v : 0;
    sheet[addr] = { t: "n", v: value };
  }

  // ── Escribir como XLSX ─────────────────────────────────────────
  // Mantenemos las 4 hojas y todas las fórmulas. cellFormula:true
  // en la lectura garantiza que las fórmulas estén disponibles en
  // el output. SheetJS community escribe XLSX sin problemas.
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx", cellStyles: true });
}

/**
 * Nombre sugerido para el archivo descargado. Sin caracteres conflictivos
 * con Windows/macOS (espacios, tildes OK; / \ : * ? " < > | no).
 */
export function suggestMillonFilename(patientName, sex) {
  const safe = (patientName ?? "paciente")
    .replace(/[\\/:*?"<>|]/g, "")
    .replace(/\s+/g, "_");
  const variant = sex === "F" ? "mujeres" : "varones";
  return `MCMI-II_${safe}_${variant}.xlsx`;
}
