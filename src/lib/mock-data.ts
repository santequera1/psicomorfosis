// Datos mock para Psicomorfosis (clínica de salud mental)
// Todos ficticios — no representan personas reales.

export type Risk = "none" | "low" | "moderate" | "high" | "critical";
export type Modality = "individual" | "pareja" | "familiar" | "grupal" | "tele";
export type PatientStatus = "activo" | "pausa" | "alta" | "derivado";

export const SEDES = ["Sede Chapinero", "Sede Cedritos", "Telepsicología"];

export interface Patient {
  id: string;
  name: string;
  preferredName?: string;
  pronouns: string;
  doc: string;
  age: number;
  phone: string;
  email: string;
  professional: string;
  modality: Modality;
  status: PatientStatus;
  reason: string;
  lastContact: string;
  nextSession?: string;
  risk: Risk;
  tags?: string[];
}

export const PATIENTS: Patient[] = [
  { id: "P-1042", name: "María Camila Rondón", preferredName: "Cami", pronouns: "ella", doc: "CC 1.024.587.331", age: 28, phone: "+57 310 482 1290", email: "cami.rondon@correo.co", professional: "Dra. Lucía Méndez", modality: "individual", status: "activo", reason: "Ansiedad generalizada", lastContact: "Hace 2 días", nextSession: "Hoy · 10:30", risk: "low", tags: ["TCC"] },
  { id: "P-1011", name: "Andrés Felipe Galeano", pronouns: "él", doc: "CC 79.554.012", age: 41, phone: "+57 312 998 0021", email: "afgaleano@correo.co", professional: "Dr. Mateo Rivas", modality: "individual", status: "activo", reason: "Episodio depresivo mayor", lastContact: "Ayer", nextSession: "Hoy · 11:30", risk: "high", tags: ["psiquiatría"] },
  { id: "P-0987", name: "Familia Ortega-Pinilla", pronouns: "—", doc: "—", age: 0, phone: "+57 318 220 4410", email: "ortega.fam@correo.co", professional: "Mg. Sofía Quintana", modality: "familiar", status: "activo", reason: "Dinámica familiar · adolescente", lastContact: "Hace 5 días", nextSession: "Hoy · 14:00", risk: "moderate" },
  { id: "P-1098", name: "Valentina Soto Cárdenas", preferredName: "Val", pronouns: "elle", doc: "TI 1.030.998.221", age: 16, phone: "+57 301 776 8812", email: "vsoto.fam@correo.co", professional: "Dra. Lucía Méndez", modality: "individual", status: "activo", reason: "Autolesión no suicida · regulación emocional", lastContact: "Hoy", nextSession: "Mañana · 09:00", risk: "critical", tags: ["DBT", "menor"] },
  { id: "P-0876", name: "Jorge & Patricia Lemus", pronouns: "—", doc: "—", age: 0, phone: "+57 315 110 4477", email: "jpl.pareja@correo.co", professional: "Esp. Daniel Forero", modality: "pareja", status: "activo", reason: "Crisis de pareja · comunicación", lastContact: "Hace 1 semana", nextSession: "Hoy · 17:00", risk: "none" },
  { id: "P-1120", name: "Laura Restrepo Vélez", pronouns: "ella", doc: "CC 1.152.337.044", age: 34, phone: "+57 320 441 9928", email: "laura.rv@correo.co", professional: "Dr. Mateo Rivas", modality: "tele", status: "activo", reason: "Duelo complicado", lastContact: "Hace 3 días", nextSession: "Hoy · 18:00", risk: "low" },
  { id: "P-0712", name: "Camilo Esteban Ruiz", pronouns: "él", doc: "CC 80.221.554", age: 52, phone: "+57 313 668 1192", email: "ce.ruiz@correo.co", professional: "Dr. Mateo Rivas", modality: "individual", status: "pausa", reason: "Trastorno bipolar II · seguimiento", lastContact: "Hace 3 semanas", risk: "moderate", tags: ["psiquiatría"] },
  { id: "P-0998", name: "Sara Liliana Beltrán", pronouns: "ella", doc: "CC 1.014.778.092", age: 24, phone: "+57 319 002 7766", email: "s.beltran@correo.co", professional: "Mg. Sofía Quintana", modality: "individual", status: "activo", reason: "TCA · anorexia restrictiva", lastContact: "Hace 2 días", nextSession: "Mañana · 11:00", risk: "high", tags: ["interdisciplinar"] },
  { id: "P-0654", name: "Tomás Aristizábal", pronouns: "él", doc: "CC 1.085.221.001", age: 19, phone: "+57 314 998 1212", email: "tomi.a@correo.co", professional: "Esp. Daniel Forero", modality: "individual", status: "activo", reason: "Adicción a sustancias · cannabis", lastContact: "Hace 4 días", nextSession: "Jueves · 16:00", risk: "moderate" },
  { id: "P-0532", name: "Marta Inés Cifuentes", pronouns: "ella", doc: "CC 41.998.220", age: 67, phone: "+57 311 220 7788", email: "marta.cif@correo.co", professional: "Dra. Lucía Méndez", modality: "tele", status: "alta", reason: "Adaptación a jubilación", lastContact: "Hace 2 meses", risk: "none" },
];

export const TODAY_AGENDA = [
  { time: "08:00", patient: "Mariana Cruz",      professional: "Dra. Lucía Méndez", modality: "individual" as Modality, room: "Consultorio 2",  status: "atendida" },
  { time: "09:00", patient: "Iván Salgado",      professional: "Dr. Mateo Rivas",   modality: "individual" as Modality, room: "Consultorio 1",  status: "atendida" },
  { time: "10:30", patient: "María Camila R.",   professional: "Dra. Lucía Méndez", modality: "individual" as Modality, room: "Consultorio 2",  status: "en_curso" },
  { time: "11:30", patient: "Andrés F. Galeano", professional: "Dr. Mateo Rivas",   modality: "individual" as Modality, room: "Consultorio 1",  status: "confirmada", risk: "high" as Risk },
  { time: "14:00", patient: "Familia Ortega-P.", professional: "Mg. Sofía Quintana",modality: "familiar" as Modality,   room: "Sala familiar",  status: "confirmada" },
  { time: "15:30", patient: "Diego Hernández",   professional: "Esp. Daniel Forero",modality: "individual" as Modality, room: "Consultorio 3",  status: "confirmada" },
  { time: "17:00", patient: "Jorge & Patricia",  professional: "Esp. Daniel Forero",modality: "pareja" as Modality,     room: "Sala pareja",    status: "pendiente" },
  { time: "18:00", patient: "Laura Restrepo",    professional: "Dr. Mateo Rivas",   modality: "tele" as Modality,       room: "Telepsicología", status: "pendiente" },
];

export const REVENUE_7D = [
  { day: "Lun", value: 2480000 },
  { day: "Mar", value: 3120000 },
  { day: "Mié", value: 2980000 },
  { day: "Jue", value: 3640000 },
  { day: "Vie", value: 4120000 },
  { day: "Sáb", value: 1820000 },
  { day: "Dom", value: 540000 },
];

export const SESSIONS_BY_MODALITY = [
  { modality: "Individual", value: 142 },
  { modality: "Pareja",     value: 28 },
  { modality: "Familiar",   value: 19 },
  { modality: "Grupal",     value: 11 },
  { modality: "Tele",       value: 56 },
];

export const REASONS = [
  { reason: "Ansiedad",   value: 38 },
  { reason: "Depresión",  value: 31 },
  { reason: "Pareja",     value: 14 },
  { reason: "Adolescentes", value: 12 },
  { reason: "Duelo",      value: 9 },
  { reason: "TCA",        value: 6 },
  { reason: "Adicciones", value: 5 },
];

export const RISK_LABEL: Record<Risk, string> = {
  none: "Sin bandera",
  low: "Riesgo bajo",
  moderate: "Riesgo moderado",
  high: "Riesgo alto",
  critical: "Riesgo crítico",
};

// ─────────────────────────────────────────────────────────────
// Tests psicométricos
// ─────────────────────────────────────────────────────────────

export interface PsychTest {
  id: string;
  code: string;
  name: string;
  shortName: string;
  items: number;
  minutes: number;
  category: "Ansiedad" | "Depresión" | "Autoestima" | "TEPT" | "Personalidad" | "Adicciones" | "Alimentación";
  description: string;
  ageRange: string;
  scoring: { range: string; label: string; level: "none" | "low" | "moderate" | "high" | "critical" }[];
}

export const PSYCH_TESTS: PsychTest[] = [
  {
    id: "phq9", code: "PHQ-9", name: "Patient Health Questionnaire", shortName: "PHQ-9",
    items: 9, minutes: 5, category: "Depresión", ageRange: "≥ 12 años",
    description: "Tamizaje y medición de la severidad de síntomas depresivos en las últimas 2 semanas.",
    scoring: [
      { range: "0–4", label: "Mínima", level: "none" },
      { range: "5–9", label: "Leve", level: "low" },
      { range: "10–14", label: "Moderada", level: "moderate" },
      { range: "15–19", label: "Moderadamente severa", level: "high" },
      { range: "20–27", label: "Severa", level: "critical" },
    ],
  },
  {
    id: "gad7", code: "GAD-7", name: "Generalized Anxiety Disorder", shortName: "GAD-7",
    items: 7, minutes: 4, category: "Ansiedad", ageRange: "≥ 12 años",
    description: "Evalúa la severidad de síntomas de ansiedad generalizada en las últimas 2 semanas.",
    scoring: [
      { range: "0–4", label: "Mínima", level: "none" },
      { range: "5–9", label: "Leve", level: "low" },
      { range: "10–14", label: "Moderada", level: "moderate" },
      { range: "15–21", label: "Severa", level: "high" },
    ],
  },
  {
    id: "bdi2", code: "BDI-II", name: "Beck Depression Inventory", shortName: "BDI-II",
    items: 21, minutes: 10, category: "Depresión", ageRange: "≥ 13 años",
    description: "Inventario de 21 ítems para evaluar la presencia y severidad de síntomas depresivos.",
    scoring: [
      { range: "0–13", label: "Mínima", level: "none" },
      { range: "14–19", label: "Leve", level: "low" },
      { range: "20–28", label: "Moderada", level: "moderate" },
      { range: "29–63", label: "Severa", level: "high" },
    ],
  },
  {
    id: "bai", code: "BAI", name: "Beck Anxiety Inventory", shortName: "Beck Ansiedad",
    items: 21, minutes: 8, category: "Ansiedad", ageRange: "≥ 17 años",
    description: "Mide síntomas somáticos y cognitivos de ansiedad en la última semana.",
    scoring: [
      { range: "0–7", label: "Mínima", level: "none" },
      { range: "8–15", label: "Leve", level: "low" },
      { range: "16–25", label: "Moderada", level: "moderate" },
      { range: "26–63", label: "Severa", level: "high" },
    ],
  },
  {
    id: "rosenberg", code: "RSES", name: "Rosenberg Self-Esteem Scale", shortName: "Rosenberg",
    items: 10, minutes: 5, category: "Autoestima", ageRange: "≥ 14 años",
    description: "Escala unidimensional de 10 ítems para evaluar autoestima global.",
    scoring: [
      { range: "≥ 30", label: "Autoestima alta", level: "none" },
      { range: "26–29", label: "Autoestima media", level: "low" },
      { range: "< 26", label: "Autoestima baja", level: "moderate" },
    ],
  },
  {
    id: "pcl5", code: "PCL-5", name: "PTSD Checklist DSM-5", shortName: "PCL-5",
    items: 20, minutes: 10, category: "TEPT", ageRange: "≥ 18 años",
    description: "Mide presencia y severidad de síntomas de TEPT según criterios DSM-5.",
    scoring: [
      { range: "0–32", label: "Por debajo de umbral", level: "low" },
      { range: "33–80", label: "Sintomatología clínicamente significativa", level: "high" },
    ],
  },
  {
    id: "audit", code: "AUDIT", name: "Alcohol Use Disorders Identification Test", shortName: "AUDIT",
    items: 10, minutes: 5, category: "Adicciones", ageRange: "≥ 15 años",
    description: "Identifica consumo de riesgo, consumo perjudicial y dependencia de alcohol.",
    scoring: [
      { range: "0–7", label: "Consumo de bajo riesgo", level: "none" },
      { range: "8–15", label: "Consumo de riesgo", level: "low" },
      { range: "16–19", label: "Consumo perjudicial", level: "moderate" },
      { range: "≥ 20", label: "Probable dependencia", level: "high" },
    ],
  },
  {
    id: "eat26", code: "EAT-26", name: "Eating Attitudes Test", shortName: "EAT-26",
    items: 26, minutes: 8, category: "Alimentación", ageRange: "≥ 13 años",
    description: "Tamizaje para conductas y actitudes relacionadas con trastornos de alimentación.",
    scoring: [
      { range: "< 20", label: "Riesgo bajo", level: "low" },
      { range: "≥ 20", label: "Riesgo significativo", level: "high" },
    ],
  },
];

// Ítems de muestra para aplicación interactiva del PHQ-9
export const PHQ9_ITEMS = [
  "Poco interés o placer en hacer cosas",
  "Sentirse desanimado/a, deprimido/a o sin esperanza",
  "Problemas para dormir o dormir demasiado",
  "Sentirse cansado/a o con poca energía",
  "Poco apetito o comer en exceso",
  "Sentirse mal consigo mismo/a o como un fracaso",
  "Dificultad para concentrarse",
  "Moverse o hablar muy lento, o estar inquieto/a en exceso",
  "Pensamientos de que estaría mejor muerto/a o de hacerse daño",
];

export const PHQ9_OPTIONS = [
  { value: 0, label: "Nunca" },
  { value: 1, label: "Varios días" },
  { value: 2, label: "Más de la mitad de los días" },
  { value: 3, label: "Casi todos los días" },
];

export interface TestApplication {
  id: string;
  patientId: string;
  patientName: string;
  testCode: string;
  testName: string;
  date: string;
  score: number;
  interpretation: string;
  level: "none" | "low" | "moderate" | "high" | "critical";
  professional: string;
  status: "completado" | "en_curso" | "enviado";
}

export const TEST_APPLICATIONS: TestApplication[] = [
  { id: "T-2001", patientId: "P-1042", patientName: "María Camila Rondón", testCode: "GAD-7", testName: "Ansiedad generalizada", date: "2026-03-12", score: 11, interpretation: "Moderada", level: "moderate", professional: "Dra. Lucía Méndez", status: "completado" },
  { id: "T-2002", patientId: "P-1042", patientName: "María Camila Rondón", testCode: "GAD-7", testName: "Ansiedad generalizada", date: "2026-04-02", score: 8, interpretation: "Leve", level: "low", professional: "Dra. Lucía Méndez", status: "completado" },
  { id: "T-2003", patientId: "P-1011", patientName: "Andrés Felipe Galeano", testCode: "PHQ-9", testName: "Depresión", date: "2026-03-28", score: 18, interpretation: "Moderadamente severa", level: "high", professional: "Dr. Mateo Rivas", status: "completado" },
  { id: "T-2004", patientId: "P-1098", patientName: "Valentina Soto Cárdenas", testCode: "PHQ-9", testName: "Depresión", date: "2026-04-10", score: 22, interpretation: "Severa", level: "critical", professional: "Dra. Lucía Méndez", status: "completado" },
  { id: "T-2005", patientId: "P-0998", patientName: "Sara Liliana Beltrán", testCode: "EAT-26", testName: "Conductas alimentarias", date: "2026-04-14", score: 31, interpretation: "Riesgo significativo", level: "high", professional: "Mg. Sofía Quintana", status: "completado" },
  { id: "T-2006", patientId: "P-1120", patientName: "Laura Restrepo Vélez", testCode: "BDI-II", testName: "Depresión Beck", date: "2026-04-15", score: 0, interpretation: "Pendiente", level: "none", professional: "Dr. Mateo Rivas", status: "enviado" },
  { id: "T-2007", patientId: "P-0654", patientName: "Tomás Aristizábal", testCode: "AUDIT", testName: "Uso de alcohol", date: "2026-04-16", score: 0, interpretation: "En aplicación", level: "none", professional: "Esp. Daniel Forero", status: "en_curso" },
];

// Histórico de evolución para gráfico (GAD-7 de Cami)
export const TEST_EVOLUTION = [
  { date: "Ene 15", score: 15, label: "Severa" },
  { date: "Feb 05", score: 13, label: "Moderada" },
  { date: "Feb 26", score: 11, label: "Moderada" },
  { date: "Mar 12", score: 11, label: "Moderada" },
  { date: "Abr 02", score: 8, label: "Leve" },
];

// ─────────────────────────────────────────────────────────────
// Prescripción / Plan terapéutico (tareas TCC)
// ─────────────────────────────────────────────────────────────

export type TaskStatus = "asignada" | "en_progreso" | "completada" | "vencida";
export type TaskType = "registro_pensamientos" | "exposicion" | "activacion" | "reestructuracion" | "mindfulness" | "psicoeducacion" | "autoregistro";

export interface TherapyTask {
  id: string;
  patientId: string;
  patientName: string;
  title: string;
  type: TaskType;
  description: string;
  assignedAt: string;
  dueAt: string;
  status: TaskStatus;
  adherence: number; // 0–100
  professional: string;
  sessionsRemaining: number;
}

export const TCC_TEMPLATES: { id: TaskType; name: string; description: string; icon: string }[] = [
  { id: "registro_pensamientos", name: "Registro de pensamientos", description: "Situación → pensamiento automático → emoción → evidencia → pensamiento alternativo.", icon: "PenSquare" },
  { id: "exposicion", name: "Exposición gradual", description: "Jerarquía de situaciones temidas y exposiciones progresivas con SUDS.", icon: "TrendingUp" },
  { id: "activacion", name: "Activación conductual", description: "Programación de actividades agradables y de dominio con registro diario.", icon: "Sparkles" },
  { id: "reestructuracion", name: "Reestructuración cognitiva", description: "Identificación de distorsiones y construcción de pensamientos más adaptativos.", icon: "Brain" },
  { id: "mindfulness", name: "Mindfulness · 10 min/día", description: "Práctica diaria guiada de atención plena con registro de observaciones.", icon: "Leaf" },
  { id: "psicoeducacion", name: "Psicoeducación", description: "Material de lectura con preguntas de comprensión al final.", icon: "BookOpen" },
  { id: "autoregistro", name: "Autoregistro emocional", description: "Registro diario de emoción, intensidad, disparador y estrategia usada.", icon: "ClipboardList" },
];

export const THERAPY_TASKS: TherapyTask[] = [
  { id: "TK-401", patientId: "P-1042", patientName: "María Camila Rondón", title: "Jerarquía de exposición social", type: "exposicion", description: "Completar jerarquía con 8 situaciones de menor a mayor ansiedad y SUDS.", assignedAt: "2026-04-09", dueAt: "2026-04-16", status: "en_progreso", adherence: 75, professional: "Dra. Lucía Méndez", sessionsRemaining: 1 },
  { id: "TK-402", patientId: "P-1042", patientName: "María Camila Rondón", title: "Registro de pensamientos · pitch laboral", type: "registro_pensamientos", description: "3 registros completos esta semana del pensamiento 'voy a fallar'.", assignedAt: "2026-04-02", dueAt: "2026-04-09", status: "completada", adherence: 100, professional: "Dra. Lucía Méndez", sessionsRemaining: 0 },
  { id: "TK-403", patientId: "P-1011", patientName: "Andrés Felipe Galeano", title: "Activación conductual · agenda semanal", type: "activacion", description: "Programar 3 actividades diarias (placenteras + dominio).", assignedAt: "2026-04-10", dueAt: "2026-04-17", status: "en_progreso", adherence: 40, professional: "Dr. Mateo Rivas", sessionsRemaining: 1 },
  { id: "TK-404", patientId: "P-1098", patientName: "Valentina Soto Cárdenas", title: "Plan de seguridad · tarjeta de estrategias DBT", type: "autoregistro", description: "Registro diario de urgencias y estrategia de tolerancia al malestar aplicada.", assignedAt: "2026-04-11", dueAt: "2026-04-18", status: "en_progreso", adherence: 86, professional: "Dra. Lucía Méndez", sessionsRemaining: 0 },
  { id: "TK-405", patientId: "P-0998", patientName: "Sara Liliana Beltrán", title: "Comidas regulares · registro sin pesaje", type: "autoregistro", description: "5 comidas programadas al día. Registrar emoción antes/después, sin pesarse.", assignedAt: "2026-04-08", dueAt: "2026-04-15", status: "vencida", adherence: 55, professional: "Mg. Sofía Quintana", sessionsRemaining: 0 },
  { id: "TK-406", patientId: "P-1120", patientName: "Laura Restrepo Vélez", title: "Carta al ser querido · duelo", type: "psicoeducacion", description: "Leer capítulo 3 y escribir carta de despedida para la próxima sesión.", assignedAt: "2026-04-12", dueAt: "2026-04-19", status: "asignada", adherence: 0, professional: "Dr. Mateo Rivas", sessionsRemaining: 2 },
  { id: "TK-407", patientId: "P-0654", patientName: "Tomás Aristizábal", title: "Mindfulness 10 min/día · app Calm", type: "mindfulness", description: "Sesión guiada diaria. Registrar 3 observaciones en bitácora.", assignedAt: "2026-04-14", dueAt: "2026-04-21", status: "en_progreso", adherence: 60, professional: "Esp. Daniel Forero", sessionsRemaining: 1 },
];

// ─────────────────────────────────────────────────────────────
// Documentos clínicos
// ─────────────────────────────────────────────────────────────

export type DocType = "consentimiento" | "informe" | "certificado" | "remision" | "cuestionario" | "factura";
export type DocStatus = "borrador" | "pendiente_firma" | "firmado" | "enviado" | "archivado";

export interface ClinicalDoc {
  id: string;
  name: string;
  type: DocType;
  patientId?: string;
  patientName?: string;
  createdAt: string;
  updatedAt: string;
  sizeKb: number;
  status: DocStatus;
  professional: string;
  signedAt?: string;
}

export const DOCUMENTS: ClinicalDoc[] = [
  { id: "D-9001", name: "Consentimiento informado · terapia individual", type: "consentimiento", patientId: "P-1042", patientName: "María Camila Rondón", createdAt: "2025-11-04", updatedAt: "2025-11-04", sizeKb: 128, status: "firmado", professional: "Dra. Lucía Méndez", signedAt: "2025-11-04" },
  { id: "D-9002", name: "Consentimiento · grabación de sesión telepsicología", type: "consentimiento", patientId: "P-1120", patientName: "Laura Restrepo Vélez", createdAt: "2026-01-09", updatedAt: "2026-01-09", sizeKb: 110, status: "firmado", professional: "Dr. Mateo Rivas", signedAt: "2026-01-09" },
  { id: "D-9003", name: "Informe psicológico · evaluación inicial", type: "informe", patientId: "P-1098", patientName: "Valentina Soto Cárdenas", createdAt: "2025-09-18", updatedAt: "2026-01-20", sizeKb: 684, status: "firmado", professional: "Dra. Lucía Méndez", signedAt: "2025-09-22" },
  { id: "D-9004", name: "Remisión a psiquiatría · evaluación farmacológica", type: "remision", patientId: "P-1011", patientName: "Andrés Felipe Galeano", createdAt: "2026-03-15", updatedAt: "2026-03-15", sizeKb: 92, status: "enviado", professional: "Dr. Mateo Rivas" },
  { id: "D-9005", name: "Certificado de asistencia · laboral", type: "certificado", patientId: "P-1042", patientName: "María Camila Rondón", createdAt: "2026-04-10", updatedAt: "2026-04-10", sizeKb: 64, status: "firmado", professional: "Dra. Lucía Méndez", signedAt: "2026-04-10" },
  { id: "D-9006", name: "Consentimiento · plan DBT para adolescente", type: "consentimiento", patientId: "P-1098", patientName: "Valentina Soto Cárdenas", createdAt: "2026-04-11", updatedAt: "2026-04-11", sizeKb: 156, status: "pendiente_firma", professional: "Dra. Lucía Méndez" },
  { id: "D-9007", name: "Informe de cierre · alta terapéutica", type: "informe", patientId: "P-0532", patientName: "Marta Inés Cifuentes", createdAt: "2026-02-22", updatedAt: "2026-02-28", sizeKb: 512, status: "archivado", professional: "Dra. Lucía Méndez", signedAt: "2026-02-28" },
  { id: "D-9008", name: "Informe mensual · seguimiento TCA", type: "informe", patientId: "P-0998", patientName: "Sara Liliana Beltrán", createdAt: "2026-04-05", updatedAt: "2026-04-15", sizeKb: 348, status: "borrador", professional: "Mg. Sofía Quintana" },
  { id: "D-9009", name: "Remisión a nutrición clínica", type: "remision", patientId: "P-0998", patientName: "Sara Liliana Beltrán", createdAt: "2026-04-01", updatedAt: "2026-04-01", sizeKb: 74, status: "enviado", professional: "Mg. Sofía Quintana" },
  { id: "D-9010", name: "Protocolo de consentimiento · plantilla 2026", type: "consentimiento", createdAt: "2026-01-02", updatedAt: "2026-03-10", sizeKb: 96, status: "archivado", professional: "Administración" },
];

// ─────────────────────────────────────────────────────────────
// Mensajería
// ─────────────────────────────────────────────────────────────

export interface MessageItem {
  id: string;
  from: "paciente" | "profesional";
  text: string;
  at: string;
  read?: boolean;
}

export interface MessageThread {
  id: string;
  patientId: string;
  patientName: string;
  preferredName?: string;
  preview: string;
  lastAt: string;
  unread: number;
  pinned?: boolean;
  risk: Risk;
  messages: MessageItem[];
}

export const MESSAGE_THREADS: MessageThread[] = [
  {
    id: "M-701", patientId: "P-1042", patientName: "María Camila Rondón", preferredName: "Cami",
    preview: "Completé el registro de la semana, gracias por…",
    lastAt: "09:12", unread: 2, risk: "low",
    messages: [
      { id: "m1", from: "profesional", text: "Hola Cami, ¿cómo estás? Recuerda enviarme el registro de exposiciones antes de mañana.", at: "Ayer · 16:40", read: true },
      { id: "m2", from: "paciente", text: "Hola Lucía. Sí, aquí va lo de esta semana, completé 4 de 5 ejercicios.", at: "09:08", read: false },
      { id: "m3", from: "paciente", text: "Tuve mucha ansiedad con el del pitch pero usé la respiración 4-7-8 y bajé SUDS de 80 a 45.", at: "09:12", read: false },
    ],
  },
  {
    id: "M-702", patientId: "P-1098", patientName: "Valentina Soto Cárdenas", preferredName: "Val",
    preview: "Estoy teniendo urgencias de autolesión, ¿puedes?",
    lastAt: "08:55", unread: 3, pinned: true, risk: "critical",
    messages: [
      { id: "m1", from: "paciente", text: "Hola, no estoy bien.", at: "08:40", read: false },
      { id: "m2", from: "paciente", text: "Tengo muchas urgencias. Intenté la caja de hielo pero no funcionó.", at: "08:52", read: false },
      { id: "m3", from: "paciente", text: "¿Puedes llamarme cuando puedas? Estoy teniendo urgencias de autolesión.", at: "08:55", read: false },
    ],
  },
  {
    id: "M-703", patientId: "P-1011", patientName: "Andrés Felipe Galeano",
    preview: "Confirmado para hoy 11:30",
    lastAt: "Ayer", unread: 0, risk: "high",
    messages: [
      { id: "m1", from: "profesional", text: "Andrés, recordatorio de cita hoy a las 11:30. ¿Confirmas asistencia?", at: "Ayer · 09:00", read: true },
      { id: "m2", from: "paciente", text: "Confirmado para hoy 11:30", at: "Ayer · 09:14", read: true },
    ],
  },
  {
    id: "M-704", patientId: "P-1120", patientName: "Laura Restrepo Vélez",
    preview: "Gracias doctor, la carta me ayudó mucho a…",
    lastAt: "Lun", unread: 0, risk: "low",
    messages: [
      { id: "m1", from: "profesional", text: "Laura, cuéntame cómo te fue con la carta de despedida.", at: "Dom · 10:30", read: true },
      { id: "m2", from: "paciente", text: "Gracias doctor, la carta me ayudó mucho a ordenar las cosas que nunca le dije a mi papá.", at: "Lun · 08:20", read: true },
    ],
  },
  {
    id: "M-705", patientId: "P-0998", patientName: "Sara Liliana Beltrán",
    preview: "Lista la remisión de nutrición, acabo de…",
    lastAt: "Vie", unread: 0, risk: "high",
    messages: [
      { id: "m1", from: "paciente", text: "Lista la remisión de nutrición, acabo de agendar para el miércoles.", at: "Vie · 15:22", read: true },
    ],
  },
  {
    id: "M-706", patientId: "P-0654", patientName: "Tomás Aristizábal",
    preview: "Hice el AUDIT, me salió 14",
    lastAt: "Jue", unread: 1, risk: "moderate",
    messages: [
      { id: "m1", from: "paciente", text: "Hice el AUDIT, me salió 14", at: "Jue · 19:10", read: false },
    ],
  },
];

export const QUICK_REPLIES = [
  { id: "qr1", label: "Confirmación de cita", text: "Te recordamos tu cita programada. Por favor confirma asistencia respondiendo este mensaje." },
  { id: "qr2", label: "Horario de atención", text: "Atendemos mensajes lun–vie de 8:00 a 18:00. Si es una emergencia, marca 123 o la línea 106 (Bogotá)." },
  { id: "qr3", label: "Tarea pendiente", text: "Hola, te escribo para recordarte la tarea acordada en sesión. ¿Cómo va el proceso?" },
  { id: "qr4", label: "Envío de documento", text: "Te envío el documento que conversamos. Revísalo cuando puedas y me cuentas si hay dudas." },
];

// ─────────────────────────────────────────────────────────────
// Notificaciones
// ─────────────────────────────────────────────────────────────

export type NotificationType = "cita" | "mensaje" | "tarea" | "test" | "alerta" | "documento";

export interface AppNotification {
  id: string;
  type: NotificationType;
  title: string;
  description: string;
  at: string;
  read: boolean;
  urgent?: boolean;
}

export const NOTIFICATIONS: AppNotification[] = [
  { id: "N-1", type: "alerta", title: "Val. Soto reporta urgencias de autolesión", description: "Mensaje entrante — nivel crítico. Activa protocolo si es necesario.", at: "hace 8 min", read: false, urgent: true },
  { id: "N-2", type: "cita", title: "María Camila en recepción", description: "Cita de 10:30 confirmada. Pasar a consultorio 2.", at: "hace 15 min", read: false },
  { id: "N-3", type: "test", title: "PHQ-9 pendiente de calificar", description: "Andrés F. Galeano completó test hace 2 horas.", at: "hace 2 h", read: false },
  { id: "N-4", type: "tarea", title: "Tarea vencida · Sara Beltrán", description: "Registro de comidas sin cerrar. Adherencia 55%.", at: "hoy 08:00", read: true },
  { id: "N-5", type: "documento", title: "Consentimiento pendiente · Val. Soto", description: "Plan DBT para adolescente requiere firma del tutor.", at: "ayer", read: true },
  { id: "N-6", type: "mensaje", title: "3 mensajes sin leer", description: "Hilos: Cami Rondón, Tomás A., Val. Soto.", at: "hoy", read: true },
];

// ─────────────────────────────────────────────────────────────
// Crisis · contactos
// ─────────────────────────────────────────────────────────────

export const CRISIS_LINES = [
  { name: "Línea 106 · Bogotá", number: "106", description: "Línea psicológica 24/7 · Secretaría Distrital de Salud." },
  { name: "Línea nacional 192", number: "192 · opción 4", description: "MinSalud · orientación en salud mental." },
  { name: "Emergencias 123", number: "123", description: "Riesgo inminente · coordinación policial/ambulancia." },
  { name: "Psic. Nathaly Ferrer", number: "+57 310 555 0012", description: "Celular personal · solo emergencias clínicas." },
];

export const CRISIS_PROTOCOL_STEPS = [
  "Mantener contacto verbal. Validar emoción, no minimizar.",
  "Evaluar riesgo inminente: ideación, plan, medios, tiempo.",
  "Retirar medios letales si están a disposición (fármacos, objetos cortantes).",
  "Activar plan de seguridad: red de apoyo, contactos previamente acordados.",
  "Si hay riesgo alto/crítico → llamar a 123 o acompañar a urgencias.",
  "Registrar incidente en historia clínica antes de 24 h.",
];
