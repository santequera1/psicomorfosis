#!/usr/bin/env node
/**
 * Contenido demostrativo para una cuenta YA existente (p. ej. una que
 * entró con Google): pacientes, citas del mes actual (pasadas atendidas +
 * futuras) y del mes siguiente, notas clínicas, diagnósticos, tests,
 * recibos y tareas. Sirve para probar el SaaS con datos realistas sin
 * tocar nada de otros consultorios.
 *
 * - Todo va al workspace/professional del usuario indicado.
 * - Los pacientes son ficticios: teléfonos 3xx 555 xxxx (no existen),
 *   correos @example.com y whatsapp_opt_in=0 → el bot nunca les escribe.
 * - Marca [demo] en notas/recibos/tareas para poder limpiarlo después.
 * - No es idempotente: si el workspace ya tiene pacientes "[demo]",
 *   aborta (usa --wipe para borrar lo sembrado y volver a sembrar).
 *
 * Uso (VPS, desde ~/apps/psicomorfosis):
 *   node server/scripts/seed-demo-cuenta.js --email=alguien@gmail.com
 *   node server/scripts/seed-demo-cuenta.js --email=... --db=/tmp/copia.db   (ensayo)
 *   node server/scripts/seed-demo-cuenta.js --email=... --wipe               (limpia y resiembra)
 *   node server/scripts/seed-demo-cuenta.js --email=... --wipe --only-wipe   (solo limpia)
 *   node server/scripts/seed-demo-cuenta.js --email=... --pool=A            (elige el juego de pacientes A o B)
 */

import path from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const args = Object.fromEntries(process.argv.slice(2).map((a) => {
  const m = a.match(/^--([^=]+)(?:=(.*))?$/);
  return m ? [m[1], m[2] ?? true] : [a, true];
}));
if (!args.email) {
  console.error("Falta --email=correo@dominio");
  process.exit(1);
}
const dbPath = args.db ? path.resolve(String(args.db)) : path.join(__dirname, "..", "data.db");
const db = new Database(dbPath);
db.pragma("foreign_keys = ON");

const TAG = "[demo]";
const pad = (n) => String(n).padStart(2, "0");
const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const addDays = (base, n) => { const d = new Date(base); d.setDate(d.getDate() + n); return d; };
const pick = (arr, i) => arr[((i % arr.length) + arr.length) % arr.length];

// "Hoy" en Bogotá (el VPS corre en UTC; a las 8 pm de Colombia ya es
// mañana en UTC y las citas "de hoy" caerían en el día equivocado).
const bogota = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota", year: "numeric", month: "2-digit", day: "2-digit" })
  .format(new Date());
const TODAY = new Date(`${bogota}T12:00:00`);
const todayIso = iso(TODAY);
const monthStart = new Date(TODAY.getFullYear(), TODAY.getMonth(), 1, 12);
const nextMonthEnd = new Date(TODAY.getFullYear(), TODAY.getMonth() + 2, 0, 12);

// ─── Usuario / workspace ────────────────────────────────────────
const user = db.prepare(`
  SELECT u.id, u.name, u.email, u.workspace_id, u.professional_id, p.name AS prof_name
  FROM users u LEFT JOIN professionals p ON p.id = u.professional_id
  WHERE lower(u.email) = lower(?)
`).get(String(args.email));
if (!user) { console.error(`No hay usuario con email ${args.email}`); process.exit(1); }
if (!user.professional_id) { console.error(`El usuario ${user.id} no tiene professional_id; no siembro.`); process.exit(1); }
const ws = user.workspace_id;
const profId = user.professional_id;
const profName = user.prof_name || user.name || "Profesional";
console.log(`> ${user.email} → user ${user.id} · workspace ${ws} · professional ${profId} (${profName}) · hoy ${todayIso}`);

// ─── Limpieza opcional de una siembra anterior ──────────────────
const demoPatients = db.prepare("SELECT id FROM patients WHERE workspace_id = ? AND tags LIKE '%demo%'").all(ws).map((r) => r.id);
if (demoPatients.length) {
  if (!args.wipe) {
    console.error(`El workspace ${ws} ya tiene ${demoPatients.length} pacientes demo (${demoPatients.slice(0, 3).join(", ")}…). Usa --wipe para resembrar.`);
    process.exit(1);
  }
  const inList = demoPatients.map(() => "?").join(",");
  db.transaction(() => {
    for (const t of ["appointments", "clinical_notes", "clinical_diagnoses", "test_applications", "invoices", "tareas"]) {
      const r = db.prepare(`DELETE FROM ${t} WHERE workspace_id = ? AND patient_id IN (${inList})`).run(ws, ...demoPatients);
      console.log(`  - ${t}: ${r.changes} borrados`);
    }
    const t = db.prepare("DELETE FROM tareas WHERE workspace_id = ? AND description LIKE ?").run(ws, `${TAG}%`);
    console.log(`  - tareas (sin paciente): ${t.changes} borradas`);
    const p = db.prepare(`DELETE FROM patients WHERE workspace_id = ? AND id IN (${inList})`).run(ws, ...demoPatients);
    console.log(`  - patients: ${p.changes} borrados`);
  })();
  if (args["only-wipe"]) { console.log("Listo (solo limpieza)."); process.exit(0); }
}

// ─── Pacientes (dos juegos: un consultorio usa A, otro B) ───────
const POOL_A = [
  { name: "Mariana Ospina Cárdenas", age: 29, sex: "F", risk: "moderate", risk_type: "ansiedad", modality: "individual", tags: "demo,ansiedad,laboral",
    reason: "Crisis de ansiedad recurrentes asociadas a carga laboral. Dificultad para desconectar del trabajo.",
    antecedentes: "Sin antecedentes psiquiátricos previos. Madre con diagnóstico de TAG. Consumo de café alto (5 tazas/día). Sin consumo de sustancias.",
    plan: "TCC centrada en ansiedad: psicoeducación, respiración diafragmática, registro de pensamientos automáticos y exposición gradual a situaciones laborales evitadas. 12 sesiones, revisión con GAD-7 cada 4.",
    dx: { code: "6B00", system: "CIE-11", name: "Trastorno de ansiedad generalizada" } },
  { name: "Jorge Iván Betancur", age: 41, sex: "M", risk: "low", risk_type: null, modality: "individual", tags: "demo,duelo,insomnio",
    reason: "Proceso de duelo por pérdida de su padre hace 4 meses. Insomnio de conciliación.",
    antecedentes: "Casado, 2 hijos. Sin antecedentes clínicos. Padre fallecido por cáncer tras 8 meses de enfermedad; fue cuidador principal.",
    plan: "Acompañamiento en duelo (modelo de tareas de Worden). Higiene del sueño y técnica de posponer la preocupación. Evaluar PHQ-9 mensual.",
    dx: { code: "Z63.4", system: "DSM-5-TR", name: "Reacción de duelo (no patológica)" } },
  { name: "Valeria Quintero Mesa", age: 23, sex: "F", risk: "high", risk_type: "depresion", modality: "virtual", tags: "demo,depresion,universitaria",
    reason: "Episodio depresivo moderado. Aislamiento social y abandono de actividades académicas.",
    antecedentes: "Episodio depresivo previo a los 19 años tratado con sertralina 6 meses. Actualmente sin medicación. Estudiante de Derecho, 7.º semestre.",
    plan: "Activación conductual + reestructuración cognitiva. Coordinación con psiquiatría para valoración farmacológica. Plan de seguridad revisado en sesión 1.",
    dx: { code: "6A70.1", system: "CIE-11", name: "Episodio depresivo único, moderado" } },
  { name: "Andrés Felipe Restrepo", age: 35, sex: "M", risk: "low", risk_type: null, modality: "individual", tags: "demo,pareja,comunicacion",
    reason: "Dificultades de comunicación en pareja. Solicita herramientas de regulación emocional.",
    antecedentes: "Relación de 6 años, convive hace 3. Sin antecedentes. Refiere 'explotar' en discusiones y luego sentir culpa.",
    plan: "Regulación emocional (tiempo fuera acordado, identificación de señales fisiológicas) y comunicación asertiva. Valorar sesiones conjuntas de pareja en sesión 6.",
    dx: null },
  { name: "Luisa Fernanda Agudelo", age: 32, sex: "F", risk: "moderate", risk_type: "estres", modality: "virtual", tags: "demo,burnout,directiva",
    reason: "Burnout en rol directivo. Sintomatología física asociada al estrés (cefaleas, bruxismo).",
    antecedentes: "Gerente de operaciones, equipo de 40 personas. Bruxismo diagnosticado por odontología. Sin antecedentes psiquiátricos.",
    plan: "Manejo del estrés: límites laborales, delegación, relajación muscular progresiva. Seguimiento con PSS-10. Remisión a medicina general por cefaleas.",
    dx: null },
  { name: "Samuel Zapata Giraldo", age: 19, sex: "M", risk: "low", risk_type: null, modality: "individual", tags: "demo,vocacional,adolescente",
    reason: "Orientación vocacional y manejo de presión familiar por elección de carrera.",
    antecedentes: "Recién graduado de bachillerato. Presión familiar hacia Medicina; interés propio en Diseño. Sin antecedentes clínicos.",
    plan: "Orientación vocacional (intereses, aptitudes, valores). Sesión familiar para acordar expectativas. 6 sesiones.",
    dx: null },
  { name: "Carolina Herrera Núñez", age: 47, sex: "F", risk: "low", risk_type: null, modality: "individual", tags: "demo,autoestima,separacion",
    reason: "Separación reciente tras 20 años de matrimonio. Baja autoestima y dificultad para tomar decisiones.",
    antecedentes: "Separada hace 5 meses. Dos hijos adolescentes. Dejó de trabajar hace 15 años; retomando actividad laboral.",
    plan: "Fortalecimiento de autoestima (RSES basal y a 8 semanas), toma de decisiones y proyecto de vida. Enfoque humanista con técnicas cognitivas.",
    dx: null },
];
const POOL_B = [
  { name: "Daniela Rojas Pineda", age: 27, sex: "F", risk: "moderate", risk_type: "ansiedad", modality: "virtual", tags: "demo,ansiedad,panico",
    reason: "Ataques de pánico en transporte público desde hace 3 meses. Evitación progresiva de salir sola.",
    antecedentes: "Sin antecedentes psiquiátricos. Primer ataque tras episodio de hipoglucemia en el Transmilenio. Trabaja en atención al cliente.",
    plan: "TCC para pánico: psicoeducación, exposición interoceptiva y exposición gradual in vivo. BAI basal y a la sesión 8.",
    dx: { code: "6B01", system: "CIE-11", name: "Trastorno de pánico" } },
  { name: "Camilo Andrés Torres", age: 38, sex: "M", risk: "low", risk_type: null, modality: "individual", tags: "demo,laboral,estres",
    reason: "Estrés laboral por cambio de cargo. Irritabilidad en casa y dificultad para concentrarse.",
    antecedentes: "Ingeniero, ascendido a jefe de área hace 4 meses. Casado, 1 hija de 5 años. Sin antecedentes.",
    plan: "Manejo del estrés y habilidades de liderazgo: organización del tiempo, delegación, regulación de la irritabilidad. PSS-10 de seguimiento.",
    dx: null },
  { name: "Isabella Moreno Castro", age: 16, sex: "F", risk: "high", risk_type: "autolesion", modality: "individual", tags: "demo,adolescente,autolesion",
    reason: "Remitida por orientación escolar: autolesiones superficiales y conflictos con la madre. Acude con acudiente.",
    antecedentes: "Padres separados hace 2 años. Rendimiento académico en descenso. Sin ideación suicida estructurada al ingreso; plan de seguridad firmado con la madre.",
    plan: "DBT-A adaptada: regulación emocional, tolerancia al malestar, habilidades interpersonales. Sesión con la madre cada 3 sesiones. Monitoreo de riesgo en cada sesión.",
    dx: { code: "6A60", system: "CIE-11", name: "Trastorno de desregulación emocional (en estudio)" } },
  { name: "Ricardo Salazar Vega", age: 52, sex: "M", risk: "moderate", risk_type: "depresion", modality: "individual", tags: "demo,depresion,desempleo",
    reason: "Ánimo bajo tras despido hace 6 meses. Pérdida de interés, aumento de consumo de alcohol los fines de semana.",
    antecedentes: "Contador, 25 años en la misma empresa. Hipertensión controlada. Consumo de alcohol: 6-8 cervezas los sábados.",
    plan: "Activación conductual y reestructuración de creencias sobre el valor personal ligado al trabajo. AUDIT basal. Coordinar con medicina general.",
    dx: { code: "6A70.1", system: "CIE-11", name: "Episodio depresivo único, moderado" } },
  { name: "Paula Andrea Gómez", age: 31, sex: "F", risk: "low", risk_type: null, modality: "virtual", tags: "demo,pareja,maternidad",
    reason: "Dudas sobre maternidad y tensión con su pareja por proyecto de vida. Solicita espacio para clarificar.",
    antecedentes: "Relación de 4 años. Sin antecedentes clínicos. Diseñadora independiente.",
    plan: "Clarificación de valores y toma de decisiones. Valorar sesiones de pareja. 8 sesiones.",
    dx: null },
  { name: "Sebastián Vargas Ruiz", age: 24, sex: "M", risk: "low", risk_type: null, modality: "virtual", tags: "demo,tea,habilidades-sociales",
    reason: "Diagnóstico de TEA nivel 1 en la adultez. Busca apoyo en habilidades sociales y ansiedad en entrevistas laborales.",
    antecedentes: "Diagnóstico por neuropsicología hace 8 meses. Ingeniero de sistemas recién graduado. Sin medicación.",
    plan: "Entrenamiento en habilidades sociales y manejo de ansiedad en entrevistas (rol-play, exposición). Psicoeducación sobre TEA.",
    dx: { code: "6A02.0", system: "CIE-11", name: "Trastorno del espectro autista sin discapacidad intelectual" } },
  { name: "Gloria Inés Martínez", age: 63, sex: "F", risk: "low", risk_type: null, modality: "individual", tags: "demo,duelo,adulto-mayor",
    reason: "Duelo por fallecimiento de su esposo hace 8 meses. Sensación de vacío y dificultad para retomar rutinas.",
    antecedentes: "Viuda, 3 hijos adultos. Pensionada. Hipotiroidismo controlado. Red de apoyo activa (hermanas, parroquia).",
    plan: "Acompañamiento en duelo, reconstrucción de rutinas significativas y activación social. PHQ-9 mensual.",
    dx: { code: "Z63.4", system: "DSM-5-TR", name: "Reacción de duelo (no patológica)" } },
];
// --pool=A|B fuerza un juego; por defecto alterna por paridad del workspace.
const PATIENTS = args.pool ? (String(args.pool).toUpperCase() === "B" ? POOL_B : POOL_A) : (ws % 2 === 0 ? POOL_B : POOL_A);

function nextPatientId() {
  const wsMax = db.prepare("SELECT MAX(CAST(SUBSTR(id, 3) AS INTEGER)) AS m FROM patients WHERE workspace_id = ? AND id GLOB 'P-[0-9]*'").get(ws);
  let n = wsMax?.m ? wsMax.m + 1 : ws * 1000;
  let id = `P-${n}`;
  while (db.prepare("SELECT 1 FROM patients WHERE id = ?").get(id)) id = `P-${++n}`;
  return id;
}
const slug = (s) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z ]/g, "").trim().split(/\s+/);

const seeded = db.transaction(() => {
  // ── 1. Pacientes ──
  const patIns = db.prepare(`
    INSERT INTO patients (id, workspace_id, professional_id, name, doc, age, sex, phone, email, professional, modality,
                          status, reason, risk, risk_type, tags, whatsapp_opt_in, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'activo', ?, ?, ?, ?, 0, ?, ?)
  `);
  const ids = [];
  PATIENTS.forEach((p, i) => {
    const id = nextPatientId();
    const parts = slug(p.name);
    const email = `${parts[0]}.${parts[1] ?? "demo"}@example.com`;
    const doc = `CC 1.0${40 + i + (ws % 7)}.${200 + i * 7}.${300 + i * 13}`;
    const phone = `+57 3${10 + i} 555 ${String(1000 + i * 137 + ws).slice(-4)}`;
    const created = `${iso(addDays(monthStart, -20 + i * 2))} 09:00:00`;
    patIns.run(id, ws, profId, p.name, doc, p.age, p.sex, phone, email, profName, p.modality,
               p.reason, p.risk, p.risk_type, p.tags, created, created);
    ids.push(id);
  });

  // ── 2. Citas: mes actual (pasadas + futuras) y mes siguiente ──
  // Cada paciente tiene un día de la semana y una hora fijos (como en una
  // consulta real); sin choques de agenda porque los slots son únicos.
  const SLOTS = [["08:00", 1], ["09:00", 2], ["10:00", 3], ["11:00", 4], ["14:00", 1], ["15:00", 2], ["16:00", 3]];
  const apptIns = db.prepare(`
    INSERT INTO appointments (workspace_id, sede_id, professional_id, patient_id, date, time, duration_min, patient_name,
                              professional, modality, room, status, notes, meeting_url, video_provider)
    VALUES (?, NULL, ?, ?, ?, ?, 50, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const sessions = []; // { pid, i, date, time, past }
  let nPast = 0, nFuture = 0, noShowDone = false, solicitadaDone = false;
  PATIENTS.forEach((p, i) => {
    const [time, weekday] = pick(SLOTS, i);
    // Primer día del mes con ese weekday
    let d = new Date(monthStart);
    while (d.getDay() !== weekday) d = addDays(d, 1);
    let k = 0;
    for (; d <= nextMonthEnd; d = addDays(d, 7), k++) {
      // Sesiones semanales el mes actual, quincenales el siguiente (se ve
      // más real y deja huecos para agendar en las pruebas).
      if (d.getMonth() !== TODAY.getMonth() && k % 2 === 1) continue;
      const dateIso = iso(d);
      const past = dateIso < todayIso;
      const isTele = p.modality === "virtual";
      let status, notes;
      if (past) {
        if (!noShowDone && i === 3) { status = "no_show"; noShowDone = true; notes = "No asistió, no avisó. Reprogramar."; }
        else status = "atendida";
        nPast++;
      } else {
        const daysAhead = Math.round((d - TODAY) / 86400000);
        if (!solicitadaDone && i === 6 && daysAhead > 2) { status = "solicitada"; solicitadaDone = true; notes = "Solicitud desde el enlace público — pendiente de confirmar."; }
        else status = daysAhead <= 7 ? "confirmada" : "agendada";
        nFuture++;
      }
      const meeting = isTele && !past && status !== "solicitada"
        ? `https://meet.jit.si/Psicomorfosis-demo${ws}x${i}x${k}` : null;
      const r = apptIns.run(ws, profId, ids[i], dateIso, time, p.name, profName, p.modality,
                            isTele ? null : "Consultorio 1", status, notes ?? null, meeting, meeting ? "jitsi" : null);
      sessions.push({ apptId: r.lastInsertRowid, pid: ids[i], i, date: dateIso, time, past, status });
    }
  });

  // ── 3. Historia clínica: motivo, antecedentes, plan, examen mental y SOAP por sesión atendida ──
  const noteIns = db.prepare(`
    INSERT INTO clinical_notes (workspace_id, patient_id, author_id, author_name, kind, content, created_at, updated_at, signed_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const SOAPS = [
    { s: "Refiere semana con menos episodios de ansiedad (2 vs 5). Usó la respiración diafragmática en una reunión difícil.", o: "Discurso organizado, menor activación al narrar estresores.", a: "Respuesta favorable a técnicas de regulación. Sintomatología en descenso.", p: "Continuar exposición gradual. Registro de pensamientos automáticos para próxima sesión." },
    { s: "Durmió mejor 4 de 7 noches. Despertares asociados a rumia sobre temas familiares.", o: "Afecto congruente, se observa cansancio leve.", a: "Insomnio en mejoría parcial; componente de rumia persiste.", p: "Higiene del sueño estricta + técnica de posponer la preocupación (worry time)." },
    { s: "Asistió a la reunión social que había evitado. 'Me costó pero me quedé hasta el final'.", o: "Postura más erguida, contacto visual sostenido.", a: "Avance significativo en activación conductual.", p: "Programar 2 actividades sociales para las próximas 2 semanas. Reforzar logro." },
    { s: "Discusión fuerte el fin de semana; logró pausar y retomar la conversación al día siguiente.", o: "Narra el episodio sin desbordamiento emocional.", a: "Aplicación efectiva del tiempo fuera acordado en sesión.", p: "Modelar conversación de reparación. Rol-play próxima sesión." },
    { s: "Cefaleas disminuyeron a 1 episodio esta semana. Delegó dos tareas en el equipo.", o: "Menos tensión mandibular visible.", a: "Correlación clara entre delegación y síntomas físicos.", p: "Plan de límites laborales: no correos después de 7 pm. Evaluar en 2 semanas." },
    { s: "Primera sesión. Describe el motivo de consulta con detalle; expectativas realistas frente al proceso.", o: "Orientado en las tres esferas. Afecto ansioso, colaborador.", a: "Impresión diagnóstica inicial consistente con el motivo de consulta. Sin indicadores de riesgo agudo.", p: "Encuadre terapéutico, consentimiento informado, aplicación de tamizaje inicial. Sesión semanal." },
  ];
  let nNotes = 0;
  PATIENTS.forEach((p, i) => {
    const first = sessions.find((s) => s.i === i);
    const t0 = `${first.date} ${first.time}:00`;
    noteIns.run(ws, ids[i], user.id, profName, "motivo", p.reason, t0, t0, t0);
    noteIns.run(ws, ids[i], user.id, profName, "antecedentes", p.antecedentes, t0, t0, t0);
    noteIns.run(ws, ids[i], user.id, profName, "plan", p.plan, t0, t0, t0);
    noteIns.run(ws, ids[i], user.id, profName, "examen_mental",
      `Paciente ${p.sex === "F" ? "femenina" : "masculino"} de ${p.age} años. Orientad${p.sex === "F" ? "a" : "o"} en tiempo, lugar y persona. Aspecto acorde a la edad, aseo adecuado. Discurso fluido y coherente. Afecto ${p.risk === "high" ? "aplanado con fondo triste" : p.risk === "moderate" ? "ansioso" : "eutímico"}. Pensamiento lógico, sin alteraciones sensoperceptivas. Juicio y raciocinio conservados. Introspección ${p.risk === "low" ? "adecuada" : "parcial"}.`,
      t0, t0, t0);
    nNotes += 4;
    sessions.filter((s) => s.i === i && s.past && s.status === "atendida").forEach((s, j) => {
      const ts = `${s.date} ${s.time}:00`;
      const soap = j === 0 ? SOAPS[5] : pick(SOAPS, i + j);
      noteIns.run(ws, ids[i], user.id, profName, "sesion", JSON.stringify(soap), ts, ts, ts);
      nNotes++;
    });
  });

  // ── 4. Diagnósticos ──
  const dxIns = db.prepare(`
    INSERT INTO clinical_diagnoses (workspace_id, patient_id, code, system, name, is_primary, note, added_by_id, added_by_name, created_at)
    VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?, ?)
  `);
  let nDx = 0;
  PATIENTS.forEach((p, i) => {
    if (!p.dx) return;
    const first = sessions.find((s) => s.i === i);
    dxIns.run(ws, ids[i], p.dx.code, p.dx.system, p.dx.name, "Diagnóstico presuntivo según entrevista inicial y tamizaje.", user.id, profName, `${first.date} ${first.time}:00`);
    nDx++;
  });

  // ── 5. Tests: uno completado (con puntaje) y uno pendiente por paciente ──
  const CATALOG = db.prepare("SELECT code, name, items FROM psych_tests WHERE (is_custom = 0 OR is_custom IS NULL)").all();
  const byCode = Object.fromEntries(CATALOG.map((t) => [t.code, t]));
  const RESULTS = {
    "PHQ-9": { score: 11, level: "moderate", interp: "Depresión moderada" },
    "GAD-7": { score: 13, level: "moderate", interp: "Ansiedad moderada" },
    "BAI":   { score: 19, level: "moderate", interp: "Ansiedad moderada" },
    "BDI-II": { score: 22, level: "moderate", interp: "Depresión moderada" },
    "RSES":  { score: 17, level: "low", interp: "Autoestima baja" },
    "AUDIT": { score: 9, level: "mild", interp: "Consumo de riesgo" },
  };
  const perPatient = {
    ansiedad: ["GAD-7", "BAI"], panico: ["BAI", "GAD-7"], depresion: ["PHQ-9", "BDI-II"], duelo: ["PHQ-9", "GAD-7"],
    estres: ["GAD-7", "PHQ-9"], pareja: ["GAD-7", "PHQ-9"], autoestima: ["RSES", "PHQ-9"], desempleo: ["PHQ-9", "AUDIT"],
    autolesion: ["PHQ-9", "BDI-II"], tea: ["GAD-7", "PHQ-9"], vocacional: ["GAD-7", "RSES"], laboral: ["GAD-7", "PHQ-9"],
  };
  const testIns = db.prepare(`
    INSERT INTO test_applications (id, workspace_id, patient_id, patient_name, test_code, test_name, date, score, interpretation, level,
                                   professional, status, applied_by, assigned_at, completed_at, total_items, answered_items, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'paciente', ?, ?, ?, ?, ?)
  `);
  let nTests = 0;
  PATIENTS.forEach((p, i) => {
    const key = p.tags.split(",").find((t) => perPatient[t]) ?? "ansiedad";
    const [doneCode, pendCode] = perPatient[key];
    const done = byCode[doneCode], pend = byCode[pendCode];
    if (!done || !pend) return;
    const first = sessions.find((s) => s.i === i);
    const r = RESULTS[doneCode];
    testIns.run(`T-${ws}-demo-${i}-a`, ws, ids[i], p.name, done.code, done.name, first.date, r.score, r.interp, r.level, profName,
                "completado", `${first.date} ${first.time}:00`, `${iso(addDays(new Date(first.date + "T12:00:00"), 1))} 19:20:00`,
                done.items, done.items, `${TAG} Tamizaje inicial respondido desde el portal.`);
    nTests++;
    const lastPast = [...sessions].reverse().find((s) => s.i === i && s.past) ?? first;
    testIns.run(`T-${ws}-demo-${i}-b`, ws, ids[i], p.name, pend.code, pend.name, lastPast.date, null, null, null, profName,
                "pendiente", `${lastPast.date} ${lastPast.time}:00`, null, pend.items, 0, `${TAG} Asignado, pendiente de responder.`);
    nTests++;
  });

  // ── 6. Recibos: uno por sesión atendida (la mayoría pagados) ──
  const year = TODAY.getFullYear();
  const last = db.prepare("SELECT id FROM invoices WHERE workspace_id = ? AND id LIKE ? ORDER BY id DESC LIMIT 1").get(ws, `R-${ws}-${year}-%`);
  let seq = last ? parseInt(last.id.match(/-(\d+)$/)?.[1] ?? "0", 10) + 1 : 1;
  const invIns = db.prepare(`
    INSERT INTO invoices (id, workspace_id, patient_id, patient_name, professional, concept, amount, method, status, date, bank, modality, paid_at, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const METHODS = [["Transferencia", "Bancolombia"], ["Nequi", "Nequi"], ["Efectivo", null], ["Transferencia", "Davivienda"], ["Tarjeta", null]];
  let nInv = 0, pendingInv = 0;
  sessions.filter((s) => s.past && s.status === "atendida").forEach((s, j) => {
    const p = PATIENTS[s.i];
    const pendiente = j % 5 === 4; // ~20 % por cobrar
    const [method, bank] = pick(METHODS, s.i + j);
    let id = `R-${ws}-${year}-${String(seq++).padStart(4, "0")}`;
    while (db.prepare("SELECT 1 FROM invoices WHERE id = ?").get(id)) id = `R-${ws}-${year}-${String(seq++).padStart(4, "0")}`;
    invIns.run(id, ws, s.pid, p.name, profName, `Sesión individual · ${s.date}`, p.modality === "virtual" ? 120000 : 140000,
               pendiente ? "Transferencia" : method, pendiente ? "pendiente" : "pagada", s.date, pendiente ? null : bank,
               p.modality === "virtual" ? "Virtual" : "Presencial", pendiente ? null : `${s.date} ${s.time}:00`, `${s.date} ${s.time}:00`);
    nInv++; if (pendiente) pendingInv++;
  });

  // ── 7. Tareas ──
  const tareaIns = db.prepare(`
    INSERT INTO tareas (workspace_id, title, description, type, status, priority, assignee_id, creator_id, patient_id,
                        visibility, due_date, completed_at, position, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'team', ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
  `);
  const TASKS = [
    { t: `Informe de remisión a psiquiatría — ${PATIENTS[2].name}`, st: "TODO", pr: "URGENT", due: 2, pid: ids[2], type: "Clínica" },
    { t: "Confirmar citas de la próxima semana", st: "TODO", pr: "HIGH", due: 1, type: "Administrativa" },
    { t: `Revisar tamizaje pendiente — ${PATIENTS[0].name}`, st: "TODO", pr: "MEDIUM", due: 3, pid: ids[0], type: "Tests" },
    { t: `Plan de exposición gradual — ${PATIENTS[0].name}`, st: "IN_PROGRESS", pr: "HIGH", due: 4, pid: ids[0], type: "Clínica" },
    { t: "Actualizar consentimientos informados 2026", st: "IN_PROGRESS", pr: "MEDIUM", due: 7, type: "Administrativa" },
    { t: `Preparar sesión familiar — ${PATIENTS[5].name}`, st: "TODO", pr: "MEDIUM", due: 6, pid: ids[5], type: "Clínica" },
    { t: "Cierre de facturación del mes anterior", st: "DONE", pr: "MEDIUM", due: -3, type: "Administrativa" },
    { t: `Resumen de evolución para EPS — ${PATIENTS[4].name}`, st: "IN_REVIEW", pr: "LOW", due: 10, pid: ids[4], type: "Clínica" },
    { t: "Renovar póliza de responsabilidad civil", st: "TODO", pr: "LOW", due: 21, type: "Administrativa" },
    { t: "Leer guía NICE de ansiedad generalizada (actualización)", st: "TODO", pr: "LOW", due: 14, type: "Formación" },
  ];
  TASKS.forEach((t, i) => {
    tareaIns.run(ws, t.t, `${TAG} Tarea de demostración.`, t.type, t.st, t.pr, profId, user.id, t.pid ?? null,
                 t.due != null ? iso(addDays(TODAY, t.due)) : null, t.st === "DONE" ? `${iso(addDays(TODAY, -3))} 17:00:00` : null, i);
  });

  // ── 8. Campos derivados en el paciente ──
  const upd = db.prepare("UPDATE patients SET last_contact = ?, next_session = ? WHERE id = ?");
  ids.forEach((pid) => {
    const mine = sessions.filter((s) => s.pid === pid);
    const lastPast = [...mine].reverse().find((s) => s.past);
    const next = mine.find((s) => !s.past && s.status !== "solicitada");
    upd.run(lastPast?.date ?? null, next ? `${next.date} ${next.time}` : null, pid);
  });

  return { ids, nPast, nFuture, nNotes, nDx, nTests, nInv, pendingInv, nTasks: TASKS.length };
})();

console.log(`> ${seeded.ids.length} pacientes: ${seeded.ids[0]} … ${seeded.ids.at(-1)}`);
console.log(`> ${seeded.nPast + seeded.nFuture} citas (${seeded.nPast} pasadas, ${seeded.nFuture} futuras hasta ${iso(nextMonthEnd)}; 1 no_show, 1 solicitada)`);
console.log(`> ${seeded.nNotes} notas clínicas · ${seeded.nDx} diagnósticos · ${seeded.nTests} tests · ${seeded.nInv} recibos (${seeded.pendingInv} pendientes) · ${seeded.nTasks} tareas`);
console.log("Listo.");
