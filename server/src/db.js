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
  role TEXT NOT NULL DEFAULT 'psicologa', -- 'super_admin' | 'admin' | 'psicologa' | 'paciente'
  professional_id INTEGER,
  patient_id TEXT,                         -- FK a patients.id, solo para role='paciente'
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
  FOREIGN KEY (professional_id) REFERENCES professionals(id) ON DELETE SET NULL,
  FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE
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
  signature_url TEXT,
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
  photo_url TEXT,
  address TEXT,
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
  type TEXT,                          -- 'consentimiento' | 'informe' | 'certificado' | 'remision' | 'evolucion' | 'contrato' | 'otro'
  kind TEXT NOT NULL DEFAULT 'editor', -- 'editor' (in-app) | 'file' (subido)
  patient_id TEXT,
  patient_name TEXT,
  -- Para kind='file' (archivo subido)
  filename TEXT,                      -- nombre en disco: <ws>/<uuid>.<ext>
  original_name TEXT,                 -- nombre original que subió el usuario
  mime TEXT,
  size_bytes INTEGER,
  -- Para kind='editor' (documento creado in-app)
  body_json TEXT,                     -- TipTap doc state (JSON)
  body_text TEXT,                     -- texto plano para búsqueda/preview
  template_id INTEGER,                -- referencia a plantilla origen (nullable)
  -- Estado y firma
  status TEXT,                        -- 'borrador' | 'pendiente_firma' | 'firmado' | 'archivado'
  professional TEXT,
  signed_at TEXT,
  signed_by_user_id INTEGER,
  -- Soft delete
  archived_at TEXT,
  -- Timestamps
  size_kb INTEGER,                    -- legacy, derivable de size_bytes / 1024
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
  FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE SET NULL,
  FOREIGN KEY (signed_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (template_id) REFERENCES document_templates(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_documents_workspace ON documents(workspace_id);
CREATE INDEX IF NOT EXISTS idx_documents_patient ON documents(patient_id);
CREATE INDEX IF NOT EXISTS idx_documents_status ON documents(status);

-- Assets inline del editor (imágenes pegadas en docs). NO van en la lista
-- principal de Documentos para no contaminar; son archivos pequeños referenciados
-- por URL pública desde el body_json. Se asocian a un documento si fue donde se
-- usaron, permitiendo limpieza al borrar el documento.
CREATE TABLE IF NOT EXISTS document_assets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  workspace_id INTEGER NOT NULL,
  document_id TEXT,
  filename TEXT NOT NULL,
  original_name TEXT,
  mime TEXT NOT NULL,
  size_bytes INTEGER,
  uploaded_by_user_id INTEGER,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
  FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE SET NULL,
  FOREIGN KEY (uploaded_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_doc_assets_workspace ON document_assets(workspace_id);

CREATE TABLE IF NOT EXISTS document_templates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  workspace_id INTEGER,               -- NULL = sistema (visible en todos los workspaces)
  name TEXT NOT NULL,
  description TEXT,
  category TEXT,                      -- 'consentimiento' | 'informe' | 'contrato' | 'certificado' | 'otro'
  scope TEXT NOT NULL DEFAULT 'workspace', -- 'system' | 'workspace' | 'personal'
  body_json TEXT NOT NULL,            -- TipTap doc state (JSON)
  body_text TEXT,
  legal_disclaimer TEXT,              -- Aviso de revisión legal cuando aplique
  archived INTEGER DEFAULT 0,
  uses_count INTEGER DEFAULT 0,
  created_by_user_id INTEGER,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_doc_templates_workspace ON document_templates(workspace_id);
CREATE INDEX IF NOT EXISTS idx_doc_templates_category ON document_templates(category);

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

-- Portal del paciente: invitaciones por token (one-time activation)
CREATE TABLE IF NOT EXISTS patient_invites (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  workspace_id INTEGER NOT NULL,
  patient_id TEXT NOT NULL,
  token TEXT UNIQUE NOT NULL,
  expires_at TEXT NOT NULL,
  used_at TEXT,
  created_by_user_id INTEGER,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
  FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_patient_invites_token ON patient_invites(token);
CREATE INDEX IF NOT EXISTS idx_patient_invites_patient ON patient_invites(patient_id);

-- Vista de Tareas (organización interna del equipo)
CREATE TABLE IF NOT EXISTS tareas_folders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  workspace_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  color TEXT NOT NULL,
  position INTEGER DEFAULT 0,
  expanded INTEGER DEFAULT 1,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS tareas_projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  workspace_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  color TEXT NOT NULL,
  description TEXT,
  category TEXT,
  folder_id INTEGER,
  archived INTEGER DEFAULT 0,
  position INTEGER DEFAULT 0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
  FOREIGN KEY (folder_id) REFERENCES tareas_folders(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS tareas_columns (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  workspace_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  color TEXT NOT NULL,
  icon TEXT,
  status TEXT NOT NULL,
  position INTEGER NOT NULL,
  is_default INTEGER DEFAULT 0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS tareas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  workspace_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  type TEXT,
  status TEXT NOT NULL DEFAULT 'TODO',
  priority TEXT NOT NULL DEFAULT 'MEDIUM',
  assignee_id INTEGER,
  creator_id INTEGER NOT NULL,
  project_id INTEGER,
  patient_id TEXT,
  visibility TEXT NOT NULL DEFAULT 'team',
  start_date TEXT,
  due_date TEXT,
  completed_at TEXT,
  archived_at TEXT,
  deleted_at TEXT,
  tracking_preset TEXT,
  total_pomodoros INTEGER DEFAULT 0,
  current_pomodoro_time INTEGER,
  pomodoro_status TEXT,
  recurrence TEXT,
  recurring_template_id INTEGER,
  is_recurring_instance INTEGER DEFAULT 0,
  position INTEGER DEFAULT 0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
  FOREIGN KEY (creator_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (assignee_id) REFERENCES professionals(id) ON DELETE SET NULL,
  FOREIGN KEY (project_id) REFERENCES tareas_projects(id) ON DELETE SET NULL,
  FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_tareas_workspace ON tareas(workspace_id);
CREATE INDEX IF NOT EXISTS idx_tareas_status ON tareas(workspace_id, status);
CREATE INDEX IF NOT EXISTS idx_tareas_assignee ON tareas(assignee_id);
CREATE INDEX IF NOT EXISTS idx_tareas_project ON tareas(project_id);

CREATE TABLE IF NOT EXISTS tareas_comments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id INTEGER NOT NULL,
  workspace_id INTEGER NOT NULL,
  author_id INTEGER NOT NULL,
  text TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (task_id) REFERENCES tareas(id) ON DELETE CASCADE,
  FOREIGN KEY (author_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS tareas_checklist (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id INTEGER NOT NULL,
  text TEXT NOT NULL,
  completed INTEGER DEFAULT 0,
  position INTEGER NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  completed_at TEXT,
  FOREIGN KEY (task_id) REFERENCES tareas(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS tareas_images (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id INTEGER NOT NULL,
  filename TEXT NOT NULL,
  size INTEGER,
  mime TEXT,
  position INTEGER NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (task_id) REFERENCES tareas(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS tareas_pomodoro_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  duration_minutes INTEGER NOT NULL,
  completed INTEGER NOT NULL,
  type TEXT NOT NULL,
  date TEXT NOT NULL,
  FOREIGN KEY (task_id) REFERENCES tareas(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
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
    // Añadida en tanda del 26 de abril (vista de Tareas — vinculo user↔professional para JWT)
    "ALTER TABLE users ADD COLUMN professional_id INTEGER REFERENCES professionals(id) ON DELETE SET NULL",
    // Firma del profesional (canvas dibujado, imagen subida o tipográfica)
    "ALTER TABLE professionals ADD COLUMN signature_url TEXT",
    // Añadidas en tanda del 26 de abril noche (módulo Documentos — gestión de contenido)
    "ALTER TABLE documents ADD COLUMN kind TEXT NOT NULL DEFAULT 'file'",
    "ALTER TABLE documents ADD COLUMN filename TEXT",
    "ALTER TABLE documents ADD COLUMN original_name TEXT",
    "ALTER TABLE documents ADD COLUMN mime TEXT",
    "ALTER TABLE documents ADD COLUMN size_bytes INTEGER",
    "ALTER TABLE documents ADD COLUMN body_json TEXT",
    "ALTER TABLE documents ADD COLUMN body_text TEXT",
    "ALTER TABLE documents ADD COLUMN template_id INTEGER",
    "ALTER TABLE documents ADD COLUMN signed_by_user_id INTEGER",
    "ALTER TABLE documents ADD COLUMN archived_at TEXT",
    // Portal del paciente (26 abril noche)
    "ALTER TABLE users ADD COLUMN patient_id TEXT REFERENCES patients(id) ON DELETE CASCADE",
    "ALTER TABLE patients ADD COLUMN photo_url TEXT",
    "ALTER TABLE patients ADD COLUMN address TEXT",
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
  } else {
    backfillExisting();
  }
}

/**
 * Backfills idempotentes para BDs existentes (producción).
 * Se ejecuta en cada arranque cuando NO es un seed fresh.
 *  - Siembra columnas default de tareas para workspaces que no las tengan.
 *  - Vincula users.professional_id por match de nombre cuando esté null.
 *  - Actualiza la info de la psic. Nathaly Ferrer en su workspace individual.
 */
function backfillExisting() {
  // 1. Columnas de tareas faltantes
  const wsRows = db.prepare("SELECT id FROM workspaces").all();
  const colCount = db.prepare("SELECT COUNT(*) AS n FROM tareas_columns WHERE workspace_id = ?");
  for (const ws of wsRows) {
    if (colCount.get(ws.id).n === 0) {
      seedTaskColumns(ws.id);
      console.log(`[db] backfill: seeded tareas_columns para workspace ${ws.id}`);
    }
  }

  // 1b. Plantillas de documentos del sistema (compartidas, workspace_id IS NULL)
  try {
    const tCount = db.prepare("SELECT COUNT(*) AS n FROM document_templates WHERE workspace_id IS NULL").get().n;
    if (tCount === 0) {
      seedSystemDocumentTemplates();
    }
  } catch (err) {
    console.warn("[db] backfill seed templates falló:", err.message);
  }

  // 2. Vincular users.professional_id si está vacío y hay match exacto por nombre
  try {
    const r = db.prepare(`
      UPDATE users SET professional_id = (
        SELECT p.id FROM professionals p
        WHERE p.workspace_id = users.workspace_id AND p.name = users.name
        LIMIT 1
      )
      WHERE professional_id IS NULL
    `).run();
    if (r.changes > 0) console.log(`[db] backfill: vinculé professional_id en ${r.changes} usuarios`);
  } catch (err) {
    console.warn("[db] backfill professional_id falló:", err.message);
  }

  // 3. Limpiar strings vencidos de next_session/last_contact en pacientes.
  // Estos campos ahora se DERIVAN de la tabla appointments en el endpoint;
  // los strings literales del seed ("Hoy · 10:30", "Hace 2 días") quedan vencidos
  // y confunden al usuario. Los matamos para que la fuente de verdad sea appointments.
  try {
    const r = db.prepare(`
      UPDATE patients SET next_session = NULL, last_contact = NULL
      WHERE next_session IS NOT NULL OR last_contact IS NOT NULL
    `).run();
    if (r.changes > 0) console.log(`[db] backfill: limpiados strings de next_session/last_contact en ${r.changes} pacientes`);
  } catch (err) {
    console.warn("[db] backfill clean session strings falló:", err.message);
  }

  // 4. Desfirmar los bloques de historia clínica sembrados de oficio.
  // El seed inicial los marcaba como firmados sin acción del profesional, lo cual viola
  // el espíritu de la Res. 1995/1999. Si signed_at == created_at en notas tipo "bloque"
  // creadas el día del seed (2025-11-04), las pasamos a borrador. Un sign() humano deja
  // signed_at != created_at, así que esto no afecta firmas reales.
  try {
    const r = db.prepare(`
      UPDATE clinical_notes SET signed_at = NULL
      WHERE signed_at IS NOT NULL
        AND signed_at = created_at
        AND created_at = '2025-11-04T10:00:00.000Z'
        AND kind IN ('motivo', 'antecedentes', 'examen_mental', 'cie11', 'plan')
    `).run();
    if (r.changes > 0) console.log(`[db] backfill: desfirmé ${r.changes} bloques de historia (sembrados de oficio)`);
  } catch (err) {
    console.warn("[db] backfill desfirmar bloques falló:", err.message);
  }

  // 5. Info de Nathaly (workspace individual): actualizar solo si los valores actuales son los antiguos
  try {
    const ind = db.prepare("SELECT id FROM workspaces WHERE mode = 'individual' LIMIT 1").get();
    if (ind) {
      // professionals.phone
      db.prepare(`UPDATE professionals SET phone = '+57 304 219 0650'
                  WHERE workspace_id = ? AND name = 'Nathaly Ferrer Pacheco' AND phone = '+57 318 442 0098'`)
        .run(ind.id);
      // settings (upsert ligero)
      const upsert = db.prepare(`
        INSERT INTO settings (workspace_id, key, value) VALUES (?, ?, ?)
        ON CONFLICT(workspace_id, key) DO UPDATE SET value = excluded.value
      `);
      // Solo actualizar si está con el valor antiguo, o crear si no existe
      const phone = db.prepare("SELECT value FROM settings WHERE workspace_id = ? AND key = 'phone'").get(ind.id);
      if (!phone || phone.value === "+57 318 442 0098") upsert.run(ind.id, "phone", "+57 304 219 0650");
      const addr = db.prepare("SELECT value FROM settings WHERE workspace_id = ? AND key = 'address'").get(ind.id);
      if (!addr || addr.value === "Bogotá · Chapinero") upsert.run(ind.id, "address", "Cartagena de Indias · Torices");
      const office = db.prepare("SELECT 1 FROM settings WHERE workspace_id = ? AND key = 'consultorio_name'").get(ind.id);
      if (!office) upsert.run(ind.id, "consultorio_name", "Consultorio en Torices");
      const city = db.prepare("SELECT 1 FROM settings WHERE workspace_id = ? AND key = 'city'").get(ind.id);
      if (!city) upsert.run(ind.id, "city", "Cartagena");
    }
  } catch (err) {
    console.warn("[db] backfill info Nathaly falló:", err.message);
  }
}

function seed() {
  console.log("[db] seeding fresh database…");
  seedPsychTestCatalog();
  seedSystemDocumentTemplates();
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
    .run(wsId, "Nathaly Ferrer Pacheco", "Psicóloga clínica", "nathaly@psicomorfosis.co", "+57 304 219 0650", "Terapia cognitivo-conductual").lastInsertRowid;

  // Vincular el usuario al profesional para que el JWT lleve professional_id
  db.prepare("UPDATE users SET professional_id = ? WHERE workspace_id = ? AND username = ?").run(profId, wsId, "nathaly");

  // Columnas default del kanban de tareas
  seedTaskColumns(wsId);

  // Pacientes (5)
  const patients = [
    // last_contact y next_session se DERIVAN de la tabla appointments al consultar.
    // No se siembran aquí para evitar strings vencidos cuando la BD no es fresca.
    { id: "P-0101", name: "María Camila Rondón", preferred_name: "Cami", pronouns: "ella", doc: "CC 1.024.587.331", age: 28, phone: "+57 310 482 1290", email: "cami.rondon@correo.co", modality: "individual", status: "activo", reason: "Ansiedad generalizada", last_contact: null, next_session: null, risk: "low", tags: "TCC" },
    { id: "P-0102", name: "Andrés Felipe Galeano", preferred_name: null, pronouns: "él", doc: "CC 79.554.012", age: 41, phone: "+57 312 998 0021", email: "afgaleano@correo.co", modality: "individual", status: "activo", reason: "Episodio depresivo mayor", last_contact: null, next_session: null, risk: "high", tags: "psiquiatría" },
    { id: "P-0103", name: "Laura Restrepo Vélez", preferred_name: null, pronouns: "ella", doc: "CC 1.152.337.044", age: 34, phone: "+57 320 441 9928", email: "laura.rv@correo.co", modality: "tele", status: "activo", reason: "Duelo complicado", last_contact: null, next_session: null, risk: "low", tags: null },
    { id: "P-0104", name: "Valentina Soto Cárdenas", preferred_name: "Val", pronouns: "elle", doc: "TI 1.030.998.221", age: 16, phone: "+57 301 776 8812", email: "vsoto.fam@correo.co", modality: "individual", status: "activo", reason: "Autolesión no suicida · regulación emocional", last_contact: null, next_session: null, risk: "critical", tags: "DBT,menor" },
    { id: "P-0105", name: "Marta Inés Cifuentes", preferred_name: null, pronouns: "ella", doc: "CC 41.998.220", age: 67, phone: "+57 311 220 7788", email: "marta.cif@correo.co", modality: "tele", status: "alta", reason: "Adaptación a jubilación", last_contact: null, next_session: null, risk: "none", tags: null },
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
    ["phone", "+57 304 219 0650"],
    ["address", "Cartagena de Indias · Torices"],
    ["consultorio_name", "Consultorio en Torices"],
    ["city", "Cartagena"],
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

  // Columnas default del kanban de tareas
  seedTaskColumns(wsId);

  // 10 pacientes repartidos
  const patients = [
    { id: "P-1042", name: "María Camila Rondón", preferred_name: "Cami", pronouns: "ella", doc: "CC 1.024.587.331", age: 28, phone: "+57 310 482 1290", email: "cami.rondon@correo.co", modality: "individual", status: "activo", reason: "Ansiedad generalizada", last_contact: null, next_session: null, risk: "low", tags: "TCC", professional_id: lucia, professional: "Dra. Lucía Méndez", sede_id: chapId },
    { id: "P-1011", name: "Andrés Felipe Galeano", preferred_name: null, pronouns: "él", doc: "CC 79.554.012", age: 41, phone: "+57 312 998 0021", email: "afgaleano@correo.co", modality: "individual", status: "activo", reason: "Episodio depresivo mayor", last_contact: null, next_session: null, risk: "high", tags: "psiquiatría", professional_id: mateo, professional: "Dr. Mateo Rivas", sede_id: chapId },
    { id: "P-0987", name: "Familia Ortega-Pinilla", preferred_name: null, pronouns: "—", doc: "—", age: 0, phone: "+57 318 220 4410", email: "ortega.fam@correo.co", modality: "familiar", status: "activo", reason: "Dinámica familiar · adolescente", last_contact: null, next_session: null, risk: "moderate", tags: null, professional_id: sofia, professional: "Mg. Sofía Quintana", sede_id: cedId },
    { id: "P-1098", name: "Valentina Soto Cárdenas", preferred_name: "Val", pronouns: "elle", doc: "TI 1.030.998.221", age: 16, phone: "+57 301 776 8812", email: "vsoto.fam@correo.co", modality: "individual", status: "activo", reason: "Autolesión no suicida · regulación emocional", last_contact: null, next_session: null, risk: "critical", tags: "DBT,menor", professional_id: lucia, professional: "Dra. Lucía Méndez", sede_id: chapId },
    { id: "P-0876", name: "Jorge & Patricia Lemus", preferred_name: null, pronouns: "—", doc: "—", age: 0, phone: "+57 315 110 4477", email: "jpl.pareja@correo.co", modality: "pareja", status: "activo", reason: "Crisis de pareja · comunicación", last_contact: null, next_session: null, risk: "none", tags: null, professional_id: mateo, professional: "Dr. Mateo Rivas", sede_id: cedId },
    { id: "P-1120", name: "Laura Restrepo Vélez", preferred_name: null, pronouns: "ella", doc: "CC 1.152.337.044", age: 34, phone: "+57 320 441 9928", email: "laura.rv@correo.co", modality: "tele", status: "activo", reason: "Duelo complicado", last_contact: null, next_session: null, risk: "low", tags: null, professional_id: mateo, professional: "Dr. Mateo Rivas", sede_id: null },
    { id: "P-0712", name: "Camilo Esteban Ruiz", preferred_name: null, pronouns: "él", doc: "CC 80.221.554", age: 52, phone: "+57 313 668 1192", email: "ce.ruiz@correo.co", modality: "individual", status: "pausa", reason: "Trastorno bipolar II · seguimiento", last_contact: null, next_session: null, risk: "moderate", tags: "psiquiatría", professional_id: mateo, professional: "Dr. Mateo Rivas", sede_id: chapId },
    { id: "P-0998", name: "Sara Liliana Beltrán", preferred_name: null, pronouns: "ella", doc: "CC 1.014.778.092", age: 24, phone: "+57 319 002 7766", email: "s.beltran@correo.co", modality: "individual", status: "activo", reason: "TCA · anorexia restrictiva", last_contact: null, next_session: null, risk: "high", tags: "interdisciplinar", professional_id: sofia, professional: "Mg. Sofía Quintana", sede_id: cedId },
    { id: "P-0654", name: "Tomás Aristizábal", preferred_name: null, pronouns: "él", doc: "CC 1.085.221.001", age: 19, phone: "+57 314 998 1212", email: "tomi.a@correo.co", modality: "individual", status: "activo", reason: "Adicción a sustancias · cannabis", last_contact: null, next_session: null, risk: "moderate", tags: null, professional_id: nathaly, professional: "Nathaly Ferrer Pacheco", sede_id: cedId },
    { id: "P-0532", name: "Marta Inés Cifuentes", preferred_name: null, pronouns: "ella", doc: "CC 41.998.220", age: 67, phone: "+57 311 220 7788", email: "marta.cif@correo.co", modality: "tele", status: "alta", reason: "Adaptación a jubilación", last_contact: null, next_session: null, risk: "none", tags: null, professional_id: nathaly, professional: "Nathaly Ferrer Pacheco", sede_id: null },
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

    // Bloques de historia clínica iniciales (BORRADORES — el profesional debe revisarlos y firmarlos
    // antes de que queden como historia oficial. La Resolución 1995/1999 exige que la firma sea
    // un acto consciente del profesional, no del seed automático).
    const firstDay = "2025-11-04T10:00:00.000Z";
    noteIns.run(wsId, p.id, prof, "motivo", `${p.reason}. Inicio de síntomas hace varios meses con impacto funcional moderado.`, firstDay, null);
    noteIns.run(wsId, p.id, prof, "antecedentes", "Sin antecedentes psiquiátricos previos relevantes. Historia médica sin particularidades. Red de apoyo funcional. Se descarta consumo problemático de sustancias.", firstDay, null);
    noteIns.run(wsId, p.id, prof, "examen_mental", "Paciente alerta, orientado en las tres esferas. Lenguaje fluido. Afecto congruente con contenido. Pensamiento lógico y organizado. Sin ideación auto/heterolesiva. Insight preservado.", firstDay, null);
    noteIns.run(wsId, p.id, prof, "cie11", `Diagnóstico presuntivo según tamizaje inicial. Estado actual: ${p.status}. Revisión con pruebas psicométricas pendiente.`, firstDay, null);
    noteIns.run(wsId, p.id, prof, "plan", `Psicoterapia ${p.modality === "tele" ? "por telepsicología" : "presencial"} con enfoque TCC. Sesiones semanales. Aplicación periódica de PHQ-9/GAD-7. Revisión de plan cada 4 sesiones.`, firstDay, null);

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

// ─── Plantillas de documentos del sistema (visibles en todos los workspaces) ─
// Formato body_json: TipTap doc state {type:"doc", content:[...]}.
// Variables soportadas en interpolación: {{paciente.nombre}}, {{paciente.documento}},
// {{paciente.edad}}, {{profesional.nombre}}, {{profesional.tarjeta_profesional}},
// {{clinica.razon_social}}, {{clinica.direccion}}, {{clinica.telefono}},
// {{fecha.hoy}}, {{fecha.larga}}, {{sesion.fecha}}.
function seedSystemDocumentTemplates() {
  // Helper para construir bloques TipTap de forma legible
  const h1 = (text) => ({ type: "heading", attrs: { level: 1 }, content: [{ type: "text", text }] });
  const h2 = (text) => ({ type: "heading", attrs: { level: 2 }, content: [{ type: "text", text }] });
  const p = (text) => ({ type: "paragraph", content: text ? [{ type: "text", text }] : [] });
  const ul = (items) => ({ type: "bulletList", content: items.map((t) => ({ type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: t }] }] })) });
  const hr = () => ({ type: "horizontalRule" });

  const DISCLAIMER = "⚠️ Este documento es un borrador de referencia generado por Psicomorfosis. Antes de usarlo con pacientes reales, hágalo revisar por su asesoría legal y ajústelo a su contexto particular.";

  const templates = [
    {
      name: "Consentimiento informado de psicoterapia",
      description: "Consentimiento general según Ley 1090/2006 y código deontológico del psicólogo en Colombia.",
      category: "consentimiento",
      legal_disclaimer: DISCLAIMER,
      body: {
        type: "doc",
        content: [
          h1("Consentimiento informado de psicoterapia"),
          p("Yo, {{paciente.nombre}}, identificado(a) con {{paciente.documento}}, mayor de edad, declaro de manera libre, voluntaria y consciente que he sido informado(a) por {{profesional.nombre}} (Tarjeta profesional {{profesional.tarjeta_profesional}}) sobre el proceso psicoterapéutico que iniciaré en {{clinica.razon_social}}."),
          h2("Naturaleza del servicio"),
          p("La psicoterapia es un proceso en el que profesional y consultante trabajan colaborativamente para identificar, comprender y abordar dificultades emocionales, conductuales o relacionales. Las sesiones tienen una duración aproximada de 50 minutos y la frecuencia se acuerda según necesidad clínica."),
          h2("Objetivos y método"),
          p("El profesional emplea un enfoque psicológico ajustado a las necesidades del consultante. Los objetivos se definirán de forma conjunta y se revisarán periódicamente. La participación activa del consultante es indispensable para el avance del proceso."),
          h2("Confidencialidad y excepciones"),
          p("La información compartida en sesión es estrictamente confidencial conforme a la Ley 1090 de 2006 y el secreto profesional. Las excepciones contempladas por la ley son: (i) riesgo grave para la vida o integridad propia o de terceros, (ii) requerimiento judicial competente y (iii) maltrato a menores o personas en condición de vulnerabilidad."),
          h2("Tratamiento de datos personales"),
          p("Autorizo el tratamiento de mis datos personales y de mi historia clínica conforme a la Ley 1581 de 2012 y la Resolución 1995 de 1999. La información se conservará por un periodo mínimo de veinte (20) años contados desde la última atención."),
          h2("Honorarios y política de cancelación"),
          p("El valor de cada sesión y la política de cancelación con antelación serán informados antes del inicio del proceso."),
          h2("Derecho a interrumpir el proceso"),
          p("Tengo derecho a finalizar el proceso terapéutico en cualquier momento, idealmente con una sesión de cierre. El profesional puede igualmente proponer derivación si lo considera más adecuado para mis necesidades."),
          hr(),
          p("Lugar y fecha: {{clinica.direccion}}, {{fecha.larga}}."),
          p(""),
          p("Firma del consultante: ____________________________"),
          p(""),
          p("Firma del profesional: ____________________________"),
          p("{{profesional.nombre}} — TP {{profesional.tarjeta_profesional}}"),
        ],
      },
    },
    {
      name: "Consentimiento informado de telepsicología",
      description: "Consentimiento específico para servicios virtuales según Resolución 2654 de 2019.",
      category: "consentimiento",
      legal_disclaimer: DISCLAIMER,
      body: {
        type: "doc",
        content: [
          h1("Consentimiento informado de telepsicología"),
          p("De acuerdo con la Resolución 2654 de 2019 del Ministerio de Salud y Protección Social, que regula la telesalud y los servicios de telemedicina en Colombia, yo {{paciente.nombre}}, identificado(a) con {{paciente.documento}}, autorizo expresamente recibir atención psicológica modalidad telepsicología por parte de {{profesional.nombre}}."),
          h2("Naturaleza de la modalidad virtual"),
          p("La telepsicología es una modalidad válida de atención que utiliza tecnologías de la información y comunicación. Se realiza por videollamada en plataformas que cumplen estándares de privacidad y seguridad."),
          h2("Limitaciones y condiciones técnicas"),
          ul([
            "Es responsabilidad del consultante disponer de un espacio privado, libre de interrupciones y con conexión estable.",
            "En caso de fallas técnicas durante la sesión, se intentará reconexión hasta tres veces; de persistir el problema, se reprogramará sin costo adicional.",
            "Algunos cuadros clínicos pueden requerir atención presencial; el profesional indicará si la modalidad virtual no es adecuada para mi caso.",
          ]),
          h2("Confidencialidad ampliada"),
          p("Tomo conocimiento de los riesgos asociados a la transmisión de datos por internet. El profesional se compromete a usar herramientas con cifrado de extremo a extremo en la medida de lo posible. Me comprometo a no grabar las sesiones sin autorización escrita."),
          h2("Protocolo en caso de crisis"),
          p("En caso de emergencia psicológica durante una sesión virtual, autorizo al profesional a contactar a las personas o servicios indicados a continuación, así como a las líneas oficiales (Línea 106 Bogotá, 123 emergencias, 192 MinSalud)."),
          p("Contacto de emergencia: ____________________________________________"),
          hr(),
          p("Firma del consultante: ____________________________  Fecha: {{fecha.hoy}}"),
          p("Firma del profesional: ____________________________"),
          p("{{profesional.nombre}} — TP {{profesional.tarjeta_profesional}}"),
        ],
      },
    },
    {
      name: "Autorización de tratamiento de datos personales (Habeas Data)",
      description: "Autorización conforme a la Ley 1581 de 2012 y Decreto 1377 de 2013.",
      category: "consentimiento",
      legal_disclaimer: DISCLAIMER,
      body: {
        type: "doc",
        content: [
          h1("Autorización para el tratamiento de datos personales"),
          p("En cumplimiento de la Ley 1581 de 2012, el Decreto 1377 de 2013 y demás normas concordantes, yo {{paciente.nombre}}, identificado(a) con {{paciente.documento}}, autorizo de manera libre, expresa, informada e inequívoca a {{clinica.razon_social}} para recolectar, almacenar, usar, circular y suprimir mis datos personales para los siguientes fines:"),
          ul([
            "Prestación del servicio de atención psicológica y conformación de mi historia clínica.",
            "Facturación, cobro de servicios y reportes ante entidades de control cuando corresponda.",
            "Envío de recordatorios de citas, materiales psicoeducativos y comunicaciones del proceso terapéutico.",
            "Cumplimiento de obligaciones legales y regulatorias del sector salud.",
          ]),
          h2("Datos sensibles"),
          p("Acepto que parte de la información que entrego es de naturaleza sensible (salud, creencias, hábitos, contenido de sesiones) y autorizo su tratamiento bajo medidas reforzadas de seguridad y confidencialidad."),
          h2("Derechos del titular"),
          p("Conozco mis derechos a conocer, actualizar, rectificar, suprimir mis datos y a revocar esta autorización en cualquier momento, comunicándome al correo o teléfono dispuestos por {{clinica.razon_social}}."),
          hr(),
          p("Firma del titular: ____________________________  Fecha: {{fecha.hoy}}"),
        ],
      },
    },
    {
      name: "Consentimiento de menor de edad (firma del cuidador)",
      description: "Para pacientes menores de 18 años, firmado por padre, madre o representante legal.",
      category: "consentimiento",
      legal_disclaimer: DISCLAIMER,
      body: {
        type: "doc",
        content: [
          h1("Consentimiento informado · paciente menor de edad"),
          p("Yo, ____________________________________, identificado(a) con C.C. ____________________, en calidad de ☐ padre  ☐ madre  ☐ representante legal del/la menor {{paciente.nombre}} (documento {{paciente.documento}}, edad {{paciente.edad}} años), autorizo el inicio del proceso de atención psicológica con {{profesional.nombre}} en {{clinica.razon_social}}."),
          h2("Asentimiento del/la menor"),
          p("Hemos explicado al/la menor, en lenguaje adecuado a su edad, el propósito y el carácter de las sesiones. El/la menor manifiesta su asentimiento voluntario para participar."),
          h2("Confidencialidad y comunicación con el cuidador"),
          p("Las sesiones individuales del/la menor son confidenciales. El profesional informará al cuidador sobre temas que pongan en riesgo la integridad del/la menor o de terceros, así como sobre el progreso global del proceso, respetando la intimidad de los contenidos clínicos detallados."),
          h2("Compromiso del cuidador"),
          ul([
            "Garantizar la asistencia del/la menor a las sesiones programadas.",
            "Participar en las sesiones de orientación familiar cuando el profesional lo indique.",
            "Cumplir con los honorarios y políticas de cancelación.",
          ]),
          hr(),
          p("Firma del cuidador: ____________________________  Fecha: {{fecha.hoy}}"),
          p("Asentimiento del/la menor: ____________________________"),
          p("Firma del profesional: ____________________________"),
        ],
      },
    },
    {
      name: "Contrato terapéutico",
      description: "Acuerdo de marco terapéutico, frecuencia, honorarios y política de cancelación.",
      category: "contrato",
      legal_disclaimer: DISCLAIMER,
      body: {
        type: "doc",
        content: [
          h1("Contrato terapéutico"),
          p("Entre {{profesional.nombre}}, identificado(a) con T.P. {{profesional.tarjeta_profesional}} (en adelante 'el profesional'), y {{paciente.nombre}}, identificado(a) con {{paciente.documento}} (en adelante 'el consultante'), se establece el siguiente acuerdo de trabajo terapéutico:"),
          h2("1. Objetivo"),
          p("Iniciar un proceso psicoterapéutico orientado a abordar las dificultades expresadas por el consultante en la consulta inicial. Los objetivos específicos se definirán y revisarán de manera conjunta."),
          h2("2. Frecuencia y duración"),
          p("Las sesiones tendrán una duración de 50 minutos y se realizarán con frecuencia semanal, salvo acuerdo distinto. La duración total del proceso se estima entre 12 y 24 sesiones, sujeto a evolución clínica."),
          h2("3. Honorarios"),
          p("El valor por sesión es de $____________ COP. El pago se realiza el día de la sesión por los medios autorizados por {{clinica.razon_social}}."),
          h2("4. Política de cancelación"),
          p("Las cancelaciones con menos de 24 horas de anticipación generan el cobro del 50% del valor de la sesión. La inasistencia sin aviso genera el cobro del 100%."),
          h2("5. Confidencialidad"),
          p("Aplican los términos del Consentimiento informado y la Ley 1090 de 2006."),
          h2("6. Vigencia y revisión"),
          p("Este contrato se revisará cada 12 sesiones. Cualquiera de las partes puede solicitar su modificación o terminación con preaviso razonable."),
          hr(),
          p("Firma del consultante: ____________________________"),
          p("Firma del profesional: ____________________________  Fecha: {{fecha.hoy}}"),
        ],
      },
    },
    {
      name: "Certificado de asistencia psicológica",
      description: "Constancia para terceros (empresa, EPS, institución educativa).",
      category: "certificado",
      legal_disclaimer: null,
      body: {
        type: "doc",
        content: [
          h1("Certificado de asistencia"),
          p(""),
          p("La suscrita {{profesional.nombre}}, psicóloga(o) con tarjeta profesional {{profesional.tarjeta_profesional}}, en ejercicio de sus funciones en {{clinica.razon_social}},"),
          h2("CERTIFICA QUE"),
          p("{{paciente.nombre}}, identificado(a) con {{paciente.documento}}, asiste a proceso de atención psicológica en esta institución desde la fecha indicada en su historia clínica y se encuentra en seguimiento profesional."),
          p("Esta certificación se expide a solicitud del interesado(a) para los fines que estime pertinentes, sin que pueda extenderse a información clínica detallada que se encuentra protegida por el secreto profesional."),
          hr(),
          p("Dado en {{clinica.direccion}}, a los {{fecha.larga}}."),
          p(""),
          p("____________________________"),
          p("{{profesional.nombre}}"),
          p("T.P. {{profesional.tarjeta_profesional}}"),
        ],
      },
    },
    {
      name: "Remisión a psiquiatría",
      description: "Carta de remisión a profesional médico psiquiatra.",
      category: "remision",
      legal_disclaimer: null,
      body: {
        type: "doc",
        content: [
          h1("Remisión a psiquiatría"),
          p("Fecha: {{fecha.larga}}"),
          p(""),
          p("Estimado(a) colega:"),
          p("Por medio de la presente remito a su consulta a {{paciente.nombre}}, identificado(a) con {{paciente.documento}}, edad {{paciente.edad}} años, paciente que se encuentra en proceso psicoterapéutico bajo mi atención."),
          h2("Motivo de remisión"),
          p("[Describir cuadro clínico, hallazgos relevantes, riesgo, sintomatología que justifica valoración psiquiátrica.]"),
          h2("Antecedentes clínicos relevantes"),
          ul([
            "[Antecedentes médicos / psiquiátricos]",
            "[Medicación actual si existe]",
            "[Resultados de pruebas psicométricas relevantes]",
          ]),
          h2("Plan terapéutico actual"),
          p("[Enfoque, frecuencia, objetivos en curso.]"),
          h2("Información solicitada"),
          p("Agradezco su valoración para descartar / confirmar diagnóstico clínico, evaluar pertinencia de tratamiento farmacológico y aportar pautas de manejo conjunto. Quedo atenta(o) para articular el plan integral."),
          hr(),
          p("Cordialmente,"),
          p("{{profesional.nombre}} — TP {{profesional.tarjeta_profesional}}"),
          p("{{clinica.razon_social}} — {{clinica.telefono}}"),
        ],
      },
    },
    {
      name: "Informe psicológico",
      description: "Plantilla estructurada para informes a EPS, juzgados o instituciones.",
      category: "informe",
      legal_disclaimer: null,
      body: {
        type: "doc",
        content: [
          h1("Informe psicológico"),
          p("Profesional: {{profesional.nombre}} — TP {{profesional.tarjeta_profesional}}"),
          p("Institución: {{clinica.razon_social}}"),
          p("Fecha de emisión: {{fecha.larga}}"),
          hr(),
          h2("1. Identificación del consultante"),
          ul([
            "Nombre: {{paciente.nombre}}",
            "Identificación: {{paciente.documento}}",
            "Edad: {{paciente.edad}} años",
          ]),
          h2("2. Motivo de consulta"),
          p("[Descripción del motivo y antecedentes inmediatos.]"),
          h2("3. Antecedentes relevantes"),
          ul([
            "Personales:",
            "Familiares:",
            "Médicos / psiquiátricos:",
            "Académicos / laborales:",
          ]),
          h2("4. Examen mental"),
          p("[Apariencia, conducta, lenguaje, afecto, pensamiento, percepción, juicio, insight.]"),
          h2("5. Pruebas aplicadas"),
          p("[Listar instrumentos psicométricos con puntajes e interpretación.]"),
          h2("6. Análisis e impresión clínica"),
          p("[Integración de hallazgos. Diagnóstico presuntivo CIE-11 si corresponde.]"),
          h2("7. Plan de intervención y recomendaciones"),
          p("[Enfoque, frecuencia, objetivos, derivaciones, recomendaciones para la red de apoyo.]"),
          hr(),
          p("____________________________"),
          p("{{profesional.nombre}} — TP {{profesional.tarjeta_profesional}}"),
        ],
      },
    },
    {
      name: "Alta terapéutica",
      description: "Cierre formal del proceso con resumen de logros y recomendaciones.",
      category: "informe",
      legal_disclaimer: null,
      body: {
        type: "doc",
        content: [
          h1("Alta terapéutica"),
          p("Profesional: {{profesional.nombre}} — TP {{profesional.tarjeta_profesional}}"),
          p("Consultante: {{paciente.nombre}} ({{paciente.documento}}) — {{paciente.edad}} años"),
          p("Fecha de alta: {{fecha.larga}}"),
          hr(),
          h2("Motivo de consulta inicial"),
          p("[Resumen breve.]"),
          h2("Trabajo terapéutico realizado"),
          p("[Número de sesiones, enfoque, herramientas trabajadas.]"),
          h2("Logros alcanzados"),
          ul([
            "[Logro 1]",
            "[Logro 2]",
            "[Logro 3]",
          ]),
          h2("Recomendaciones de continuidad"),
          p("[Mantenimiento, autocuidado, señales para retomar acompañamiento.]"),
          h2("Disponibilidad para seguimiento"),
          p("Se entrega alta con apertura para sesiones de seguimiento o retorno al proceso si el consultante lo requiere en el futuro."),
          hr(),
          p("Firma del consultante: ____________________________"),
          p("Firma del profesional: ____________________________"),
        ],
      },
    },
  ];

  const ins = db.prepare(`
    INSERT INTO document_templates (workspace_id, name, description, category, scope, body_json, body_text, legal_disclaimer, created_at, updated_at)
    VALUES (NULL, ?, ?, ?, 'system', ?, ?, ?, datetime('now'), datetime('now'))
  `);
  for (const t of templates) {
    const text = extractTextFromTipTap(t.body);
    ins.run(t.name, t.description, t.category, JSON.stringify(t.body), text, t.legal_disclaimer ?? null);
  }
  console.log(`[db] seeded ${templates.length} system document templates`);
}

/**
 * Extrae el texto plano de un doc TipTap recursivamente.
 * Útil para body_text (búsqueda full-text futura) y previews cortos.
 */
function extractTextFromTipTap(node) {
  if (!node) return "";
  if (typeof node === "string") return node;
  if (node.type === "text") return node.text ?? "";
  if (Array.isArray(node.content)) {
    return node.content.map(extractTextFromTipTap).join(" ");
  }
  return "";
}

// ─── Columnas default del kanban de tareas (organización del equipo) ───────
function seedTaskColumns(wsId) {
  const ins = db.prepare(`
    INSERT INTO tareas_columns (workspace_id, name, color, icon, status, position, is_default)
    VALUES (?, ?, ?, ?, ?, ?, 1)
  `);
  const cols = [
    ["Por hacer",    "var(--lavender-400)", "Circle",       "TODO",        0],
    ["En progreso",  "var(--brand-700)",    "Clock",        "IN_PROGRESS", 1],
    ["En revisión",  "var(--warning)",      "AlertCircle",  "IN_REVIEW",   2],
    ["Hecho",        "var(--sage-500)",     "CheckCircle2", "DONE",        3],
  ];
  for (const [name, color, icon, status, pos] of cols) {
    ins.run(wsId, name, color, icon, status, pos);
  }
}
