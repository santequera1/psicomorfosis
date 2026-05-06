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
  workspaceId: number;
  workspaceName: string;
  workspaceMode: WorkspaceMode;
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
  lastLoginAt: string | null;
  ownerName: string | null;
  ownerEmail: string | null;
  ownerUsername: string | null;
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
  createdAt: string;
  updatedAt: string;
  signedAt: string | null;
  supersededById: number | null;
  isDraft: boolean;
  isSuperseded: boolean;
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
  cie11: "Diagnóstico CIE-11",
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
export interface PsychTestQuestion { id: string; text: string; reverse?: boolean; scale?: PsychTestScaleOption[] }
export interface PsychTestRange { min: number; max: number; label: string; level: "none" | "low" | "moderate" | "high" | "critical" }
export interface PsychTestAlerts { critical_question_id?: string; critical_threshold?: number }
export interface PsychTestDefinition {
  version?: number;
  instructions?: string;
  scale?: PsychTestScaleOption[] | null;
  questions: PsychTestQuestion[];
  scoring?: { type: "sum" | "sum_reversed" | "eat26" | "millon" | "none" };
  ranges: PsychTestRange[];
  alerts?: PsychTestAlerts | null;
}
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
    scale: PsychTestScaleOption[];
    questions: Array<{ id: string; text: string; reverse?: boolean }>;
    /** "none" indica test cualitativo: no se calcula puntaje ni nivel,
     *  el psicólogo lee las respuestas y las interpreta. */
    scoring: { type: "sum" | "sum_reversed" | "none" };
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
  answers_json: Record<string, number> | null;
  alerts_json: {
    critical_response?: boolean;
    critical_question_id?: string;
    critical_value?: number;
    /** Para tests con scoring por escalas múltiples (MCMI-II): raw scores por escala. */
    scales_raw?: Record<string, number | null>;
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
        value: number | null;
        label: string | null;
      }>;
    };
  } | null;
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

export function clearSession() {
  window.localStorage.removeItem(TOKEN_KEY);
  window.localStorage.removeItem(USER_KEY);
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
  login: (username: string, password: string) =>
    request<{ token: string; user: ApiUser }>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    }),
  me: () => request<{ user: ApiUser }>("/api/auth/me"),

  // Portal del paciente — invitación + activación + login (públicos)
  invitePatient: (patientId: string) =>
    request<{ token: string; url: string; expires_at: string; days_valid: number; whatsapp_text: string }>(
      `/api/patients/${patientId}/invite`,
      { method: "POST" }
    ),
  validatePatientInvite: (token: string) =>
    request<{
      valid: boolean;
      patient: { id: string; name: string; preferred_name: string | null; email: string };
      professional: { name: string; title: string | null } | null;
      clinic: { name: string; city: string | null; address: string | null };
      expires_at: string;
    }>(`/api/patient-invite/${token}`),
  activatePatientInvite: (token: string, password: string) =>
    request<{ token: string; user: { id: number; name: string; email: string; role: "paciente"; patient_id: string; workspace_id: number } }>(
      `/api/patient-invite/${token}/activate`,
      { method: "POST", body: JSON.stringify({ password }) }
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
  portalAppointments: () => request<Array<Record<string, any>>>("/api/portal/appointments"),
  portalTasks: () => request<Array<Record<string, any>>>("/api/portal/tasks"),
  portalCompleteTask: (id: string) => request<{ ok: true }>(`/api/portal/tasks/${id}/complete`, { method: "POST" }),
  portalDocuments: () => request<Array<Record<string, any>>>("/api/portal/documents"),

  // Workspace
  getWorkspace: () => request<Workspace>("/api/workspace"),
  getDashboardStats: () => request<{
    sessionsByModality: Array<{ modality: string; value: number }>;
    reasons: Array<{ reason: string; value: number }>;
    revenue7d: Array<{ day: string; value: number }>;
  }>("/api/workspace/dashboard-stats"),
  getReportsStats: () => request<{
    sessionsByModality: Array<{ modality: string; value: number }>;
    reasons: Array<{ reason: string; value: number }>;
    revenue7d: Array<{ day: string; value: number }>;
    retention: Array<{ mes: string; nuevos: number; retenidos: number; alta: number }>;
  }>("/api/workspace/reports-stats"),
  /** Firma del profesional vinculado al usuario actual. */
  getMySignature: () => request<{ professional_id: number; name: string; tarjeta_profesional: string | null; signature_url: string | null }>("/api/workspace/me/signature"),
  setMySignature: (dataUrl: string) =>
    request<{ ok: true; signature_url: string }>("/api/workspace/me/signature", { method: "PUT", body: JSON.stringify({ dataUrl }) }),
  clearMySignature: () =>
    request<{ ok: true; signature_url: null }>("/api/workspace/me/signature", { method: "PUT", body: JSON.stringify({ clear: true }) }),
  updateWorkspace: (body: { name?: string; mode?: WorkspaceMode }) =>
    request<{ id: number; name: string; mode: WorkspaceMode }>("/api/workspace", { method: "PATCH", body: JSON.stringify(body) }),

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
  createAppointment: (body: Record<string, unknown>) =>
    request("/api/appointments", { method: "POST", body: JSON.stringify(body) }),
  updateAppointment: (id: number | string, body: Record<string, unknown>) =>
    request<Record<string, any>>(`/api/appointments/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  deleteAppointment: (id: number | string) =>
    request<void>(`/api/appointments/${id}`, { method: "DELETE" }),

  // Tests psicométricos — catálogo y aplicaciones
  listTestCatalog: () => request<Array<PsychTest>>("/api/tests/catalog"),
  getTestCatalog: (id: string) => request<PsychTest>(`/api/tests/catalog/${id}`),
  listTestApplications: (params: { patient_id?: string; status?: string; test_code?: string } = {}) =>
    request<TestApplication[]>(`/api/tests/applications${qs(params)}`),
  getTestApplication: (id: string) => request<TestApplication>(`/api/tests/applications/${id}`),
  /** Crear aplicación con respuestas (staff aplicó test en sesión). */
  createTestApplication: (body: { test_id: string; patient_id?: string; patient_name?: string; answers?: Record<string, number>; applied_by?: "profesional" | "paciente" }) =>
    request<TestApplication>("/api/tests/applications", { method: "POST", body: JSON.stringify(body) }),
  /** Asignar test al paciente para autoaplicación (sin respuestas, queda pendiente). */
  assignTestToPatient: (body: { test_id: string; patient_id: string }) =>
    request<TestApplication>("/api/tests/applications", { method: "POST", body: JSON.stringify({ ...body, assign_to_patient: true }) }),
  submitTestApplication: (id: string, answers: Record<string, number>) =>
    request<TestApplication>(`/api/tests/applications/${id}/submit`, { method: "POST", body: JSON.stringify({ answers }) }),
  /** Guardar respuestas parciales (pausa) — staff. Cambia status a 'en_curso'. */
  saveTestApplicationProgress: (id: string, answers: Record<string, number>) =>
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
  deleteTestApplication: (id: string) => request<{ ok: true }>(`/api/tests/applications/${id}`, { method: "DELETE" }),

  // Formularios personalizados del consultorio (workspace-scoped)
  createTestForm: (body: CreateFormBody) =>
    request<PsychTest>("/api/tests/forms", { method: "POST", body: JSON.stringify(body) }),
  deleteTestForm: (id: string) =>
    request<{ ok: true }>(`/api/tests/forms/${id}`, { method: "DELETE" }),

  // Solicitudes de tests al equipo Psicomorfosis (canal para tests clínicos
  // complejos que solo el equipo puede implementar de forma validada)
  listTestRequests: () => request<TestRequest[]>("/api/tests/requests"),
  createTestRequest: (body: { test_name: string; reason?: string }) =>
    request<TestRequest>("/api/tests/requests", { method: "POST", body: JSON.stringify(body) }),

  // Portal del paciente — tests
  portalTests: () => request<Array<TestApplication & { definition: PsychTestDefinition | null }>>("/api/portal/tests"),
  portalSubmitTest: (id: string, answers: Record<string, number>) =>
    request<{ ok: true; score: number; level: string; label: string; has_critical_response: boolean }>(
      `/api/portal/tests/${id}/submit`,
      { method: "POST", body: JSON.stringify({ answers }) }
    ),
  /** Guardar respuestas parciales (pausa) — paciente. */
  portalSaveTestProgress: (id: string, answers: Record<string, number>) =>
    request<{ ok: true; answered_items: number }>(`/api/portal/tests/${id}/progress`, { method: "PATCH", body: JSON.stringify({ answers }) }),

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
  invoicesSummary: () => request<{ paid: number; pending: number; overdue: number; total: number }>("/api/invoices/summary"),
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
  listNotifications: () => request<Array<Record<string, unknown>>>("/api/notifications"),

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
  createNote: (patientId: string, body: { kind: NoteKind; content: string }) =>
    request<ClinicalNote>(`/api/patients/${patientId}/notes`, { method: "POST", body: JSON.stringify(body) }),
  updateNote: (id: number, body: { content: string }) =>
    request<ClinicalNote>(`/api/notes/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  signNote: (id: number) => request<ClinicalNote>(`/api/notes/${id}/sign`, { method: "POST" }),
  supersedeNote: (id: number, body: { content: string; sign?: boolean }) =>
    request<ClinicalNote>(`/api/notes/${id}/supersede`, { method: "POST", body: JSON.stringify(body) }),
  deleteNote: (id: number) => request<{ ok: true }>(`/api/notes/${id}`, { method: "DELETE" }),

  // ─── Plataforma (solo platform admins) ────────────────────────────────
  platformListWorkspaces: () =>
    request<PlatformWorkspace[]>(`/api/platform/workspaces`),
  platformGetWorkspace: (id: number) =>
    request<PlatformWorkspaceDetail>(`/api/platform/workspaces/${id}`),
  platformDisableWorkspace: (id: number, reason?: string) =>
    request<{ ok: boolean }>(`/api/platform/workspaces/${id}/disable`, {
      method: "POST",
      body: JSON.stringify({ reason: reason ?? null }),
    }),
  platformEnableWorkspace: (id: number) =>
    request<{ ok: boolean }>(`/api/platform/workspaces/${id}/enable`, { method: "POST" }),
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
  platformGetUsage: () => request<PlatformUsage>(`/api/platform/usage`),
};
