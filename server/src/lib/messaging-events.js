/**
 * Catálogo cerrado de eventos de messaging. Si el server intenta emitir
 * uno que no esté acá, falla. Esto previene typos silenciosos del tipo
 * `appointment.remider.24h` que el bot nunca procesaría.
 *
 * Los nombres son `domain.action[.qualifier]` en minúsculas con puntos.
 * Estables — son parte del contrato público con el bot. NO renombrar
 * sin sincronizar con el bot externo.
 *
 * `kind` indica a quién va dirigido por DEFAULT (configurable por workspace):
 *   - 'patient': dispara al paciente involucrado
 *   - 'professional': dispara al psicólogo del workspace
 *   - 'both': dispara dos eventos separados (uno por destinatario)
 */
export const EVENTS = {
  // ─── Citas ────────────────────────────────────────────────────────────
  "appointment.created":             { kind: "patient",      description: "Nueva cita agendada" },
  "appointment.reminder.24h":        { kind: "patient",      description: "Recordatorio 24h antes" },
  "appointment.reminder.1h":         { kind: "patient",      description: "Recordatorio 1h antes" },
  "appointment.cancelled":           { kind: "both",         description: "Cita cancelada" },
  "appointment.confirmed_by_patient":{ kind: "professional", description: "Paciente confirmó por WhatsApp" },

  // ─── Documentos ──────────────────────────────────────────────────────
  "document.shared":                 { kind: "patient",      description: "Documento compartido contigo" },
  "document.signature_requested":    { kind: "patient",      description: "Documento pendiente de firma" },
  "document.signed":                 { kind: "professional", description: "Paciente firmó documento" },

  // ─── Tareas y tests ──────────────────────────────────────────────────
  "task.assigned":                   { kind: "patient",      description: "Tarea nueva asignada" },
  "task.submitted":                  { kind: "professional", description: "Paciente entregó tarea" },
  "test.assigned":                   { kind: "patient",      description: "Test psicométrico asignado" },

  // ─── Otros ────────────────────────────────────────────────────────────
  "invoice.paid":                    { kind: "patient",      description: "Pago registrado" },
  "clinical_risk.alert":             { kind: "professional", description: "Alerta de riesgo clínico detectada" },
  "portal.invite":                   { kind: "patient",      description: "Invitación a activar portal" },
};

export const EVENT_TYPES = Object.keys(EVENTS);

export function isValidEventType(type) {
  return Object.prototype.hasOwnProperty.call(EVENTS, type);
}
