/**
 * Cliente del bot externo de messaging.
 *
 *   Psicomorfosis ──HTTPS+HMAC──→  Bot externo  ──WHAPI/Meta──→  WhatsApp
 *                ←──── Webhook firmado ────
 *
 * Esta capa NO sabe nada de WhatsApp. Solo emite eventos firmados a una
 * URL configurable (`MESSAGING_BOT_URL`) y procesa los webhooks de
 * vuelta. Cambiar de WHAPI a Meta = cambiar el bot, no esta lib.
 *
 * Protocolo de firma (estilo Stripe):
 *   Header: X-Psicomorfosis-Signature: t=<unix>,v1=<hmac>
 *   Donde hmac = HMAC_SHA256(secret, `${t}.${raw_body}`)
 *
 *   Anti-replay: rechazamos timestamps con desfase > 5 min.
 *   Timing-safe compare: usamos crypto.timingSafeEqual para prevenir
 *   side-channel timing attacks en la verificación.
 *
 * Variables de entorno requeridas (leídas lazy para que dotenvConfig
 * en index.js corra primero):
 *   - MESSAGING_BOT_URL          URL del bot (POST recibe eventos)
 *   - MESSAGING_OUTBOUND_SECRET  secret para firmar salientes
 *   - MESSAGING_INBOUND_SECRET   secret para verificar entrantes
 *   - MESSAGING_ENABLED          "1" para habilitar globalmente
 *   - MESSAGING_DEFAULT_COUNTRY  ej "+57" (prefijo para teléfonos sin +)
 */

import crypto from "node:crypto";
import { db } from "../db.js";
import { EVENTS, isValidEventType } from "./messaging-events.js";
import { DEFAULT_TEMPLATES, renderTemplate } from "./messaging-templates.js";

// ── Config lazy ────────────────────────────────────────────────────────
function env(name, fallback = null) {
  return process.env[name] ?? fallback;
}

function isGloballyEnabled() {
  return env("MESSAGING_ENABLED") === "1";
}

const MAX_CLOCK_SKEW_SEC = 5 * 60;       // 5 min anti-replay
const OUTBOUND_TIMEOUT_MS = 10_000;       // 10s al bot externo
const MAX_RETRIES = 3;
const RETRY_BACKOFF_MS = [300, 1_500, 5_000]; // jitter en cada uno

// ── Firma saliente ─────────────────────────────────────────────────────

/**
 * Firma un body para envío saliente al bot. Retorna el header completo.
 *   sign("{...}", "secret") → "t=1717604400,v1=abc..."
 */
export function signOutbound(rawBody, secret) {
  if (typeof rawBody !== "string") {
    throw new Error("signOutbound: rawBody debe ser string (JSON.stringify del payload)");
  }
  if (!secret) throw new Error("signOutbound: falta secret");
  const t = Math.floor(Date.now() / 1000);
  const sig = crypto
    .createHmac("sha256", secret)
    .update(`${t}.${rawBody}`)
    .digest("hex");
  return `t=${t},v1=${sig}`;
}

/**
 * Verifica una firma entrante. Devuelve true/false. NUNCA lanza para
 * que el caller pueda decidir qué responder al cliente sin filtrar
 * detalles del fallo en el log.
 *
 *   verifyInbound(rawBody, headerValue, secret, { maxSkewSec? })
 *
 * Reglas:
 *   1. Header parseable como "t=<n>,v1=<hex>"
 *   2. t numérico y dentro de MAX_CLOCK_SKEW_SEC respecto a Date.now()
 *   3. HMAC recalculado coincide en tiempo constante con v1
 */
export function verifyInbound(rawBody, headerValue, secret, opts = {}) {
  if (typeof rawBody !== "string" || !headerValue || !secret) return false;
  const maxSkew = opts.maxSkewSec ?? MAX_CLOCK_SKEW_SEC;
  const parts = {};
  for (const seg of headerValue.split(",")) {
    const [k, v] = seg.split("=");
    if (k && v) parts[k.trim()] = v.trim();
  }
  const t = Number(parts.t);
  const v1 = parts.v1;
  if (!Number.isFinite(t) || !v1) return false;
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - t) > maxSkew) return false;

  const expected = crypto
    .createHmac("sha256", secret)
    .update(`${t}.${rawBody}`)
    .digest("hex");

  // timingSafeEqual requiere buffers del mismo length. Si son distintos,
  // bailout antes; comparar lengths NO es side-channel sensible para
  // hex de 64 chars de un HMAC SHA-256.
  const a = Buffer.from(expected, "hex");
  const b = Buffer.from(v1, "hex");
  if (a.length !== b.length) return false;
  try {
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

// ── Envío saliente ─────────────────────────────────────────────────────

/**
 * Envía un evento al bot externo con retries y registro de auditoría.
 *
 * @param {object} args
 * @param {number} args.workspace_id
 * @param {string} args.event_type    — debe estar en EVENTS
 * @param {object} args.recipient     — { kind, id, phone, name, first_name }
 * @param {object} args.data          — datos específicos del evento
 * @param {string} args.sender_label  — firma del psicólogo
 * @param {string} [args.idempotency_key] — para evitar duplicados en logs
 * @param {string} [args.rendered_message] — opcional: texto ya renderizado
 *                                            (si lo omitís, lo renderiza
 *                                            con la plantilla del workspace)
 * @returns {Promise<{ok: boolean, status: string, log_id: number, error?: string}>}
 */
export async function sendBotEvent(args) {
  const {
    workspace_id, event_type, recipient, data = {}, sender_label,
    idempotency_key = null, rendered_message: overrideMessage = null,
  } = args;

  if (!isValidEventType(event_type)) {
    throw new Error(`sendBotEvent: event_type inválido "${event_type}"`);
  }
  if (!workspace_id) throw new Error("sendBotEvent: falta workspace_id");
  if (!recipient || !recipient.phone) {
    throw new Error("sendBotEvent: recipient.phone es requerido");
  }

  // Idempotencia: si el log ya tiene una fila SENT con esta key, no
  // re-enviamos. Cron de recordatorios depende fuertemente de esto.
  if (idempotency_key) {
    const prev = db.prepare(
      `SELECT id, status FROM messaging_outbound_log
       WHERE idempotency_key = ? AND status = 'sent'
       ORDER BY id DESC LIMIT 1`,
    ).get(idempotency_key);
    if (prev) {
      return { ok: true, status: "deduped", log_id: prev.id };
    }
  }

  const rendered = overrideMessage ?? renderForWorkspace({
    workspace_id, event_type, data, recipient, sender_label,
  });

  const payload = {
    event: event_type,
    workspace_id,
    sent_at: new Date().toISOString(),
    idempotency_key,
    recipient: {
      kind: recipient.kind,
      id: recipient.id ?? null,
      phone: recipient.phone,
      name: recipient.name ?? null,
    },
    data,
    rendered_message: rendered,
    meta: {
      sender_label: sender_label ?? null,
      app: "psicomorfosis",
      version: 1,
    },
  };

  // Globally disabled o sin URL configurada: registramos como skipped.
  // Esto permite hacer dry-run en desarrollo sin un bot corriendo.
  const url = env("MESSAGING_BOT_URL");
  const secret = env("MESSAGING_OUTBOUND_SECRET");
  if (!isGloballyEnabled() || !url || !secret) {
    const logId = insertLog({
      workspace_id, event_type, idempotency_key,
      recipient_kind: recipient.kind, recipient_id: recipient.id ?? null,
      recipient_phone: recipient.phone,
      payload_json: JSON.stringify(payload),
      rendered_message: rendered,
      status: "skipped_disabled",
    });
    return { ok: true, status: "skipped_disabled", log_id: logId };
  }

  const rawBody = JSON.stringify(payload);
  const sigHeader = signOutbound(rawBody, secret);

  let lastError = null;
  let response = null;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const controller = new AbortController();
      const tm = setTimeout(() => controller.abort(), OUTBOUND_TIMEOUT_MS);
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Psicomorfosis-Signature": sigHeader,
          "X-Psicomorfosis-Event": event_type,
          "X-Psicomorfosis-Workspace": String(workspace_id),
        },
        body: rawBody,
        signal: controller.signal,
      });
      clearTimeout(tm);
      const body = await res.text();
      response = { status: res.status, body };
      if (res.status >= 200 && res.status < 300) break;
      if (res.status >= 400 && res.status < 500) {
        // 4xx no se reintenta — es nuestro error
        lastError = `HTTP ${res.status}: ${body.slice(0, 200)}`;
        break;
      }
      // 5xx: reintentar
      lastError = `HTTP ${res.status}: ${body.slice(0, 200)}`;
    } catch (err) {
      lastError = err.name === "AbortError" ? "timeout" : (err.message ?? String(err));
    }
    if (attempt < MAX_RETRIES) {
      const base = RETRY_BACKOFF_MS[attempt] ?? 5_000;
      const jitter = Math.floor(Math.random() * 250);
      await new Promise((r) => setTimeout(r, base + jitter));
    }
  }

  const ok = response?.status >= 200 && response?.status < 300;
  const logId = insertLog({
    workspace_id, event_type, idempotency_key,
    recipient_kind: recipient.kind, recipient_id: recipient.id ?? null,
    recipient_phone: recipient.phone,
    payload_json: rawBody,
    rendered_message: rendered,
    status: ok ? "sent" : "failed",
    bot_response_code: response?.status ?? null,
    bot_response_body: response?.body?.slice(0, 1000) ?? null,
    retry_count: ok ? 0 : MAX_RETRIES,
    error: ok ? null : lastError,
  });

  return ok
    ? { ok: true, status: "sent", log_id: logId }
    : { ok: false, status: "failed", log_id: logId, error: lastError };
}

// ── Renderizado por workspace ──────────────────────────────────────────

/**
 * Renderiza el mensaje final para un evento. Busca plantilla custom del
 * workspace; si no hay, usa la default del catálogo. El payload de
 * variables se compone de:
 *   - data (todo lo del evento)
 *   - patient / professional / appointment / document / task / etc.
 *     (lo que data ya traiga)
 *   - sender_label
 *   - portal_url, app_url (env)
 */
function renderForWorkspace({ workspace_id, event_type, data, recipient, sender_label }) {
  const row = db.prepare(
    `SELECT body_text FROM message_templates
     WHERE workspace_id = ? AND event_type = ? AND channel = 'whatsapp' AND enabled = 1`,
  ).get(workspace_id, event_type);
  const template = row?.body_text ?? DEFAULT_TEMPLATES[event_type] ?? "";

  const ctx = {
    ...data,
    sender_label: sender_label ?? "tu psicóloga",
    portal_url: env("PUBLIC_PORTAL_URL", "https://psico.wailus.co"),
    app_url:    env("PUBLIC_APP_URL", "https://psico.wailus.co"),
    recipient,
  };
  return renderTemplate(template, ctx);
}

// ── Auditoría ──────────────────────────────────────────────────────────

function insertLog(row) {
  const result = db.prepare(
    `INSERT INTO messaging_outbound_log
     (workspace_id, event_type, idempotency_key,
      recipient_kind, recipient_id, recipient_phone,
      payload_json, rendered_message, status,
      bot_response_code, bot_response_body, retry_count, error)
     VALUES (@workspace_id, @event_type, @idempotency_key,
             @recipient_kind, @recipient_id, @recipient_phone,
             @payload_json, @rendered_message, @status,
             @bot_response_code, @bot_response_body, @retry_count, @error)`,
  ).run({
    bot_response_code: null,
    bot_response_body: null,
    retry_count: 0,
    error: null,
    ...row,
  });
  return result.lastInsertRowid;
}

// ── Util de teléfono ───────────────────────────────────────────────────

/**
 * Normaliza un teléfono al formato E.164 (`+57...`). Acepta:
 *   "3001234567"           → "+573001234567"
 *   "+57 300 123 4567"     → "+573001234567"
 *   "57 300 123 4567"      → "+573001234567"
 *
 * Útil al construir el `recipient.phone` desde patient.phone que viene
 * en cualquier formato.
 */
export function normalizePhone(raw) {
  if (!raw) return null;
  const cleaned = String(raw).replace(/[^\d+]/g, "");
  if (cleaned.startsWith("+")) return cleaned;
  const cc = env("MESSAGING_DEFAULT_COUNTRY", "+57").replace(/[^\d+]/g, "");
  if (cleaned.startsWith(cc.replace("+", ""))) return `+${cleaned}`;
  return `${cc}${cleaned}`;
}

// ── Diagnóstico ────────────────────────────────────────────────────────

/**
 * Retorna el estado actual de la config de messaging para mostrar al
 * super_admin en una pantalla de diagnóstico.
 */
export function messagingStatus() {
  return {
    globally_enabled: isGloballyEnabled(),
    bot_url_configured: Boolean(env("MESSAGING_BOT_URL")),
    outbound_secret_configured: Boolean(env("MESSAGING_OUTBOUND_SECRET")),
    inbound_secret_configured: Boolean(env("MESSAGING_INBOUND_SECRET")),
    default_country: env("MESSAGING_DEFAULT_COUNTRY", "+57"),
  };
}
