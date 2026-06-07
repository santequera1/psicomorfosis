/**
 * Cliente de email para notificaciones automáticas (citas creadas,
 * reprogramadas, canceladas). SMTP via nodemailer hacia el servidor
 * configurado en .env (mail.wailus.co por default).
 *
 * Diseño:
 *  - Transport lazy: se crea en el primer envío y se reutiliza. Si SMTP
 *    no está configurado, sendAppointmentEmail devuelve status='skipped_no_smtp'
 *    en vez de tirar — la creación de cita NUNCA debe bloquearse por email.
 *  - Plantillas HTML inline (template literals). No usamos engine de
 *    templates para mantener el módulo simple y autocontenido.
 *  - Adjuntamos un .ics estándar para que el paciente pueda agregar la
 *    cita a su calendario (Google, Apple, Outlook lo entienden todos).
 *  - Logging en email_log con metadata pero SIN contenido del email.
 */

import nodemailer from "nodemailer";
import { db } from "./db.js";

// ─── Configuración SMTP (env vars, lazy) ──────────────────────────────
//
// IMPORTANTE: leemos process.env LAZY (dentro de cada función) y no al
// top-level del módulo, porque los imports ES son "hoisteados": cuando
// index.js importa esta función, mailer.js se evalúa ANTES de que el
// body de index.js corra dotenv.config(). Si leyéramos los valores al
// top-level con `const SMTP_HOST = process.env.SMTP_HOST`, capturaríamos
// undefined antes de que dotenv haya cargado el .env.

function getSmtpConfig() {
  return {
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT ?? 465),
    secure: String(process.env.SMTP_SECURE ?? "true") === "true",
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
    fromName: process.env.SMTP_FROM_NAME ?? "Psicomorfosis",
  };
}

function smtpConfigured() {
  const c = getSmtpConfig();
  return !!(c.host && c.user && c.pass);
}

let _transport = null;
function getTransport() {
  if (_transport) return _transport;
  if (!smtpConfigured()) return null;
  const c = getSmtpConfig();
  _transport = nodemailer.createTransport({
    pool: true,             // pool de conexiones reutilizables
    maxConnections: 3,      // max sockets concurrentes — wailus es chico
    maxMessages: 50,        // recicla la conexión cada 50 mensajes para evitar
                            // que el server SMTP la corte por idle/timeout
    host: c.host,
    port: c.port,
    secure: c.secure,       // true para puerto 465 (SSL), false para 587 (STARTTLS)
    auth: { user: c.user, pass: c.pass },
    // Timeouts conservadores: si SMTP cae, no queremos bloquear 30s la
    // creación de citas. 10s para handshake, 15s para envío grande.
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 15_000,
    tls: {
      // SNI explícito — algunos servidores con multi-tenant rechazan
      // conexiones sin servername correcto.
      servername: c.host,
    },
  });
  return _transport;
}

/**
 * Envía con retry para errores transitorios de red. ECONNRESET es muy
 * común con mail.wailus.co cuando el socket del pool quedó zombie —
 * el primer envío rebota, el segundo (con pool reseteado) funciona.
 *
 * Solo reintenta errores transitorios (ECONNRESET, ETIMEDOUT, ESOCKET).
 * Errores de auth o de dirección inválida se propagan sin retry.
 */
async function sendMailWithRetry(mail, attempts = 3) {
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    try {
      const transport = getTransport();
      if (!transport) throw new Error("SMTP no configurado");
      return await transport.sendMail(mail);
    } catch (err) {
      lastErr = err;
      const code = err?.code || "";
      const msg = String(err?.message || "");
      const retriable =
        code === "ECONNRESET" || code === "ETIMEDOUT" ||
        code === "ESOCKET" || code === "EAI_AGAIN" ||
        msg.includes("ECONNRESET");
      if (!retriable || i === attempts - 1) throw err;

      console.warn(`[mailer] reintento ${i + 1}/${attempts} tras ${code || msg.slice(0, 80)}`);
      // Cerrar pool y forzar reconexión: si quedaron sockets muertos,
      // el siguiente getTransport() crea uno nuevo limpio.
      try { _transport?.close?.(); } catch { /* noop */ }
      _transport = null;

      // Backoff exponencial: 300ms, 900ms
      await new Promise((r) => setTimeout(r, 300 * Math.pow(3, i)));
    }
  }
  throw lastErr;
}

// ─── Helpers de formato ───────────────────────────────────────────────

const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const MESES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

/**
 * Convierte "2026-05-15" + "14:00" → "viernes, 15 de mayo de 2026 a las 2:00 p.m."
 * Trabajamos siempre en hora local Colombia (no convertimos a UTC para
 * mostrar — la psicóloga y el paciente viven en la misma TZ).
 */
function formatHumanDateTime(dateIso, time) {
  if (!dateIso) return "(fecha sin definir)";
  const [y, m, d] = dateIso.split("-").map(Number);
  const date = new Date(y, (m ?? 1) - 1, d ?? 1);
  const dia = DIAS[date.getDay()];
  const mes = MESES[date.getMonth()];
  const hora = formatHumanTime(time);
  return `${dia}, ${d} de ${mes} de ${y}${hora ? ` a las ${hora}` : ""}`;
}

function formatHumanTime(time) {
  if (!time) return "";
  const [hStr, mStr] = time.split(":");
  const h = Number(hStr);
  const m = Number(mStr ?? 0);
  if (Number.isNaN(h)) return time;
  const period = h >= 12 ? "p.m." : "a.m.";
  const h12 = ((h + 11) % 12) + 1;
  const mm = String(m).padStart(2, "0");
  return mm === "00" ? `${h12}:00 ${period}` : `${h12}:${mm} ${period}`;
}

function formatModality(modality) {
  if (modality === "tele" || modality === "virtual") return "Telepsicología (videollamada)";
  if (modality === "individual") return "Sesión presencial";
  if (modality === "pareja") return "Sesión de pareja";
  if (modality === "familiar") return "Sesión familiar";
  if (modality === "grupal") return "Sesión grupal";
  return modality ?? "Sesión";
}

function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// ─── Generador iCalendar (.ics) ───────────────────────────────────────

/**
 * Genera un archivo .ics standalone para una cita. Compatible con Google
 * Calendar, Apple Calendar y Outlook. Usa TZID America/Bogota para que
 * el evento aparezca en la hora correcta sin conversiones UTC.
 *
 * Si la cita está cancelada, METHOD:CANCEL + STATUS:CANCELLED hace que
 * el cliente de correo del paciente actualice el evento existente en
 * lugar de duplicarlo.
 */
function generateIcs({ appointment, professional, workspaceName, method = "PUBLISH", status = "CONFIRMED" }) {
  const [y, m, d] = appointment.date.split("-").map(Number);
  const [hh, mm] = (appointment.time ?? "09:00").split(":").map(Number);
  const dur = Number(appointment.duration_min ?? 50);

  const start = new Date(y, (m ?? 1) - 1, d ?? 1, hh ?? 9, mm ?? 0);
  const end = new Date(start.getTime() + dur * 60_000);
  const stamp = new Date();

  const fmt = (dt) => {
    const pad = (n) => String(n).padStart(2, "0");
    return `${dt.getFullYear()}${pad(dt.getMonth() + 1)}${pad(dt.getDate())}T${pad(dt.getHours())}${pad(dt.getMinutes())}${pad(dt.getSeconds())}`;
  };
  const fmtUtc = (dt) => `${fmt(new Date(dt.getTime() + dt.getTimezoneOffset() * 60_000))}Z`;

  const uid = `psicomorfosis-appt-${appointment.id}@psico.wailus.co`;
  const summary = `Sesión con ${professional?.name ?? workspaceName ?? "Psicología"}`;
  const location = appointment.modality === "tele" || appointment.modality === "virtual"
    ? "Telepsicología (videollamada)"
    : (appointment.room || workspaceName || "");
  const description = appointment.notes ? appointment.notes.replace(/[\r\n]+/g, "\\n") : "";

  // Cuerpo del ICS — líneas terminadas en CRLF según RFC 5545.
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Psicomorfosis//ES",
    "CALSCALE:GREGORIAN",
    `METHOD:${method}`,
    "BEGIN:VTIMEZONE",
    "TZID:America/Bogota",
    "BEGIN:STANDARD",
    "DTSTART:19700101T000000",
    "TZOFFSETFROM:-0500",
    "TZOFFSETTO:-0500",
    "TZNAME:COT",
    "END:STANDARD",
    "END:VTIMEZONE",
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${fmtUtc(stamp)}`,
    `DTSTART;TZID=America/Bogota:${fmt(start)}`,
    `DTEND;TZID=America/Bogota:${fmt(end)}`,
    `SUMMARY:${summary}`,
    location ? `LOCATION:${location}` : null,
    description ? `DESCRIPTION:${description}` : null,
    `STATUS:${status}`,
    "SEQUENCE:0",
    "TRANSP:OPAQUE",
    "END:VEVENT",
    "END:VCALENDAR",
  ].filter(Boolean);

  return lines.join("\r\n");
}

// ─── Plantillas HTML ──────────────────────────────────────────────────

/**
 * Estilo base compartido por las 3 plantillas. Inline-friendly,
 * compatible con clientes de email (Gmail, Outlook, Apple Mail).
 * Sin imports externos ni JavaScript; solo HTML + estilos inline.
 */
function emailLayout({ title, accentColor = "#14685b", bodyHtml }) {
  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(title)}</title>
</head>
<body style="margin:0;padding:0;background:#f5f5f4;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#1a1a1a;line-height:1.55;">
<div style="max-width:560px;margin:0 auto;padding:24px 16px;">
  <div style="background:#fff;border:1px solid #e7e5e4;border-radius:12px;overflow:hidden;">
    <div style="padding:24px 28px 16px 28px;border-bottom:1px solid #f5f5f4;">
      <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.14em;color:${accentColor};font-weight:600;">Psicomorfosis</div>
      <h1 style="margin:6px 0 0 0;font-size:20px;color:#1a1a1a;line-height:1.3;">${escapeHtml(title)}</h1>
    </div>
    <div style="padding:20px 28px 28px 28px;">
      ${bodyHtml}
    </div>
  </div>
  <p style="margin:20px 12px 0 12px;font-size:11px;color:#78716c;line-height:1.5;text-align:center;">
    Este mensaje se generó automáticamente desde la plataforma de gestión clínica de tu psicóloga/o.
    Si crees que lo recibiste por error, simplemente ignóralo. Para responder, puedes contestar
    directamente a este correo.
  </p>
</div>
</body>
</html>`;
}

function appointmentDetailsBlock({ appointment, professional, workspaceName }) {
  const cuando = formatHumanDateTime(appointment.date, appointment.time);
  const duracion = appointment.duration_min ? `${appointment.duration_min} minutos` : "";
  const modalidad = formatModality(appointment.modality);
  const profesional = professional?.name ?? workspaceName ?? "";
  const lugar = appointment.modality === "tele" || appointment.modality === "virtual"
    ? "Telepsicología (videollamada — el enlace te lo compartirá tu psicóloga/o)"
    : (appointment.room ? `${appointment.room}` : (workspaceName ?? ""));

  const row = (label, value) => value
    ? `<tr><td style="padding:6px 12px 6px 0;color:#78716c;font-size:13px;vertical-align:top;width:120px;">${label}</td><td style="padding:6px 0;color:#1a1a1a;font-size:14px;">${escapeHtml(value)}</td></tr>`
    : "";

  return `<table cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;margin:8px 0 4px 0;">
${row("Cuándo", cuando)}
${row("Duración", duracion)}
${row("Modalidad", modalidad)}
${row("Profesional", profesional)}
${row("Lugar", lugar)}
</table>`;
}

function templateCreated({ appointment, patient, professional, workspaceName }) {
  const firstName = (patient?.preferred_name?.trim() || patient?.name?.split(" ")[0] || "").trim();
  const saludo = firstName ? `Hola ${escapeHtml(firstName)},` : "Hola,";
  const body = `
<p style="margin:0 0 14px 0;font-size:15px;">${saludo}</p>
<p style="margin:0 0 14px 0;font-size:14px;color:#44403c;">
Te confirmamos que tu cita ha sido agendada. Estos son los detalles:
</p>
${appointmentDetailsBlock({ appointment, professional, workspaceName })}
<p style="margin:18px 0 6px 0;font-size:13px;color:#57534e;">
Adjuntamos también un archivo de calendario (.ics) para que puedas agregar la cita a Google Calendar,
Apple Calendar u Outlook.
</p>
<p style="margin:14px 0 0 0;font-size:13px;color:#57534e;">
Si necesitas reprogramar o cancelar, responde directamente a este correo o comunícate con tu
psicóloga/o por el canal habitual.
</p>`;
  return emailLayout({ title: "Tu cita ha sido agendada", bodyHtml: body });
}

function templateRescheduled({ appointment, patient, professional, workspaceName, previous }) {
  const firstName = (patient?.preferred_name?.trim() || patient?.name?.split(" ")[0] || "").trim();
  const saludo = firstName ? `Hola ${escapeHtml(firstName)},` : "Hola,";
  const prevWhen = previous ? formatHumanDateTime(previous.date, previous.time) : null;

  const body = `
<p style="margin:0 0 14px 0;font-size:15px;">${saludo}</p>
<p style="margin:0 0 14px 0;font-size:14px;color:#44403c;">
Tu cita fue reprogramada${prevWhen ? `. La fecha anterior era <strong style="color:#1a1a1a;">${escapeHtml(prevWhen)}</strong>` : ""}.
Estos son los nuevos detalles:
</p>
${appointmentDetailsBlock({ appointment, professional, workspaceName })}
<p style="margin:18px 0 6px 0;font-size:13px;color:#57534e;">
Adjuntamos un archivo de calendario actualizado. Si lo abres desde el correo, tu app de calendario
debería actualizar el evento existente automáticamente.
</p>
<p style="margin:14px 0 0 0;font-size:13px;color:#57534e;">
Si la nueva fecha no te queda bien, responde a este correo para coordinar otra opción.
</p>`;
  return emailLayout({ title: "Tu cita fue reprogramada", bodyHtml: body });
}

function templateCancelled({ appointment, patient, professional, workspaceName }) {
  const firstName = (patient?.preferred_name?.trim() || patient?.name?.split(" ")[0] || "").trim();
  const saludo = firstName ? `Hola ${escapeHtml(firstName)},` : "Hola,";
  const cuando = formatHumanDateTime(appointment.date, appointment.time);
  const profesional = professional?.name ?? workspaceName ?? "";

  const body = `
<p style="margin:0 0 14px 0;font-size:15px;">${saludo}</p>
<p style="margin:0 0 14px 0;font-size:14px;color:#44403c;">
Te informamos que la cita que tenías agendada con <strong style="color:#1a1a1a;">${escapeHtml(profesional)}</strong>
el <strong style="color:#1a1a1a;">${escapeHtml(cuando)}</strong> fue cancelada.
</p>
<p style="margin:14px 0 0 0;font-size:13px;color:#57534e;">
Si quieres reprogramar, responde directamente a este correo o comunícate con tu psicóloga/o por
el canal habitual. Si tú habías solicitado la cancelación, puedes ignorar este mensaje.
</p>`;
  return emailLayout({ title: "Tu cita fue cancelada", bodyHtml: body, accentColor: "#b91c1c" });
}

// ─── Función pública ──────────────────────────────────────────────────

const SUBJECTS = {
  appointment_created: "Tu cita ha sido agendada",
  appointment_rescheduled: "Tu cita fue reprogramada",
  appointment_cancelled: "Tu cita fue cancelada",
};

/**
 * Envía un email transaccional al paciente sobre el estado de su cita.
 * Best-effort: cualquier error se loguea pero NO se propaga. La función
 * SIEMPRE resuelve con un objeto de resultado para que el caller pueda
 * persistir en email_log sin romper la transacción de la cita.
 *
 * @param {object} opts
 * @param {string} opts.kind - 'appointment_created' | 'appointment_rescheduled' | 'appointment_cancelled'
 * @param {object} opts.appointment - row de appointments
 * @param {object} opts.patient - row de patients (necesita email + name)
 * @param {object} [opts.professional] - row de professionals (para "De:")
 * @param {string} [opts.workspaceName] - nombre del workspace (fallback)
 * @param {string} [opts.replyTo] - email del psicólogo para que el paciente pueda responderle
 * @param {object} [opts.previous] - estado anterior de la cita (solo para reschedule)
 * @returns {Promise<{status: string, ms: number, error?: string}>}
 */
export async function sendAppointmentEmail(opts) {
  const start = Date.now();
  const { kind, appointment, patient, professional, workspaceName, replyTo, previous } = opts;

  const result = {
    workspace_id: appointment.workspace_id ?? null,
    appointment_id: appointment.id ?? null,
    to_email: patient?.email ?? "",
    kind,
    status: "failed",
    error: null,
    ms: 0,
  };

  // Validaciones preliminares — fallar barato.
  if (!patient?.email || !patient.email.includes("@")) {
    result.status = "skipped_no_email";
    result.ms = Date.now() - start;
    logEmail(result);
    return result;
  }
  if (!smtpConfigured()) {
    result.status = "skipped_no_smtp";
    result.error = "SMTP_HOST/USER/PASS no configurados";
    result.ms = Date.now() - start;
    logEmail(result);
    return result;
  }

  try {
    const c = getSmtpConfig();
    const profDisplay = professional?.name ? `${professional.name} · ${c.fromName}` : c.fromName;
    const fromAddress = `${profDisplay} <${c.user}>`;
    const html =
      kind === "appointment_rescheduled" ? templateRescheduled({ appointment, patient, professional, workspaceName, previous }) :
      kind === "appointment_cancelled" ? templateCancelled({ appointment, patient, professional, workspaceName }) :
      templateCreated({ appointment, patient, professional, workspaceName });
    const subject = SUBJECTS[kind] ?? "Notificación de cita";

    // ICS adjunto. Para canceladas usamos METHOD:CANCEL + STATUS:CANCELLED
    // así el cliente de calendario del paciente actualiza el evento.
    const ics = generateIcs({
      appointment,
      professional,
      workspaceName,
      method: kind === "appointment_cancelled" ? "CANCEL" : "REQUEST",
      status: kind === "appointment_cancelled" ? "CANCELLED" : "CONFIRMED",
    });

    await sendMailWithRetry({
      from: fromAddress,
      to: patient.email,
      replyTo: replyTo || undefined,
      subject,
      html,
      attachments: [{
        filename: "cita.ics",
        content: ics,
        contentType: "text/calendar; charset=utf-8; method=" + (kind === "appointment_cancelled" ? "CANCEL" : "REQUEST"),
      }],
    });

    result.status = "sent";
  } catch (err) {
    result.status = "failed";
    result.error = String(err?.message ?? err).slice(0, 500);
    console.warn(`[mailer] envío falló para ${patient.email}: ${result.error}`);
  }

  result.ms = Date.now() - start;
  logEmail(result);
  return result;
}

/** Persiste el resultado del envío en email_log. Best-effort: si falla, loguea. */
function logEmail(r) {
  try {
    db.prepare(`
      INSERT INTO email_log (workspace_id, appointment_id, to_email, kind, status, error, ms)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      r.workspace_id, r.appointment_id, r.to_email,
      r.kind, r.status, r.error, r.ms,
    );
  } catch (err) {
    console.warn(`[mailer] no se pudo loguear envío: ${err.message}`);
  }
}

/** Para debug en arranque: imprime si SMTP está configurado (sin la pass). */
export function logSmtpStatus() {
  const c = getSmtpConfig();
  if (smtpConfigured()) {
    console.log(`[mailer] SMTP listo: ${c.user} @ ${c.host}:${c.port} (secure=${c.secure})`);
  } else {
    console.warn("[mailer] SMTP NO configurado — emails de citas no se enviarán. Setea SMTP_HOST/USER/PASS en .env.");
  }
}

// ─── Invitación del paciente al portal ────────────────────────────────

/**
 * Plantilla HTML para la invitación al portal. Tono cálido (van a ser
 * pacientes reales recibiendo esto), explicación corta de qué es el portal,
 * CTA grande al link de activación + fallback texto del URL para clientes
 * que bloqueen botones.
 */
function templatePatientInvite({ patient, professional, workspaceName, url, daysValid }) {
  const firstName = (patient?.preferred_name?.trim() || patient?.name?.split(" ")[0] || "").trim();
  const saludo = firstName ? `Hola ${escapeHtml(firstName)},` : "Hola,";
  const profName = professional?.name ?? workspaceName ?? "tu psicóloga/o";

  const body = `
<p style="margin:0 0 14px 0;font-size:15px;">${saludo}</p>
<p style="margin:0 0 14px 0;font-size:14px;color:#44403c;">
${escapeHtml(profName)} te invita a tu espacio personal en Psicomorfosis, donde podrás:
</p>
<ul style="margin:0 0 14px 18px;padding:0;font-size:14px;color:#44403c;line-height:1.7;">
  <li>Ver tus próximas citas y tareas asignadas</li>
  <li>Responder tests psicométricos cuando te los compartan</li>
  <li>Consultar documentos y firmar consentimientos desde tu celular</li>
</ul>
<p style="margin:18px 0 14px 0;font-size:14px;color:#44403c;">
Para activarlo, necesitas crear tu contraseña en este enlace seguro:
</p>
<p style="text-align:center;margin:20px 0;">
  <a href="${escapeHtml(url)}" style="display:inline-block;padding:14px 28px;background:#14685b;color:#ffffff;text-decoration:none;border-radius:8px;font-size:15px;font-weight:600;">
    Activar mi cuenta
  </a>
</p>
<p style="margin:0 0 8px 0;font-size:12px;color:#78716c;">
Si el botón no funciona, copia y pega esta dirección en tu navegador:
</p>
<p style="margin:0 0 18px 0;font-size:12px;color:#57534e;word-break:break-all;">
${escapeHtml(url)}
</p>
<p style="margin:14px 0 0 0;font-size:12px;color:#78716c;">
El enlace es válido por ${daysValid} día${daysValid === 1 ? "" : "s"}. Si vence, pídele a ${escapeHtml(profName)} que te envíe uno nuevo.
</p>
<p style="margin:10px 0 0 0;font-size:12px;color:#78716c;">
Tu información clínica está protegida — solo tú y ${escapeHtml(profName)} pueden verla.
</p>`;
  return emailLayout({ title: "Activa tu portal del paciente", bodyHtml: body });
}

/**
 * Envía la invitación por email. Best-effort: si SMTP no está configurado o
 * el paciente no tiene email, no rompemos el flujo — el psicólogo igual tiene
 * el link/QR para compartir manualmente. Retornamos un objeto descriptivo
 * para que el endpoint informe al frontend si el email se envió o no.
 *
 * @param {object} opts
 * @param {object} opts.patient - row de patients (email, name, preferred_name, workspace_id)
 * @param {object} [opts.professional] - row de professionals (name, email)
 * @param {string} [opts.workspaceName]
 * @param {string} opts.url - URL absoluta de activación
 * @param {number} opts.daysValid - días de validez del token (5)
 * @param {string} [opts.replyTo] - email del psicólogo para que paciente responda dudas
 * @returns {Promise<{status:'sent'|'skipped_no_email'|'skipped_no_smtp'|'failed', error?:string}>}
 */
export async function sendPatientInviteEmail(opts) {
  const start = Date.now();
  const { patient, professional, workspaceName, url, daysValid, replyTo } = opts;
  const result = {
    workspace_id: patient?.workspace_id ?? null,
    appointment_id: null,
    to_email: patient?.email ?? "",
    kind: "patient_invite",
    status: "failed",
    error: null,
    ms: 0,
  };

  if (!patient?.email || !patient.email.includes("@")) {
    result.status = "skipped_no_email";
    result.ms = Date.now() - start;
    logEmail(result);
    return result;
  }
  if (!smtpConfigured()) {
    result.status = "skipped_no_smtp";
    result.error = "SMTP_HOST/USER/PASS no configurados";
    result.ms = Date.now() - start;
    logEmail(result);
    return result;
  }

  try {
    const c = getSmtpConfig();
    const profDisplay = professional?.name ? `${professional.name} · ${c.fromName}` : c.fromName;
    const fromAddress = `${profDisplay} <${c.user}>`;
    const html = templatePatientInvite({ patient, professional, workspaceName, url, daysValid });

    await sendMailWithRetry({
      from: fromAddress,
      to: patient.email,
      replyTo: replyTo || undefined,
      subject: "Activa tu portal del paciente · Psicomorfosis",
      html,
    });

    result.status = "sent";
  } catch (err) {
    result.error = String(err?.message ?? err).slice(0, 500);
    console.warn(`[mailer] invitación falló para ${patient.email}: ${result.error}`);
  }

  result.ms = Date.now() - start;
  logEmail(result);
  return result;
}

/**
 * Envía un email a la bandeja interna (Stiven) cuando alguien llena el
 * form de "Solicitar demo" en la landing pública (/inicio). El lead
 * SIEMPRE se persiste en demo_requests aunque el email falle — esta
 * función es notificación, no canal único.
 *
 * @param {{ name:string; email:string; phone?:string; message?:string; toEmail:string }} opts
 * @returns {Promise<{status:'sent'|'skipped_no_smtp'|'failed', error?:string}>}
 */
export async function sendDemoRequestEmail(opts) {
  const start = Date.now();
  const { name, email, phone, message, toEmail } = opts;
  const result = {
    workspace_id: null,
    appointment_id: null,
    to_email: toEmail,
    kind: "demo_request",
    status: "failed",
    error: null,
    ms: 0,
  };

  if (!smtpConfigured()) {
    result.status = "skipped_no_smtp";
    result.error = "SMTP no configurado";
    result.ms = Date.now() - start;
    logEmail(result);
    return result;
  }

  try {
    const c = getSmtpConfig();
    const fromAddress = `${c.fromName} <${c.user}>`;
    const safeName = String(name).slice(0, 100);
    const safeEmail = String(email).slice(0, 200);
    const safePhone = phone ? String(phone).slice(0, 50) : "";
    const safeMessage = message ? String(message).slice(0, 2000) : "";

    const html = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; color: #1f2937;">
        <div style="border-left: 3px solid #1f6f6b; padding-left: 16px; margin-bottom: 24px;">
          <p style="margin: 0; font-size: 11px; text-transform: uppercase; letter-spacing: 0.1em; color: #6b7280;">Psicomorfosis · Landing</p>
          <h1 style="margin: 4px 0 0; font-size: 22px; color: #111827;">Nueva solicitud de demo</h1>
        </div>
        <table cellpadding="0" cellspacing="0" border="0" style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
          <tr><td style="padding: 8px 0; color: #6b7280; width: 110px;">Nombre</td><td style="padding: 8px 0; color: #111827; font-weight: 500;">${escapeHtmlMail(safeName)}</td></tr>
          <tr><td style="padding: 8px 0; color: #6b7280;">Email</td><td style="padding: 8px 0;"><a href="mailto:${escapeHtmlMail(safeEmail)}" style="color: #1f6f6b; text-decoration: none;">${escapeHtmlMail(safeEmail)}</a></td></tr>
          ${safePhone ? `<tr><td style="padding: 8px 0; color: #6b7280;">Teléfono</td><td style="padding: 8px 0;"><a href="tel:${escapeHtmlMail(safePhone)}" style="color: #1f6f6b; text-decoration: none;">${escapeHtmlMail(safePhone)}</a></td></tr>` : ""}
        </table>
        ${safeMessage ? `
          <div style="background: #f9fafb; border-radius: 8px; padding: 16px; margin-bottom: 20px;">
            <p style="margin: 0 0 6px; font-size: 11px; text-transform: uppercase; letter-spacing: 0.1em; color: #6b7280;">Mensaje</p>
            <p style="margin: 0; white-space: pre-wrap; line-height: 1.55;">${escapeHtmlMail(safeMessage)}</p>
          </div>` : ""}
        <p style="margin: 24px 0 0; font-size: 12px; color: #9ca3af;">Llegó desde https://psico.wailus.co/inicio · responde directo a este correo para contactar al lead.</p>
      </div>
    `;

    await sendMailWithRetry({
      from: fromAddress,
      to: toEmail,
      replyTo: safeEmail,
      subject: `Demo Psicomorfosis · ${safeName}`,
      html,
    });

    result.status = "sent";
  } catch (err) {
    result.error = String(err?.message ?? err).slice(0, 500);
    console.warn(`[mailer] demo request email falló: ${result.error}`);
  }

  result.ms = Date.now() - start;
  logEmail(result);
  return result;
}

// ─── Account requests (registro autoservicio desde landing) ───────────

/**
 * Plantilla: "recibimos tu solicitud". Va al solicitante recién hace POST.
 * Cálido, breve, sin promesa firme de aprobación. Solo confirma recibo
 * y da expectativa de 24h.
 */
function templateAccountRequestReceived({ fullName, username }) {
  const firstName = (fullName?.split(" ")[0] ?? "").trim();
  const saludo = firstName ? `Hola ${escapeHtml(firstName)},` : "Hola,";
  const body = `
<p style="margin:0 0 14px 0;font-size:15px;">${saludo}</p>
<p style="margin:0 0 14px 0;font-size:14px;color:#44403c;">
Recibimos tu solicitud para acceder a Psicomorfosis. Te avisaremos por este
mismo correo cuando esté lista, generalmente en menos de 24 horas.
</p>
<p style="margin:0 0 14px 0;font-size:14px;color:#44403c;">
Para que tengas a la mano cuando ingreses:
</p>
<table cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;margin:8px 0 4px 0;">
  <tr><td style="padding:6px 12px 6px 0;color:#78716c;font-size:13px;vertical-align:top;width:120px;">Usuario</td><td style="padding:6px 0;color:#1a1a1a;font-size:14px;font-family:monospace;">${escapeHtml(username)}</td></tr>
</table>
<p style="margin:18px 0 0 0;font-size:13px;color:#57534e;">
Tu contraseña es la que escogiste al solicitar — no la incluimos aquí por seguridad.
Si la olvidaste, te avisamos cuando la cuenta esté lista y podrás restablecerla
desde la pantalla de inicio de sesión.
</p>`;
  return emailLayout({ title: "Recibimos tu solicitud", bodyHtml: body });
}

/**
 * Plantilla: bienvenida al psicólogo recién aprobado. Réplica del email
 * manual que se enviaba antes (verbatim, con el branding del layout).
 * Variables: nombre del workspace/persona, username, URL de login.
 *
 * NO incluye la contraseña porque el usuario la creó él mismo al solicitar.
 */
function templateAccountApproved({ fullName, username, loginUrl }) {
  const firstName = (fullName?.split(" ")[0] ?? "").trim();
  const saludo = firstName ? `Hola ${escapeHtml(firstName)} 👋` : "Hola 👋";
  const body = `
<p style="margin:0 0 14px 0;font-size:15px;">${saludo}</p>
<p style="margin:0 0 14px 0;font-size:14px;color:#44403c;">
Ya tienes lista tu cuenta para que puedas probar la plataforma.
</p>
<table cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;margin:8px 0 4px 0;">
  <tr><td style="padding:6px 12px 6px 0;color:#78716c;font-size:13px;vertical-align:top;width:120px;">Usuario</td><td style="padding:6px 0;color:#1a1a1a;font-size:14px;font-family:monospace;">${escapeHtml(username)}</td></tr>
  <tr><td style="padding:6px 12px 6px 0;color:#78716c;font-size:13px;vertical-align:top;">Contraseña</td><td style="padding:6px 0;color:#1a1a1a;font-size:14px;">(la que escogiste al registrarte)</td></tr>
</table>
<p style="text-align:center;margin:20px 0;">
  <a href="${escapeHtml(loginUrl)}" style="display:inline-block;padding:14px 28px;background:#14685b;color:#ffffff;text-decoration:none;border-radius:8px;font-size:15px;font-weight:600;">
    Entrar a Psicomorfosis
  </a>
</p>
<p style="margin:0 0 14px 0;font-size:14px;color:#44403c;">
Cuando ingreses, primero te aparecerán unos <strong style="color:#1a1a1a;">términos y condiciones</strong>
para aceptar. Después, la misma plataforma te hará un recorrido rápido para mostrarte
las funciones principales. Desde la sección de <strong style="color:#1a1a1a;">Configuración</strong>
podrás agregar tu horario, cambiar la contraseña si lo prefieres y personalizar la
apariencia de la aplicación.
</p>
<p style="margin:0 0 14px 0;font-size:14px;color:#44403c;">
La plataforma incluye gestión de pacientes, historias clínicas, notas de sesión,
agenda, documentación, tareas terapéuticas, tests psicométricos, facturación y
reportes. En la parte documental puedes utilizar plantillas prediseñadas o también
subir, crear, guardar y editar documentos tipo Word directamente desde la
aplicación — el sistema cuenta con un editor de texto integrado para facilitar
todo el proceso.
</p>
<p style="margin:0 0 14px 0;font-size:14px;color:#44403c;">
Además, hay un <strong style="color:#1a1a1a;">portal para pacientes</strong> donde
ellos mismos pueden diligenciar formularios, responder tests, gestionar citas y
firmar documentos digitalmente. Al momento de crear un paciente, también puedes
crearle su cuenta y enviarle el acceso.
</p>
<p style="margin:0 0 14px 0;font-size:14px;color:#44403c;">
Si notas algún error, comportamiento extraño o tienes sugerencias, dentro de la
plataforma encontrarás una opción llamada <strong style="color:#1a1a1a;">Reportar
problema</strong> para enviarme feedback directamente, o desde el botón flotante
puedes escribirme a WhatsApp.
</p>
<p style="margin:18px 0 0 0;font-size:14px;color:#44403c;">
¡Muchas gracias!
</p>`;
  return emailLayout({ title: "Tu cuenta de Psicomorfosis ya está lista", bodyHtml: body });
}

/**
 * Plantilla: rechazo cordial. Sin razones específicas a menos que el admin
 * las haya escrito en `reason` (futuro: campo opcional en la UI de rechazo).
 */
function templateAccountRejected({ fullName, reason }) {
  const firstName = (fullName?.split(" ")[0] ?? "").trim();
  const saludo = firstName ? `Hola ${escapeHtml(firstName)},` : "Hola,";
  const reasonBlock = reason
    ? `<p style="margin:0 0 14px 0;font-size:14px;color:#44403c;">${escapeHtml(reason)}</p>`
    : "";
  const body = `
<p style="margin:0 0 14px 0;font-size:15px;">${saludo}</p>
<p style="margin:0 0 14px 0;font-size:14px;color:#44403c;">
Gracias por tu interés en Psicomorfosis. Por el momento no podemos abrir tu
cuenta, pero te avisaremos en cuanto se abran nuevos cupos para que puedas
acceder a la plataforma.
</p>
${reasonBlock}
<p style="margin:14px 0 0 0;font-size:13px;color:#57534e;">
Si esto fue un error o tienes dudas, responde a este correo y te ayudamos.
</p>`;
  return emailLayout({ title: "Sobre tu solicitud de acceso", bodyHtml: body, accentColor: "#78716c" });
}

/**
 * Notificación a Stiven cuando llega una solicitud nueva. Reutiliza el
 * estilo de sendDemoRequestEmail (no el emailLayout grande) para que se vea
 * como un "memo interno" rápido, no como un email a cliente.
 */
async function sendAccountRequestNotificationEmail({ request, toEmail }) {
  if (!smtpConfigured()) return { status: "skipped_no_smtp" };
  const c = getSmtpConfig();
  const fromAddress = `${c.fromName} <${c.user}>`;
  const safeName = escapeHtmlMail(String(request.full_name).slice(0, 100));
  const safeEmail = escapeHtmlMail(String(request.email).slice(0, 200));
  const safeUsername = escapeHtmlMail(String(request.username).slice(0, 100));
  const safePhone = request.phone ? escapeHtmlMail(String(request.phone).slice(0, 50)) : "";
  const safeMessage = request.message ? escapeHtmlMail(String(request.message).slice(0, 2000)) : "";

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; color: #1f2937;">
      <div style="border-left: 3px solid #1f6f6b; padding-left: 16px; margin-bottom: 24px;">
        <p style="margin: 0; font-size: 11px; text-transform: uppercase; letter-spacing: 0.1em; color: #6b7280;">Psicomorfosis · Registro</p>
        <h1 style="margin: 4px 0 0; font-size: 22px; color: #111827;">Nueva solicitud de cuenta</h1>
      </div>
      <table cellpadding="0" cellspacing="0" border="0" style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
        <tr><td style="padding: 8px 0; color: #6b7280; width: 110px;">Nombre</td><td style="padding: 8px 0; color: #111827; font-weight: 500;">${safeName}</td></tr>
        <tr><td style="padding: 8px 0; color: #6b7280;">Email</td><td style="padding: 8px 0;"><a href="mailto:${safeEmail}" style="color: #1f6f6b; text-decoration: none;">${safeEmail}</a></td></tr>
        <tr><td style="padding: 8px 0; color: #6b7280;">Usuario</td><td style="padding: 8px 0; color: #111827; font-family: monospace;">${safeUsername}</td></tr>
        ${safePhone ? `<tr><td style="padding: 8px 0; color: #6b7280;">Teléfono</td><td style="padding: 8px 0;"><a href="tel:${safePhone}" style="color: #1f6f6b; text-decoration: none;">${safePhone}</a></td></tr>` : ""}
      </table>
      ${safeMessage ? `
        <div style="background: #f9fafb; border-radius: 8px; padding: 16px; margin-bottom: 20px;">
          <p style="margin: 0 0 6px; font-size: 11px; text-transform: uppercase; letter-spacing: 0.1em; color: #6b7280;">Mensaje</p>
          <p style="margin: 0; white-space: pre-wrap; line-height: 1.55;">${safeMessage}</p>
        </div>` : ""}
      <p style="margin: 24px 0 0; font-size: 13px; color: #6b7280;">
        Revisa y aprueba en <a href="https://psico.wailus.co/platform/solicitudes" style="color:#1f6f6b;">/platform/solicitudes</a>.
      </p>
    </div>
  `;

  try {
    await sendMailWithRetry({
      from: fromAddress, to: toEmail, replyTo: request.email,
      subject: `Solicitud Psicomorfosis · ${request.full_name}`,
      html,
    });
    return { status: "sent" };
  } catch (err) {
    console.warn("[mailer] notificación admin de solicitud falló:", err?.message);
    return { status: "failed", error: String(err?.message ?? err).slice(0, 500) };
  }
}

/**
 * Envío del acuse de recibo al solicitante. Best-effort.
 */
export async function sendAccountRequestReceivedEmail({ fullName, email, username, replyTo }) {
  if (!smtpConfigured()) return { status: "skipped_no_smtp" };
  const c = getSmtpConfig();
  try {
    await sendMailWithRetry({
      from: `${c.fromName} <${c.user}>`,
      to: email,
      replyTo: replyTo || undefined,
      subject: "Recibimos tu solicitud · Psicomorfosis",
      html: templateAccountRequestReceived({ fullName, username }),
    });
    return { status: "sent" };
  } catch (err) {
    console.warn("[mailer] acuse de recibo falló:", err?.message);
    return { status: "failed", error: String(err?.message ?? err).slice(0, 500) };
  }
}

/**
 * Email de bienvenida tras aprobación. Best-effort.
 */
export async function sendAccountApprovedEmail({ fullName, email, username, loginUrl, replyTo }) {
  if (!smtpConfigured()) return { status: "skipped_no_smtp" };
  const c = getSmtpConfig();
  try {
    await sendMailWithRetry({
      from: `${c.fromName} <${c.user}>`,
      to: email,
      replyTo: replyTo || undefined,
      subject: "Tu cuenta de Psicomorfosis ya está lista",
      html: templateAccountApproved({ fullName, username, loginUrl }),
    });
    return { status: "sent" };
  } catch (err) {
    console.warn("[mailer] aprobación email falló:", err?.message);
    return { status: "failed", error: String(err?.message ?? err).slice(0, 500) };
  }
}

/**
 * Email de rechazo cordial. Best-effort.
 */
export async function sendAccountRejectedEmail({ fullName, email, reason, replyTo }) {
  if (!smtpConfigured()) return { status: "skipped_no_smtp" };
  const c = getSmtpConfig();
  try {
    await sendMailWithRetry({
      from: `${c.fromName} <${c.user}>`,
      to: email,
      replyTo: replyTo || undefined,
      subject: "Sobre tu solicitud de acceso · Psicomorfosis",
      html: templateAccountRejected({ fullName, reason }),
    });
    return { status: "sent" };
  } catch (err) {
    console.warn("[mailer] rechazo email falló:", err?.message);
    return { status: "failed", error: String(err?.message ?? err).slice(0, 500) };
  }
}

export { sendAccountRequestNotificationEmail };

function escapeHtmlMail(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
