// Aplica un MCMI-II al paciente P-9002 (Andrés Galeano Suárez) en
// el workspace 9 (Dr. Pruebas Demo) con respuestas aleatorias.
// Para usar como demo en el video — necesitamos un resultado Millon
// completo con perfil por escala que poder mostrar en la app.
//
// Se ejecuta DIRECTAMENTE en el VPS via ssh node, no via la API.
// Esto evita necesitar las credenciales del psicólogo demo y permite
// computar el score con el mismo motor que el backend.

import Database from "better-sqlite3";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_PATH = process.argv[2];
const DATA_DIR = process.argv[3];
if (!DB_PATH || !DATA_DIR) {
  console.error("Uso: node seed-millon-andres.mjs <db> <dataDir>");
  process.exit(1);
}

const MATRIX = JSON.parse(readFileSync(join(DATA_DIR, "mcmi2-scoring-matrix.json"), "utf8"));
const QUESTIONS = JSON.parse(readFileSync(join(DATA_DIR, "mcmi2-questions.json"), "utf8"));

const db = new Database(DB_PATH);

// 1) Respuestas aleatorias 1=V, 2=F para cada uno de los 175 items.
//    Seed pseudo-aleatoria simple (no necesitamos reproducibilidad).
const answers = {};
for (const q of QUESTIONS) {
  // Distribución 60/40 hacia V para que el perfil no quede plano (V es
  // el que dispara peso en la mayoría de las escalas; sólo F daría
  // raw scores cercanos a 0 y el resultado se vería sospechoso).
  answers[String(q.id ?? q.numero ?? q.n ?? "")] = Math.random() < 0.6 ? 1 : 2;
}

// 2) Calcular raw scores por escala (misma lógica que calculateMillonScores
//    del backend).
const raw = {};
for (const sc of MATRIX.scales) raw[sc.code] = 0;
for (const itemId of Object.keys(MATRIX.matrix)) {
  const a = answers[itemId];
  if (a !== 1 && a !== 2) continue;
  const respKey = a === 1 ? "V" : "F";
  const entries = MATRIX.matrix[itemId][respKey] ?? [];
  for (const e of entries) {
    raw[e.scale] = (raw[e.scale] ?? 0) + e.weight;
  }
}
raw["X"] = null; // X no calculable linealmente

// 3) Score "agregado" = suma de raws no-null.
let agg = 0;
for (const k of Object.keys(raw)) if (raw[k] != null) agg += raw[k];

// 4) Validity warning si V > 1.
const validityWarning = (raw["V"] ?? 0) > 1
  ? "El índice de Validez (V) es ≥ 2. El test podría ser inválido. Revisar con criterio clínico antes de interpretar."
  : null;

const alerts_json = JSON.stringify({
  scales_raw: raw,
  meta: {
    type: "millon",
    requires_clinical_interpretation: true,
    validity_warning: validityWarning,
  },
});

// 5) INSERT en test_applications.
const now = new Date().toISOString();
const id = `T-9-demo-millon-${Date.now().toString(36)}`;
db.prepare(`
  INSERT INTO test_applications (
    id, workspace_id, patient_id, patient_name,
    test_code, test_name, date, score, interpretation, level,
    professional, status, applied_by, completed_at,
    answers_json, alerts_json, total_items, answered_items, started_at
  ) VALUES (?, 9, 'P-9002', 'Andrés Galeano Suárez',
    'MCMI-II', 'Inventario Multiaxial Clínico de Millon',
    ?, ?, 'Ver detalle por escala', 'none',
    'Dr. Pruebas Demo', 'completado', 'profesional', ?,
    ?, ?, 175, 175, ?)
`).run(
  id,
  now.slice(0, 10),
  agg,
  now,
  JSON.stringify(answers),
  alerts_json,
  now,
);

console.log(JSON.stringify({
  ok: true,
  id,
  score: agg,
  validity_v: raw["V"],
  scales_sample: { "1": raw["1"], "2": raw["2"], "8A": raw["8A"], "CC": raw["CC"], "PP": raw["PP"] },
}, null, 2));
