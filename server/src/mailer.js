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

// ─── Configuración SMTP (env vars) ────────────────────────────────────

const SMTP_HOST = process.env.SMTP_HOST;
const SMTP_PORT = Number(process.env.SMTP_PORT ?? 465);
const SMTP_SECURE = String(process.env.SMTP_SECURE ?? "true") === "true";
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;
const SMTP_FROM_NAME = process.env.SMTP_FROM_NAME ?? "Psicomorfosis";

function smtpConfigured() {
  return !!(SMTP_HOST && SMTP_USER && SMTP_PASS);
}

let _transport = null;
function getTransport() {
  if (_transport) return _transport;
  if (!smtpConfigured()) return null;
  _transport = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_SECURE, // true para puerto 465 (SSL), false para 587 (STARTTLS)
    auth: { user: SMTP_USER, pass: SMTP_PASS },
    // Timeouts conservadores: si SMTP cae, no queremos bloquear 30s la
    // creación de citas. 8s es suficiente para una sesión normal.
    connectionTimeout: 8_000,
    greetingTimeout: 8_000,
    socketTimeout: 8_000,
  });
  return _transport;
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
    const transport = getTransport();
    const profDisplay = professional?.name ? `${professional.name} · ${SMTP_FROM_NAME}` : SMTP_FROM_NAME;
    const fromAddress = `${profDisplay} <${SMTP_USER}>`;
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

    await transport.sendMail({
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
  if (smtpConfigured()) {
    console.log(`[mailer] SMTP listo: ${SMTP_USER} @ ${SMTP_HOST}:${SMTP_PORT} (secure=${SMTP_SECURE})`);
  } else {
    console.warn("[mailer] SMTP NO configurado — emails de citas no se enviarán. Setea SMTP_HOST/USER/PASS en .env.");
  }
}
