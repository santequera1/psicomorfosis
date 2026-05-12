/**
 * Seed de demostración: workspace "Consulta Psic. de Prueba" con
 * 5 pacientes, citas, notas, diagnósticos, tests, recibos, documentos
 * y tareas. Pensado para que Stiven pueda probar la app desde el
 * punto de vista de un psicólogo sin contaminar la cuenta real de
 * Nathaly.
 *
 * Uso:
 *   ssh ubuntu@51.195.109.26
 *   cd ~/apps/psicomorfosis/server/src
 *   node seed-psicologo-demo.mjs
 *
 * Idempotente: si el user 'psicologo' ya existe, aborta con un
 * mensaje claro de cómo limpiarlo manualmente para re-seedear.
 *
 * Todo lo que se inserta corre en UNA transacción — si algo falla,
 * rollback completo. La DB no queda inconsistente.
 */

import { db } from "./db.js";
import bcrypt from "bcryptjs";

const username = "psicologo";
const password = "Psico@2026!N";

// ─── Pre-check ─────────────────────────────────────────────────────────

const existing = db.prepare("SELECT id, workspace_id FROM users WHERE username = ?").get(username);
if (existing) {
  console.log(`⚠️  El user '${username}' ya existe (workspace_id=${existing.workspace_id}).`);
  console.log("Para re-seedear:");
  console.log("  pm2 stop psicomorfosis-api");
  console.log(`  sqlite3 ~/apps/psicomorfosis/server/data.db "DELETE FROM workspaces WHERE id = ${existing.workspace_id};"`);
  console.log("  pm2 start psicomorfosis-api");
  console.log("  node seed-psicologo-demo.mjs");
  process.exit(0);
}

// ─── Helpers ───────────────────────────────────────────────────────────

const today = new Date();
const iso = (d) => d.toISOString().slice(0, 10);
const isoFull = (d) => d.toISOString().replace(/\.\d+Z$/, "Z");
const daysAgo = (n) => { const d = new Date(today); d.setDate(d.getDate() - n); return d; };
const daysAhead = (n) => { const d = new Date(today); d.setDate(d.getDate() + n); return d; };

function rand(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }

// ─── Pacientes ────────────────────────────────────────────────────────
//
// Mezcla intencional de casos típicos en clínica privada: ansiedad,
// depresión moderada, adolescente con TDAH, duelo, conflictos de pareja.
// Sirve para que cada flujo de prueba toque un caso distinto.
const PATIENTS = [
  {
    id: "P-9001",
    name: "Camila Rondón Vélez",
    preferred_name: "Cami",
    pronouns: "ella",
    doc: "CC 1.020.345.678",
    age: 28,
    phone: "+57 300 123 4567",
    email: "camila.rondon.demo@example.com",
    modality: "individual",
    status: "activo",
    reason: "Ansiedad y sobrecarga laboral",
    risk: "moderate",
    risk_type: '["reagudizacion"]',
    tags: '["TCC","ansiedad","laboral"]',
    address: "Cartagena de Indias, El Bosque",
    sex: "F",
  },
  {
    id: "P-9002",
    name: "Andrés Galeano Suárez",
    preferred_name: "",
    pronouns: "él",
    doc: "CC 80.123.456",
    age: 35,
    phone: "+57 311 222 3344",
    email: "andres.galeano.demo@example.com",
    modality: "individual",
    status: "activo",
    reason: "Episodios depresivos recurrentes",
    risk: "moderate",
    risk_type: '["reagudizacion"]',
    tags: '["depresión","TCC"]',
    address: "Cartagena, Manga",
    sex: "M",
  },
  {
    id: "P-9003",
    name: "Valentina Soto Cárdenas",
    preferred_name: "Val",
    pronouns: "ella",
    doc: "TI 1.031.998.221",
    age: 16,
    phone: "+57 301 776 8812",
    email: "vsoto.fam.demo@example.com",
    modality: "individual",
    status: "activo",
    reason: "Dificultades de atención y rendimiento escolar",
    risk: "low",
    risk_type: null,
    tags: '["adolescente","TDAH","escolar"]',
    address: "Cartagena, Castillogrande",
    sex: "F",
  },
  {
    id: "P-9004",
    name: "Laura Restrepo Ruiz",
    preferred_name: "",
    pronouns: "ella",
    doc: "CC 43.567.890",
    age: 42,
    phone: "+57 315 444 5566",
    email: "laura.restrepo.demo@example.com",
    modality: "individual",
    status: "activo",
    reason: "Proceso de duelo tras pérdida de su padre",
    risk: "moderate",
    risk_type: '["reagudizacion"]',
    tags: '["duelo","ansiedad"]',
    address: "Cartagena, Bocagrande",
    sex: "F",
  },
  {
    id: "P-9005",
    name: "Carlos Mendoza Pérez",
    preferred_name: "",
    pronouns: "él",
    doc: "CC 70.234.567",
    age: 50,
    phone: "+57 318 999 8877",
    email: "carlos.mendoza.demo@example.com",
    modality: "pareja",
    status: "activo",
    reason: "Conflictos persistentes en relación de pareja",
    risk: "low",
    risk_type: null,
    tags: '["pareja","comunicación"]',
    address: "Cartagena, Crespo",
    sex: "M",
  },
];

// ─── Datos clínicos por paciente ──────────────────────────────────────
// Texto genérico estilo "notas de consultorio": frases neutras que
// describen cuadro clínico típico sin ser copia de ningún manual.

const CLINICAL = {
  "P-9001": {
    motivo: "Paciente consulta por sensación persistente de ansiedad, preocupación excesiva y dificultad para conciliar el sueño durante los últimos 4 meses. Refiere alta carga laboral y sensación de no poder desconectarse.",
    antecedentes: "Sin antecedentes psiquiátricos previos. No refiere consumo de sustancias. Antecedentes familiares: madre con tratamiento ansioso hace varios años. Sin patología médica de base relevante.",
    examen_mental: "Paciente lúcida, orientada en las tres esferas. Discurso coherente, fluido. Afecto ansioso. Pensamiento centrado en preocupaciones laborales y rendimiento. Sin alteraciones sensoperceptivas. Juicio conservado.",
    plan: "Sesiones semanales de TCC durante 12 semanas. Psicoeducación sobre ansiedad. Técnicas de respiración y reestructuración cognitiva. Higiene del sueño. Reevaluación a las 6 semanas.",
    diagnoses: [
      { code: "6B00", system: "CIE-11", name: "Trastorno de ansiedad generalizada", catalog_id: "tag", is_primary: 1 },
    ],
    soap: [
      {
        date: daysAgo(7),
        s: "Refiere que la última semana ha tenido 2 episodios de despertar nocturno con taquicardia. En el trabajo, presentación importante el viernes que la mantiene 'en alerta constante'.",
        o: "Apariencia cuidada. Discurso fluido y coherente. Afecto ansioso modulado. Aplicación de GAD-7: 14 (ansiedad moderada). Sin ideación suicida.",
        a: "Cuadro consistente con trastorno de ansiedad generalizada en fase activa. Respuesta inicial favorable a psicoeducación pero síntomas mantienen intensidad moderada.",
        p: "Practicar respiración 4-7-8 al dormir. Registro de preocupaciones diario (15 min designados). Reevaluar en próxima sesión. Citar al cónyuge si la paciente lo autoriza.",
        signed: true,
      },
    ],
    tasks: [
      { title: "Registro semanal de preocupaciones", description: "Anotar cada día las 3 preocupaciones más recurrentes y el grado de evidencia que las respalda.", type: "Sesión clínica", priority: "MEDIUM", status: "IN_PROGRESS", due_days: 7 },
      { title: "Practicar respiración 4-7-8 antes de dormir", description: "5 minutos antes de acostarse, durante la próxima semana.", type: "Auto-cuidado", priority: "LOW", status: "TODO", due_days: 7 },
    ],
    tests: [
      { test_code: "GAD-7", test_name: "Generalized Anxiety Disorder 7", score: 14, level: "moderate", interpretation: "Ansiedad moderada — requiere intervención", days_ago: 7 },
    ],
  },
  "P-9002": {
    motivo: "Consulta por episodios depresivos recurrentes en los últimos 2 años. Refiere anhedonia, fatiga matinal y baja motivación laboral. Episodio actual de 6 semanas de evolución.",
    antecedentes: "Episodio depresivo similar hace 18 meses, resuelto con psicoterapia. Sin tratamiento farmacológico actual. No refiere antecedentes familiares relevantes. Consumo de alcohol social moderado.",
    examen_mental: "Paciente orientado, colaborador. Bradipsiquia leve. Afecto deprimido, modula con dificultad. Pensamiento sin alteraciones formales. Niega ideación suicida activa pero refiere 'no le ve sentido a algunas cosas'.",
    plan: "TCC semanal con énfasis en activación conductual. Aplicar PHQ-9 mensual. Evaluar interconsulta a psiquiatría si no hay mejoría en 6 semanas. Plan de seguridad acordado.",
    diagnoses: [
      { code: "6A71", system: "CIE-11", name: "Trastorno depresivo recurrente", catalog_id: "dep-recurrente", is_primary: 1 },
    ],
    soap: [
      {
        date: daysAgo(14),
        s: "Reporta semana 'gris pero menos pesada' que la anterior. Logró ir al gimnasio 2 veces. Sin episodios de llanto pero sigue con cansancio matinal.",
        o: "Afecto eutímico levemente. Buen contacto visual. PHQ-9: 12 (depresión moderada, mejoró desde 17 en sesión 1).",
        a: "Respuesta inicial a activación conductual. Síntomas en mejoría pero aún en rango moderado.",
        p: "Continuar registro de actividades placenteras/de logro. Caminata 30 min diaria. Próxima sesión en 1 semana.",
        signed: true,
      },
    ],
    tasks: [
      { title: "Registro diario de actividades (placer/logro)", description: "Anotar 3 actividades diarias y calificar de 0-10 placer y logro experimentados.", type: "Sesión clínica", priority: "MEDIUM", status: "IN_PROGRESS", due_days: 7 },
      { title: "Caminata 30 min diaria", description: "Ejercicio aeróbico ligero como parte del plan de activación conductual.", type: "Auto-cuidado", priority: "MEDIUM", status: "IN_PROGRESS", due_days: 14 },
    ],
    tests: [
      { test_code: "PHQ-9", test_name: "Patient Health Questionnaire-9", score: 12, level: "moderate", interpretation: "Depresión moderada — respuesta inicial al tratamiento", days_ago: 14 },
    ],
  },
  "P-9003": {
    motivo: "Adolescente con dificultades de atención en clase y bajo rendimiento en últimos 2 trimestres. Padres reportan distractibilidad y desorganización en tareas escolares.",
    antecedentes: "Sin antecedentes médicos relevantes. No medicación. Familia nuclear. Padres en pareja estable. Sin antecedentes psiquiátricos familiares conocidos.",
    examen_mental: "Adolescente colaboradora. Discurso fluido, ocasional dispersión durante la entrevista. Afecto eutímico. Pensamiento sin alteraciones. Reporta dificultad para mantener atención en lecturas largas.",
    plan: "Evaluación neuropsicológica preliminar con escalas de TDAH. Trabajo conjunto con colegio. Psicoeducación a padres sobre estrategias de organización. Plantilla de planificación semanal.",
    diagnoses: [
      { code: "6A05", system: "CIE-11", name: "Trastorno por déficit de atención e hiperactividad", catalog_id: "tdah", is_primary: 1 },
    ],
    soap: [
      {
        date: daysAgo(5),
        s: "Refiere que esta semana 'olvidó' 3 tareas y entregó otra a destiempo. Cuenta que se distrae con redes sociales cuando intenta estudiar.",
        o: "Atención fluctuante durante la sesión (cambia tema en 2 ocasiones). Sin signos de ansiedad. Colaborativa.",
        a: "Cuadro consistente con TDAH presentación combinada. Adherencia inicial al uso de planificador, pero falla por estímulos digitales.",
        p: "Configurar modo concentración en celular durante bloques de estudio. Técnica Pomodoro 25/5. Revisar planificador en siguiente sesión.",
        signed: false,
      },
    ],
    tasks: [
      { title: "Usar planificador semanal", description: "Cada domingo, escribir tareas/entregas de la semana en el planificador físico.", type: "Sesión clínica", priority: "HIGH", status: "TODO", due_days: 7 },
      { title: "Bloques Pomodoro de estudio", description: "Ciclos de 25 min de estudio + 5 min de descanso. Sin celular durante el bloque.", type: "Sesión clínica", priority: "MEDIUM", status: "TODO", due_days: 7 },
    ],
    tests: [],
  },
  "P-9004": {
    motivo: "Proceso de duelo no resuelto tras fallecimiento de su padre hace 8 meses. Refiere llanto frecuente, dificultad para volver a rutinas y sensación de 'estar atorada en ese momento'.",
    antecedentes: "Sin antecedentes psiquiátricos. Relación cercana con el padre fallecido. Otras pérdidas significativas en últimos 5 años (madre, 2018). Apoyo familiar limitado.",
    examen_mental: "Paciente colaboradora, presenta llanto durante la entrevista al hablar del padre. Afecto triste, congruente. Pensamiento centrado en recuerdos. Sin ideación autolítica activa. Sueño fragmentado.",
    plan: "Trabajo de elaboración de duelo. Sesiones semanales. Carta al padre como técnica narrativa. Reincorporación gradual a actividades sociales suspendidas.",
    diagnoses: [
      { code: "QE62", system: "CIE-11", name: "Reacción de duelo (no patológica)", catalog_id: "duelo", is_primary: 1 },
      { code: "6B00", system: "CIE-11", name: "Trastorno de ansiedad generalizada", catalog_id: "tag", is_primary: 0 },
    ],
    soap: [
      {
        date: daysAgo(21),
        s: "Compartió que pudo asistir al cumpleaños de su sobrina por primera vez desde la muerte de su padre. 'Lloré bastante pero no me arrepentí de ir'.",
        o: "Afecto triste pero modula. Discurso fluido. Sin signos ansiosos agudos. Reporta sueño de 5 horas promedio.",
        a: "Avance significativo en reincorporación social. Duelo en fase de elaboración activa. Persisten síntomas ansiosos secundarios.",
        p: "Continuar reincorporación gradual a actividades. Comenzar carta al padre. Trabajar técnicas de regulación del sueño.",
        signed: true,
      },
    ],
    tasks: [
      { title: "Escribir carta al padre (no enviada)", description: "Ejercicio terapéutico narrativo. Sin presión de extensión ni forma.", type: "Sesión clínica", priority: "MEDIUM", status: "IN_PROGRESS", due_days: 14 },
      { title: "Retomar caminata con vecina", description: "Actividad social que dejó hace 8 meses. Empezar con 1 vez por semana.", type: "Auto-cuidado", priority: "LOW", status: "TODO", due_days: 14 },
    ],
    tests: [],
  },
  "P-9005": {
    motivo: "Solicita terapia individual paralela al proceso de pareja que ya iniciaron. Refiere patrones de comunicación pasivo-agresivos y rumiación post-discusiones.",
    antecedentes: "Sin antecedentes psiquiátricos. Casado hace 18 años. 2 hijos. Tendencia histórica a evitar conflicto. Padres con relación conflictiva en su infancia.",
    examen_mental: "Paciente reflexivo, autocrítico. Afecto eutímico, modula bien. Discurso ordenado. Pensamiento sin alteraciones. Insight conservado sobre sus patrones.",
    plan: "Enfoque centrado en patrones aprendidos de manejo de conflicto. Identificación de gatillos. Comunicación asertiva. Coordinación con terapeuta de pareja (con autorización).",
    diagnoses: [
      { code: "QE51.0", system: "CIE-11", name: "Problemas en relación de pareja", catalog_id: "problema-pareja", is_primary: 1 },
    ],
    soap: [],
    tasks: [
      { title: "Registro de discusiones con cónyuge", description: "Apuntar gatillo, reacción inicial, qué hubiera hecho distinto.", type: "Sesión clínica", priority: "MEDIUM", status: "TODO", due_days: 7 },
    ],
    tests: [],
  },
};

// ─── Tareas propias del psicólogo (sin paciente) ──────────────────────
const OWN_TASKS = [
  { title: "Renovar póliza de responsabilidad civil", description: "Vence el 30 del próximo mes. Contactar al broker.", type: "Administrativo", priority: "MEDIUM", status: "TODO", due_days: 20, visibility: "private" },
  { title: "Lectura: capítulo 3 manual de TCC para ansiedad", description: "Revisar técnicas de exposición gradual para próxima sesión con paciente P-9001.", type: "Capacitación", priority: "LOW", status: "IN_PROGRESS", due_days: 5, visibility: "private" },
  { title: "Cierre contable del mes", description: "Cuadrar recibos emitidos vs pagos recibidos. Exportar reporte.", type: "Reporte", priority: "MEDIUM", status: "TODO", due_days: 10, visibility: "private" },
  { title: "Pausa de autocuidado — caminata 30 min", description: "Salir hoy a las 6pm sin celular.", type: "Auto-cuidado", priority: "LOW", status: "DONE", completed_days_ago: 1, visibility: "private" },
  { title: "Reunión mensual con grupo de supervisión", description: "Llevar caso P-9004 (duelo complejo) para discutir abordaje.", type: "Reunión equipo", priority: "MEDIUM", status: "TODO", due_days: 14, visibility: "private" },
];

// ─── Citas (pasadas atendidas + futuras) ──────────────────────────────
const APPOINTMENTS = [
  // Pasadas atendidas
  { patient_id: "P-9001", date: iso(daysAgo(7)),  time: "10:00", duration_min: 50, modality: "individual", status: "atendida", notes: "Sesión productiva, paciente colaboradora." },
  { patient_id: "P-9002", date: iso(daysAgo(14)), time: "11:00", duration_min: 50, modality: "individual", status: "atendida", notes: "Continúa mejora con activación conductual." },
  { patient_id: "P-9003", date: iso(daysAgo(5)),  time: "15:00", duration_min: 50, modality: "individual", status: "atendida", notes: "Padres asistieron a primera parte de sesión." },
  { patient_id: "P-9004", date: iso(daysAgo(21)), time: "09:00", duration_min: 50, modality: "individual", status: "atendida", notes: "Avance notable en reincorporación social." },
  // Futuras (próximas 24-72h para que aparezcan en notificaciones)
  { patient_id: "P-9001", date: iso(daysAhead(1)), time: "10:00", duration_min: 50, modality: "individual", status: "confirmada", notes: "" },
  { patient_id: "P-9002", date: iso(daysAhead(2)), time: "11:00", duration_min: 50, modality: "individual", status: "confirmada", notes: "" },
  { patient_id: "P-9003", date: iso(daysAhead(3)), time: "15:00", duration_min: 50, modality: "individual", status: "pendiente", notes: "" },
  { patient_id: "P-9005", date: iso(daysAhead(2)), time: "16:00", duration_min: 50, modality: "pareja", status: "confirmada", notes: "Primera sesión individual." },
];

// ─── Recibos (mezcla pagados + pendientes) ────────────────────────────
const INVOICES = [
  { patient_id: "P-9001", date: iso(daysAgo(7)),  concept: "Sesión individual",  amount: 180000, status: "pagada",    method: "Transferencia", days_paid_ago: 6 },
  { patient_id: "P-9002", date: iso(daysAgo(14)), concept: "Sesión individual",  amount: 180000, status: "pagada",    method: "Efectivo",      days_paid_ago: 13 },
  { patient_id: "P-9003", date: iso(daysAgo(5)),  concept: "Sesión individual",  amount: 180000, status: "pagada",    method: "Nequi",         days_paid_ago: 4 },
  { patient_id: "P-9004", date: iso(daysAgo(21)), concept: "Sesión individual",  amount: 180000, status: "pagada",    method: "Transferencia", days_paid_ago: 19 },
  { patient_id: "P-9001", date: iso(daysAgo(2)),  concept: "Sesión individual",  amount: 180000, status: "pendiente", method: "Transferencia", days_paid_ago: null },
];

// ─── Insertar todo en una transacción ─────────────────────────────────

const tx = db.transaction(() => {
  // 1. Workspace
  const wsId = db.prepare(
    "INSERT INTO workspaces (name, mode) VALUES (?, 'individual')"
  ).run("Consulta Psic. de Prueba").lastInsertRowid;

  // 2. Professional
  const profId = db.prepare(`
    INSERT INTO professionals (workspace_id, name, title, email, phone, approach, active)
    VALUES (?, ?, ?, ?, ?, ?, 1)
  `).run(
    wsId,
    "Dr. Pruebas Demo",
    "Psicólogo/a clínico/a",
    "psicologo.demo@psicomorfosis.co",
    "+57 300 000 0001",
    "Cognitivo-conductual",
  ).lastInsertRowid;

  // 3. User psicologo
  const userId = db.prepare(`
    INSERT INTO users (workspace_id, username, password_hash, name, email, role, professional_id)
    VALUES (?, ?, ?, ?, ?, 'super_admin', ?)
  `).run(
    wsId, username, bcrypt.hashSync(password, 10),
    "Dr. Pruebas Demo", "psicologo.demo@psicomorfosis.co", profId,
  ).lastInsertRowid;

  // 4. tareas_columns (las 4 estándar)
  const tcIns = db.prepare(`
    INSERT INTO tareas_columns (workspace_id, name, color, icon, status, position, is_default)
    VALUES (?, ?, ?, ?, ?, ?, 1)
  `);
  const cols = [
    ["Por hacer",    "var(--lavender-400)", "Circle",       "TODO",        0],
    ["En progreso",  "var(--brand-700)",    "Clock",        "IN_PROGRESS", 1],
    ["En revisión",  "var(--warning)",      "AlertCircle",  "IN_REVIEW",   2],
    ["Hecho",        "var(--sage-500)",     "CheckCircle2", "DONE",        3],
  ];
  for (const [n, c, i, s, p] of cols) tcIns.run(wsId, n, c, i, s, p);

  // 5. Settings de horario y duración
  const setIns = db.prepare(
    "INSERT INTO settings (workspace_id, key, value) VALUES (?, ?, ?)"
  );
  setIns.run(wsId, "work_start_hour", "08");
  setIns.run(wsId, "work_end_hour", "18");
  setIns.run(wsId, "work_days", "monday,tuesday,wednesday,thursday,friday");
  setIns.run(wsId, "session_duration_min", "50");
  setIns.run(wsId, "session_price_cop", "180000");

  // 6. Cuenta bancaria (wallet) — Bancolombia ahorros
  db.prepare(`
    INSERT INTO bank_accounts (workspace_id, label, bank_id, account_type, last4, holder_name, brand)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(wsId, "Cuenta consultorio", "bancolombia", "ahorros", "4521", "Dr. Pruebas Demo", "none");

  // 7. Pacientes
  const patIns = db.prepare(`
    INSERT INTO patients (
      id, workspace_id, professional_id, name, preferred_name, pronouns, doc, age,
      phone, email, professional, modality, status, reason, risk, risk_type, tags,
      address, sex, last_contact, next_session
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const p of PATIENTS) {
    patIns.run(
      p.id, wsId, profId, p.name, p.preferred_name, p.pronouns, p.doc, p.age,
      p.phone, p.email, "Dr. Pruebas Demo", p.modality, p.status, p.reason,
      p.risk, p.risk_type, p.tags, p.address, p.sex,
      null, null,
    );
  }

  // 8. Notas clínicas: bloques de historia + SOAP por paciente
  const noteIns = db.prepare(`
    INSERT INTO clinical_notes (workspace_id, patient_id, author_id, author_name, kind, content, signed_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  for (const [pid, c] of Object.entries(CLINICAL)) {
    const now = new Date().toISOString();
    if (c.motivo)         noteIns.run(wsId, pid, userId, "Dr. Pruebas Demo", "motivo",       c.motivo, now);
    if (c.antecedentes)   noteIns.run(wsId, pid, userId, "Dr. Pruebas Demo", "antecedentes", c.antecedentes, now);
    if (c.examen_mental)  noteIns.run(wsId, pid, userId, "Dr. Pruebas Demo", "examen_mental", c.examen_mental, now);
    if (c.plan)           noteIns.run(wsId, pid, userId, "Dr. Pruebas Demo", "plan",         c.plan, now);
    for (const s of (c.soap ?? [])) {
      const content = JSON.stringify({ s: s.s, o: s.o, a: s.a, p: s.p });
      noteIns.run(
        wsId, pid, userId, "Dr. Pruebas Demo", "sesion",
        content,
        s.signed ? s.date.toISOString() : null,
      );
    }
  }

  // 9. Diagnósticos estructurados (tabla nueva clinical_diagnoses)
  const dxIns = db.prepare(`
    INSERT INTO clinical_diagnoses (
      workspace_id, patient_id, code, system, name, catalog_id, is_primary, added_by_id, added_by_name
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const [pid, c] of Object.entries(CLINICAL)) {
    for (const d of (c.diagnoses ?? [])) {
      dxIns.run(
        wsId, pid, d.code, d.system, d.name, d.catalog_id, d.is_primary,
        userId, "Dr. Pruebas Demo",
      );
    }
  }

  // 10. Citas
  const apptIns = db.prepare(`
    INSERT INTO appointments (
      workspace_id, professional_id, patient_id, patient_name, professional,
      date, time, duration_min, modality, status, notes
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const a of APPOINTMENTS) {
    const patient = PATIENTS.find((p) => p.id === a.patient_id);
    apptIns.run(
      wsId, profId, a.patient_id, patient?.name ?? "Desconocido", "Dr. Pruebas Demo",
      a.date, a.time, a.duration_min, a.modality, a.status, a.notes ?? "",
    );
  }

  // 11. Tests aplicados (solo metadata: nombre, score, nivel, fecha — sin items)
  const taIns = db.prepare(`
    INSERT INTO test_applications (
      workspace_id, patient_id, patient_name, test_code, test_name, status,
      score, level, interpretation, applied_by, date
    ) VALUES (?, ?, ?, ?, ?, 'completado', ?, ?, ?, 'profesional', ?)
  `);
  for (const [pid, c] of Object.entries(CLINICAL)) {
    const patient = PATIENTS.find((p) => p.id === pid);
    for (const t of (c.tests ?? [])) {
      taIns.run(
        wsId, pid, patient?.name ?? "Desconocido", t.test_code, t.test_name,
        t.score, t.level, t.interpretation, iso(daysAgo(t.days_ago)),
      );
    }
  }

  // 12. Tareas de pacientes (therapy_tasks) — la tabla del módulo "Tareas
  //     terapéuticas" que se asignan al paciente. Algunas las llevamos
  //     también a "tareas" del kanban interno para que se vean ahí.
  const tareasIns = db.prepare(`
    INSERT INTO tareas (
      workspace_id, title, description, type, status, priority, assignee_id,
      creator_id, patient_id, visibility, due_date, completed_at, position
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  let pos = 0;
  // Tareas propias del psicólogo (sin paciente)
  for (const t of OWN_TASKS) {
    const due = t.due_days ? iso(daysAhead(t.due_days)) : null;
    const completed = t.completed_days_ago ? isoFull(daysAgo(t.completed_days_ago)) : null;
    tareasIns.run(
      wsId, t.title, t.description, t.type, t.status, t.priority,
      profId, userId, null, t.visibility, due, completed, pos++,
    );
  }
  // Tareas asignadas a pacientes
  for (const [pid, c] of Object.entries(CLINICAL)) {
    for (const t of (c.tasks ?? [])) {
      const due = t.due_days ? iso(daysAhead(t.due_days)) : null;
      tareasIns.run(
        wsId, t.title, t.description, t.type, t.status, t.priority,
        profId, userId, pid, "team", due, null, pos++,
      );
    }
  }

  // 13. Recibos
  const invIns = db.prepare(`
    INSERT INTO invoices (
      id, workspace_id, patient_id, patient_name, concept, amount, total,
      method, status, date, paid_at, modality, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  // ID format: R-<wsId>-<year>-<seq>
  const year = today.getFullYear();
  let seq = 1;
  for (const i of INVOICES) {
    const patient = PATIENTS.find((p) => p.id === i.patient_id);
    const id = `R-${wsId}-${year}-${String(seq).padStart(4, "0")}`;
    seq++;
    invIns.run(
      id, wsId, i.patient_id, patient?.name ?? "Desconocido", i.concept,
      i.amount, i.amount, i.method, i.status, i.date,
      i.days_paid_ago ? isoFull(daysAgo(i.days_paid_ago)) : null,
      "individual",
      isoFull(daysAgo(28 - seq)),
    );
  }

  return {
    wsId, userId, profId,
    patients: PATIENTS.length,
    appointments: APPOINTMENTS.length,
    invoices: INVOICES.length,
    ownTasks: OWN_TASKS.length,
    patientTasks: Object.values(CLINICAL).reduce((acc, c) => acc + (c.tasks?.length ?? 0), 0),
    soapNotes: Object.values(CLINICAL).reduce((acc, c) => acc + (c.soap?.length ?? 0), 0),
    diagnoses: Object.values(CLINICAL).reduce((acc, c) => acc + (c.diagnoses?.length ?? 0), 0),
    tests: Object.values(CLINICAL).reduce((acc, c) => acc + (c.tests?.length ?? 0), 0),
  };
});

try {
  const result = tx();
  console.log("✅ Demo seedeado correctamente:");
  console.log(`  Workspace ID: ${result.wsId}`);
  console.log(`  User ID:      ${result.userId}`);
  console.log(`  Professional: ${result.profId}`);
  console.log(`  ─────────`);
  console.log(`  Pacientes:    ${result.patients}`);
  console.log(`  Citas:        ${result.appointments}`);
  console.log(`  Notas SOAP:   ${result.soapNotes}`);
  console.log(`  Diagnósticos: ${result.diagnoses}`);
  console.log(`  Tests:        ${result.tests}`);
  console.log(`  Tareas (propias + paciente): ${result.ownTasks} + ${result.patientTasks}`);
  console.log(`  Recibos:      ${result.invoices}`);
  console.log("");
  console.log(`🔑 Acceso:`);
  console.log(`  URL:        https://psico.wailus.co`);
  console.log(`  Usuario:    ${username}`);
  console.log(`  Contraseña: ${password}`);
} catch (err) {
  console.error("❌ Error en seed:", err.message);
  console.error(err.stack);
  process.exit(1);
}
