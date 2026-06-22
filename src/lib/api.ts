// Cliente HTTP para el backend Psicomorfosis (Express + SQLite).

/**
 * Resuelve la URL base del backend.
 * - En build SSR: usa localhost al puerto del backend (3002 por defecto).
 * - En navegador: usa el mismo origen — vite dev o nginx proxean /api y /socket.io
 *   al backend. Funciona igual en local, LAN y detrás de dominio/HTTPS.
 * - Se puede sobrescribir con window.__PSM_API_BASE__ o VITE_API_BASE.
 */
function resolveApiBase(): string {
  if (typeof window === "undefined") return "http://localhost:3002";
  const override = (window as any).__PSM_API_BASE__ ?? (import.meta as any).env?.VITE_API_BASE;
  if (override) return override;
  return "";
}

const API_BASE = resolveApiBase();

export const TOKEN_KEY = "psm.token";
export const USER_KEY = "psm.user";

export type WorkspaceMode = "individual" | "organization";

export interface ApiUser {
  id: number;
  username: string;
  name: string;
  email: string;
  role: string;
  /** Cross-workspace platform admin (dueño de la plataforma). */
  isPlatformAdmin?: boolean;
  /** Asesor legal (edita políticas/términos en /legal-admin). Cross-workspace. */
  isLegalAdmin?: boolean;
  workspaceId: number;
  workspaceName: string;
  workspaceMode: WorkspaceMode;
}

export interface PlatformWorkspaceMember {
  id: number;
  name: string;
  username: string;
  email: string | null;
  role: string;
  isLegalAdmin: boolean;
  isPlatformAdmin: boolean;
  lastLoginAt: string | null;
}

export interface PlatformWorkspace {
  id: number;
  name: string;
  mode: WorkspaceMode;
  disabledAt: string | null;
  disabledReason: string | null;
  createdAt: string;
  usersCount: number;
  patientsCount: number;
  documentsCount: number;
  documents7d: number;
  appointments30d: number;
  /** Citas atendidas en los últimos 30 días (vs. total programadas). KPI más fiel a la actividad clínica real. */
  sessions30d: number;
  /** Suma de invoices pagadas en los últimos 30 días (paid_at o created_at). */
  revenue30d: number;
  /** Especialidades del psicólogo. Array de strings, vacío si no las configuró. */
  specialties: string[];
  /** Capacidad máxima de pacientes activos. null = sin tope. */
  maxPatients: number | null;
  /** % de ocupación (patientsCount / maxPatients * 100). null si no hay tope. */
  occupancyPct: number | null;
  lastLoginAt: string | null;
  ownerName: string | null;
  ownerEmail: string | null;
  ownerUsername: string | null;
  members: PlatformWorkspaceMember[];
}

export interface PlatformWorkspaceDetail {
  workspace: {
    id: number;
    name: string;
    mode: WorkspaceMode;
    disabledAt: string | null;
    disabledReason: string | null;
    createdAt: string;
  };
  users: Array<{
    id: number;
    username: string;
    name: string;
    email: string | null;
    role: string;
    isPlatformAdmin: boolean;
    lastLoginAt: string | null;
    createdAt: string;
  }>;
  stats: {
    patients_count: number;
    patients_archived: number;
    documents_count: number;
    documents_signed: number;
    appointments_total: number;
    tests_count: number;
    notes_count: number;
  };
}

export interface PlatformUsage {
  workspaces_total: number;
  workspaces_active: number;
  staff_users: number;
  patient_users: number;
  active_staff_7d: number;
  patients_total: number;
  docs_30d: number;
  appts_30d: number;
}

export interface BankAccount {
  id: number;
  bankId: string;
  label: string;
  accountType: string | null;
  last4: string | null;
  holderName: string | null;
  brand: "mastercard" | "visa" | "amex" | "none";
  isDefault: boolean;
  archivedAt: string | null;
  createdAt: string;
}

export interface BankAccountInput {
  bankId: string;
  label: string;
  accountType?: string | null;
  last4?: string | null;
  holderName?: string | null;
  brand?: "mastercard" | "visa" | "amex" | "none";
  isDefault?: boolean;
}

export interface Sede {
  id: number;
  name: string;
  address: string | null;
  phone: string | null;
  active: boolean | number;
}

export interface Professional {
  id: number;
  name: string;
  title: string | null;
  email: string | null;
  phone: string | null;
  approach: string | null;
  active: boolean | number;
  sedeIds: number[];
}

export interface Workspace {
  id: number;
  name: string;
  mode: WorkspaceMode;
  /** Especialidades del psicólogo. Array de strings, vacío si no las configuró. */
  specialties?: string[];
  /** Capacidad máxima de pacientes activos. null = sin tope. */
  maxPatients?: number | null;
  sedes: Sede[];
  professionals: Professional[];
}

export interface ApiPatient {
  id: string;
  name: string;
  preferredName?: string;
  pronouns: string;
  doc: string;
  age: number;
  phone: string;
  email: string;
  professional: string;
  professionalId?: number;
  sedeId?: number;
  modality: "individual" | "pareja" | "familiar" | "grupal" | "tele";
  status: "activo" | "pausa" | "alta" | "derivado";
  reason: string;
  lastContact: string;
  nextSession?: string;
  risk: "none" | "low" | "moderate" | "high" | "critical";
  riskTypes?: ("suicida" | "autolesion" | "heteroagresion" | "abandono_tto" | "reagudizacion" | "descompensacion")[];
  tags?: string[];
  /** Dirección de residencia o ciudad/barrio. Texto libre. */
  address?: string;
  /** Sexo asignado al nacer ("M"|"F"). Distinto de pronombres/identidad de género — se usa en tests cuya interpretación depende de baremos diferenciados (ej. MCMI-II). */
  sex?: "M" | "F";
  // Seguro / EPS — opcionales, todos texto libre.
  insuranceProvider?: string;
  insurancePlan?: string;
  insurancePolicy?: string;
  /** Fecha YYYY-MM-DD hasta la que la póliza está vigente (opcional). */
  insuranceValidUntil?: string;
  /**
   * Estado de la cuenta del portal del paciente:
   *  - "not_invited": nunca se generó una invitación (o la última expiró sin uso)
   *  - "invited":     hay una invitación abierta esperando que el paciente active
   *  - "active":      el paciente ya activó su cuenta y puede entrar al portal
   */
  portalStatus?: "not_invited" | "invited" | "active";
  /** ISO timestamp de cuándo aceptó los términos al activar (proxy de activación). */
  portalActivatedAt?: string | null;
  /** ISO timestamp de la última vez que entró al portal (puede ser null si nunca entró post-activación). */
  portalLastLoginAt?: string | null;
  /** ISO timestamp en que expira la invitación pendiente. Solo cuando portalStatus="invited". */
  portalInviteExpiresAt?: string | null;
}

export interface EmergencyContact {
  id: number;
  patientId: string;
  name: string;
  relation: string;
  phone: string;
  priority: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface Invoice {
  id: string;
  patient_id: string | null;
  patient_name: string;
  professional: string;
  concept: string;
  amount: number;
  method: string;
  status: "pagada" | "pendiente" | "vencida" | "borrador";
  date: string;
  /** Modalidad del servicio: "Presencial" | "Virtual" | "Tele" — independiente del método de pago. */
  modality: string | null;
  bank: string | null;
  eps: string | null;
  payment_reference: string | null;
  payment_notes: string | null;
  paid_at: string | null;
  created_at: string | null;
  /** FK opcional al wallet del workspace (lib/banks.ts catalog). */
  bank_account_id: number | null;
}

export type NoteKind =
  | "motivo"
  | "antecedentes"
  | "examen_mental"
  | "cie11"
  | "plan"
  | "sesion"
  | "evolucion"
  | "privada";

export interface ClinicalNote {
  id: number;
  workspaceId: number;
  patientId: string;
  authorId: number | null;
  authorName: string | null;
  kind: NoteKind;
  /** Texto libre para bloques y JSON stringified {s,o,a,p} para notas de sesión */
  content: string;
  /** Solo aplica al bloque kind='cie11' (renombrado a "Diagnóstico" en UI).
   *  Permite que el psicólogo indique qué sistema de clasificación usa
   *  para esa nota. NULL = legacy (datos anteriores a may 2026) o sin
   *  especificar. NO hay catálogo precargado — es solo una etiqueta. */
  diagnosticSystem: DiagnosticSystem | null;
  createdAt: string;
  updatedAt: string;
  signedAt: string | null;
  supersededById: number | null;
  isDraft: boolean;
  isSuperseded: boolean;
}

/** Sistemas de clasificación diagnóstica aceptados. Texto libre con la
 *  etiqueta del sistema seleccionado; los códigos no se validan. */
export type DiagnosticSystem = "CIE-11" | "DSM-5-TR" | "Otro";

export const DIAGNOSTIC_SYSTEMS: DiagnosticSystem[] = ["CIE-11", "DSM-5-TR", "Otro"];

// ─── Diagnóstico estructurado del paciente ─────────────────────────────────

/** Diagnóstico clínico asignado a un paciente. La psicóloga puede asignar
 *  N por paciente y marcar uno como principal. */
export interface ClinicalDiagnosis {
  id: number;
  workspaceId: number;
  patientId: string;
  code: string;
  system: DiagnosticSystem;
  name: string;
  /** Si vino del catálogo curado, este es su id estable interno. Si fue
   *  agregado libre (system="Otro" o nombre custom), es null. */
  catalogId: string | null;
  isPrimary: boolean;
  /** Nota libre opcional específica de ESTE diagnóstico (no la
   *  formulación clínica del paciente, que va en el bloque cie11). */
  note: string | null;
  addedById: number | null;
  addedByName: string | null;
  createdAt: string;
  archivedAt: string | null;
}

/** Entrada del catálogo curado de diagnósticos (response del servidor). */
export interface DiagnosisCatalogEntry {
  id: string;
  category: string;
  name: string;
  /** Cuando se pide ?system=X, esto es el código de ese sistema (string).
   *  Cuando no se pide system, esto es un objeto con códigos paralelos. */
  code?: string;
  codes?: { "CIE-11"?: string | null; "DSM-5-TR"?: string | null };
  keywords: string[];
}

export interface DiagnosisCatalog {
  categories: string[];
  entries: DiagnosisCatalogEntry[];
}

export interface SoapContent {
  s: string;
  o: string;
  a: string;
  p: string;
}

/** Tipos de bloque de historia clínica (singleton por paciente) */
export const BLOCK_KINDS: NoteKind[] = ["motivo", "antecedentes", "examen_mental", "cie11", "plan"];
export const BLOCK_LABELS: Record<Exclude<NoteKind, "sesion" | "evolucion" | "privada">, string> = {
  motivo: "Motivo de consulta",
  antecedentes: "Antecedentes personales",
  examen_mental: "Examen mental",
  // El kind interno sigue siendo 'cie11' por compatibilidad con datos
  // existentes, pero el label visible evolucionó: primero fue "Diagnóstico
  // CIE-11" (solo texto + selector de sistema); después "Diagnóstico" con
  // selector; ahora "Impresión diagnóstica" — el bloque contiene una
  // lista de dx estructurados (DiagnosisManager) + una formulación
  // clínica libre. El término es más cálido y menos psiquiátrico/EPS.
  cie11: "Impresión diagnóstica",
  plan: "Plan de tratamiento",
};

// ─── Tareas (organización interna del equipo) ──────────────────────────────
export type TareaStatus = "TODO" | "IN_PROGRESS" | "IN_REVIEW" | "DONE";
export type TareaPriority = "LOW" | "MEDIUM" | "HIGH" | "URGENT";
export type TareaVisibility = "private" | "team" | "workspace";
export type TareaType =
  | "Sesión clínica"
  | "Tests"
  | "Documentación"
  | "Llamada / Seguimiento"
  | "Administrativo"
  | "Capacitación"
  | "Auto-cuidado"
  | "Reunión equipo"
  | "Reporte";

export type TrackingPreset =
  | "POMODORO_25" | "DEEP_50" | "STRATEGIC_90" | "SHORT_BREAK" | "LONG_BREAK";

export const TRACKING_PRESETS: { id: TrackingPreset; label: string; minutes: number }[] = [
  { id: "POMODORO_25", label: "25 min · Pomodoro", minutes: 25 },
  { id: "DEEP_50", label: "50 min · Sesión profunda", minutes: 50 },
  { id: "STRATEGIC_90", label: "90 min · Bloque estratégico", minutes: 90 },
  { id: "SHORT_BREAK", label: "Pausa corta", minutes: 5 },
  { id: "LONG_BREAK", label: "Pausa larga", minutes: 15 },
];

export const TAREA_TYPES: TareaType[] = [
  "Sesión clínica",
  "Tests",
  "Documentación",
  "Llamada / Seguimiento",
  "Administrativo",
  "Capacitación",
  "Auto-cuidado",
  "Reunión equipo",
  "Reporte",
];

export interface RecurrenceConfig {
  enabled: boolean;
  frequency: "daily" | "weekly" | "biweekly" | "monthly";
  day_of_week?: number;
  day_of_month?: number;
  next_occurrence?: string;
  last_generated?: string;
}

export interface TareaComment {
  id: number;
  task_id: number;
  workspace_id: number;
  author_id: number;
  author_name: string;
  text: string;
  created_at: string;
}

export interface TareaChecklistItem {
  id: number;
  task_id: number;
  text: string;
  completed: boolean;
  position: number;
  created_at: string;
  completed_at: string | null;
}

export interface TareaImage {
  id: number;
  task_id: number;
  filename: string;
  url: string;
  size: number | null;
  mime: string | null;
  position: number;
}

export interface TareaPomodoroSession {
  id: number;
  task_id: number;
  user_id: number;
  start_time: string;
  end_time: string;
  duration_minutes: number;
  completed: boolean;
  type: "work" | "break";
  date: string;
}

export interface Tarea {
  id: number;
  workspace_id: number;
  title: string;
  description: string | null;
  type: TareaType | null;
  status: TareaStatus;
  priority: TareaPriority;
  assignee_id: number | null;
  creator_id: number;
  project_id: number | null;
  patient_id: string | null;
  visibility: TareaVisibility;
  start_date: string | null;
  due_date: string | null;
  completed_at: string | null;
  archived_at: string | null;
  deleted_at: string | null;
  tracking_preset: TrackingPreset | null;
  total_pomodoros: number;
  current_pomodoro_time: number | null;
  pomodoro_status: "idle" | "running" | "paused" | "break" | null;
  recurrence: RecurrenceConfig | null;
  recurring_template_id: number | null;
  is_recurring_instance: boolean;
  position: number;
  created_at: string;
  updated_at: string;
  comments?: TareaComment[];
  checklist?: TareaChecklistItem[];
  images?: TareaImage[];
  pomodoro_sessions?: TareaPomodoroSession[];
  // Flujo Moodle: el psicólogo puede adjuntar una plantilla (Word/PDF) y el
  // paciente entrega su respuesta como archivo. Ambos FKs apuntan a documents
  // para reutilizar la infra de archivos. submitted_at es null si aún no entregó.
  template_document_id?: string | null;
  submission_document_id?: string | null;
  submitted_at?: string | null;
  template_document?: TareaDocumentDescriptor | null;
  submission_document?: TareaDocumentDescriptor | null;
}

/** Descriptor mínimo de un archivo adjunto a una tarea (template o entrega). */
export interface TareaDocumentDescriptor {
  id: string;
  name: string | null;
  original_name: string | null;
  filename: string | null;
  mime: string | null;
  size_bytes: number | null;
  kind: "file" | "editor";
  created_at?: string;
}

export interface TareaProject {
  id: number;
  workspace_id: number;
  name: string;
  color: string;
  description: string | null;
  category: string | null;
  folder_id: number | null;
  archived: boolean;
  position: number;
  created_at: string;
  updated_at: string;
}

export interface TareaFolder {
  id: number;
  workspace_id: number;
  name: string;
  color: string;
  position: number;
  expanded: boolean;
  created_at: string;
}

// ─── Tests psicométricos ────────────────────────────────────────────────────
export interface PsychTestScaleOption { value: number; label: string }
/** Tipo de widget para preguntas de tests "Actividad" (heterogéneos). */
export type ActivityQuestionType = "single_choice" | "yes_no" | "numeric" | "text";
export interface PsychTestQuestion {
  id: string;
  text: string;
  reverse?: boolean;
  scale?: PsychTestScaleOption[];
  /** Para tests "Actividad": tipo de widget que renderiza esta pregunta. */
  type?: ActivityQuestionType;
  /** single_choice: opciones específicas de esta pregunta. */
  options?: PsychTestScaleOption[];
  /** numeric: rango permitido (inclusive). */
  numeric_min?: number;
  numeric_max?: number;
  /** text: placeholder opcional. */
  placeholder?: string;
}
export interface PsychTestRange { min: number; max: number; label: string; level: "none" | "low" | "moderate" | "high" | "critical" }
export interface PsychTestAlerts { critical_question_id?: string; critical_threshold?: number }
export interface PsychTestDefinition {
  version?: number;
  instructions?: string;
  scale?: PsychTestScaleOption[] | null;
  questions: PsychTestQuestion[];
  /** "activity": cada pregunta tiene su widget propio, sin score automático. */
  scoring?: { type: "sum" | "sum_reversed" | "eat26" | "millon" | "none" | "activity" };
  ranges: PsychTestRange[];
  alerts?: PsychTestAlerts | null;
}

/** Las respuestas pueden ser numéricas (Likert/V-F/numeric) o texto (text). */
export type AnswerValue = number | string;
export type AnswersMap = Record<string, AnswerValue>;
export interface PsychTest {
  id: string;
  code: string;
  name: string;
  shortName: string;
  items: number;
  minutes: number;
  category: string;
  description: string | null;
  ageRange: string | null;
  scoring: PsychTestRange[];
  definition: PsychTestDefinition | null;
  /** false = instrumento clínico oficial; true = formulario del consultorio. */
  isCustom?: boolean;
  workspaceId?: number | null;
}

export interface TestRequest {
  id: number;
  workspace_id: number;
  requested_by: number | null;
  requester_name: string | null;
  test_name: string;
  reason: string | null;
  status: "open" | "in_progress" | "completed" | "rejected" | string;
  created_at: string;
}

export interface CreateFormBody {
  name: string;
  short_name?: string;
  description?: string;
  category?: string;
  age_range?: string;
  minutes?: number;
  definition: {
    instructions?: string;
    /** Para Likert/V-F: escala global. Para Actividad: opcional/vacía
     *  porque cada pregunta lleva sus propias opciones. */
    scale: PsychTestScaleOption[];
    questions: PsychTestQuestion[];
    /** "activity": tipos heterogéneos por pregunta, sin score automático.
     *  "none": legacy de v1.1 (escala global única, sin score). */
    scoring: { type: "sum" | "sum_reversed" | "none" | "activity" };
    ranges: PsychTestRange[];
  };
}
export interface TestApplication {
  id: string;
  workspace_id: number;
  patient_id: string | null;
  patient_name: string | null;
  test_code: string;
  test_name: string;
  date: string | null;
  score: number | null;
  interpretation: string | null;
  level: string | null;
  professional: string | null;
  status: "pendiente" | "en_curso" | "completado" | string;
  applied_by: "profesional" | "paciente" | null;
  assigned_at: string | null;
  completed_at: string | null;
  answers_json: AnswersMap | null;
  alerts_json: {
    critical_response?: boolean;
    critical_question_id?: string;
    critical_value?: number;
    /** Para tests con scoring por escalas múltiples (MCMI-II): raw scores por escala. */
    scales_raw?: Record<string, number | null>;
    /** Subescalas opt-in (BIS-11, etc): breakdown del score total por subescala.
     *  Calculado por el motor de scoring; el frontend lo renderiza bajo el score
     *  total como tabla/barras. */
    subscales?: Array<{
      key: string;
      label: string;
      score: number;
      items_count: number;
      answered_count: number;
    }>;
    /** Metadata adicional del scoring: tipo de test, advertencias de validez, etc. */
    meta?: {
      type?: string;
      validity_warning?: string | null;
      requires_clinical_interpretation?: boolean;
      /** Para tests cualitativos (scoring "none"): snapshot de las respuestas
       *  con etiquetas legibles, listas para que el psicólogo las interprete. */
      answers_snapshot?: Array<{
        id: string;
        text: string;
        /** Tipo de widget original de la pregunta (sólo en tests "activity"). */
        q_type?: ActivityQuestionType | null;
        value: AnswerValue | null;
        label: string | null;
      }>;
    };
  } | null;
  /** Observaciones clínicas del psicólogo sobre el resultado del test
   *  (texto libre). NULL si no hay nota. Pedido por Nathaly: complementa
   *  el score automático con contexto cualitativo. */
  notes?: string | null;
  total_items?: number | null;
  answered_items?: number | null;
  started_at?: string | null;
  paused_at?: string | null;
}

// ─── Documentos & Plantillas ───────────────────────────────────────────────
export type DocumentKind = "editor" | "file";
export type DocumentStatus = "borrador" | "pendiente_firma" | "firmado";
export type DocumentType =
  | "consentimiento" | "informe" | "certificado" | "remision"
  | "contrato" | "evolucion" | "otro";

/** Doc state de TipTap. Estructura: { type:"doc", content:[...] }. */
export type TipTapDoc = { type: string; content?: any[]; attrs?: Record<string, any>; text?: string; marks?: any[] };

export interface PsmDocument {
  id: string;
  workspace_id: number;
  name: string;
  type: DocumentType | string;
  kind: DocumentKind;
  patient_id: string | null;
  patient_name: string | null;
  // Para kind='file'
  filename: string | null;
  original_name: string | null;
  mime: string | null;
  size_bytes: number | null;
  /** URL pública para imágenes (sin token); null para otros tipos. */
  public_url: string | null;
  // Para kind='editor'
  body_json: TipTapDoc | null;
  body_text: string | null;
  template_id: number | null;
  // Estado y firma
  status: DocumentStatus | null;
  professional: string | null;
  signed_at: string | null;
  signed_by_user_id: number | null;
  // Soft delete
  archived_at: string | null;
  /** Si true, el paciente lo ve en su portal. Un doc firmado siempre se ve. */
  shared_with_patient?: boolean;
  // Timestamps
  size_kb: number | null;
  created_at: string;
  updated_at: string;
}

export type TemplateScope = "system" | "workspace" | "personal";
export type TemplateCategory = "consentimiento" | "informe" | "contrato" | "certificado" | "remision" | "otro";

export interface DocumentTemplate {
  id: number;
  workspace_id: number | null;
  name: string;
  description: string | null;
  category: TemplateCategory;
  scope: TemplateScope;
  body_json: TipTapDoc;
  body_text: string | null;
  legal_disclaimer: string | null;
  archived: boolean;
  uses_count: number;
  created_at: string;
  updated_at: string;
}

export interface TareaColumn {
  id: number;
  workspace_id: number;
  name: string;
  color: string;
  icon: string | null;
  status: TareaStatus;
  position: number;
  is_default: boolean;
  created_at: string;
}

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(TOKEN_KEY);
}

export function getStoredUser(): ApiUser | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(USER_KEY);
  return raw ? JSON.parse(raw) : null;
}

export function setSession(token: string, user: ApiUser) {
  window.localStorage.setItem(TOKEN_KEY, token);
  window.localStorage.setItem(USER_KEY, JSON.stringify(user));
}

/**
 * Reemplaza solo el JWT en localStorage (deja el user object intacto).
 * Útil tras /change-password donde el backend invalida tokens previos y
 * devuelve uno nuevo — el user es el mismo pero el token cambió.
 */
export function refreshToken(token: string) {
  window.localStorage.setItem(TOKEN_KEY, token);
}

export function clearSession() {
  window.localStorage.removeItem(TOKEN_KEY);
  window.localStorage.removeItem(USER_KEY);
}

/**
 * Logout completo: avisa al server para que invalide TODOS los tokens del
 * usuario (en todos los dispositivos donde tenga sesión abierta) Y limpia el
 * localStorage local. Si el endpoint server falla (sin red, etc.) igual
 * limpiamos localmente — UX prioritaria; el token expira solo en 24h.
 *
 * Detecta si la sesión actual es de paciente o staff y llama al endpoint
 * apropiado (los dos hacen lo mismo pero requieren middleware distinto).
 */
export async function logoutEverywhere(): Promise<void> {
  const user = getStoredUser();
  try {
    if (user?.role === "paciente") {
      await api.portalLogout();
    } else if (user) {
      await api.logout();
    }
  } catch {
    // Si el server no responde, igual cerramos localmente. Mejor logout
    // parcial que dejar al usuario con sesión activa en su pantalla.
  } finally {
    clearSession();
  }
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(init.headers as Record<string, string> | undefined),
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}${path}`, { ...init, headers });
  if (res.status === 204) return undefined as T;

  const contentType = res.headers.get("content-type") ?? "";
  const body = contentType.includes("application/json") ? await res.json() : await res.text();

  if (!res.ok) {
    const msg = typeof body === "string" ? body : body.error ?? "Error en la solicitud";
    if (res.status === 401) clearSession();
    // 403 con hint=wrong_role en endpoints del portal: el token actual no es
    // de paciente (típicamente, staff logueado abrió el portal con su token).
    // Limpiamos sesión para que el guard del PortalShell mande a /p/login y
    // no quedemos en loop pidiendo /api/portal/* y recibiendo 403 forever.
    if (
      res.status === 403 &&
      typeof body === "object" && body && (body as any).hint === "wrong_role" &&
      path.startsWith("/api/portal/")
    ) {
      clearSession();
      if (typeof window !== "undefined" && !window.location.pathname.startsWith("/p/login")) {
        window.location.href = "/p/login";
      }
    }
    throw new ApiError(res.status, msg);
  }
  return body as T;
}

function qs(params: Record<string, string | number | undefined | null>): string {
  const entries = Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== "");
  if (entries.length === 0) return "";
  return "?" + new URLSearchParams(entries.map(([k, v]) => [k, String(v)])).toString();
}

export const api = {
  base: API_BASE,

  // Auth
  /** Login flexible: identifier puede ser username O email. */
  login: (identifier: string, password: string) =>
    request<{ token: string; user: ApiUser }>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ identifier, password }),
    }),
  me: () => request<{ user: ApiUser }>("/api/auth/me"),
  /** Logout server-side: invalida TODOS los tokens del usuario actual. */
  logout: () => request<{ ok: true }>("/api/auth/logout", { method: "POST" }),
  /** Logout del paciente — equivalente del portal. */
  portalLogout: () => request<{ ok: true }>("/api/portal/logout", { method: "POST" }),
  /**
   * Cambia la contraseña del usuario autenticado. Requiere la actual.
   * El backend invalida todos los tokens previos al hacer el cambio y
   * devuelve un token nuevo para que la pestaña actual no quede deslogueada.
   */
  changePassword: (body: { current_password: string; new_password: string }) =>
    request<{ ok: true; token?: string }>("/api/auth/change-password", { method: "POST", body: JSON.stringify(body) }),

  /**
   * Verifica si un username o email están disponibles. Endpoint público
   * (sin token). Para "editar mis credenciales" pasa excludeId con el
   * id propio para que el username/email actual del user no aparezca
   * como "ya en uso por mí mismo".
   */
  checkAvailability: (params: { username?: string; email?: string; excludeId?: number }) => {
    const qs = new URLSearchParams();
    if (params.username) qs.set("username", params.username);
    if (params.email) qs.set("email", params.email);
    if (typeof params.excludeId === "number") qs.set("excludeId", String(params.excludeId));
    return request<{
      usernameAvailable?: boolean; usernameError?: string;
      emailAvailable?: boolean; emailError?: string;
    }>(`/api/auth/check-availability?${qs.toString()}`);
  },

  /** El user autenticado actualiza su propio username y/o email. */
  updateCredentials: (body: { current_password: string; username?: string; email?: string }) =>
    request<{ ok: true; token?: string; user?: ApiUser }>("/api/auth/update-credentials", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  // Portal del paciente — invitación + activación + login (públicos)
  invitePatient: (patientId: string) =>
    request<{
      token: string;
      url: string;
      expires_at: string;
      days_valid: number;
      whatsapp_text: string;
      /** "queued" = se está enviando email en background; "no_smtp" = caer al flujo manual. */
      email_status?: "queued" | "no_smtp";
      /** Email del paciente al que se envió/enviará. */
      email_to?: string;
    }>(
      `/api/patients/${patientId}/invite`,
      { method: "POST" }
    ),
  /**
   * Restablece la contraseña del portal de un paciente. Genera una
   * contraseña temporal segura, la guarda hasheada en el servidor y
   * la devuelve UNA SOLA VEZ para que el psicólogo la comparta con el
   * paciente. Después el paciente puede cambiarla desde /p/perfil.
   */
  resetPatientPassword: (patientId: string) =>
    request<{
      ok: true;
      username: string;
      new_password: string;
      message: string;
    }>(`/api/patients/${patientId}/reset-password`, { method: "POST" }),
  validatePatientInvite: (token: string) =>
    request<{
      valid: boolean;
      patient: { id: string; name: string; preferred_name: string | null; email: string };
      professional: { name: string; title: string | null } | null;
      clinic: { name: string; city: string | null; address: string | null };
      expires_at: string;
    }>(`/api/patient-invite/${token}`),
  activatePatientInvite: (token: string, password: string, opts?: { acceptedLegal?: boolean; legalVersion?: string }) =>
    request<{ token: string; user: { id: number; name: string; email: string; role: "paciente"; patient_id: string; workspace_id: number } }>(
      `/api/patient-invite/${token}/activate`,
      {
        method: "POST",
        body: JSON.stringify({
          password,
          // El backend exige consentimiento explícito para activar (Ley 1581/2012).
          accepted_legal: opts?.acceptedLegal === true,
          legal_version: opts?.legalVersion,
        }),
      }
    ),
  loginPatient: (email: string, password: string) =>
    request<{ token: string; user: { id: number; name: string; email: string; role: "paciente"; patient_id: string; workspace_id: number } }>(
      "/api/auth/patient/login",
      { method: "POST", body: JSON.stringify({ email, password }) }
    ),

  // Portal del paciente — endpoints autenticados
  portalMe: () =>
    request<{
      patient: ApiPatient & { address?: string | null; photo_url?: string | null };
      professional: { id: number; name: string; title: string | null; phone: string | null; email: string | null; signature_url: string | null } | null;
      clinic: { name: string | null; city: string | null; address: string | null; phone: string | null; consultorio: string | null };
    }>("/api/portal/me"),
  portalUpdateMe: (body: Partial<{ phone: string; email: string; address: string; photo_url: string; preferred_name: string; pronouns: string }>) =>
    request<{ ok: true }>("/api/portal/me", { method: "PATCH", body: JSON.stringify(body) }),
  /**
   * Eliminar la cuenta del portal del paciente (Ley 1581 art. 8e). NO borra
   * la historia clínica (Resolución 1995/1999 obliga a conservarla 15 años).
   * Solo borra el acceso digital. Exige password + el texto "ELIMINAR".
   */
  portalDeleteMyAccount: (body: { current_password: string; confirm_text: string }) =>
    request<{ ok: true; message: string }>("/api/portal/me/delete", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  /**
   * Descargar TODOS los datos del paciente en JSON (Ley 1581 art. 8b —
   * derecho de acceso). Descarga directa con auth via header.
   */
  portalExportMyData: async (): Promise<void> => {
    const token = getToken();
    const res = await fetch(`${API_BASE}/api/portal/me/export`, {
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    });
    if (!res.ok) throw new ApiError(res.status, "No se pudo exportar tus datos");
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    // Nombre del archivo: el header Content-Disposition trae el sugerido,
    // pero por simplicidad lo armamos acá también.
    const today = new Date().toISOString().slice(0, 10);
    a.download = `mis-datos-${today}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  },
  portalAppointments: () => request<Array<Record<string, any>>>("/api/portal/appointments"),
  portalTasks: () => request<Array<Record<string, any>>>("/api/portal/tasks"),
  portalCompleteTask: (id: string) => request<{ ok: true }>(`/api/portal/tasks/${id}/complete`, { method: "POST" }),
  /**
   * El paciente entrega un archivo como respuesta a una tarea con plantilla.
   * `id` es de la forma "tarea-N" (las terapéuticas no aceptan entrega de
   * archivo). Sube vía multipart/form-data; el server crea un documento
   * compartido y lo enlaza como `submission_document` de la tarea.
   */
  portalSubmitTaskFile: async (id: string, file: File) => {
    const fd = new FormData();
    fd.append("file", file);
    const token = getToken();
    const res = await fetch(`${API_BASE}/api/portal/tasks/${id}/submit`, {
      method: "POST",
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      body: fd,
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new ApiError(res.status, body?.error ?? "No se pudo entregar la tarea");
    }
    return res.json() as Promise<{
      ok: true;
      task: {
        id: string;
        status: "asignada" | "completada";
        submitted_at: string;
        submission_document: { id: string; name: string; original_name: string; filename: string; mime: string; size_bytes: number };
      };
    }>;
  },
  portalDocuments: () => request<Array<Record<string, any>>>("/api/portal/documents"),
  /**
   * Detalle de un documento compartido con el paciente, modo solo-lectura.
   * Devuelve el body_json para renderizar con DocumentEditor en read-only
   * (kind='editor'), o metadata del archivo (kind='file') para iframe/img.
   */
  portalDocument: (id: string) =>
    request<{
      document: {
        id: string;
        name: string;
        type: string;
        kind: "editor" | "file";
        mime: string | null;
        filename: string | null;
        original_name: string | null;
        size_bytes: number | null;
        body_json: TipTapDoc | null;
        body_text: string | null;
        professional: string | null;
        signed_at: string | null;
        created_at: string;
        updated_at: string;
      };
      clinic: { name?: string; city?: string; address?: string };
      pending_signature_request_id: string | null;
      variable_context: Record<string, any>;
    }>(`/api/portal/documents/${id}`),
  /** URL del archivo (PDF/imagen) compartido. Incluye token como ?t= para iframe/img. */
  portalDocumentFileUrl: (id: string, opts?: { download?: boolean }) => {
    const t = getToken();
    const qs = new URLSearchParams();
    if (t) qs.set("t", t);
    if (opts?.download) qs.set("download", "1");
    return `${API_BASE}/api/portal/documents/${id}/file?${qs.toString()}`;
  },

  // Workspace
  getWorkspace: () => request<Workspace>("/api/workspace"),

  /**
   * Eliminar permanentemente la cuenta del usuario y todos sus datos
   * (workspace, pacientes, historia clínica, recibos, documentos…).
   * Operación irreversible — implementa el derecho de supresión del
   * art. 8 lit. e) Ley 1581/2012. Requiere doble confirmación: el texto
   * literal "ELIMINAR" + reingreso de la contraseña actual.
   */
  deleteAccount: (input: { confirmText: string; currentPassword: string }) =>
    request<{
      deleted: true;
      workspaceId: number;
      workspaceName: string;
      deletedAt: string;
      message: string;
    }>("/api/workspace/me/all-data", {
      method: "DELETE",
      body: JSON.stringify(input),
    }),
  getDashboardStats: () => request<{
    sessionsByModality: Array<{ modality: string; value: number }>;
    reasons: Array<{ reason: string; value: number }>;
    revenue7d: Array<{ day: string; value: number }>;
    pendingItems: {
      testsToReview: number;
      testsAssignedPending: number;
      openTasks: number;
      openSignRequests: number;
    };
    patientsWithoutFollowup: Array<{
      id: string;
      name: string;
      preferredName: string | null;
      risk: string | null;
      professional: string | null;
      lastSessionDate: string;
      daysSince: number;
    }>;
  }>("/api/workspace/dashboard-stats"),
  getReportsStats: () => request<{
    sessionsByModality: Array<{ modality: string; value: number }>;
    reasons: Array<{ reason: string; value: number }>;
    revenue7d: Array<{ day: string; value: number }>;
    retention: Array<{ mes: string; nuevos: number; retenidos: number; alta: number }>;
    sessionsByDow: Array<{ day: string; value: number }>;
    patientsByRisk: Array<{ level: string; key: string; value: number }>;
    patientsByAge: Array<{ range: string; value: number }>;
    patientsBySex: Array<{ sex: string; key: string; value: number }>;
    testsByMonth: Array<{ mes: string; value: number }>;
    topPatients: Array<{ id: string; name: string; sessions: number }>;
    revenueByMethod: Array<{ method: string; value: number; count: number }>;
    revenueByAccount: Array<{
      bucket: "account" | "cash" | "none";
      accountId: number | null;
      bankId: string | null;
      label: string;
      last4: string | null;
      accountType: string | null;
      brand: string;
      value: number;
      count: number;
    }>;
    operational: {
      attendance_rate: number;
      cancel_rate: number;
      no_show_rate: number;
      avg_duration_min: number | null;
      total_last_90d: number;
    };
  }>("/api/workspace/reports-stats"),
  /** Firma del profesional vinculado al usuario actual. */
  getMySignature: () => request<{ professional_id: number; name: string; tarjeta_profesional: string | null; signature_url: string | null }>("/api/workspace/me/signature"),
  setMySignature: (dataUrl: string) =>
    request<{ ok: true; signature_url: string }>("/api/workspace/me/signature", { method: "PUT", body: JSON.stringify({ dataUrl }) }),
  clearMySignature: () =>
    request<{ ok: true; signature_url: null }>("/api/workspace/me/signature", { method: "PUT", body: JSON.stringify({ clear: true }) }),
  /** Foto de perfil del usuario actual. dataUrl para set, clear:true para quitar. */
  getMyPhoto: () => request<{ photo_url: string | null }>("/api/workspace/me/photo"),
  setMyPhoto: (dataUrl: string) =>
    request<{ ok: true; photo_url: string }>("/api/workspace/me/photo", { method: "PUT", body: JSON.stringify({ dataUrl }) }),
  clearMyPhoto: () =>
    request<{ ok: true; photo_url: null }>("/api/workspace/me/photo", { method: "PUT", body: JSON.stringify({ clear: true }) }),
  /** Preferencias de notificaciones — default true si no hay override. */
  getMyNotificationPrefs: () => request<{
    prefs: Array<{ type: "appointment_reminder" | "clinical_risk_alert" | "daily_summary" | "payment_received"; enabled: boolean }>;
  }>("/api/workspace/me/notification-prefs"),
  setNotificationPref: (type: string, enabled: boolean) =>
    request<{ ok: true }>("/api/workspace/me/notification-prefs", {
      method: "PATCH",
      body: JSON.stringify({ type, enabled }),
    }),
  updateWorkspace: (body: { name?: string; mode?: WorkspaceMode; specialties?: string[] | null; max_patients?: number | null }) =>
    request<{ id: number; name: string; mode: WorkspaceMode; specialties: string[]; maxPatients: number | null }>(
      "/api/workspace",
      { method: "PATCH", body: JSON.stringify(body) }
    ),

  // Sedes
  listSedes: () => request<Sede[]>("/api/workspace/sedes"),
  createSede: (body: Partial<Sede>) => request<Sede>("/api/workspace/sedes", { method: "POST", body: JSON.stringify(body) }),
  updateSede: (id: number, body: Partial<Sede>) => request<Sede>(`/api/workspace/sedes/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  deleteSede: (id: number) => request<void>(`/api/workspace/sedes/${id}`, { method: "DELETE" }),

  // Professionals
  listProfessionals: () => request<Professional[]>("/api/workspace/professionals"),
  createProfessional: (body: Partial<Professional>) =>
    request<Professional>("/api/workspace/professionals", { method: "POST", body: JSON.stringify(body) }),
  updateProfessional: (id: number, body: Partial<Professional>) =>
    request<Professional>(`/api/workspace/professionals/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  deleteProfessional: (id: number) => request<void>(`/api/workspace/professionals/${id}`, { method: "DELETE" }),

  // Patients
  listPatients: (params: Record<string, string | number | undefined> = {}) =>
    request<ApiPatient[]>(`/api/patients${qs(params)}`),
  getPatient: (id: string) => request<ApiPatient>(`/api/patients/${id}`),
  createPatient: (body: Partial<ApiPatient>) =>
    request<ApiPatient>("/api/patients", { method: "POST", body: JSON.stringify(body) }),
  updatePatient: (id: string, body: Partial<ApiPatient>) =>
    request<ApiPatient>(`/api/patients/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  deletePatient: (id: string) => request<void>(`/api/patients/${id}`, { method: "DELETE" }),
  archivePatient: (id: string) => request<ApiPatient>(`/api/patients/${id}/archive`, { method: "POST" }),

  // Contactos de emergencia (anidados al paciente)
  listEmergencyContacts: (patientId: string) =>
    request<EmergencyContact[]>(`/api/patients/${patientId}/emergency-contacts`),
  createEmergencyContact: (patientId: string, body: Omit<Partial<EmergencyContact>, "id" | "patientId">) =>
    request<EmergencyContact>(`/api/patients/${patientId}/emergency-contacts`, {
      method: "POST", body: JSON.stringify(body),
    }),
  updateEmergencyContact: (id: number, body: Omit<Partial<EmergencyContact>, "id" | "patientId">) =>
    request<EmergencyContact>(`/api/patients/emergency-contacts/${id}`, {
      method: "PATCH", body: JSON.stringify(body),
    }),
  deleteEmergencyContact: (id: number) =>
    request<void>(`/api/patients/emergency-contacts/${id}`, { method: "DELETE" }),
  restorePatient: (id: string) => request<ApiPatient>(`/api/patients/${id}/restore`, { method: "POST" }),

  // Appointments
  listAppointments: (params: Record<string, string | number | undefined> = {}) =>
    request<Array<Record<string, any>>>(`/api/appointments${qs(params)}`),
  getAppointment: (id: number | string) =>
    request<Record<string, any>>(`/api/appointments/${id}`),
  createAppointment: (body: Record<string, unknown>) =>
    request("/api/appointments", { method: "POST", body: JSON.stringify(body) }),
  updateAppointment: (id: number | string, body: Record<string, unknown>) =>
    request<Record<string, any>>(`/api/appointments/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  /** Cancela una cita. Por default envía email al paciente si tiene
   *  correo; con `notify: false` el backend salta el aviso (útil cuando
   *  la psicóloga ya habló con el paciente por WhatsApp). */
  deleteAppointment: (id: number | string, opts?: { notify?: boolean }) =>
    request<void>(`/api/appointments/${id}`, {
      method: "DELETE",
      ...(opts && opts.notify === false
        ? { body: JSON.stringify({ notify: false }), headers: { "Content-Type": "application/json" } }
        : {}),
    }),

  // Tests psicométricos — catálogo y aplicaciones
  listTestCatalog: () => request<Array<PsychTest>>("/api/tests/catalog"),
  getTestCatalog: (id: string) => request<PsychTest>(`/api/tests/catalog/${id}`),
  listTestApplications: (params: { patient_id?: string; status?: string; test_code?: string } = {}) =>
    request<TestApplication[]>(`/api/tests/applications${qs(params)}`),
  getTestApplication: (id: string) => request<TestApplication>(`/api/tests/applications/${id}`),
  /** Crear aplicación con respuestas (staff aplicó test en sesión). */
  createTestApplication: (body: { test_id: string; patient_id?: string; patient_name?: string; answers?: AnswersMap; applied_by?: "profesional" | "paciente" }) =>
    request<TestApplication>("/api/tests/applications", { method: "POST", body: JSON.stringify(body) }),
  /** Asignar test al paciente para autoaplicación (sin respuestas, queda pendiente). */
  assignTestToPatient: (body: { test_id: string; patient_id: string }) =>
    request<TestApplication>("/api/tests/applications", { method: "POST", body: JSON.stringify({ ...body, assign_to_patient: true }) }),
  submitTestApplication: (id: string, answers: AnswersMap) =>
    request<TestApplication>(`/api/tests/applications/${id}/submit`, { method: "POST", body: JSON.stringify({ answers }) }),
  /** Guardar respuestas parciales (pausa) — staff. Cambia status a 'en_curso'. */
  saveTestApplicationProgress: (id: string, answers: AnswersMap) =>
    request<TestApplication>(`/api/tests/applications/${id}/progress`, { method: "PATCH", body: JSON.stringify({ answers }) }),
  /** Descarga las respuestas como CSV listo para pegar en Excel oficial (MCMI-II). */
  exportTestApplicationCsv: async (id: string): Promise<Blob> => {
    const token = localStorage.getItem("psm.token");
    const r = await fetch(`${API_BASE}/api/tests/applications/${id}/export.csv`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!r.ok) {
      const body = await r.json().catch(() => ({}));
      throw new ApiError(r.status, (body as any).error ?? "No se pudo exportar el CSV");
    }
    return r.blob();
  },
  /** Descarga el Excel oficial del MCMI-II con las respuestas inyectadas
   *  en la plantilla (varones/mujeres según sexo del paciente). Las
   *  fórmulas de las 4 hojas calculan automáticamente raw scores, BR e
   *  interpretación al abrirlo. Devuelve {blob, filename} para que el
   *  caller pueda usar el filename sugerido por el servidor en el
   *  Content-Disposition. */
  exportTestApplicationXlsx: async (id: string): Promise<{ blob: Blob; filename: string }> => {
    const token = localStorage.getItem("psm.token");
    const r = await fetch(`${API_BASE}/api/tests/applications/${id}/export.xlsx`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!r.ok) {
      const body = await r.json().catch(() => ({}));
      throw new ApiError(r.status, (body as any).error ?? "No se pudo exportar el Excel");
    }
    // Filename sugerido por el server vía Content-Disposition; si no
    // viene, default razonable.
    const cd = r.headers.get("Content-Disposition") ?? "";
    const m = cd.match(/filename="?([^";]+)"?/i);
    const filename = m?.[1] ?? `MCMI-II.xlsx`;
    return { blob: await r.blob(), filename };
  },
  deleteTestApplication: (id: string) => request<{ ok: true }>(`/api/tests/applications/${id}`, { method: "DELETE" }),
  /** POST público desde la landing (/inicio) — solicitud de demo.
   *  El backend persiste el lead y envía email a Stiven. Sin auth.
   *  Rate-limited a 5/15min por IP. */
  submitDemoRequest: (body: { name: string; email: string; phone?: string; message?: string }) =>
    request<{ ok: true; id: number }>("/api/landing/demo-request", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  /** Registro autoservicio desde la landing. Crea una solicitud
   *  (`account_requests`) en estado `pending` para que el platform admin
   *  apruebe o rechace desde /platform/solicitudes. Sin auth.
   *  El password se hashea en el server; el cliente lo manda en HTTPS. */
  submitRegistration: (body: {
    fullName: string;
    email: string;
    username?: string;
    password: string;
    phone?: string;
    message?: string;
  }) =>
    request<{ ok: true; id: number; username: string }>("/api/landing/register", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  // ─── Solicitudes de cuenta (platform admin) ──────────────────────────
  listAccountRequests: (params?: { status?: "pending" | "approved" | "rejected" }) => {
    const qs = params?.status ? `?status=${params.status}` : "";
    return request<{
      items: Array<{
        id: number;
        full_name: string;
        email: string;
        username: string;
        phone: string | null;
        message: string | null;
        status: "pending" | "approved" | "rejected";
        created_at: string;
        reviewed_at: string | null;
        rejection_reason: string | null;
        approved_workspace_id: number | null;
        approved_user_id: number | null;
        ip: string | null;
      }>;
      counts: { pending: number; approved: number; rejected: number };
    }>(`/api/platform/account-requests${qs}`);
  },
  approveAccountRequest: (id: number, body?: { workspaceName?: string; professionalTitle?: string }) =>
    request<{
      ok: true;
      workspaceId: number;
      userId: number;
      professionalId: number;
      username: string;
      alreadyApproved?: boolean;
    }>(`/api/platform/account-requests/${id}/approve`, {
      method: "POST",
      body: JSON.stringify(body ?? {}),
    }),
  rejectAccountRequest: (id: number, body?: { reason?: string }) =>
    request<{ ok: true; alreadyRejected?: boolean }>(`/api/platform/account-requests/${id}/reject`, {
      method: "POST",
      body: JSON.stringify(body ?? {}),
    }),
  /**
   * Transcribe un audio grabado en el navegador. Envía el blob como
   * multipart/form-data al backend que hace de proxy a OpenAI Whisper /
   * gpt-4o-transcribe. Auth requerida.
   *
   * No usamos `request<T>` porque ese helper hardcodea Content-Type
   * JSON; con FormData el browser debe poner el boundary multipart
   * correcto automáticamente y no debemos setear Content-Type a mano.
   */
  /** Novedades / anuncios in-app. Globales — todos los staff ven los
   *  mismos. El backend marca cada uno con isRead según el user actual. */
  listAnnouncements: () => request<{
    items: Array<{
      id: number;
      title: string;
      body: string;
      category: "feature" | "fix" | "note";
      imageUrl: string | null;
      publishedAt: string;
      isRead: boolean;
    }>;
    unreadCount: number;
  }>("/api/workspace/announcements"),
  markAnnouncementRead: (id: number) =>
    request<{ ok: true }>(`/api/workspace/announcements/${id}/read`, { method: "POST" }),
  transcribeVoice: async (audio: Blob, opts?: { filename?: string; signal?: AbortSignal }): Promise<{ success: true; text: string } | { success: false; error: string }> => {
    const token = getToken();
    const form = new FormData();
    form.append("audio", audio, opts?.filename ?? "dictado.webm");
    const headers: Record<string, string> = {};
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await fetch(`${API_BASE}/api/voice/transcribe`, {
      method: "POST",
      headers,
      body: form,
      signal: opts?.signal,
    });
    if (res.status === 401) clearSession();
    let body: any = null;
    try { body = await res.json(); } catch { /* noop */ }
    if (!res.ok || !body?.success) {
      return { success: false, error: body?.error ?? "No se pudo transcribir el audio." };
    }
    return { success: true, text: String(body.text ?? "") };
  },
  /** Setea/actualiza la nota clínica del psicólogo sobre el resultado del test. */
  setTestApplicationNotes: (id: string, notes: string | null) =>
    request<{ ok: true; notes: string | null }>(`/api/tests/applications/${id}/notes`, {
      method: "PATCH",
      body: JSON.stringify({ notes }),
    }),

  // Formularios personalizados del consultorio (workspace-scoped)
  createTestForm: (body: CreateFormBody) =>
    request<PsychTest>("/api/tests/forms", { method: "POST", body: JSON.stringify(body) }),
  /** Editar un formulario personalizado. Reusa el mismo body que createTestForm. */
  updateTestForm: (id: string, body: CreateFormBody) =>
    request<PsychTest>(`/api/tests/forms/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  deleteTestForm: (id: string) =>
    request<{ ok: true }>(`/api/tests/forms/${id}`, { method: "DELETE" }),

  // Solicitudes de tests al equipo Psicomorfosis (canal para tests clínicos
  // complejos que solo el equipo puede implementar de forma validada)
  listTestRequests: () => request<TestRequest[]>("/api/tests/requests"),
  createTestRequest: (body: { test_name: string; reason?: string }) =>
    request<TestRequest>("/api/tests/requests", { method: "POST", body: JSON.stringify(body) }),

  // Portal del paciente — tests
  portalTests: () => request<Array<TestApplication & { definition: PsychTestDefinition | null }>>("/api/portal/tests"),
  portalSubmitTest: (id: string, answers: AnswersMap) =>
    request<{ ok: true; score: number | null; level: string; label: string; has_critical_response: boolean }>(
      `/api/portal/tests/${id}/submit`,
      { method: "POST", body: JSON.stringify({ answers }) }
    ),
  /** Guardar respuestas parciales (pausa) — paciente. */
  portalSaveTestProgress: (id: string, answers: AnswersMap) =>
    request<{ ok: true; answered_items: number }>(`/api/portal/tests/${id}/progress`, { method: "PATCH", body: JSON.stringify({ answers }) }),

  // Portal del paciente — firma de documentos
  /** Firma guardada del paciente (data:image/...) o null. */
  portalGetMySignature: () =>
    request<{ signature_url: string | null }>("/api/portal/me/signature"),
  portalDeleteMySignature: () =>
    request<{ ok: true }>("/api/portal/me/signature", { method: "DELETE" }),
  /** Info para firmar un documento desde el portal: body, clínica, firma guardada,
   *  contexto de variables ya resuelto (paciente.nombre, clinica.razon_social, etc). */
  portalGetDocumentForSigning: (id: string) =>
    request<{
      valid: true;
      document: { id: string; name: string; type: string; kind: string; body_json: any; body_text: string | null; professional: string | null; created_at: string };
      patient: { name: string; preferred_name: string | null; doc: string | null } | null;
      clinic: { name?: string; city?: string; address?: string };
      expires_at: string;
      saved_signature_url: string | null;
      variable_context: Record<string, Record<string, string>> | null;
    }>(`/api/portal/documents/${id}/signing`),
  /** Aplica la firma del paciente desde el portal. */
  portalSignDocument: (id: string, body: { signature_data_url: string; geolocation?: { lat: number; lng: number; accuracy?: number }; save_signature?: boolean }) =>
    request<{ ok: true; signed_at: string; cert_sha256: string; cert_data: any }>(
      `/api/portal/documents/${id}/sign`,
      { method: "POST", body: JSON.stringify(body) }
    ),

  // Tasks
  listTasks: (params: Record<string, string> = {}) =>
    request<Array<Record<string, unknown>>>(`/api/tasks${qs(params)}`),

  // Documentos
  listDocuments: (params: { patient_id?: string; type?: string; status?: string; q?: string; include_archived?: boolean } = {}) =>
    request<PsmDocument[]>(`/api/documents${qs({
      patient_id: params.patient_id,
      type: params.type,
      status: params.status,
      q: params.q,
      include_archived: params.include_archived ? "true" : undefined,
    })}`),
  getDocument: (id: string) => request<PsmDocument>(`/api/documents/${id}`),
  createDocument: (body: { name: string; type?: string; patient_id?: string | null; patient_name?: string | null; template_id?: number; note_id?: number; body_json?: TipTapDoc }) =>
    request<PsmDocument>("/api/documents", { method: "POST", body: JSON.stringify(body) }),
  updateDocument: (id: string, body: Partial<PsmDocument>) =>
    request<PsmDocument>(`/api/documents/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  signDocument: (id: string) => request<PsmDocument>(`/api/documents/${id}/sign`, { method: "POST" }),
  /** Marcar/desmarcar documento como visible para el paciente en su portal. */
  setDocumentSharedWithPatient: (id: string, shared: boolean) =>
    request<PsmDocument>(`/api/documents/${id}/share`, {
      method: "PATCH",
      body: JSON.stringify({ shared }),
    }),
  archiveDocument: (id: string) => request<{ ok: true }>(`/api/documents/${id}/archive`, { method: "POST" }),
  restoreDocument: (id: string) => request<PsmDocument>(`/api/documents/${id}/restore`, { method: "POST" }),
  deleteDocument: (id: string) => request<{ ok: true }>(`/api/documents/${id}`, { method: "DELETE" }),
  /**
   * URL absoluta para abrir el archivo físico (PDF/img).
   * Por defecto incluye el token como ?t=<token> para que pueda usarse
   * directamente en <img src=...> o <iframe src=...> sin Authorization header.
   * Si se prefiere usar headers, pasar `withToken: false`.
   */
  documentFileUrl: (id: string, opts?: { download?: boolean; withToken?: boolean }) => {
    const useToken = opts?.withToken !== false;
    const params = new URLSearchParams();
    if (opts?.download) params.set("download", "1");
    if (useToken) {
      const t = getToken();
      if (t) params.set("t", t);
    }
    const qs = params.toString();
    return `${API_BASE}/api/documents/${id}/file${qs ? "?" + qs : ""}`;
  },
  /** Sube un archivo y devuelve el documento creado. */
  uploadDocument: async (file: File, meta: { name?: string; type?: string; patient_id?: string | null; patient_name?: string | null } = {}) => {
    const fd = new FormData();
    fd.append("file", file);
    if (meta.name) fd.append("name", meta.name);
    if (meta.type) fd.append("type", meta.type);
    if (meta.patient_id) fd.append("patient_id", meta.patient_id);
    if (meta.patient_name) fd.append("patient_name", meta.patient_name);
    const token = getToken();
    const res = await fetch(`${API_BASE}/api/documents/upload`, {
      method: "POST",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: fd,
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({ error: "Upload failed" }));
      throw new ApiError(res.status, body.error ?? "Upload failed");
    }
    return res.json() as Promise<PsmDocument>;
  },

  // Plantillas
  listDocumentTemplates: (params: { category?: TemplateCategory } = {}) =>
    request<DocumentTemplate[]>(`/api/documents/templates${qs({ category: params.category })}`),
  getDocumentTemplate: (id: number) => request<DocumentTemplate>(`/api/documents/templates/${id}`),
  createDocumentTemplate: (body: { name: string; description?: string; category?: TemplateCategory; body_json: TipTapDoc; scope?: "workspace" | "personal" }) =>
    request<DocumentTemplate>("/api/documents/templates", { method: "POST", body: JSON.stringify(body) }),
  updateDocumentTemplate: (id: number, body: Partial<DocumentTemplate>) =>
    request<DocumentTemplate>(`/api/documents/templates/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  cloneDocumentTemplate: (id: number) =>
    request<DocumentTemplate>(`/api/documents/templates/${id}/clone`, { method: "POST" }),
  deleteDocumentTemplate: (id: number) => request<{ ok: true }>(`/api/documents/templates/${id}`, { method: "DELETE" }),
  /** Sube .docx y crea plantilla del workspace con su contenido convertido a TipTap. */
  uploadTemplateDocx: async (file: File, meta: { name?: string; description?: string; category?: TemplateCategory } = {}) => {
    const fd = new FormData();
    fd.append("file", file);
    if (meta.name) fd.append("name", meta.name);
    if (meta.description) fd.append("description", meta.description);
    if (meta.category) fd.append("category", meta.category);
    const token = getToken();
    const res = await fetch(`${API_BASE}/api/documents/templates/from-docx`, {
      method: "POST",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: fd,
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({ error: "Upload failed" }));
      throw new ApiError(res.status, body.error ?? "Upload failed");
    }
    return res.json() as Promise<DocumentTemplate>;
  },

  // Assets inline del editor (imágenes que se pegan en el cuerpo del doc).
  // Devuelve URL pública sin token (sirve directo via /api/uploads/...).
  // Firma del paciente — link público con token
  createSignRequest: (documentId: string) =>
    request<{ token: string; url: string; expires_at: string; days_valid: number; whatsapp_text: string; patient_phone: string | null }>(
      `/api/documents/${documentId}/sign-request`, { method: "POST" }
    ),
  listSignRequests: (documentId: string) =>
    request<Array<{ id: number; token: string; expires_at: string; signed_at: string | null; signed_ip: string | null; cert_sha256: string | null; created_at: string }>>(
      `/api/documents/${documentId}/sign-requests`
    ),
  getDocumentVariables: (documentId: string) =>
    request<{
      paciente: Record<string, string>;
      profesional: Record<string, string>;
      clinica: Record<string, string>;
      fecha: Record<string, string>;
      sesion: Record<string, string>;
    }>(`/api/documents/${documentId}/variables`),
  /** Duplica un documento. Permite reasignar paciente y profesional. */
  duplicateDocument: (
    id: string,
    body?: { name?: string; patient_id?: string | null; patient_name?: string | null; professional?: string | null },
  ) =>
    request<PsmDocument>(`/api/documents/${id}/duplicate`, {
      method: "POST",
      body: JSON.stringify(body ?? {}),
    }),
  /** Descarga el PDF del documento. Devuelve el Blob — el caller arma el download anchor. */
  downloadDocumentPdf: async (documentId: string): Promise<Blob> => {
    const token = localStorage.getItem("psm.token");
    const r = await fetch(`${API_BASE}/api/documents/${documentId}/pdf`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!r.ok) {
      const body = await r.json().catch(() => ({}));
      throw new ApiError(r.status, (body as any).error ?? "No se pudo generar el PDF");
    }
    return r.blob();
  },
  // Endpoints públicos del paciente firmando — sin auth
  validateSignToken: (token: string) =>
    fetch(`${API_BASE}/api/documents/sign/${token}`).then(async (r) => {
      const body = await r.json().catch(() => ({}));
      if (!r.ok) throw new ApiError(r.status, (body as any).error ?? "Error");
      return body as {
        valid: boolean;
        document: { id: string; name: string; type: string; kind: string; body_json: TipTapDoc | null; body_text: string | null; professional: string | null; created_at: string };
        patient: { name: string; preferred_name: string | null } | null;
        clinic: { name: string | null; city: string | null; address: string | null };
        expires_at: string;
      };
    }),
  submitSignature: (token: string, body: { signature_data_url: string; geolocation?: { lat: number; lng: number; accuracy?: number } }) =>
    fetch(`${API_BASE}/api/documents/sign/${token}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).then(async (r) => {
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new ApiError(r.status, (data as any).error ?? "Error");
      return data as { ok: true; signed_at: string; cert_sha256: string; cert_data: any };
    }),

  uploadDocumentAsset: async (file: File, document_id?: string) => {
    const fd = new FormData();
    fd.append("file", file);
    if (document_id) fd.append("document_id", document_id);
    const token = getToken();
    const res = await fetch(`${API_BASE}/api/documents/assets`, {
      method: "POST",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: fd,
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({ error: "Upload failed" }));
      throw new ApiError(res.status, body.error ?? "Upload failed");
    }
    return res.json() as Promise<{ id: number; public_url: string; mime: string; size_bytes: number }>;
  },

  // Recibos (internamente "invoices" por compat de schema)
  listInvoices: (params: Record<string, string> = {}) => request<Invoice[]>(`/api/invoices${qs(params)}`),
  getInvoice: (id: string) => request<Invoice>(`/api/invoices/${id}`),
  createInvoice: (body: Partial<Invoice>) =>
    request<Invoice>("/api/invoices", { method: "POST", body: JSON.stringify(body) }),
  updateInvoice: (id: string, body: Partial<Invoice>) =>
    request<Invoice>(`/api/invoices/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  deleteInvoice: (id: string) =>
    request<void>(`/api/invoices/${id}`, { method: "DELETE" }),
  invoicesSummary: () => request<{ paid: number; pending: number; overdue: number; total: number; paid_count: number; avg_ticket: number }>("/api/invoices/summary"),
  /** Genera un PDF de muestra con los settings dados (sin persistir). Devuelve Blob. */
  previewReceiptPdf: async (params: {
    showLogo: boolean;
    showName: boolean;
    orientation: string;
    brandColor: string;
  }): Promise<Blob> => {
    const token = localStorage.getItem("psm.token");
    const qs = new URLSearchParams({
      show_logo: params.showLogo ? "1" : "0",
      show_name: params.showName ? "1" : "0",
      orientation: params.orientation,
      brand_color: params.brandColor,
    });
    const r = await fetch(`${API_BASE}/api/invoices/preview-pdf?${qs}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!r.ok) {
      const body = await r.json().catch(() => ({}));
      throw new ApiError(r.status, (body as any).error ?? "No se pudo generar el preview");
    }
    return r.blob();
  },
  /** Descarga el PDF del recibo. */
  downloadInvoicePdf: async (id: string): Promise<Blob> => {
    const token = localStorage.getItem("psm.token");
    const r = await fetch(`${API_BASE}/api/invoices/${id}/pdf`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!r.ok) {
      const body = await r.json().catch(() => ({}));
      throw new ApiError(r.status, (body as any).error ?? "No se pudo generar el PDF");
    }
    return r.blob();
  },
  /**
   * Genera y descarga un certificado de atención agregando todos los recibos
   * pagados del paciente en el rango. Útil para EPS / declaración de renta.
   */
  downloadCertificatePdf: async (params: { patient_id: string; from?: string; to?: string }): Promise<Blob> => {
    const token = localStorage.getItem("psm.token");
    const qsObj: Record<string, string> = { patient_id: params.patient_id };
    if (params.from) qsObj.from = params.from;
    if (params.to) qsObj.to = params.to;
    const r = await fetch(`${API_BASE}/api/invoices/certificate?${new URLSearchParams(qsObj)}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!r.ok) {
      const body = await r.json().catch(() => ({}));
      throw new ApiError(r.status, (body as any).error ?? "No se pudo generar el certificado");
    }
    return r.blob();
  },

  // Notifications
  // Las notificaciones se calculan dinámicamente en el backend desde
  // la data real (citas próximas, tests, tareas vencidas, documentos
  // firmados…). El campo `read` siempre es false con este modelo:
  // si el evento ya no aplica, la notificación desaparece sola.
  listNotifications: () => request<Array<{
    id: string;
    type: "cita" | "mensaje" | "tarea" | "test" | "alerta" | "documento" | "entrega";
    title: string;
    description: string;
    at: string;
    read: boolean;
    urgent?: boolean;
  }>>("/api/notifications"),
  /** Descarta una notificación. Persistente — no vuelve a aparecer. */
  dismissNotification: (id: string) =>
    request<{ ok: true }>(`/api/notifications/${encodeURIComponent(id)}/dismiss`, { method: "POST" }),
  /** Descarta todas las notificaciones visibles del usuario actual. */
  markAllNotificationsRead: () =>
    request<{ ok: true; dismissed: number }>("/api/notifications/mark-all-read", { method: "POST" }),

  // Settings
  getSettings: () => request<Record<string, string>>("/api/settings"),
  updateSettings: (body: Record<string, string>) => request("/api/settings", { method: "PUT", body: JSON.stringify(body) }),
  /** Sube el logo de recibos como data URL (PNG/JPG/WebP/SVG ≤ 1MB). */
  uploadReceiptLogo: (dataUrl: string | null) =>
    request<{ ok: boolean; receipt_logo_url: string | null }>(
      "/api/workspace/receipt-logo",
      { method: "PUT", body: JSON.stringify(dataUrl ? { dataUrl } : { clear: true }) },
    ),

  // Tareas (organización interna del equipo) — distinto de tasks (terapéuticas)
  listTareas: (params: { include?: ("archived" | "deleted")[] } = {}) => {
    const q = params.include?.length ? `?include=${params.include.join(",")}` : "";
    return request<Tarea[]>(`/api/tareas${q}`);
  },
  getTarea: (id: number) => request<Tarea>(`/api/tareas/${id}`),
  createTarea: (body: Partial<Tarea>) =>
    request<Tarea>("/api/tareas", { method: "POST", body: JSON.stringify(body) }),
  updateTarea: (id: number, body: Partial<Tarea>) =>
    request<Tarea>(`/api/tareas/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  deleteTarea: (id: number) => request<void>(`/api/tareas/${id}`, { method: "DELETE" }),
  restoreTarea: (id: number) => request<Tarea>(`/api/tareas/${id}/restore`, { method: "POST" }),
  archiveTarea: (id: number) => request<void>(`/api/tareas/${id}/archive`, { method: "POST" }),
  moveTarea: (id: number, status: TareaStatus, position: number) =>
    request<Tarea>(`/api/tareas/${id}/move`, { method: "POST", body: JSON.stringify({ status, position }) }),
  duplicateTarea: (id: number) => request<Tarea>(`/api/tareas/${id}/duplicate`, { method: "POST" }),

  // Comentarios
  addTareaComment: (taskId: number, text: string) =>
    request<TareaComment>(`/api/tareas/${taskId}/comments`, { method: "POST", body: JSON.stringify({ text }) }),
  deleteTareaComment: (taskId: number, commentId: number) =>
    request<void>(`/api/tareas/${taskId}/comments/${commentId}`, { method: "DELETE" }),

  // Checklist
  addTareaChecklistItem: (taskId: number, text: string) =>
    request<TareaChecklistItem>(`/api/tareas/${taskId}/checklist`, { method: "POST", body: JSON.stringify({ text }) }),
  updateTareaChecklistItem: (taskId: number, itemId: number, body: Partial<TareaChecklistItem>) =>
    request<TareaChecklistItem>(`/api/tareas/${taskId}/checklist/${itemId}`, { method: "PATCH", body: JSON.stringify(body) }),
  deleteTareaChecklistItem: (taskId: number, itemId: number) =>
    request<void>(`/api/tareas/${taskId}/checklist/${itemId}`, { method: "DELETE" }),

  // Pomodoro
  recordTareaPomodoro: (taskId: number, body: Omit<TareaPomodoroSession, "id" | "task_id" | "user_id">) =>
    request<TareaPomodoroSession>(`/api/tareas/${taskId}/pomodoro`, { method: "POST", body: JSON.stringify(body) }),

  // Proyectos / columnas / carpetas
  listTareaProjects: () => request<TareaProject[]>("/api/tareas/projects"),
  createTareaProject: (body: Partial<TareaProject>) =>
    request<TareaProject>("/api/tareas/projects", { method: "POST", body: JSON.stringify(body) }),
  updateTareaProject: (id: number, body: Partial<TareaProject>) =>
    request<TareaProject>(`/api/tareas/projects/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  deleteTareaProject: (id: number) => request<void>(`/api/tareas/projects/${id}`, { method: "DELETE" }),
  reorderTareaProjects: (ordered_ids: number[]) =>
    request<void>("/api/tareas/projects/reorder", { method: "POST", body: JSON.stringify({ ordered_ids }) }),

  listTareaColumns: () => request<TareaColumn[]>("/api/tareas/columns"),
  listTareaFolders: () => request<TareaFolder[]>("/api/tareas/folders"),

  // Clinical notes (historia clínica editable)
  listNotes: (patientId: string, params: { kind?: NoteKind; include_superseded?: boolean } = {}) =>
    request<ClinicalNote[]>(
      `/api/patients/${patientId}/notes${qs({ kind: params.kind, include_superseded: params.include_superseded ? "true" : undefined })}`
    ),
  createNote: (patientId: string, body: { kind: NoteKind; content: string; diagnosticSystem?: DiagnosticSystem | null }) =>
    request<ClinicalNote>(`/api/patients/${patientId}/notes`, { method: "POST", body: JSON.stringify(body) }),
  updateNote: (id: number, body: { content?: string; diagnosticSystem?: DiagnosticSystem | null }) =>
    request<ClinicalNote>(`/api/notes/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  signNote: (id: number) => request<ClinicalNote>(`/api/notes/${id}/sign`, { method: "POST" }),
  supersedeNote: (id: number, body: { content: string; sign?: boolean; diagnosticSystem?: DiagnosticSystem | null }) =>
    request<ClinicalNote>(`/api/notes/${id}/supersede`, { method: "POST", body: JSON.stringify(body) }),
  deleteNote: (id: number) => request<{ ok: true }>(`/api/notes/${id}`, { method: "DELETE" }),

  // ─── Diagnósticos clínicos estructurados ───────────────────────────────
  /** Devuelve el catálogo curado. Si pasa system, filtra entradas con
   *  código en ese sistema; sin filtro, devuelve con códigos paralelos. */
  getDiagnosisCatalog: (system?: DiagnosticSystem) =>
    request<DiagnosisCatalog>(
      `/api/diagnoses/catalog${system ? `?system=${encodeURIComponent(system)}` : ""}`,
    ),
  /** Búsqueda LIVE en la API CIE-11 de la OMS. Se usa como fallback
   *  cuando el catálogo local curado no devuelve resultados suficientes.
   *  Si el server no tiene ICD_CLIENT_ID/SECRET configurados, responde
   *  503 — la UI debe mostrar mensaje "búsqueda live no disponible" y
   *  seguir funcionando con el catálogo local. */
  searchIcd11: (query: string, limit = 10) =>
    request<{ results: Array<{ code: string; name: string; chapter?: string; isLeaf?: boolean; id: string | null }> }>(
      `/api/diagnoses/icd/search?q=${encodeURIComponent(query)}&limit=${limit}`,
    ),
  listPatientDiagnoses: (patientId: string) =>
    request<ClinicalDiagnosis[]>(`/api/patients/${patientId}/diagnoses`),
  addPatientDiagnosis: (patientId: string, body: {
    code: string;
    system: DiagnosticSystem;
    name: string;
    catalogId?: string | null;
    isPrimary?: boolean;
    note?: string | null;
  }) =>
    request<ClinicalDiagnosis>(`/api/patients/${patientId}/diagnoses`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  updateDiagnosis: (id: number, body: {
    isPrimary?: boolean;
    note?: string | null;
    name?: string;
    code?: string;
  }) =>
    request<ClinicalDiagnosis>(`/api/diagnoses/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  archiveDiagnosis: (id: number) =>
    request<{ ok: true }>(`/api/diagnoses/${id}`, { method: "DELETE" }),

  // ─── Plataforma (solo platform admins) ────────────────────────────────
  platformListWorkspaces: () =>
    request<PlatformWorkspace[]>(`/api/platform/workspaces`),
  platformGetWorkspace: (id: number) =>
    request<PlatformWorkspaceDetail>(`/api/platform/workspaces/${id}`),
  /**
   * Editar metadata del workspace desde el panel admin (nombre, modo,
   * especialidades, capacidad máxima). El psicólogo también puede
   * editar estos campos desde /configuracion; este endpoint sirve para
   * cuando el admin necesita corregir algo o configurar por ellos.
   */
  platformUpdateWorkspace: (id: number, body: {
    name?: string;
    mode?: WorkspaceMode;
    specialties?: string[] | null;
    max_patients?: number | null;
  }) =>
    request<{ ok: boolean }>(`/api/platform/workspaces/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  platformDisableWorkspace: (id: number, reason?: string) =>
    request<{ ok: boolean }>(`/api/platform/workspaces/${id}/disable`, {
      method: "POST",
      body: JSON.stringify({ reason: reason ?? null }),
    }),
  platformEnableWorkspace: (id: number) =>
    request<{ ok: boolean }>(`/api/platform/workspaces/${id}/enable`, { method: "POST" }),
  // Novedades / anuncios — admin de plataforma.
  platformListAnnouncements: () => request<{
    items: Array<{
      id: number;
      title: string;
      body: string;
      category: "feature" | "fix" | "note";
      active: boolean;
      imageUrl: string | null;
      publishedAt: string;
      readCount: number;
    }>;
  }>("/api/platform/announcements"),
  platformCreateAnnouncement: (body: { title: string; body: string; category: "feature" | "fix" | "note"; active?: boolean; imageUrl?: string | null }) =>
    request<{ ok: true; id: number }>("/api/platform/announcements", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  platformUpdateAnnouncement: (id: number, patch: Partial<{ title: string; body: string; category: "feature" | "fix" | "note"; active: boolean; imageUrl: string | null }>) =>
    request<{ ok: true }>(`/api/platform/announcements/${id}`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    }),
  platformDeleteAnnouncement: (id: number) =>
    request<{ ok: true }>(`/api/platform/announcements/${id}`, { method: "DELETE" }),
  /** Sube una imagen para anuncio. Multipart con field "image". */
  platformUploadAnnouncementImage: async (file: File): Promise<{ ok: true; url: string }> => {
    const token = getToken();
    const form = new FormData();
    form.append("image", file);
    const headers: Record<string, string> = {};
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await fetch(`${API_BASE}/api/platform/announcements/upload-image`, {
      method: "POST",
      headers,
      body: form,
    });
    if (res.status === 401) clearSession();
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body?.error ?? "No se pudo subir la imagen");
    return body;
  },
  platformDeleteWorkspace: (id: number, confirmName: string) =>
    request<{ ok: boolean }>(`/api/platform/workspaces/${id}`, {
      method: "DELETE",
      body: JSON.stringify({ confirm_name: confirmName }),
    }),
  platformResetUserPassword: (userId: number, newPassword: string) =>
    request<{ ok: boolean; username: string; name: string }>(
      `/api/platform/users/${userId}/reset-password`,
      { method: "POST", body: JSON.stringify({ new_password: newPassword }) },
    ),
  /** Platform admin actualiza username, email y/o nombre de un staff user. */
  platformUpdateUser: (userId: number, body: { username?: string; email?: string; name?: string }) =>
    request<{ ok: boolean; user?: { id: number; username: string; email: string | null; name: string; role: string } }>(
      `/api/platform/users/${userId}`,
      { method: "PATCH", body: JSON.stringify(body) },
    ),
  platformCreateWorkspace: (body: {
    workspaceName: string;
    mode?: "individual" | "organization";
    ownerName: string;
    ownerEmail: string;
    username?: string;
    password: string;
    professionalTitle?: string;
    professionalPhone?: string;
    professionalApproach?: string;
  }) =>
    request<{ workspaceId: number; userId: number; professionalId: number; username: string }>(
      `/api/platform/workspaces`,
      { method: "POST", body: JSON.stringify(body) },
    ),
  /** Suma un usuario a un workspace existente. Usado para sumar otra
   *  asesor legal al workspace legal compartido, u otra psicóloga a
   *  un workspace de clínica. */
  platformAddWorkspaceUser: (workspaceId: number, body: {
    name: string;
    email: string;
    username?: string;
    password: string;
    isLegalAdmin?: boolean;
    professionalTitle?: string;
    professionalPhone?: string;
    professionalApproach?: string;
  }) =>
    request<{ workspaceId: number; userId: number; professionalId: number | null; username: string; role: string }>(
      `/api/platform/workspaces/${workspaceId}/users`,
      { method: "POST", body: JSON.stringify(body) },
    ),
  platformGetUsage: () => request<PlatformUsage>(`/api/platform/usage`),

  // ─── Error reports (admin only) ──────────────────────────────────────
  platformListErrorReports: (status: "open" | "resolved" | "all" = "open") =>
    request<{
      items: Array<{
        id: number;
        kind: "manual" | "auto";
        url: string | null;
        message: string | null;
        user_description: string | null;
        user_agent: string | null;
        status: "open" | "resolved";
        created_at: string;
        resolved_at: string | null;
        user_role: string | null;
        user_name: string | null;
        workspace_name: string | null;
        resolved_by_name: string | null;
        attachments_count: number;
      }>;
      counts: { open_count: number; resolved_count: number; total_count: number };
    }>(`/api/platform/error-reports?status=${status}`),

  platformGetErrorReport: (id: number) =>
    request<{
      id: number;
      kind: string;
      url: string | null;
      message: string | null;
      stack: string | null;
      user_description: string | null;
      user_agent: string | null;
      status: string;
      created_at: string;
      resolved_at: string | null;
      user_role: string | null;
      user_name: string | null;
      workspace_name: string | null;
      resolved_by_name: string | null;
      attachments: Array<{
        id: number;
        url: string;
        mime: string | null;
        size: number | null;
        original_name: string | null;
        created_at: string;
      }>;
    }>(`/api/platform/error-reports/${id}`),

  platformResolveErrorReport: (id: number, status: "open" | "resolved") =>
    request<{ ok: boolean }>(`/api/platform/error-reports/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    }),

  // ─── Test requests (platform admin: ve todos los workspaces) ─────────
  platformListTestRequests: (status: "open" | "closed" | "all" = "open") =>
    request<Array<{
      id: number;
      workspace_id: number;
      workspace_name: string | null;
      test_name: string;
      reason: string | null;
      status: "open" | "closed";
      created_at: string;
      requester_name: string | null;
      requested_by: number | null;
      requester_email: string | null;
    }>>(`/api/platform/test-requests?status=${status}`),
  platformResolveTestRequest: (id: number, status: "open" | "closed") =>
    request<{ ok: boolean }>(`/api/platform/test-requests/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    }),
  /** Crea una tarea en /tareas del platform admin con la info de la
   *  solicitud (status TODO) y cierra la solicitud. Devuelve el id de
   *  la tarea creada para que el frontend pueda hacer deeplink. */
  platformTestRequestToTask: (id: number) =>
    request<{ ok: true; task_id: number }>(`/api/platform/test-requests/${id}/to-task`, {
      method: "POST",
    }),

  // ─── Wallet de cuentas bancarias ────────────────────────────────────
  listBankAccounts: (params: { includeArchived?: boolean } = {}) =>
    request<BankAccount[]>(
      `/api/bank-accounts${qs({ includeArchived: params.includeArchived ? "true" : null })}`,
    ),
  createBankAccount: (input: BankAccountInput) =>
    request<BankAccount>("/api/bank-accounts", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  updateBankAccount: (id: number, input: Partial<BankAccountInput>) =>
    request<BankAccount>(`/api/bank-accounts/${id}`, {
      method: "PATCH",
      body: JSON.stringify(input),
    }),
  deleteBankAccount: (id: number) =>
    request<{ ok: true; alreadyArchived?: boolean }>(`/api/bank-accounts/${id}`, {
      method: "DELETE",
    }),

  // ─── Legal: lectura pública (sin auth) ──────────────────────────────
  legalGetPublic: (slug: string) =>
    request<{
      slug: string;
      title: string;
      description: string | null;
      versionLabel: string;
      bodyHtml: string;
      publishedAt: string;
      summaryOfChanges: string | null;
      hasPreviousVersion: boolean;
    }>(`/api/legal/public/${slug}`),
  legalListPublic: () =>
    request<Array<{
      slug: string;
      title: string;
      description: string | null;
      publicPath: string | null;
      versionLabel: string | null;
      publishedAt: string | null;
    }>>("/api/legal/public"),

  // ─── Legal: usuario autenticado ─────────────────────────────────────
  legalMyPending: () =>
    request<{
      pending: Array<{
        documentId: number;
        slug: string;
        title: string;
        description: string | null;
        versionId: number;
        versionLabel: string;
        bodyHtml: string;
        publishedAt: string;
        summaryOfChanges: string | null;
      }>;
    }>("/api/legal/me/pending"),
  legalAccept: (versionId: number) =>
    request<{ accepted: true; acceptanceId: number; alreadyAccepted?: boolean }>(
      "/api/legal/me/accept",
      { method: "POST", body: JSON.stringify({ versionId }) },
    ),

  // ─── Legal admin (María Rivera) ─────────────────────────────────────
  legalAdminListDocuments: () =>
    request<Array<{
      id: number;
      slug: string;
      title: string;
      description: string | null;
      publicPath: string | null;
      requiresAcceptance: boolean;
      acceptanceAudience: "staff" | "patient" | "both" | "none";
      createdAt: string;
      latestPublished: { id: number; version_label: string; published_at: string } | null;
      pendingDraft: { id: number; version_label: string; created_at: string; summary_of_changes: string | null } | null;
      acceptancesCount: number;
    }>>("/api/legal/admin/documents"),
  legalAdminGetDocument: (slug: string) =>
    request<{
      id: number;
      slug: string;
      title: string;
      description: string | null;
      publicPath: string | null;
      requiresAcceptance: boolean;
      acceptanceAudience: "staff" | "patient" | "both" | "none";
      acceptancesCount: number;
      versions: Array<{
        id: number;
        version_label: string;
        status: "draft" | "published" | "archived";
        summary_of_changes: string | null;
        created_at: string;
        published_at: string | null;
        created_by_name: string | null;
        published_by_name: string | null;
      }>;
    }>(`/api/legal/admin/documents/${slug}`),
  legalAdminGetVersion: (id: number) =>
    request<{
      id: number;
      documentId: number;
      documentSlug: string;
      documentTitle: string;
      versionLabel: string;
      bodyHtml: string;
      summaryOfChanges: string | null;
      status: "draft" | "published" | "archived";
      createdAt: string;
      publishedAt: string | null;
      lastModifiedBy: { id: number; name: string } | null;
      lastModifiedAt: string | null;
      activeEditors: Array<{ userId: number; name: string; lastSeenAt: string }>;
    }>(`/api/legal/admin/versions/${id}`),
  /**
   * Marca al usuario como "editando ahora" en la versión indicada.
   * El frontend debe llamarlo cada ~30s mientras el editor está
   * abierto. Devuelve la lista actualizada de otros editores
   * activos (excluyendo al que llama).
   */
  legalAdminHeartbeat: (versionId: number) =>
    request<{
      activeEditors: Array<{ userId: number; name: string; lastSeenAt: string }>;
    }>(`/api/legal/admin/versions/${versionId}/heartbeat`, {
      method: "POST",
    }),
  legalAdminCreateDraft: (slug: string) =>
    request<{ versionId: number; created: boolean }>(
      `/api/legal/admin/documents/${slug}/draft`,
      { method: "POST" },
    ),
  /**
   * Restablece el documento a su plantilla inicial: borra TODAS las
   * versiones (draft, published, archived) + aceptaciones, y deja una
   * draft v1 con el body original del catálogo. Operación destructiva.
   */
  legalAdminResetDocument: (slug: string) =>
    request<{ versionId: number; reset: true }>(
      `/api/legal/admin/documents/${slug}/reset`,
      { method: "POST" },
    ),
  legalAdminUpdateVersion: (
    id: number,
    input: { bodyHtml?: string; summaryOfChanges?: string },
  ) =>
    request<{ ok: true }>(`/api/legal/admin/versions/${id}`, {
      method: "PATCH",
      body: JSON.stringify(input),
    }),
  legalAdminPublishVersion: (id: number) =>
    request<{ ok: true; publishedAt: string }>(`/api/legal/admin/versions/${id}/publish`, {
      method: "POST",
    }),
  legalAdminDeleteVersion: (id: number) =>
    request<{ ok: true; acceptancesRemoved: number }>(
      `/api/legal/admin/versions/${id}`,
      { method: "DELETE" },
    ),
  legalAdminListAcceptances: (params: { slug?: string; limit?: number; offset?: number } = {}) =>
    request<{
      rows: Array<{
        id: number;
        accepted_at: string;
        ip: string | null;
        user_agent: string | null;
        user_id: number | null;
        patient_id: string | null;
        user_name: string | null;
        user_email: string | null;
        patient_name: string | null;
        document_slug: string;
        document_title: string;
        version_label: string;
      }>;
      total: number;
      limit: number;
      offset: number;
    }>(`/api/legal/admin/acceptances${qs({
      slug: params.slug ?? null,
      limit: params.limit ?? null,
      offset: params.offset ?? null,
    })}`),

  // ─── Laura (IA) ────────────────────────────────────────────────────
  lauraHealth: () =>
    request<{ ok: boolean; status?: number; latencyMs?: number; error?: string; model: string }>(
      "/api/laura/health",
    ),
  lauraUsage: () =>
    request<{ date: string; messages_today: number; tokens_in_today: number; tokens_out_today: number }>(
      "/api/laura/usage",
    ),
  lauraListConversations: (params?: { limit?: number }) =>
    request<{
      items: Array<{
        id: number;
        title: string | null;
        patient_id: string | null;
        patient_name: string | null;
        patient_preferred: string | null;
        created_at: string;
        updated_at: string;
        message_count: number;
      }>;
    }>(`/api/laura/conversations${qs({ limit: params?.limit ?? null })}`),
  lauraGetConversation: (id: number) =>
    request<{
      conversation: {
        id: number;
        title: string | null;
        patient_id: string | null;
        patient_name: string | null;
        patient_preferred: string | null;
        created_at: string;
        updated_at: string;
      };
      messages: Array<{
        id: number;
        role: "user" | "assistant";
        content: string;
        model: string | null;
        tokens_in: number | null;
        tokens_out: number | null;
        error: string | null;
        created_at: string;
      }>;
    }>(`/api/laura/conversations/${id}`),
  lauraDeleteConversation: (id: number) =>
    request<{ ok: true }>(`/api/laura/conversations/${id}`, { method: "DELETE" }),

  /**
   * Stream de chat de Laura. SSE manual con fetch + ReadableStream
   * (no EventSource para poder mandar headers de auth y un body POST).
   *
   * `onEvent` recibe cada chunk parseado del backend:
   *   { type: "conversation_id", id }
   *   { type: "delta", text }
   *   { type: "error", code, message }
   *   { type: "done", usage, conversation_id }
   *
   * Devuelve una promesa que resuelve cuando el server cierra el
   * stream. El caller puede pasar AbortSignal para cancelar a
   * mitad del stream (cierra la conexión).
   */
  lauraChatStream: async (
    body: {
      conversation_id?: number | null;
      patient_id?: string | null;
      current_path?: string | null;
      message: string;
    },
    onEvent: (ev: LauraStreamEvent) => void,
    signal?: AbortSignal,
  ): Promise<void> => {
    const token = getToken();
    const res = await fetch(`${API_BASE}/api/laura/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "text/event-stream",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
      signal,
    });
    if (!res.ok || !res.body) {
      const errBody = await res.text().catch(() => "");
      throw new ApiError(res.status, errBody || "No se pudo iniciar el stream de Laura");
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      // SSE: eventos separados por "\n\n", cada línea con prefijo "data: ".
      let idx;
      while ((idx = buffer.indexOf("\n\n")) >= 0) {
        const chunk = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 2);
        for (const line of chunk.split("\n")) {
          if (!line.startsWith("data:")) continue;
          const payload = line.slice(5).trim();
          if (!payload) continue;
          try {
            onEvent(JSON.parse(payload) as LauraStreamEvent);
          } catch {
            // chunk malformado — ignoramos pero no abortamos
          }
        }
      }
    }
  },
};

export type LauraStreamEvent =
  | { type: "conversation_id"; id: number }
  | { type: "delta"; text: string }
  | { type: "error"; code?: string; message: string }
  | { type: "done"; usage?: { input_tokens: number; output_tokens: number; stop_reason: string | null }; conversation_id?: number };
