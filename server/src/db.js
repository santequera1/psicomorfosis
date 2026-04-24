import Database from "better-sqlite3";
import bcrypt from "bcryptjs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { existsSync } from "node:fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_PATH = join(__dirname, "..", "data.db");

export const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

const SCHEMA = `
CREATE TABLE IF NOT EXISTS workspaces (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  mode TEXT NOT NULL DEFAULT 'individual',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  workspace_id INTEGER NOT NULL,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  email TEXT,
  role TEXT NOT NULL DEFAULT 'psicologa',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS sedes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  workspace_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  address TEXT,
  phone TEXT,
  active INTEGER DEFAULT 1,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS professionals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  workspace_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  title TEXT,
  email TEXT,
  phone TEXT,
  approach TEXT,
  active INTEGER DEFAULT 1,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS professional_sedes (
  professional_id INTEGER NOT NULL,
  sede_id INTEGER NOT NULL,
  PRIMARY KEY (professional_id, sede_id),
  FOREIGN KEY (professional_id) REFERENCES professionals(id) ON DELETE CASCADE,
  FOREIGN KEY (sede_id) REFERENCES sedes(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS patients (
  id TEXT PRIMARY KEY,
  workspace_id INTEGER NOT NULL,
  sede_id INTEGER,
  professional_id INTEGER,
  name TEXT NOT NULL,
  preferred_name TEXT,
  pronouns TEXT,
  doc TEXT,
  age INTEGER,
  phone TEXT,
  email TEXT,
  professional TEXT,
  modality TEXT,
  status TEXT,
  reason TEXT,
  last_contact TEXT,
  next_session TEXT,
  risk TEXT,
  tags TEXT,
  archived_at TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
  FOREIGN KEY (sede_id) REFERENCES sedes(id) ON DELETE SET NULL,
  FOREIGN KEY (professional_id) REFERENCES professionals(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS appointments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  workspace_id INTEGER NOT NULL,
  sede_id INTEGER,
  professional_id INTEGER,
  patient_id TEXT,
  date TEXT NOT NULL,
  time TEXT NOT NULL,
  duration_min INTEGER DEFAULT 50,
  patient_name TEXT,
  professional TEXT,
  modality TEXT,
  room TEXT,
  status TEXT,
  notes TEXT,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
  FOREIGN KEY (sede_id) REFERENCES sedes(id) ON DELETE SET NULL,
  FOREIGN KEY (professional_id) REFERENCES professionals(id) ON DELETE SET NULL,
  FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS psych_tests (
  id TEXT PRIMARY KEY,
  code TEXT,
  name TEXT,
  short_name TEXT,
  items INTEGER,
  minutes INTEGER,
  category TEXT,
  description TEXT,
  age_range TEXT,
  scoring TEXT
);

CREATE TABLE IF NOT EXISTS test_applications (
  id TEXT PRIMARY KEY,
  workspace_id INTEGER NOT NULL,
  patient_id TEXT,
  patient_name TEXT,
  test_code TEXT,
  test_name TEXT,
  date TEXT,
  score INTEGER,
  interpretation TEXT,
  level TEXT,
  professional TEXT,
  status TEXT,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
  FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS therapy_tasks (
  id TEXT PRIMARY KEY,
  workspace_id INTEGER NOT NULL,
  patient_id TEXT,
  patient_name TEXT,
  title TEXT,
  type TEXT,
  description TEXT,
  assigned_at TEXT,
  due_at TEXT,
  status TEXT,
  adherence INTEGER,
  professional TEXT,
  sessions_remaining INTEGER,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
  FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS documents (
  id TEXT PRIMARY KEY,
  workspace_id INTEGER NOT NULL,
  name TEXT,
  type TEXT,
  patient_id TEXT,
  patient_name TEXT,
  created_at TEXT,
  updated_at TEXT,
  size_kb INTEGER,
  status TEXT,
  professional TEXT,
  signed_at TEXT,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
  FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS invoices (
  id TEXT PRIMARY KEY,
  workspace_id INTEGER NOT NULL,
  patient_id TEXT,
  patient_name TEXT,
  professional TEXT,
  concept TEXT,
  amount INTEGER,
  method TEXT,
  status TEXT,
  date TEXT,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
  FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  workspace_id INTEGER NOT NULL,
  type TEXT,
  title TEXT,
  description TEXT,
  at TEXT,
  read INTEGER DEFAULT 0,
  urgent INTEGER DEFAULT 0,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS settings (
  workspace_id INTEGER NOT NULL,
  key TEXT NOT NULL,
  value TEXT,
  PRIMARY KEY (workspace_id, key),
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS clinical_notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  workspace_id INTEGER NOT NULL,
  patient_id TEXT NOT NULL,
  author_id INTEGER,
  author_name TEXT,
  kind TEXT NOT NULL,
  content TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  signed_at TEXT,
  superseded_by_id INTEGER,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
  FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE,
  FOREIGN KEY (author_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (superseded_by_id) REFERENCES clinical_notes(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_clinical_notes_patient_kind ON clinical_notes(patient_id, kind);
CREATE INDEX IF NOT EXISTS idx_clinical_notes_workspace ON clinical_notes(workspace_id);
`;

/**
 * Aplica migraciones no destructivas sobre tablas existentes.
 * Usa ALTER TABLE ADD COLUMN envuelto en try/catch para ser idempotente:
 * si la columna ya existe, SQLite tira error y lo ignoramos.
 */
function runMigrations() {
  const migrations = [
    // Añadida en tanda del 20 de abril (soft delete de pacientes)
    "ALTER TABLE patients ADD COLUMN archived_at TEXT",
  ];
  for (const sql of migrations) {
    try {
      db.exec(sql);
    } catch (err) {
      // "duplicate column name" es lo esperado cuando la columna ya existe — ignorar.
      if (!/duplicate column name/i.test(String(err?.message))) {
        console.warn("[db] migration skipped:", sql, "-", err.message);
      }
    }
  }
}

export function initDb() {
  const isFresh = !existsSync(DB_PATH) || db.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE type='table'").get().n === 0;
  db.exec(SCHEMA);
  runMigrations();
  if (isFresh || db.prepare("SELECT COUNT(*) AS n FROM workspaces").get().n === 0) {
    seed();
  }
}

function seed() {
  console.log("[db] seeding fresh database…");
  seedPsychTestCatalog();
  const wsIndividual = seedIndividualWorkspace();
  const wsOrg = seedOrganizationWorkspace();
  console.log(`[db] seed done — WS individual=${wsIndividual}, WS organización=${wsOrg}`);
}

// ─── Catálogo de tests (global, compartido entre workspaces) ───────────────
function seedPsychTestCatalog() {
  const ins = db.prepare(`
    INSERT INTO psych_tests (id, code, name, short_name, items, minutes, category, description, age_range, scoring)
    VALUES (@id, @code, @name, @short_name, @items, @minutes, @category, @description, @age_range, @scoring)
  `);
  const rows = [
    { id: "phq9", code: "PHQ-9", name: "Patient Health Questionnaire", short_name: "PHQ-9", items: 9, minutes: 5, category: "Depresión", age_range: "≥ 12 años",
      description: "Tamizaje y medición de la severidad de síntomas depresivos en las últimas 2 semanas.",
      scoring: JSON.stringify([{ range: "0–4", label: "Mínima", level: "none" },{ range: "5–9", label: "Leve", level: "low" },{ range: "10–14", label: "Moderada", level: "moderate" },{ range: "15–19", label: "Moderadamente severa", level: "high" },{ range: "20–27", label: "Severa", level: "critical" }]) },
    { id: "gad7", code: "GAD-7", name: "Generalized Anxiety Disorder", short_name: "GAD-7", items: 7, minutes: 4, category: "Ansiedad", age_range: "≥ 12 años",
      description: "Evalúa la severidad de síntomas de ansiedad generalizada en las últimas 2 semanas.",
      scoring: JSON.stringify([{ range: "0–4", label: "Mínima", level: "none" },{ range: "5–9", label: "Leve", level: "low" },{ range: "10–14", label: "Moderada", level: "moderate" },{ range: "15–21", label: "Severa", level: "high" }]) },
    { id: "bdi2", code: "BDI-II", name: "Beck Depression Inventory", short_name: "BDI-II", items: 21, minutes: 10, category: "Depresión", age_range: "≥ 13 años",
      description: "Inventario de 21 ítems para evaluar la presencia y severidad de síntomas depresivos.",
      scoring: JSON.stringify([{ range: "0–13", label: "Mínima", level: "none" },{ range: "14–19", label: "Leve", level: "low" },{ range: "20–28", label: "Moderada", level: "moderate" },{ range: "29–63", label: "Severa", level: "high" }]) },
    { id: "bai", code: "BAI", name: "Beck Anxiety Inventory", short_name: "Beck Ansiedad", items: 21, minutes: 8, category: "Ansiedad", age_range: "≥ 17 años",
      description: "Mide síntomas somáticos y cognitivos de ansiedad en la última semana.",
      scoring: JSON.stringify([{ range: "0–7", label: "Mínima", level: "none" },{ range: "8–15", label: "Leve", level: "low" },{ range: "16–25", label: "Moderada", level: "moderate" },{ range: "26–63", label: "Severa", level: "high" }]) },
    { id: "rosenberg", code: "RSES", name: "Rosenberg Self-Esteem Scale", short_name: "Rosenberg", items: 10, minutes: 5, category: "Autoestima", age_range: "≥ 14 años",
      description: "Escala unidimensional de 10 ítems para evaluar autoestima global.",
      scoring: JSON.stringify([{ range: "≥ 30", label: "Alta", level: "none" },{ range: "26–29", label: "Media", level: "low" },{ range: "< 26", label: "Baja", level: "moderate" }]) },
    { id: "pcl5", code: "PCL-5", name: "PTSD Checklist DSM-5", short_name: "PCL-5", items: 20, minutes: 10, category: "TEPT", age_range: "≥ 18 años",
      description: "Mide presencia y severidad de síntomas de TEPT según DSM-5.",
      scoring: JSON.stringify([{ range: "0–32", label: "Bajo umbral", level: "low" },{ range: "33–80", label: "Clínicamente significativa", level: "high" }]) },
    { id: "audit", code: "AUDIT", name: "Alcohol Use Disorders Identification Test", short_name: "AUDIT", items: 10, minutes: 5, category: "Adicciones", age_range: "≥ 15 años",
      description: "Identifica consumo de riesgo, perjudicial y dependencia de alcohol.",
      scoring: JSON.stringify([{ range: "0–7", label: "Bajo riesgo", level: "none" },{ range: "8–15", label: "Riesgo", level: "low" },{ range: "16–19", label: "Perjudicial", level: "moderate" },{ range: "≥ 20", label: "Dependencia", level: "high" }]) },
    { id: "eat26", code: "EAT-26", name: "Eating Attitudes Test", short_name: "EAT-26", items: 26, minutes: 8, category: "Alimentación", age_range: "≥ 13 años",
      description: "Tamizaje para actitudes relacionadas con trastornos de la conducta alimentaria.",
      scoring: JSON.stringify([{ range: "< 20", label: "Riesgo bajo", level: "low" },{ range: "≥ 20", label: "Riesgo significativo", level: "high" }]) },
  ];
  for (const r of rows) ins.run(r);
}

// ─── Workspace Individual — Nathaly ────────────────────────────────────────
function seedIndividualWorkspace() {
  const wsId = db.prepare("INSERT INTO workspaces (name, mode) VALUES (?, ?)").run("Consulta Psic. Nathaly Ferrer", "individual").lastInsertRowid;

  // Usuario
  db.prepare("INSERT INTO users (workspace_id, username, password_hash, name, email, role) VALUES (?, ?, ?, ?, ?, ?)")
    .run(wsId, "nathaly", bcrypt.hashSync("nathaly123", 10), "Nathaly Ferrer Pacheco", "nathaly@psicomorfosis.co", "super_admin");

  // Profesional único
  const profId = db.prepare("INSERT INTO professionals (workspace_id, name, title, email, phone, approach, active) VALUES (?, ?, ?, ?, ?, ?, 1)")
    .run(wsId, "Nathaly Ferrer Pacheco", "Psicóloga clínica", "nathaly@psicomorfosis.co", "+57 318 442 0098", "Terapia cognitivo-conductual").lastInsertRowid;

  // Pacientes (5)
  const patients = [
    { id: "P-0101", name: "María Camila Rondón", preferred_name: "Cami", pronouns: "ella", doc: "CC 1.024.587.331", age: 28, phone: "+57 310 482 1290", email: "cami.rondon@correo.co", modality: "individual", status: "activo", reason: "Ansiedad generalizada", last_contact: "Hace 2 días", next_session: "Hoy · 10:30", risk: "low", tags: "TCC" },
    { id: "P-0102", name: "Andrés Felipe Galeano", preferred_name: null, pronouns: "él", doc: "CC 79.554.012", age: 41, phone: "+57 312 998 0021", email: "afgaleano@correo.co", modality: "individual", status: "activo", reason: "Episodio depresivo mayor", last_contact: "Ayer", next_session: "Hoy · 11:30", risk: "high", tags: "psiquiatría" },
    { id: "P-0103", name: "Laura Restrepo Vélez", preferred_name: null, pronouns: "ella", doc: "CC 1.152.337.044", age: 34, phone: "+57 320 441 9928", email: "laura.rv@correo.co", modality: "tele", status: "activo", reason: "Duelo complicado", last_contact: "Hace 3 días", next_session: "Mañana · 09:00", risk: "low", tags: null },
    { id: "P-0104", name: "Valentina Soto Cárdenas", preferred_name: "Val", pronouns: "elle", doc: "TI 1.030.998.221", age: 16, phone: "+57 301 776 8812", email: "vsoto.fam@correo.co", modality: "individual", status: "activo", reason: "Autolesión no suicida · regulación emocional", last_contact: "Hoy", next_session: "Mañana · 11:00", risk: "critical", tags: "DBT,menor" },
    { id: "P-0105", name: "Marta Inés Cifuentes", preferred_name: null, pronouns: "ella", doc: "CC 41.998.220", age: 67, phone: "+57 311 220 7788", email: "marta.cif@correo.co", modality: "tele", status: "alta", reason: "Adaptación a jubilación", last_contact: "Hace 2 meses", next_session: null, risk: "none", tags: null },
  ];
  const pIns = db.prepare(`
    INSERT INTO patients (id, workspace_id, sede_id, professional_id, name, preferred_name, pronouns, doc, age, phone, email, professional, modality, status, reason, last_contact, next_session, risk, tags)
    VALUES (@id, @workspace_id, NULL, @professional_id, @name, @preferred_name, @pronouns, @doc, @age, @phone, @email, @professional, @modality, @status, @reason, @last_contact, @next_session, @risk, @tags)
  `);
  for (const p of patients) pIns.run({ ...p, workspace_id: wsId, professional_id: profId, professional: "Nathaly Ferrer Pacheco" });

  // Citas de hoy
  seedAppointmentsFor(wsId, null, profId, "Nathaly Ferrer Pacheco", "Consultorio principal", patients);

  // Tests, tareas, documentos, facturas, notificaciones para algunos pacientes
  seedClinicalDataFor(wsId, patients, "Nathaly Ferrer Pacheco");

  // Settings
  const sIns = db.prepare("INSERT INTO settings (workspace_id, key, value) VALUES (?, ?, ?)");
  for (const [k, v] of [
    ["phone", "+57 318 442 0098"],
    ["address", "Bogotá · Chapinero"],
    ["session_price_cop", "180000"],
    ["session_duration_min", "50"],
  ]) sIns.run(wsId, k, v);

  return wsId;
}

// ─── Workspace Organización — Mi Clínica ───────────────────────────────────
function seedOrganizationWorkspace() {
  const wsId = db.prepare("INSERT INTO workspaces (name, mode) VALUES (?, ?)").run("Mi Clínica", "organization").lastInsertRowid;

  // Usuario admin
  db.prepare("INSERT INTO users (workspace_id, username, password_hash, name, email, role) VALUES (?, ?, ?, ?, ?, ?)")
    .run(wsId, "admin", bcrypt.hashSync("admin123", 10), "Administración Mi Clínica", "admin@miclinica.co", "super_admin");

  // 2 Sedes
  const chapId = db.prepare("INSERT INTO sedes (workspace_id, name, address, phone) VALUES (?, ?, ?, ?)")
    .run(wsId, "Sede Chapinero", "Cl 72 # 8-24, Bogotá", "+57 1 555 1200").lastInsertRowid;
  const cedId = db.prepare("INSERT INTO sedes (workspace_id, name, address, phone) VALUES (?, ?, ?, ?)")
    .run(wsId, "Sede Cedritos", "Cra 11 # 146-20, Bogotá", "+57 1 555 3400").lastInsertRowid;

  // 4 Profesionales
  const profIns = db.prepare("INSERT INTO professionals (workspace_id, name, title, email, phone, approach) VALUES (?, ?, ?, ?, ?, ?)");
  const nathaly = profIns.run(wsId, "Nathaly Ferrer Pacheco", "Psicóloga clínica", "nathaly@miclinica.co", "+57 318 442 0098", "Terapia cognitivo-conductual").lastInsertRowid;
  const lucia = profIns.run(wsId, "Dra. Lucía Méndez", "Psicóloga clínica", "lucia@miclinica.co", "+57 310 555 1122", "TCC + DBT").lastInsertRowid;
  const mateo = profIns.run(wsId, "Dr. Mateo Rivas", "Psicólogo clínico", "mateo@miclinica.co", "+57 315 558 9901", "Humanista").lastInsertRowid;
  const sofia = profIns.run(wsId, "Mg. Sofía Quintana", "Mg. en psicología", "sofia@miclinica.co", "+57 316 444 0077", "Sistémica / TCA").lastInsertRowid;

  // Relaciones profesional ↔ sede
  const psIns = db.prepare("INSERT INTO professional_sedes (professional_id, sede_id) VALUES (?, ?)");
  psIns.run(nathaly, chapId); psIns.run(nathaly, cedId);  // Nathaly en ambas
  psIns.run(lucia, chapId);                                // Lucía solo Chapinero
  psIns.run(mateo, chapId); psIns.run(mateo, cedId);       // Mateo en ambas
  psIns.run(sofia, cedId);                                 // Sofía solo Cedritos

  // 10 pacientes repartidos
  const patients = [
    { id: "P-1042", name: "María Camila Rondón", preferred_name: "Cami", pronouns: "ella", doc: "CC 1.024.587.331", age: 28, phone: "+57 310 482 1290", email: "cami.rondon@correo.co", modality: "individual", status: "activo", reason: "Ansiedad generalizada", last_contact: "Hace 2 días", next_session: "Hoy · 10:30", risk: "low", tags: "TCC", professional_id: lucia, professional: "Dra. Lucía Méndez", sede_id: chapId },
    { id: "P-1011", name: "Andrés Felipe Galeano", preferred_name: null, pronouns: "él", doc: "CC 79.554.012", age: 41, phone: "+57 312 998 0021", email: "afgaleano@correo.co", modality: "individual", status: "activo", reason: "Episodio depresivo mayor", last_contact: "Ayer", next_session: "Hoy · 11:30", risk: "high", tags: "psiquiatría", professional_id: mateo, professional: "Dr. Mateo Rivas", sede_id: chapId },
    { id: "P-0987", name: "Familia Ortega-Pinilla", preferred_name: null, pronouns: "—", doc: "—", age: 0, phone: "+57 318 220 4410", email: "ortega.fam@correo.co", modality: "familiar", status: "activo", reason: "Dinámica familiar · adolescente", last_contact: "Hace 5 días", next_session: "Hoy · 14:00", risk: "moderate", tags: null, professional_id: sofia, professional: "Mg. Sofía Quintana", sede_id: cedId },
    { id: "P-1098", name: "Valentina Soto Cárdenas", preferred_name: "Val", pronouns: "elle", doc: "TI 1.030.998.221", age: 16, phone: "+57 301 776 8812", email: "vsoto.fam@correo.co", modality: "individual", status: "activo", reason: "Autolesión no suicida · regulación emocional", last_contact: "Hoy", next_session: "Mañana · 09:00", risk: "critical", tags: "DBT,menor", professional_id: lucia, professional: "Dra. Lucía Méndez", sede_id: chapId },
    { id: "P-0876", name: "Jorge & Patricia Lemus", preferred_name: null, pronouns: "—", doc: "—", age: 0, phone: "+57 315 110 4477", email: "jpl.pareja@correo.co", modality: "pareja", status: "activo", reason: "Crisis de pareja · comunicación", last_contact: "Hace 1 semana", next_session: "Hoy · 17:00", risk: "none", tags: null, professional_id: mateo, professional: "Dr. Mateo Rivas", sede_id: cedId },
    { id: "P-1120", name: "Laura Restrepo Vélez", preferred_name: null, pronouns: "ella", doc: "CC 1.152.337.044", age: 34, phone: "+57 320 441 9928", email: "laura.rv@correo.co", modality: "tele", status: "activo", reason: "Duelo complicado", last_contact: "Hace 3 días", next_session: "Hoy · 18:00", risk: "low", tags: null, professional_id: mateo, professional: "Dr. Mateo Rivas", sede_id: null },
    { id: "P-0712", name: "Camilo Esteban Ruiz", preferred_name: null, pronouns: "él", doc: "CC 80.221.554", age: 52, phone: "+57 313 668 1192", email: "ce.ruiz@correo.co", modality: "individual", status: "pausa", reason: "Trastorno bipolar II · seguimiento", last_contact: "Hace 3 semanas", next_session: null, risk: "moderate", tags: "psiquiatría", professional_id: mateo, professional: "Dr. Mateo Rivas", sede_id: chapId },
    { id: "P-0998", name: "Sara Liliana Beltrán", preferred_name: null, pronouns: "ella", doc: "CC 1.014.778.092", age: 24, phone: "+57 319 002 7766", email: "s.beltran@correo.co", modality: "individual", status: "activo", reason: "TCA · anorexia restrictiva", last_contact: "Hace 2 días", next_session: "Mañana · 11:00", risk: "high", tags: "interdisciplinar", professional_id: sofia, professional: "Mg. Sofía Quintana", sede_id: cedId },
    { id: "P-0654", name: "Tomás Aristizábal", preferred_name: null, pronouns: "él", doc: "CC 1.085.221.001", age: 19, phone: "+57 314 998 1212", email: "tomi.a@correo.co", modality: "individual", status: "activo", reason: "Adicción a sustancias · cannabis", last_contact: "Hace 4 días", next_session: "Jueves · 16:00", risk: "moderate", tags: null, professional_id: nathaly, professional: "Nathaly Ferrer Pacheco", sede_id: cedId },
    { id: "P-0532", name: "Marta Inés Cifuentes", preferred_name: null, pronouns: "ella", doc: "CC 41.998.220", age: 67, phone: "+57 311 220 7788", email: "marta.cif@correo.co", modality: "tele", status: "alta", reason: "Adaptación a jubilación", last_contact: "Hace 2 meses", next_session: null, risk: "none", tags: null, professional_id: nathaly, professional: "Nathaly Ferrer Pacheco", sede_id: null },
  ];

  const pIns = db.prepare(`
    INSERT INTO patients (id, workspace_id, sede_id, professional_id, name, preferred_name, pronouns, doc, age, phone, email, professional, modality, status, reason, last_contact, next_session, risk, tags)
    VALUES (@id, @workspace_id, @sede_id, @professional_id, @name, @preferred_name, @pronouns, @doc, @age, @phone, @email, @professional, @modality, @status, @reason, @last_contact, @next_session, @risk, @tags)
  `);
  for (const p of patients) pIns.run({ ...p, workspace_id: wsId });

  // Agenda mezclada
  const today = new Date().toISOString().slice(0, 10);
  const aIns = db.prepare(`
    INSERT INTO appointments (workspace_id, sede_id, professional_id, patient_id, date, time, patient_name, professional, modality, room, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const agenda = [
    [chapId, lucia,   "P-1042", "10:30", "María Camila R.", "Dra. Lucía Méndez",  "individual", "Consultorio 2", "en_curso"],
    [chapId, mateo,   "P-1011", "11:30", "Andrés F. Galeano", "Dr. Mateo Rivas",  "individual", "Consultorio 1", "confirmada"],
    [cedId,  sofia,   "P-0987", "14:00", "Familia Ortega-P.", "Mg. Sofía Quintana", "familiar", "Sala familiar", "confirmada"],
    [cedId,  mateo,   "P-0876", "17:00", "Jorge & Patricia", "Dr. Mateo Rivas",   "pareja",     "Sala pareja",   "pendiente"],
    [null,   mateo,   "P-1120", "18:00", "Laura Restrepo",   "Dr. Mateo Rivas",   "tele",       "Telepsicología","pendiente"],
  ];
  for (const [sede, prof, pat, time, pName, pStr, mod, room, status] of agenda) {
    aIns.run(wsId, sede, prof, pat, today, time, pName, pStr, mod, room, status);
  }

  seedClinicalDataFor(wsId, patients, null);

  // Settings
  const sIns = db.prepare("INSERT INTO settings (workspace_id, key, value) VALUES (?, ?, ?)");
  for (const [k, v] of [
    ["phone", "+57 1 555 1200"],
    ["address", "Bogotá"],
    ["session_price_cop", "180000"],
    ["session_duration_min", "50"],
    ["active_sede_id", String(chapId)],
  ]) sIns.run(wsId, k, v);

  return wsId;
}

// ─── Datos clínicos compartidos (tests, tareas, documentos, facturas) ──────
function seedAppointmentsFor(wsId, sedeId, profId, profName, room, patients) {
  const today = new Date().toISOString().slice(0, 10);
  const ins = db.prepare(`
    INSERT INTO appointments (workspace_id, sede_id, professional_id, patient_id, date, time, patient_name, professional, modality, room, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const slots = [
    ["08:00", patients[0], "atendida"],
    ["10:30", patients[0], "en_curso"],
    ["11:30", patients[1], "confirmada"],
    ["16:00", patients[2], "pendiente"],
  ];
  for (const [time, p, status] of slots) {
    ins.run(wsId, sedeId, profId, p.id, today, time, p.preferred_name ?? p.name, profName, p.modality, p.modality === "tele" ? "Telepsicología" : room, status);
  }
}

function seedClinicalDataFor(wsId, patients, singleProfessional) {
  const tIns = db.prepare(`INSERT INTO test_applications (id, workspace_id, patient_id, patient_name, test_code, test_name, date, score, interpretation, level, professional, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  const kIns = db.prepare(`INSERT INTO therapy_tasks (id, workspace_id, patient_id, patient_name, title, type, description, assigned_at, due_at, status, adherence, professional, sessions_remaining) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  const dIns = db.prepare(`INSERT INTO documents (id, workspace_id, name, type, patient_id, patient_name, created_at, updated_at, size_kb, status, professional, signed_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  const iIns = db.prepare(`INSERT INTO invoices (id, workspace_id, patient_id, patient_name, professional, concept, amount, method, status, date) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  const nIns = db.prepare(`INSERT INTO notifications (id, workspace_id, type, title, description, at, read, urgent) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
  const noteIns = db.prepare(`INSERT INTO clinical_notes (workspace_id, patient_id, author_name, kind, content, created_at, signed_at) VALUES (?, ?, ?, ?, ?, ?, ?)`);

  let counter = 1;
  patients.forEach((p, idx) => {
    const prof = singleProfessional ?? p.professional;

    // 2 tests por paciente activo (excepto alta)
    if (p.status !== "alta") {
      tIns.run(`T-${wsId}-${counter++}`, wsId, p.id, p.name, "GAD-7", "Ansiedad generalizada", "2026-04-02", 11 - idx, "Moderada", idx === 0 ? "low" : idx < 2 ? "moderate" : "high", prof, "completado");
    }

    // 1 tarea por paciente
    kIns.run(`TK-${wsId}-${counter++}`, wsId, p.id, p.name,
      `Tarea terapéutica · ${p.reason.split(" ")[0]}`, "registro_pensamientos",
      "3 registros esta semana + reflexión escrita.",
      "2026-04-09", "2026-04-16", idx % 3 === 0 ? "completada" : "en_progreso", 50 + idx * 8, prof, 1);

    // Consentimiento firmado por paciente
    dIns.run(`D-${wsId}-${counter++}`, wsId,
      `Consentimiento informado · ${p.name}`, "consentimiento",
      p.id, p.name, "2025-11-04", "2025-11-04", 128, "firmado", prof, "2025-11-04");

    // 2 facturas por paciente (una pagada, otra pendiente)
    iIns.run(`F-2026-${String(wsId * 100 + idx * 2).padStart(4, "0")}`, wsId, p.id, p.name, prof, "Sesión individual TCC", 180000, "Tarjeta", "pagada", "2026-04-09");
    if (idx < 3) {
      iIns.run(`F-2026-${String(wsId * 100 + idx * 2 + 1).padStart(4, "0")}`, wsId, p.id, p.name, prof, "Sesión individual TCC", 180000, "PSE", "pendiente", "2026-04-16");
    }

    // Bloques de historia clínica iniciales (firmados)
    const firstDay = "2025-11-04T10:00:00.000Z";
    noteIns.run(wsId, p.id, prof, "motivo", `${p.reason}. Inicio de síntomas hace varios meses con impacto funcional moderado.`, firstDay, firstDay);
    noteIns.run(wsId, p.id, prof, "antecedentes", "Sin antecedentes psiquiátricos previos relevantes. Historia médica sin particularidades. Red de apoyo funcional. Se descarta consumo problemático de sustancias.", firstDay, firstDay);
    noteIns.run(wsId, p.id, prof, "examen_mental", "Paciente alerta, orientado en las tres esferas. Lenguaje fluido. Afecto congruente con contenido. Pensamiento lógico y organizado. Sin ideación auto/heterolesiva. Insight preservado.", firstDay, firstDay);
    noteIns.run(wsId, p.id, prof, "cie11", `Diagnóstico presuntivo según tamizaje inicial. Estado actual: ${p.status}. Revisión con pruebas psicométricas pendiente.`, firstDay, firstDay);
    noteIns.run(wsId, p.id, prof, "plan", `Psicoterapia ${p.modality === "tele" ? "por telepsicología" : "presencial"} con enfoque TCC. Sesiones semanales. Aplicación periódica de PHQ-9/GAD-7. Revisión de plan cada 4 sesiones.`, firstDay, firstDay);

    // Nota SOAP de sesión reciente (firmada)
    const recent = "2026-04-09T15:30:00.000Z";
    const soap = JSON.stringify({
      s: `Paciente reporta mejoría gradual en síntomas de ${p.reason.toLowerCase()}. Refiere adherencia parcial a tareas asignadas.`,
      o: "Afecto modulado. Lenguaje coherente. No ideación de daño. Puntaje GAD-7 en descenso respecto a sesión anterior.",
      a: "Progreso clínicamente significativo frente a objetivos terapéuticos. Se mantiene plan TCC.",
      p: "Asignar registro de pensamientos automáticos. Reforzar técnicas de exposición gradual. Próxima sesión en 7 días.",
    });
    noteIns.run(wsId, p.id, prof, "sesion", soap, recent, recent);
  });

  // Notificaciones básicas
  nIns.run(`N-${wsId}-1`, wsId, "cita", "Próxima cita en 30 min", "Revisa la sala asignada.", "hace 8 min", 0, 0);
  if (patients.some((p) => p.risk === "critical")) {
    nIns.run(`N-${wsId}-2`, wsId, "alerta", "Paciente con riesgo crítico", "Activa protocolo si es necesario.", "hoy", 0, 1);
  }
}
