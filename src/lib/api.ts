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
