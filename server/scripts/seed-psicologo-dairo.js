#!/usr/bin/env node
/**
 * Onboarding + seed demo de un psicólogo nuevo: Dairo Traslaviña.
 *
 * Crea desde cero: workspace individual, professional (con el teléfono
 * que el bot usa para identify), user super_admin con password bcrypt,
 * 6 pacientes con ficha rica, citas (pasadas + futuras para que el bot
 * pueda recordarlas), notas SOAP, tests, recibos y tareas kanban.
 *
 * Tag [seed-dairo] en todo lo generado. Si el user ya existe, aborta
 * (no es idempotente sobre el workspace — borrar a mano si hay que
 * recrear).
 *
 * Uso (VPS):  cd ~/apps/psicomorfosis && node server/scripts/seed-psicologo-dairo.js
 */

import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import Database from "better-sqlite3";

const require = createRequire(import.meta.url);
const bcrypt = require("bcryptjs");

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const db = new Database(path.join(__dirname, "..", "data.db"));

const TAG = "[seed-dairo]";
const PROF = {
  name: "Dairo Traslaviña",
  title: "Psicólogo Clínico",
  cedula: "CC 1.143.397.563",
  phone: "+57 300 718 9383",
  email: "dairotras@gmail.com",
  username: "dairo",
  password: "Dairo2026!",
};
// "Hoy" de referencia para repartir pasado/futuro.
const TODAY = new Date("2026-08-04T12:00:00");

const pad = (n) => String(n).padStart(2, "0");
const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const addDays = (base, n) => { const d = new Date(base); d.setDate(d.getDate() + n); return d; };
const pick = (arr, i) => arr[((i % arr.length) + arr.length) % arr.length];

// ─── Guard: no duplicar ─────────────────────────────────────────
const existing = db.prepare("SELECT id FROM users WHERE lower(email)=lower(?) OR lower(username)=lower(?)")
  .get(PROF.email, PROF.username);
if (existing) {
  console.error(`Ya existe un user con email/username de Dairo (id=${existing.id}). Aborto.`);
  process.exit(1);
}

// ─── 1. Workspace + professional + user ─────────────────────────
const ws = db.prepare("INSERT INTO workspaces (name, mode, specialties) VALUES (?, 'individual', ?)")
  .run("Consulta Psic. Dairo Traslaviña", "Psicología clínica, terapia cognitivo-conductual").lastInsertRowid;

const profId = db.prepare(`
  INSERT INTO professionals (workspace_id, name, title, email, phone, approach, active)
  VALUES (?, ?, ?, ?, ?, ?, 1)
`).run(ws, PROF.name, PROF.title, PROF.email, PROF.phone,
       "Cognitivo-conductual con enfoque en ansiedad y estrés laboral").lastInsertRowid;

const hash = bcrypt.hashSync(PROF.password, 10);
const userId = db.prepare(`
  INSERT INTO users (workspace_id, username, password_hash, name, email, role, professional_id)
  VALUES (?, ?, ?, ?, ?, 'super_admin', ?)
`).run(ws, PROF.username, hash, PROF.name, PROF.email, profId).lastInsertRowid;

console.log(`> Workspace ${ws} · professional ${profId} · user ${userId}`);

// ─── 2. Pacientes ───────────────────────────────────────────────
const PATIENTS = [
  { name: "Mariana Ospina Cárdenas", age: 29, sex: "F", phone: "+57 310 555 2201", risk: "moderate", risk_type: "ansiedad",
    reason: "Crisis de ansiedad recurrentes asociadas a carga laboral. Dificultad para desconectar del trabajo.",
    tags: "ansiedad,laboral", modality: "individual" },
  { name: "Jorge Iván Betancur", age: 41, sex: "M", phone: "+57 311 555 3402", risk: "low", risk_type: null,
    reason: "Proceso de duelo por pérdida de su padre hace 4 meses. Insomnio de conciliación.",
    tags: "duelo,insomnio", modality: "individual" },
  { name: "Valeria Quintero Mesa", age: 23, sex: "F", phone: "+57 312 555 4603", risk: "high", risk_type: "depresion",
    reason: "Episodio depresivo moderado. Aislamiento social y abandono de actividades académicas.",
    tags: "depresion,universitaria", modality: "tele" },
  { name: "Andrés Felipe Restrepo", age: 35, sex: "M", phone: "+57 313 555 5804", risk: "low", risk_type: null,
    reason: "Dificultades de comunicación en pareja. Solicita herramientas de regulación emocional.",
    tags: "pareja,comunicacion", modality: "individual" },
  { name: "Luisa Fernanda Agudelo", age: 32, sex: "F", phone: "+57 314 555 6905", risk: "moderate", risk_type: "estres",
    reason: "Burnout en rol directivo. Sintomatología física asociada al estrés (cefaleas, bruxismo).",
    tags: "burnout,directiva", modality: "tele" },
  { name: "Samuel Zapata Giraldo", age: 19, sex: "M", phone: "+57 315 555 7006", risk: "low", risk_type: null,
    reason: "Orientación vocacional y manejo de presión familiar por elección de carrera.",
    tags: "vocacional,adolescente", modality: "individual" },
];

const patIns = db.prepare(`
  INSERT INTO patients (id, workspace_id, professional_id, name, doc, age, sex, phone, email,
                        professional, modality, status, reason, risk, risk_type, tags, whatsapp_opt_in)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'activo', ?, ?, ?, ?, 0)
`);
const patientIds = [];
PATIENTS.forEach((p, i) => {
  const id = `P-${ws}0${i + 1}`;
  const email = p.name.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
    .split(" ").slice(0, 2).join(".") + ".demo@example.com";
  const doc = `CC 1.0${40 + i}.${200 + i * 7}.${300 + i * 13}`;
  patIns.run(id, ws, profId, p.name, doc, p.age, p.sex, p.phone, email,
             PROF.name, p.modality, `${TAG} ${p.reason}`, p.risk, p.risk_type, p.tags);
  patientIds.push(id);
});
console.log(`> ${patientIds.length} pacientes (${patientIds[0]}…)`);

// ─── 3. Citas: 3 pasadas + 4-5 futuras por paciente ────────────
const TIMES = ["08:00", "09:00", "10:00", "11:00", "14:00", "15:00", "16:00", "17:00"];
const apptIns = db.prepare(`
  INSERT INTO appointments (workspace_id, sede_id, professional_id, patient_id, date, time, duration_min,
                            patient_name, professional, modality, room, status, notes)
  VALUES (?, NULL, ?, ?, ?, ?, 50, ?, ?, ?, ?, ?, ?)
`);
let apptCount = 0, futureCount = 0;
PATIENTS.forEach((p, i) => {
  const id = patientIds[i];
  // Pasadas: hace ~14, ~7 y ~3 días (saltando fines de semana hacia atrás)
  [-14, -7, -3].forEach((off, j) => {
    let d = addDays(TODAY, off);
    while (d.getDay() === 0 || d.getDay() === 6) d = addDays(d, -1);
    apptIns.run(ws, profId, id, iso(d), pick(TIMES, i + j), p.name, PROF.name,
                p.modality, p.modality === "tele" ? null : "Consultorio 1",
                j === 1 && i === 3 ? "no_show" : "atendida", `${TAG} Sesión de seguimiento`);
    apptCount++;
  });
  // Futuras: mañana o pasado + semanal 4 semanas
  [1 + (i % 3), 8 + (i % 3), 15 + (i % 3), 22 + (i % 3)].forEach((off, j) => {
    let d = addDays(TODAY, off);
    while (d.getDay() === 0 || d.getDay() === 6) d = addDays(d, 1);
    apptIns.run(ws, profId, id, iso(d), pick(TIMES, i + j + 2), p.name, PROF.name,
                p.modality, p.modality === "tele" ? null : "Consultorio 1",
                j === 0 ? "confirmada" : "agendada", `${TAG} Sesión de seguimiento`);
    apptCount++; futureCount++;
  });
});
console.log(`> ${apptCount} citas (${futureCount} futuras — primeras mañana/pasado mañana)`);

// ─── 4. Notas clínicas SOAP ─────────────────────────────────────
const SOAPS = [
  { s: "Refiere semana con menos episodios de ansiedad (2 vs 5). Usó la respiración diafragmática en una reunión difícil.", o: "Discurso organizado, menor activación al narrar estresores.", a: "Respuesta favorable a técnicas de regulación. Ansiedad en descenso.", p: "Continuar exposición gradual. Registro de pensamientos automáticos para próxima sesión." },
  { s: "Durmió mejor 4 de 7 noches. Despertares asociados a rumia sobre temas familiares.", o: "Afecto congruente, se observa cansancio leve.", a: "Insomnio en mejoría parcial; componente de rumia persiste.", p: "Higiene del sueño estricta + técnica de posponer la preocupación (worry time)." },
  { s: "Asistió a la reunión social que había evitado. 'Me costó pero me quedé hasta el final'.", o: "Postura más erguida, contacto visual sostenido.", a: "Avance significativo en activación conductual.", p: "Programar 2 actividades sociales para las próximas 2 semanas. Reforzar logro." },
  { s: "Discusión fuerte con su pareja el fin de semana; logró pausar y retomar la conversación al día siguiente.", o: "Narra el episodio sin desbordamiento emocional.", a: "Aplicación efectiva del tiempo fuera acordado en sesión.", p: "Modelar conversación de reparación. Rol-play próxima sesión." },
  { s: "Cefaleas disminuyeron a 1 episodio esta semana. Delegó dos tareas en el equipo.", o: "Menos tensión mandibular visible.", a: "Correlación clara entre delegación y síntomas físicos.", p: "Plan de límites laborales: no correos después de 7pm. Evaluar en 2 semanas." },
  { s: "Presentó el examen de admisión. Refiere calma durante la prueba usando anclaje.", o: "Ánimo entusiasta, habla de planes.", a: "Manejo adecuado de la presión evaluativa.", p: "Sesión con padres para acordar expectativas realistas." },
];
const noteIns = db.prepare(`
  INSERT INTO clinical_notes (workspace_id, patient_id, author_id, author_name, kind, content, created_at, signed_at)
  VALUES (?, ?, ?, ?, 'sesion', ?, ?, ?)
`);
let noteCount = 0;
PATIENTS.forEach((_, i) => {
  [-14, -7, -3].forEach((off, j) => {
    let d = addDays(TODAY, off);
    while (d.getDay() === 0 || d.getDay() === 6) d = addDays(d, -1);
    const ts = `${iso(d)} ${pick(TIMES, i + j)}:00`;
    noteIns.run(ws, patientIds[i], userId, PROF.name,
                JSON.stringify(pick(SOAPS, i + j)) + `\n${TAG}`, ts, ts);
    noteCount++;
  });
});
console.log(`> ${noteCount} notas clínicas`);

// ─── 5. Tests ───────────────────────────────────────────────────
const TESTS = [
  { code: "PHQ-9",  name: "Patient Health Questionnaire-9",            score: 8,  level: "mild",     interp: "Depresión leve" },
  { code: "GAD-7",  name: "Generalized Anxiety Disorder-7",            score: 13, level: "moderate", interp: "Ansiedad moderada" },
  { code: "PSS-10", name: "Perceived Stress Scale",                    score: 24, level: "high",     interp: "Estrés percibido alto" },
  { code: "MBI",    name: "Maslach Burnout Inventory (screening)",     score: 61, level: "moderate", interp: "Indicadores de burnout en rango medio" },
];
const testIns = db.prepare(`
  INSERT INTO test_applications (id, workspace_id, patient_id, patient_name, test_code, test_name, date,
                                 score, interpretation, level, professional, status, applied_by,
                                 assigned_at, completed_at, total_items, answered_items, notes)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'paciente', ?, ?, 10, ?, ?)
`);
let testCount = 0;
PATIENTS.forEach((p, i) => {
  const done = pick(TESTS, i);
  const dDone = addDays(TODAY, -10 + i);
  testIns.run(`T-${ws}-DA-${i}-a`, ws, patientIds[i], p.name, done.code, done.name, iso(dDone),
              done.score, done.interp, done.level, PROF.name, "completado",
              `${iso(dDone)} 08:00:00`, `${iso(dDone)} 12:00:00`, 10,
              `${TAG} Completado por el paciente desde el portal.`);
  testCount++;
  const pend = pick(TESTS, i + 2);
  testIns.run(`T-${ws}-DA-${i}-b`, ws, patientIds[i], p.name, pend.code, pend.name, iso(TODAY),
              null, null, null, PROF.name, "asignado",
              `${iso(TODAY)} 09:00:00`, null, 0,
              `${TAG} Asignado, pendiente de responder.`);
  testCount++;
});
console.log(`> ${testCount} tests (mitad pendientes)`);

// ─── 6. Recibos ─────────────────────────────────────────────────
const invIns = db.prepare(`
  INSERT INTO invoices (id, workspace_id, patient_id, patient_name, professional, concept, amount,
                        method, status, date, modality, bank_account_id, paid_at, created_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)
`);
const METHODS = ["transferencia", "nequi", "efectivo"];
let invCount = 0;
PATIENTS.forEach((p, i) => {
  [-14, -7, -3].forEach((off, j) => {
    let d = addDays(TODAY, off);
    while (d.getDay() === 0 || d.getDay() === 6) d = addDays(d, -1);
    const status = j < 2 ? "pagada" : "pendiente";
    invIns.run(`R-${ws}-DA-${String(invCount).padStart(3, "0")}`, ws, patientIds[i], p.name, PROF.name,
               `Sesión psicología clínica ${TAG}`, 140000, pick(METHODS, i + j), status, iso(d),
               p.modality, status === "pagada" ? `${iso(d)} 18:00:00` : null, `${iso(d)} 08:00:00`);
    invCount++;
  });
});
console.log(`> ${invCount} recibos`);

// ─── 7. Tareas kanban ───────────────────────────────────────────
const TASKS = [
  { t: "Preparar informe de remisión EPS — Valeria Quintero", st: "TODO",   pr: "HIGH",   due: 2 },
  { t: "Llamar a confirmar citas de la semana",               st: "TODO",   pr: "HIGH",   due: 1 },
  { t: "Revisar resultados GAD-7 pendientes",                 st: "TODO",   pr: "MEDIUM", due: 3 },
  { t: "Diseñar plan de exposición gradual — Mariana Ospina", st: "DOING",  pr: "HIGH",   due: 4 },
  { t: "Actualizar consentimientos informados 2026",          st: "DOING",  pr: "MEDIUM", due: 7 },
  { t: "Solicitar espacio para taller de manejo del estrés",  st: "TODO",   pr: "LOW",    due: 14 },
  { t: "Facturación de julio cerrada y enviada",              st: "DONE",   pr: "MEDIUM", due: null },
  { t: "Migración de historias al nuevo formato",             st: "REVIEW", pr: "LOW",    due: 10 },
  { t: "Preparar sesión de pareja — Andrés Restrepo",         st: "TODO",   pr: "MEDIUM", due: 2 },
  { t: "Renovar póliza de responsabilidad civil",             st: "TODO",   pr: "LOW",    due: 21 },
];
const tareaIns = db.prepare(`
  INSERT INTO tareas (workspace_id, title, description, type, status, priority, assignee_id, creator_id,
                      visibility, due_date, position, created_at, updated_at)
  VALUES (?, ?, ?, 'Clínica', ?, ?, ?, ?, 'team', ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
`);
TASKS.forEach((t, i) => {
  // assignee_id referencia PROFESSIONALS (no users) — FK real de la tabla.
  tareaIns.run(ws, t.t, `${TAG} Tarea de demostración.`, t.st, t.pr, profId, userId,
               t.due != null ? iso(addDays(TODAY, t.due)) : null, i);
});
console.log(`> ${TASKS.length} tareas`);

console.log("\nListo. Credenciales de Dairo:");
console.log(`  URL:      https://psico.wailus.co/login`);
console.log(`  Usuario:  ${PROF.username}  (o ${PROF.email})`);
console.log(`  Password: ${PROF.password}`);
console.log(`  Teléfono bot (identify): ${PROF.phone}`);
console.log(`  Workspace id: ${ws}`);
