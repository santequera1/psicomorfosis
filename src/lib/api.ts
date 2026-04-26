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
  workspaceId: number;
  workspaceName: string;
  workspaceMode: WorkspaceMode;
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
  tags?: string[];
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

  // Workspace
  getWorkspace: () => request<Workspace>("/api/workspace"),
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
  restorePatient: (id: string) => request<ApiPatient>(`/api/patients/${id}/restore`, { method: "POST" }),

  // Appointments
  listAppointments: (params: Record<string, string | number | undefined> = {}) =>
    request<Array<Record<string, any>>>(`/api/appointments${qs(params)}`),
  createAppointment: (body: Record<string, unknown>) =>
    request("/api/appointments", { method: "POST", body: JSON.stringify(body) }),

  // Tests
  listTestCatalog: () => request<Array<Record<string, unknown>>>("/api/tests/catalog"),
  listTestApplications: (params: Record<string, string> = {}) =>
    request<Array<Record<string, unknown>>>(`/api/tests/applications${qs(params)}`),

  // Tasks
  listTasks: (params: Record<string, string> = {}) =>
    request<Array<Record<string, unknown>>>(`/api/tasks${qs(params)}`),

  // Documents
  listDocuments: (params: Record<string, string> = {}) =>
    request<Array<Record<string, unknown>>>(`/api/documents${qs(params)}`),
  signDocument: (id: string) => request(`/api/documents/${id}/sign`, { method: "POST" }),

  // Invoices
  listInvoices: (params: Record<string, string> = {}) => request<Invoice[]>(`/api/invoices${qs(params)}`),
  createInvoice: (body: Partial<Invoice>) =>
    request<Invoice>("/api/invoices", { method: "POST", body: JSON.stringify(body) }),
  updateInvoice: (id: string, body: Partial<Invoice>) =>
    request<Invoice>(`/api/invoices/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  invoicesSummary: () => request<{ paid: number; pending: number; overdue: number; total: number }>("/api/invoices/summary"),

  // Notifications
  listNotifications: () => request<Array<Record<string, unknown>>>("/api/notifications"),

  // Settings
  getSettings: () => request<Record<string, string>>("/api/settings"),
  updateSettings: (body: Record<string, string>) => request("/api/settings", { method: "PUT", body: JSON.stringify(body) }),

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
};
