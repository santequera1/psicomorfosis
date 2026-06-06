/**
 * Plantillas por defecto para cada evento de messaging. Si un workspace
 * no tiene una plantilla custom en `message_templates`, el sender cae
 * a la default de acá.
 *
 * Sintaxis de variables: `{{path.al.valor}}`. El renderer (render.js)
 * resuelve paths con punto contra el objeto `data` que se le pase. Si
 * la variable no existe, queda vacía (no rompe). Variables no escapadas
 * — confiamos en que WhatsApp/Telegram no interpretan HTML.
 *
 * Diseño:
 *   - Tono cálido, claro, sin tecnicismo.
 *   - Una línea de "sender_label" arriba para identificar de quién es
 *     el mensaje (importante porque el número del bot es central).
 *   - Acción/CTA al final cuando aplique.
 *   - Opt-out implícito: el primer mensaje al paciente nuevo lleva la
 *     línea "Responde PARAR si no quieres recibir más mensajes" (la
 *     añade el renderer cuando es el primer envío detected).
 */

export const DEFAULT_TEMPLATES = {
  // ─── Citas ────────────────────────────────────────────────────────────
  "appointment.created":
`Hola {{patient.first_name}}, te confirmo desde {{sender_label}}:

📅 Sesión agendada
{{appointment.date_human}} · {{appointment.time}}
Modalidad: {{appointment.modality_human}}{{appointment.room_suffix}}

Te enviaré recordatorios el día anterior y una hora antes.`,

  "appointment.reminder.24h":
`Hola {{patient.first_name}} 👋

Te recuerdo tu sesión de mañana con {{sender_label}}:
{{appointment.date_human}} · {{appointment.time}}
{{appointment.modality_human}}{{appointment.room_suffix}}

Responde SÍ para confirmar o NO si no podrás asistir.`,

  "appointment.reminder.1h":
`{{patient.first_name}}, tu sesión con {{sender_label}} es en una hora ({{appointment.time}}).
{{appointment.modality_human}}{{appointment.room_suffix}}

¡Te espero!`,

  "appointment.cancelled":
`Hola {{patient.first_name}}, tu sesión del {{appointment.date_human}} a las {{appointment.time}} fue cancelada.

Cuando quieras reagendar escríbele directamente a {{sender_label}}.`,

  "appointment.confirmed_by_patient":
`{{patient.full_name}} confirmó la sesión del {{appointment.date_human}} a las {{appointment.time}}.`,

  // ─── Documentos ──────────────────────────────────────────────────────
  "document.shared":
`{{patient.first_name}}, {{sender_label}} compartió un documento contigo:

📄 {{document.name}}

Lo puedes ver en tu portal: {{portal_url}}/p/documentos/{{document.id}}`,

  "document.signature_requested":
`Hola {{patient.first_name}},

Tienes un documento pendiente de firma:
📄 {{document.name}}

Por favor revísalo y fírmalo desde tu portal:
{{portal_url}}/p/documentos/{{document.id}}/firmar`,

  "document.signed":
`{{patient.full_name}} firmó el documento "{{document.name}}".`,

  // ─── Tareas y tests ──────────────────────────────────────────────────
  "task.assigned":
`Hola {{patient.first_name}}, {{sender_label}} te asignó una tarea:

✅ {{task.title}}
{{task.due_human}}

Puedes verla en {{portal_url}}/p/tareas`,

  "task.submitted":
`{{patient.full_name}} entregó la tarea "{{task.title}}".`,

  "test.assigned":
`Hola {{patient.first_name}}, {{sender_label}} te asignó un test psicométrico:

🧠 {{test.name}}
Tiempo estimado: {{test.duration_min}} min

Lo puedes responder en {{portal_url}}/p/tests`,

  // ─── Otros ────────────────────────────────────────────────────────────
  "invoice.paid":
`Hola {{patient.first_name}}, recibimos tu pago de {{invoice.amount_human}} por {{invoice.concept}}.

Gracias 🙌
— {{sender_label}}`,

  "clinical_risk.alert":
`⚠️ Alerta clínica
Paciente: {{patient.full_name}}
Origen: {{alert.source}}
Detalle: {{alert.detail}}

Revisa en {{app_url}} cuando puedas.`,

  "portal.invite":
`Hola {{patient.first_name}}, {{sender_label}} te invitó a tu portal del paciente para que puedas ver tus citas, documentos y tareas en un solo lugar.

Actívalo aquí: {{invite_url}}

Si tienes dudas, escríbele directamente.`,
};

/**
 * Resuelve `{{path.to.value}}` contra `data`. Tolerante: si la variable
 * no existe, retorna ""; nunca lanza. Sin interpolación recursiva
 * (no expande variables dentro de variables) para evitar inyecciones.
 */
export function renderTemplate(template, data) {
  if (!template) return "";
  return String(template).replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_match, path) => {
    const parts = path.split(".");
    let cur = data;
    for (const p of parts) {
      if (cur == null) return "";
      cur = cur[p];
    }
    if (cur == null) return "";
    return String(cur);
  });
}
