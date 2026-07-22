#!/usr/bin/env node
/**
 * Seed de data demostrativa para "Dr. Pruebas Demo" (workspace 9), JULIO 2026.
 *
 * Llena el calendario en serio: cada paciente tiene 1 cita por día hábil
 * (Lu-Vi) de julio. Se distribuye la agenda a lo largo del día.
 *
 * Tag: [seed-jul] — no toca los rows con [seed] de junio. Re-ejecutar
 * borra únicamente lo suyo.
 *
 * Uso (VPS):
 *   cd ~/apps/psicomorfosis
 *   node server/scripts/seed-doctor-demo-julio.js
 *
 * Flags:
 *   --dry   Muestra qué haría, no escribe nada.
 */

import path from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, "..", "data.db");
const argv = new Set(process.argv.slice(2));
const DRY = argv.has("--dry");

const db = new Database(DB_PATH);

const WS = 9;
const PROF_ID = 10;
const PROF_NAME = "Dr. Pruebas Demo";
const SEED_TAG = "[seed-jul]";
const REF_DATE = new Date("2026-07-02T09:00:00"); // "hoy" para diferenciar pasada / futura

const pad = (n) => String(n).padStart(2, "0");
const dateISO = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;
const pick = (arr, i) => arr[((i % arr.length) + arr.length) % arr.length];

// ─── Pre-checks ─────────────────────────────────────────────────
const ws = db.prepare("SELECT * FROM workspaces WHERE id = ?").get(WS);
if (!ws) {
  console.error(`Workspace ${WS} no existe. Aborto.`);
  process.exit(1);
}
const patients = db.prepare("SELECT id, name, phone, whatsapp_opt_in FROM patients WHERE workspace_id = ? ORDER BY id").all(WS);
if (patients.length === 0) {
  console.error("No hay pacientes en el workspace. Aborto.");
  process.exit(1);
}
const bankAccounts = db.prepare("SELECT id FROM bank_accounts WHERE workspace_id = ?").all(WS);

console.log(`> Workspace:  ${ws.name}`);
console.log(`> Pacientes:  ${patients.length}`);
console.log(`> Ref date:   ${REF_DATE.toISOString().slice(0, 10)}`);
console.log(`> Modo:       ${DRY ? "DRY-RUN" : "escritura"}`);
console.log();

// ─── 1. Limpiar seed-jul previo ─────────────────────────────────
console.log("Limpiando seed-jul previo…");
const cleanups = [
  ["appointments",      db.prepare("DELETE FROM appointments WHERE workspace_id = ? AND notes LIKE ?").run(WS, `%${SEED_TAG}%`)],
  ["invoices",          db.prepare("DELETE FROM invoices WHERE workspace_id = ? AND (concept LIKE ? OR payment_notes LIKE ?)").run(WS, `%${SEED_TAG}%`, `%${SEED_TAG}%`)],
  ["clinical_notes",    db.prepare("DELETE FROM clinical_notes WHERE workspace_id = ? AND content LIKE ?").run(WS, `%${SEED_TAG}%`)],
  ["tareas",            db.prepare("DELETE FROM tareas WHERE workspace_id = ? AND (description LIKE ? OR title LIKE ?)").run(WS, `%${SEED_TAG}%`, `%${SEED_TAG}%`)],
  ["test_applications", db.prepare("DELETE FROM test_applications WHERE workspace_id = ? AND notes LIKE ?").run(WS, `%${SEED_TAG}%`)],
];
cleanups.forEach(([t, r]) => console.log(`  ${t}: ${r.changes} borrados`));
console.log();

if (DRY) {
  console.log("(dry-run: se hizo cleanup pero no seed. Salida.)");
  db.exec("ROLLBACK"); // no hay tx abierta, no pasa nada; los deletes ya se hicieron sí
  process.exit(0);
}

// ─── 2. Citas — cada día hábil de julio, 1 por paciente ────────
console.log("Creando citas para julio 2026 (Lu-Vi, todos los pacientes cada día)…");
const MODALITIES = ["individual", "individual", "tele", "individual", "individual"];
// Horarios por slot 0..5 (uno por paciente en el orden)
const SLOT_TIMES = ["09:00", "10:00", "11:00", "14:00", "15:00", "16:00"];
const STATUSES_PAST = ["atendida", "atendida", "atendida", "atendida", "no_show", "atendida", "atendida"];

const apptIns = db.prepare(`
  INSERT INTO appointments
    (workspace_id, sede_id, professional_id, patient_id, date, time, duration_min,
     patient_name, professional, modality, room, status, notes)
  VALUES (?, NULL, ?, ?, ?, ?, 50, ?, ?, ?, ?, ?, ?)
`);

let apptCount = 0, apptFuture = 0;
for (let day = 1; day <= 31; day++) {
  const d = new Date(`2026-07-${pad(day)}T09:00:00`);
  const dow = d.getDay(); // 0=Dom, 6=Sáb
  if (dow === 0 || dow === 6) continue; // saltar fin de semana

  patients.forEach((pat, pIdx) => {
    // Rota el slot cada semana para variar
    const week = Math.floor((day - 1) / 7);
    const slotIdx = (pIdx + week) % SLOT_TIMES.length;
    const time = SLOT_TIMES[slotIdx];
    const date = dateISO(2026, 7, day);
    const apptDate = new Date(`${date}T${time}:00`);
    const isPast = apptDate < REF_DATE;
    const modality = pick(MODALITIES, day + pIdx);
    let status;
    if (isPast) {
      status = pick(STATUSES_PAST, day + pIdx);
    } else if (day - REF_DATE.getDate() <= 1) {
      status = "confirmada";
    } else {
      status = "agendada";
    }
    const room = modality === "tele" ? null : "Consultorio A";
    apptIns.run(
      WS, PROF_ID, pat.id, date, time,
      pat.name, PROF_NAME, modality, room, status,
      `${SEED_TAG} Sesión de seguimiento`,
    );
    apptCount++;
    if (!isPast) apptFuture++;
  });
}
console.log(`  ✓ ${apptCount} citas creadas (${apptFuture} futuras)`);
console.log();

// ─── 3. Tests ───────────────────────────────────────────────────
console.log("Creando tests…");
const TESTS = [
  { code: "PHQ-9",  name: "Patient Health Questionnaire-9",           score: 9,  level: "mild",     interp: "Depresión leve" },
  { code: "GAD-7",  name: "Generalized Anxiety Disorder-7",           score: 12, level: "moderate", interp: "Ansiedad moderada" },
  { code: "PSS-10", name: "Perceived Stress Scale",                   score: 21, level: "moderate", interp: "Estrés percibido moderado" },
  { code: "AUDIT",  name: "Alcohol Use Disorders Identification Test", score: 3,  level: "low",     interp: "Consumo de bajo riesgo" },
];
const testIns = db.prepare(`
  INSERT INTO test_applications
    (id, workspace_id, patient_id, patient_name, test_code, test_name, date,
     score, interpretation, level, professional, status, applied_by,
     assigned_at, completed_at, total_items, answered_items, notes)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);
let testCount = 0;
patients.forEach((pat, pIdx) => {
  const past = pick(TESTS, pIdx);
  const pastDate = dateISO(2026, 7, Math.min(1 + pIdx, 2));
  testIns.run(
    `T-${WS}-JUL-${pIdx}-a`, WS, pat.id, pat.name, past.code, past.name, pastDate,
    past.score, past.interp, past.level, PROF_NAME, "completado", "paciente",
    `${pastDate} 08:30:00`, `${pastDate} 10:00:00`,
    10, 10, `${SEED_TAG} Aplicación completada por el paciente.`,
  );
  testCount++;

  const pending = pick(TESTS, pIdx + 1);
  const assignedAt = dateISO(2026, 7, 2);
  testIns.run(
    `T-${WS}-JUL-${pIdx}-b`, WS, pat.id, pat.name, pending.code, pending.name, assignedAt,
    null, null, null, PROF_NAME, "asignado", "paciente",
    `${assignedAt} 09:00:00`, null,
    10, 0, `${SEED_TAG} Test asignado, pendiente de responder.`,
  );
  testCount++;
});
console.log(`  ✓ ${testCount} tests`);
console.log();

// ─── 4. Recibos ─────────────────────────────────────────────────
console.log("Creando recibos…");
const CONCEPTS = [
  "Sesión psicología clínica",
  "Sesión individual seguimiento",
  "Sesión telepsicología",
  "Aplicación e interpretación de test",
];
const METHODS = ["transferencia", "efectivo", "transferencia", "nequi"];
const AMOUNTS = [120000, 130000, 110000, 140000, 120000];
const invIns = db.prepare(`
  INSERT INTO invoices
    (id, workspace_id, patient_id, patient_name, professional, concept,
     amount, method, status, date, modality, bank_account_id, paid_at, created_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);
let invCount = 0;
patients.forEach((pat, pIdx) => {
  for (let i = 0; i < 3; i++) {
    const day = 1 + i * 3 + pIdx;
    if (day > 30) continue;
    const date = dateISO(2026, 7, day);
    const status = i < 2 ? "pagada" : "pendiente";
    const method = pick(METHODS, pIdx + i);
    const amount = pick(AMOUNTS, pIdx + i);
    const concept = `${pick(CONCEPTS, pIdx + i)} ${SEED_TAG}`;
    const id = `R-${WS}-JUL-${String(1000 + invCount).padStart(4, "0")}`;
    const bankId = bankAccounts.length && method !== "efectivo"
      ? bankAccounts[(pIdx + i) % bankAccounts.length].id : null;
    invIns.run(
      id, WS, pat.id, pat.name, PROF_NAME, concept,
      amount, method, status, date, "individual", bankId,
      status === "pagada" ? `${date} 10:00:00` : null,
      `${date} 08:00:00`,
    );
    invCount++;
  }
});
console.log(`  ✓ ${invCount} recibos`);
console.log();

// ─── 5. Notas clínicas ──────────────────────────────────────────
console.log("Creando notas clínicas…");
const SOAP = [
  { s: "Se siente más activa esta semana. Retomó rutina de ejercicio.", o: "Afecto eutímico, discurso fluido.", a: "Buena adherencia al plan. Menor rumia.", p: "Continuar CBT. Registro de emociones + próxima sesión en 7 días." },
  { s: "Preocupación por evaluación laboral. Ansiedad 6/10.", o: "Discurso ansioso, respiración corta.", a: "Ansiedad anticipatoria por estresor identificado.", p: "Técnica 4-7-8. Reestructuración cognitiva sobre pensamiento 'no voy a estar a la altura'." },
  { s: "Duerme mejor con higiene del sueño. 6-7h.", o: "Aspecto descansado.", a: "Mejoría del insomnio de conciliación.", p: "Mantener rutina. Ampliar registro emocional a fin de semana." },
  { s: "Discusión con pareja el fin de semana.", o: "Ligera desregulación al hablar del tema. Contacto adecuado.", a: "Patrón de comunicación reactiva bajo estrés.", p: "Trabajar comunicación no violenta. Rol-play próxima sesión." },
  { s: "Reporta ánimo estable y motivación creciente.", o: "Sonríe. Contacto visual sostenido.", a: "Continúa mejoría del cuadro depresivo.", p: "Iniciar plan de reforzamiento social." },
];
const noteIns = db.prepare(`
  INSERT INTO clinical_notes (workspace_id, patient_id, author_id, author_name, kind, content, created_at, signed_at)
  VALUES (?, ?, NULL, ?, 'sesion', ?, ?, ?)
`);
let noteCount = 0;
patients.forEach((pat, pIdx) => {
  for (let i = 0; i < 3; i++) {
    const day = 1 + i * 5 + pIdx;
    if (day > 30) continue;
    const soap = SOAP[(pIdx + i) % SOAP.length];
    const date = dateISO(2026, 7, day);
    const createdAt = `${date} 11:00:00`;
    const content = JSON.stringify(soap) + `\n${SEED_TAG}`;
    noteIns.run(WS, pat.id, PROF_NAME, content, createdAt, createdAt);
    noteCount++;
  }
});
console.log(`  ✓ ${noteCount} notas`);
console.log();

// ─── 6. Tareas ──────────────────────────────────────────────────
console.log("Creando tareas…");
const TASKS = [
  { title: "Enviar reporte mensual a EPS",              status: "TODO",   priority: "HIGH",   type: "Administrativa" },
  { title: "Confirmar citas de esta semana",            status: "TODO",   priority: "HIGH",   type: "Operativa",     dueDays: 1 },
  { title: "Revisar tests asignados pendientes",        status: "TODO",   priority: "MEDIUM", type: "Clínica",       dueDays: 3 },
  { title: "Preparar informe de proceso — paciente activo", status: "DOING", priority: "MEDIUM", type: "Clínica",   dueDays: 5 },
  { title: "Actualizar consentimientos firmados",       status: "REVIEW", priority: "LOW",    type: "Administrativa" },
  { title: "Cerrar facturación de junio",               status: "REVIEW", priority: "MEDIUM", type: "Administrativa" },
  { title: "Sesión cerrada — informe final entregado",  status: "DONE",   priority: "MEDIUM", type: "Clínica" },
  { title: "Acta de alta firmada y archivada",          status: "DONE",   priority: "LOW",    type: "Administrativa" },
];
const tareaIns = db.prepare(`
  INSERT INTO tareas (workspace_id, title, description, type, status, priority, assignee_id, creator_id, visibility, due_date, position, created_at, updated_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'team', ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
`);
const creatorRow = db.prepare("SELECT id FROM users WHERE workspace_id = ? AND professional_id = ? LIMIT 1").get(WS, PROF_ID);
const creatorId = creatorRow?.id ?? null;
let tareaCount = 0;
TASKS.forEach((t, i) => {
  if (!creatorId) return;
  const due = t.dueDays
    ? dateISO(2026, 7, Math.min(2 + t.dueDays, 30)) : null;
  tareaIns.run(
    WS, t.title, `${SEED_TAG} Tarea operativa de demostración.`,
    t.type, t.status, t.priority, creatorId, creatorId, due, i,
  );
  tareaCount++;
});
console.log(`  ✓ ${tareaCount} tareas`);
console.log();

console.log("Listo.");
console.log(`  Citas:        ${apptCount}  (${apptFuture} futuras)`);
console.log(`  Tests:        ${testCount}`);
console.log(`  Recibos:      ${invCount}`);
console.log(`  Notas:        ${noteCount}`);
console.log(`  Tareas:       ${tareaCount}`);
