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
