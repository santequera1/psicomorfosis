#!/usr/bin/env node
/**
 * Seed de data demostrativa para "Dr. Pruebas Demo" (workspace 9).
 *
 * Llena junio 2026 con citas, tests, invoices, notas y tareas
 * realistas — así la app no se ve vacía cuando se muestra a otras
 * personas o se hacen demos en vivo.
 *
 * Idempotente: marca todo lo creado con "[seed]" en notes/concept/
 * description. Al re-ejecutar borra lo viejo y vuelve a sembrar.
 *
 * Uso (desde VPS):
 *   cd ~/apps/psicomorfosis
 *   node server/scripts/seed-doctor-demo.js
 */

import path from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, "..", "data.db");
const db = new Database(DB_PATH);

const WS = 9;
const PROF_ID = 10;
const PROF_NAME = "Dr. Pruebas Demo";
const SEED_TAG = "[seed]";

// ─── Helpers ─────────────────────────────────────────────────────
const pad = (n) => String(n).padStart(2, "0");
function dateISO(y, m, d) { return `${y}-${pad(m)}-${pad(d)}`; }
function ts(y, m, d, h, mm = 0) {
  return `${y}-${pad(m)}-${pad(d)} ${pad(h)}:${pad(mm)}:00`;
}
function pick(arr, i) { return arr[i % arr.length]; }

// Pre-checks
const ws = db.prepare("SELECT * FROM workspaces WHERE id = ?").get(WS);
if (!ws) {
  console.error(`Workspace ${WS} no existe. Aborto.`);
  process.exit(1);
}
const patients = db.prepare("SELECT id, name FROM patients WHERE workspace_id = ? ORDER BY id").all(WS);
if (patients.length === 0) {
  console.error("No hay pacientes en el workspace. Aborto.");
  process.exit(1);
}
const bankAccounts = db.prepare("SELECT id FROM bank_accounts WHERE workspace_id = ?").all(WS);

console.log(`> Workspace: ${ws.name}`);
console.log(`> Pacientes: ${patients.length} (${patients.map((p) => p.id).join(", ")})`);
console.log(`> Cuentas bancarias: ${bankAccounts.length}`);
console.log();

// ─── 1. Limpiar seed previo ─────────────────────────────────────
console.log("Limpiando seed previo…");
const cleanups = [
  db.prepare("DELETE FROM appointments WHERE workspace_id = ? AND notes LIKE ?").run(WS, `%${SEED_TAG}%`),
  db.prepare("DELETE FROM invoices WHERE workspace_id = ? AND (concept LIKE ? OR payment_notes LIKE ?)").run(WS, `%${SEED_TAG}%`, `%${SEED_TAG}%`),
  db.prepare("DELETE FROM clinical_notes WHERE workspace_id = ? AND content LIKE ?").run(WS, `%${SEED_TAG}%`),
  db.prepare("DELETE FROM tareas WHERE workspace_id = ? AND (description LIKE ? OR title LIKE ?)").run(WS, `%${SEED_TAG}%`, `%${SEED_TAG}%`),
  db.prepare("DELETE FROM test_applications WHERE workspace_id = ? AND notes LIKE ?").run(WS, `%${SEED_TAG}%`),
];
cleanups.forEach((r, i) => {
  console.log(`  ${["appointments","invoices","clinical_notes","tareas","test_applications"][i]}: ${r.changes} borrados`);
});
console.log();

// ─── 2. Citas — junio 2026 ──────────────────────────────────────
console.log("Creando citas para junio 2026…");
const MODALITIES = ["individual", "individual", "tele", "individual"];
const STATUSES_PAST = ["atendida", "atendida", "atendida", "atendida", "no_show", "atendida"];
const TIMES = ["09:00", "10:00", "11:00", "14:00", "15:00", "16:00", "17:00"];

const apptIns = db.prepare(`
  INSERT INTO appointments
    (workspace_id, sede_id, professional_id, patient_id, date, time, duration_min,
     patient_name, professional, modality, room, status, notes)
  VALUES (?, NULL, ?, ?, ?, ?, 50, ?, ?, ?, ?, ?, ?)
`);

const today = new Date("2026-05-31"); // referencia
let apptCount = 0;
// 6 citas por paciente distribuidas en junio
patients.forEach((pat, pIdx) => {
  for (let i = 0; i < 6; i++) {
    const day = 2 + i * 4 + pIdx; // 2, 6, 10, 14, 18, 22 + offset por paciente
    if (day > 30) continue;
    const date = dateISO(2026, 6, day);
    const time = pick(TIMES, i + pIdx);
    const apptDate = new Date(`2026-06-${pad(day)}T${time}:00`);
    const isPast = apptDate < today || (apptDate.getMonth() === 4 && apptDate.getDate() === 31);
    const modality = pick(MODALITIES, i + pIdx);
    const status = isPast ? pick(STATUSES_PAST, i + pIdx) : (i === 0 ? "confirmada" : "agendada");
    const room = modality === "tele" ? null : "Consultorio A";
    apptIns.run(
      WS, PROF_ID, pat.id, date, time,
      pat.name, PROF_NAME, modality, room, status,
      `${SEED_TAG} Sesión de seguimiento`,
    );
    apptCount++;
  }
});
console.log(`  ✓ ${apptCount} citas creadas`);
console.log();

// ─── 3. Tests aplicados ─────────────────────────────────────────
console.log("Creando tests aplicados…");
const TESTS = [
  { code: "PHQ-9", name: "Patient Health Questionnaire-9", score: 11, level: "moderate", interpretation: "Depresión moderada" },
  { code: "GAD-7", name: "Generalized Anxiety Disorder-7", score: 8, level: "moderate", interpretation: "Ansiedad moderada" },
  { code: "AUDIT", name: "Alcohol Use Disorders Identification Test", score: 5, level: "low", interpretation: "Consumo de bajo riesgo" },
  { code: "BIS-11", name: "Barratt Impulsiveness Scale", score: 62, level: "moderate", interpretation: "Impulsividad media" },
];
const testIns = db.prepare(`
  INSERT INTO test_applications
    (id, workspace_id, patient_id, patient_name, test_code, test_name, date,
     score, interpretation, level, professional, status, applied_by,
     completed_at, total_items, answered_items, notes)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'completado', 'paciente', ?, ?, ?, ?)
`);
let testCount = 0;
patients.forEach((pat, pIdx) => {
  // 1-2 tests por paciente
  const numTests = pIdx % 2 === 0 ? 2 : 1;
  for (let i = 0; i < numTests; i++) {
    const test = pick(TESTS, pIdx + i);
    const day = 3 + i * 8 + pIdx;
    const date = dateISO(2026, 6, Math.min(day, 28));
    const id = `T-${WS}-${Date.now()}-${pIdx}-${i}`;
    testIns.run(
      id, WS, pat.id, pat.name, test.code, test.name, date,
      test.score, test.interpretation, test.level, PROF_NAME,
      `${date} ${pick(TIMES, i + pIdx)}:00`,
      10, 10, `${SEED_TAG} Aplicación completada por el paciente desde el portal.`,
    );
    testCount++;
  }
});
console.log(`  ✓ ${testCount} tests aplicados`);
console.log();

// ─── 4. Invoices / Recibos ──────────────────────────────────────
console.log("Creando recibos…");
const CONCEPTS = [
  "Sesión psicología clínica",
  "Sesión individual seguimiento",
  "Sesión telepsicología",
  "Aplicación e interpretación de test",
];
const METHODS = ["transferencia", "efectivo", "transferencia", "nequi", "transferencia"];
const AMOUNTS = [120000, 130000, 110000, 140000, 120000, 120000];
const invIns = db.prepare(`
  INSERT INTO invoices
    (id, workspace_id, patient_id, patient_name, professional, concept,
     amount, method, status, date, modality, bank_account_id, paid_at, created_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);
let invCount = 0;
patients.forEach((pat, pIdx) => {
  // 3 invoices por paciente: 2 pagados + 1 pendiente
  for (let i = 0; i < 3; i++) {
    const day = 4 + i * 7 + pIdx;
    if (day > 30) continue;
    const date = dateISO(2026, 6, day);
    const status = i < 2 ? "pagada" : "pendiente";
    const method = pick(METHODS, pIdx + i);
    const amount = pick(AMOUNTS, pIdx + i);
    const concept = `${pick(CONCEPTS, pIdx + i)} ${SEED_TAG}`;
    const id = `R-${WS}-2026-${String(1000 + apptCount + invCount).padStart(4, "0")}`;
    const bankId = bankAccounts.length && method !== "efectivo"
      ? bankAccounts[(pIdx + i) % bankAccounts.length].id
      : null;
    invIns.run(
      id, WS, pat.id, pat.name, PROF_NAME, concept,
      amount, method, status, date, "individual", bankId,
      status === "pagada" ? `${date} ${pick(TIMES, i)}:00` : null,
      `${date} 08:00:00`,
    );
    invCount++;
  }
});
console.log(`  ✓ ${invCount} recibos creados`);
console.log();

// ─── 5. Notas clínicas ──────────────────────────────────────────
console.log("Creando notas clínicas…");
const SOAP_NOTES = [
  { s: "Refiere ánimo más estable. Duerme 7h, sin despertares.", o: "Afecto eutímico, contacto adecuado.", a: "Mejoría sostenida del cuadro depresivo.", p: "Continuar plan, próxima sesión en 7 días." },
  { s: "Volvieron preocupaciones por trabajo. Ansiedad 6/10.", o: "Discurso ansioso, leve agitación psicomotora.", a: "Recurrencia de síntomas ansiosos por estresor laboral.", p: "Reforzar técnicas de respiración. Asignar registro de pensamientos automáticos." },
  { s: "Familia notó cambios positivos esta semana.", o: "Más asertividad en interacción.", a: "Generalización de aprendizajes terapéuticos.", p: "Trabajar siguiente objetivo: autoestima." },
  { s: "Reporta dificultad para dormir, 4-5h.", o: "Cansancio visible. Atención disminuida.", a: "Insomnio de mantenimiento secundario a rumia.", p: "Higiene del sueño + técnica 4-7-8. Reevaluar en 2 semanas." },
];
const noteIns = db.prepare(`
  INSERT INTO clinical_notes (workspace_id, patient_id, author_id, author_name, kind, content, created_at, signed_at)
  VALUES (?, ?, NULL, ?, 'sesion', ?, ?, ?)
`);
let noteCount = 0;
patients.forEach((pat, pIdx) => {
  // 2-3 notas por paciente
  for (let i = 0; i < 2 + (pIdx % 2); i++) {
    const day = 5 + i * 7 + pIdx;
    if (day > 30) continue;
    const soap = SOAP_NOTES[(pIdx + i) % SOAP_NOTES.length];
    const date = dateISO(2026, 6, day);
    const createdAt = `${date} ${pick(TIMES, i)}:00`;
    const content = JSON.stringify(soap) + `\n${SEED_TAG}`;
    noteIns.run(WS, pat.id, PROF_NAME, content, createdAt, createdAt);
    noteCount++;
  }
});
console.log(`  ✓ ${noteCount} notas clínicas`);
console.log();

// ─── 6. Tareas ──────────────────────────────────────────────────
console.log("Creando tareas operativas…");
const TASKS = [
  { title: "Enviar reporte mensual a EPS", status: "TODO", priority: "HIGH", type: "Administrativa" },
  { title: "Llamar a confirmar cita de mañana", status: "TODO", priority: "MEDIUM", type: "Operativa" },
  { title: "Revisar resultado de tests del paciente", status: "DOING", priority: "HIGH", type: "Clínica" },
  { title: "Preparar plan terapéutico nuevo paciente", status: "DOING", priority: "MEDIUM", type: "Clínica" },
  { title: "Actualizar consentimientos firmados", status: "REVIEW", priority: "LOW", type: "Administrativa" },
  { title: "Revisar emisión de recibos del mes", status: "REVIEW", priority: "MEDIUM", type: "Administrativa" },
  { title: "Sesión cerrada — informe final entregado", status: "DONE", priority: "MEDIUM", type: "Clínica" },
  { title: "Acta de alta firmada y archivada", status: "DONE", priority: "LOW", type: "Administrativa" },
];
const tareaIns = db.prepare(`
  INSERT INTO tareas (workspace_id, title, description, type, status, priority, assignee_id, creator_id, visibility, position, created_at, updated_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'team', ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
`);
const creatorRow = db.prepare("SELECT id FROM users WHERE workspace_id = ? AND professional_id = ? LIMIT 1").get(WS, PROF_ID);
const creatorId = creatorRow?.id ?? null;
let tareaCount = 0;
TASKS.forEach((t, i) => {
  if (!creatorId) return;
  tareaIns.run(
    WS, t.title, `${SEED_TAG} Tarea operativa de demostración.`, t.type,
    t.status, t.priority, creatorId, creatorId, i,
  );
  tareaCount++;
});
console.log(`  ✓ ${tareaCount} tareas`);
console.log();

console.log("Listo. Resumen:");
console.log(`  Citas:        ${apptCount}`);
console.log(`  Tests:        ${testCount}`);
console.log(`  Recibos:      ${invCount}`);
console.log(`  Notas:        ${noteCount}`);
console.log(`  Tareas:       ${tareaCount}`);
console.log();
console.log("Re-ejecutar este script borra lo anterior con [seed] y vuelve a crear.");
