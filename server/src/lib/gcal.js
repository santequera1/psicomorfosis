/**
 * Google Calendar por psicólogo: sincroniza citas a SU calendario y, si lo
 * activa, genera el enlace de Google Meet para las citas online.
 *
 * Modelo:
 *   - Opt-in por usuario (Configuración → Integraciones → "Conectar").
 *     Guardamos su refresh_token CIFRADO (AES-256-GCM) en users.gcal_refresh_token.
 *   - Se sincronizan citas pendiente/confirmada/en_curso. Las solicitudes del
 *     perfil público entran al calendario cuando se confirman.
 *   - Best-effort: un fallo de Google nunca rompe la operación de la cita.
 *
 * Regla del enlace (la que evita "psicóloga en Meet, paciente en Jitsi"):
 *   El enlace de una cita solo puede cambiar de Jitsi a Meet en el momento
 *   en que se va a AVISAR al paciente, y solo si Google responde antes de
 *   que salga el aviso (syncBeforeNotify, con timeout que ABORTA la petición
 *   — no la deja terminar por detrás). Cualquier sincronización en segundo
 *   plano (reprogramar sin aviso, cambios menores, reintentos) conserva el
 *   enlace que el paciente ya tiene y lo pone en la descripción del evento.
 *
 * Por qué no cuenta de servicio: Meet solo se puede crear en nombre de un
 * usuario con delegación de dominio de Google Workspace; las psicólogas
 * usan Gmail personal → cada una autoriza su propia cuenta (OAuth).
 */
import crypto from "node:crypto";
import { db } from "../db.js";

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const REVOKE_URL = "https://oauth2.googleapis.com/revoke";
const CAL_API = "https://www.googleapis.com/calendar/v3";
const TZ = "America/Bogota";
export const SCOPE_CALENDAR = "https://www.googleapis.com/auth/calendar.events";
const SYNCABLE = new Set(["pendiente", "confirmada", "en_curso"]);

// Lectura LAZY del env (los imports ESM corren antes de dotenv.config()).
const cfg = () => ({
  clientId: process.env.GOOGLE_CLIENT_ID?.trim(),
  clientSecret: process.env.GOOGLE_CLIENT_SECRET?.trim(),
  // Clave de cifrado de los refresh tokens. Si no hay una dedicada, se
  // deriva del JWT_SECRET (sha256): distinta de él, pero atada a él.
  // Cambiar cualquiera de los dos invalida los tokens guardados: el
  // usuario ve "reconecta" en Configuración (gcal_last_error).
  encKey: crypto.createHash("sha256")
    .update(String(process.env.GCAL_TOKEN_KEY || process.env.JWT_SECRET || "dev-only-key"))
    .digest(),
});
export const configured = () => Boolean(cfg().clientId && cfg().clientSecret);

// ─── Cifrado del refresh token ────────────────────────────────────────
export function encryptToken(plain) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", cfg().encKey, iv);
  const enc = Buffer.concat([cipher.update(String(plain), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1.${iv.toString("base64url")}.${tag.toString("base64url")}.${enc.toString("base64url")}`;
}
export function decryptToken(blob) {
  const [v, iv, tag, enc] = String(blob ?? "").split(".");
  if (v !== "v1" || !iv || !tag || !enc) throw new Error("token cifrado inválido");
  const decipher = crypto.createDecipheriv("aes-256-gcm", cfg().encKey, Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(enc, "base64url")), decipher.final()]).toString("utf8");
}

// ─── Conexión por usuario ─────────────────────────────────────────────
export function getConnection(userId) {
  const u = db.prepare(`
    SELECT id, gcal_refresh_token, gcal_email, gcal_connected_at, gcal_use_meet
    FROM users WHERE id = ?
  `).get(userId);
  if (!u?.gcal_refresh_token) return null;
  return { userId: u.id, email: u.gcal_email, connectedAt: u.gcal_connected_at, useMeet: !!u.gcal_use_meet };
}

export function saveConnection(userId, { refreshToken, email }) {
  // Primera conexión: Meet activo por defecto (es lo que la gente espera
  // al conectar Google; Jitsi queda como respaldo). Si ya había conexión
  // se respeta lo que la persona eligió en el interruptor.
  db.prepare(`
    UPDATE users SET gcal_refresh_token = ?, gcal_email = ?, gcal_last_error = NULL,
      gcal_use_meet = CASE WHEN gcal_connected_at IS NULL THEN 1 ELSE gcal_use_meet END,
      gcal_connected_at = ?
    WHERE id = ?
  `).run(encryptToken(refreshToken), email ?? null, new Date().toISOString(), userId);
  accessCache.delete(userId);
}

/**
 * Al conectar el calendario, copia las citas futuras que ya existían para
 * que el calendario no aparezca vacío. No toca enlaces (una cita con Jitsi
 * se queda con Jitsi; Meet es solo para citas nuevas o recién confirmadas).
 * Secuencial, en segundo plano y con pausa entre llamadas; una cita que
 * falle no frena a las demás. Se detiene si la persona desconecta a mitad.
 */
export function backfillUpcoming(userId) {
  setImmediate(async () => {
    try {
      const u = db.prepare("SELECT professional_id FROM users WHERE id = ?").get(userId);
      if (!u?.professional_id || !getConnection(userId)) return;
      const today = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
      const rows = db.prepare(`
        SELECT * FROM appointments
        WHERE professional_id = ? AND google_event_id IS NULL AND date >= ?
          AND status IN ('pendiente', 'confirmada', 'en_curso')
        ORDER BY date, time
        LIMIT 200
      `).all(u.professional_id, today);
      if (rows.length === 0) { console.log(`[gcal] backfill user=${userId}: sin citas futuras que copiar`); return; }
      let ok = 0;
      for (const appt of rows) {
        if (!getConnection(userId)) break;
        const r = await syncAppointment(appt, { allowMeet: false });
        if (r?.google_event_id) ok++;
        await new Promise((resolve) => setTimeout(resolve, 150));
      }
      console.log(`[gcal] backfill user=${userId}: ${ok}/${rows.length} citas futuras copiadas al calendario`);
    } catch (e) {
      console.warn(`[gcal] backfill user=${userId} falló:`, e?.message);
    }
  });
}

export async function disconnect(userId) {
  const u = db.prepare("SELECT gcal_refresh_token, professional_id FROM users WHERE id = ?").get(userId);
  if (u?.gcal_refresh_token) {
    // Revocar en Google para que el consentimiento no quede colgado. Si
    // falla (token ya inválido, red), igual limpiamos: la conexión muere aquí.
    try {
      const token = decryptToken(u.gcal_refresh_token);
      await fetch(`${REVOKE_URL}?token=${encodeURIComponent(token)}`, { method: "POST", signal: AbortSignal.timeout(5000) });
    } catch (e) { console.warn("[gcal] revoke:", e?.message); }
  }
  db.prepare(`
    UPDATE users SET gcal_refresh_token = NULL, gcal_email = NULL, gcal_connected_at = NULL,
                     gcal_use_meet = 0, gcal_last_error = NULL
    WHERE id = ?
  `).run(userId);
  // Los eventos ya creados se quedan en su calendario (son suyos), pero
  // dejamos de conocerlos: si conecta OTRA cuenta, las citas se vuelven a
  // crear allí en vez de PATCHear ids que ya no existen.
  if (u?.professional_id) {
    db.prepare("UPDATE appointments SET google_event_id = NULL WHERE professional_id = ? AND google_event_id IS NOT NULL")
      .run(u.professional_id);
  }
  accessCache.delete(userId);
}

/** Usuario (con calendario conectado) dueño de una cita: por professional_id. */
export function connectionForAppointment(appt) {
  if (!appt?.professional_id) return null;
  const u = db.prepare(`
    SELECT id FROM users
    WHERE professional_id = ? AND workspace_id = ? AND role <> 'paciente' AND gcal_refresh_token IS NOT NULL
    ORDER BY id LIMIT 1
  `).get(appt.professional_id, appt.workspace_id);
  return u ? getConnection(u.id) : null;
}

// ─── Access token (con caché en memoria) ─────────────────────────────
const accessCache = new Map(); // userId → { token, exp }

async function accessToken(userId, signal) {
  const hit = accessCache.get(userId);
  if (hit && hit.exp > Date.now() + 30_000) return hit.token;
  const u = db.prepare("SELECT gcal_refresh_token FROM users WHERE id = ?").get(userId);
  if (!u?.gcal_refresh_token) throw new Error("sin calendario conectado");
  const r = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: cfg().clientId,
      client_secret: cfg().clientSecret,
      refresh_token: decryptToken(u.gcal_refresh_token),
      grant_type: "refresh_token",
    }),
    signal,
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.access_token) {
    // invalid_grant = el usuario revocó el acceso desde su cuenta de Google
    // o el token caducó (apps sin verificar: 7 días en "testing"). Dejamos
    // constancia para que Configuración le pida reconectar.
    const msg = j.error_description || j.error || `HTTP ${r.status}`;
    db.prepare("UPDATE users SET gcal_last_error = ? WHERE id = ?").run(String(msg).slice(0, 200), userId);
    throw new Error(`refresh falló: ${msg}`);
  }
  accessCache.set(userId, { token: j.access_token, exp: Date.now() + (Number(j.expires_in) || 3600) * 1000 });
  return j.access_token;
}

class GapiError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

async function gapi(userId, method, path, body, { conference = false, signal } = {}) {
  const token = await accessToken(userId, signal);
  const url = `${CAL_API}${path}${conference ? (path.includes("?") ? "&" : "?") + "conferenceDataVersion=1" : ""}`;
  const r = await fetch(url, {
    method,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
    signal,
  });
  if (r.status === 204) return null;
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new GapiError(r.status, `${method} ${path} → ${r.status} ${j?.error?.message ?? ""}`.trim());
  return j;
}

// ─── Evento a partir de la cita ───────────────────────────────────────
export const isTele = (m) => m === "tele" || m === "virtual";

function eventBody(appt, { includeLink, forPatch }) {
  const [y, mo, d] = String(appt.date).split("-").map(Number);
  const [hh, mm] = String(appt.time ?? "09:00").split(":").map(Number);
  // Hora "de pared" en Colombia: construimos el instante en UTC con esas
  // cifras y lo serializamos sin zona; Google lo interpreta con timeZone.
  const start = new Date(Date.UTC(y, mo - 1, d, hh, mm));
  const end = new Date(start.getTime() + (Number(appt.duration_min) || 50) * 60_000);
  const fmt = (dt) => dt.toISOString().slice(0, 19);
  const online = isTele(appt.modality);
  return {
    summary: `Sesión · ${appt.patient_name || "paciente"}`,
    description: [
      online ? "Modalidad: online" : `Modalidad: presencial${appt.room ? ` · ${appt.room}` : ""}`,
      // El enlace que tiene el paciente, cuando no es el Meet del propio evento.
      includeLink && appt.meeting_url ? `Videollamada: ${appt.meeting_url}` : null,
      "Creado por Psicomorfosis",
    ].filter(Boolean).join("\n"),
    start: { dateTime: fmt(start), timeZone: TZ },
    end: { dateTime: fmt(end), timeZone: TZ },
    // En PATCH hay que mandar null para LIMPIAR (undefined se omite y el
    // consultorio viejo se quedaba en un evento que pasó a online).
    location: online ? (forPatch ? null : undefined) : (appt.room || (forPatch ? null : undefined)),
    status: "confirmed",
    reminders: { useDefault: true },
    extendedProperties: { private: { psicomorfosis_appt: String(appt.id) } },
  };
}

// ─── Sincronización ───────────────────────────────────────────────────
// Una operación en vuelo por cita: evita dos inserts simultáneos y deja
// que borrar/cancelar espere a que termine el insert antes de decidir.
const inflight = new Map(); // apptId → Promise

function setError(userId, msg) {
  try { db.prepare("UPDATE users SET gcal_last_error = ? WHERE id = ?").run(String(msg).slice(0, 200), userId); } catch { /* noop */ }
}
function clearError(userId) {
  try { db.prepare("UPDATE users SET gcal_last_error = NULL WHERE id = ?").run(userId); } catch { /* noop */ }
}

/**
 * Crea o actualiza el evento de la cita en el calendario del profesional.
 * `allowMeet`: solo true desde syncBeforeNotify (el aviso al paciente aún
 * no salió). Nunca lanza; devuelve la fila (con Meet si lo obtuvo).
 */
export async function syncAppointment(appt, { allowMeet = false, signal } = {}) {
  if (!configured() || !appt) return appt;
  if (!SYNCABLE.has(String(appt.status))) return appt;
  const conn = connectionForAppointment(appt);
  if (!conn) return appt;
  const prev = inflight.get(appt.id);
  if (prev) { try { await prev; } catch { /* ya registrado */ } }
  const p = doSync(appt, conn, { allowMeet, signal });
  inflight.set(appt.id, p);
  try { return await p; } finally { if (inflight.get(appt.id) === p) inflight.delete(appt.id); }
}

async function doSync(appt, conn, { allowMeet, signal }) {
  const online = isTele(appt.modality);
  // Meet solo al crear el enlace que va a viajar en el aviso: cita online,
  // Meet activo, permitido en esta llamada, y sin evento previo (una cita
  // que ya está en el calendario conserva lo que tiene).
  const wantMeet = online && conn.useMeet && allowMeet && !appt.google_event_id;
  try {
    let ev;
    if (appt.google_event_id) {
      const body = eventBody(appt, { includeLink: online && appt.video_provider !== "meet", forPatch: true });
      if (!online) body.conferenceData = null; // pasó a presencial: quitar Meet si lo tenía
      try {
        ev = await gapi(conn.userId, "PATCH", `/calendars/primary/events/${encodeURIComponent(appt.google_event_id)}`, body, { conference: true, signal });
      } catch (e) {
        // El evento ya no existe (borrado a mano, otra cuenta conectada):
        // se olvida el id y se vuelve a crear en la misma pasada.
        if (!(e instanceof GapiError && (e.status === 404 || e.status === 410))) throw e;
        db.prepare("UPDATE appointments SET google_event_id = NULL WHERE id = ?").run(appt.id);
        const body2 = eventBody({ ...appt, google_event_id: null }, { includeLink: online, forPatch: false });
        ev = await gapi(conn.userId, "POST", `/calendars/primary/events`, body2, { conference: true, signal });
      }
    } else {
      const body = eventBody(appt, { includeLink: online && !wantMeet, forPatch: false });
      if (wantMeet) {
        body.conferenceData = { createRequest: { requestId: crypto.randomUUID(), conferenceSolutionKey: { type: "hangoutsMeet" } } };
      }
      ev = await gapi(conn.userId, "POST", `/calendars/primary/events`, body, { conference: true, signal });
    }

    // ¿La cita sigue viva? Si la cancelaron/borraron mientras Google
    // respondía, el evento recién creado sobraría: se borra y no se escribe.
    const now = db.prepare("SELECT * FROM appointments WHERE id = ?").get(appt.id);
    if (!now || !SYNCABLE.has(String(now.status))) {
      if (ev?.id) {
        try { await gapi(conn.userId, "DELETE", `/calendars/primary/events/${encodeURIComponent(ev.id)}`); } catch { /* best-effort */ }
      }
      return appt;
    }

    const meet = wantMeet
      ? (ev?.hangoutLink || ev?.conferenceData?.entryPoints?.find((e) => e.entryPointType === "video")?.uri || null)
      : null;
    if (meet) {
      db.prepare("UPDATE appointments SET google_event_id = ?, meeting_url = ?, video_provider = 'meet' WHERE id = ?")
        .run(ev.id, meet, appt.id);
    } else {
      db.prepare("UPDATE appointments SET google_event_id = ?, video_provider = CASE WHEN ? THEN video_provider ELSE NULL END WHERE id = ?")
        .run(ev?.id ?? appt.google_event_id ?? null, online ? 1 : 0, appt.id);
    }
    clearError(conn.userId);
    const fresh = db.prepare("SELECT * FROM appointments WHERE id = ?").get(appt.id);
    console.log(`[gcal] cita ${appt.id} → evento ${fresh?.google_event_id}${meet ? " + Meet" : ""}`);
    return fresh ?? appt;
  } catch (e) {
    if (e?.name === "AbortError" || e?.name === "TimeoutError") {
      console.warn(`[gcal] cita ${appt.id}: Google no respondió a tiempo; se reintenta en 2º plano sin cambiar el enlace`);
      // Reintento sin Meet: el aviso ya salió (o va a salir) con Jitsi.
      setImmediate(() => { syncAppointment(appt, { allowMeet: false }).catch(() => {}); });
      return appt;
    }
    console.warn(`[gcal] sync cita ${appt.id} falló:`, e?.message);
    setError(conn.userId, e?.message);
    return appt;
  }
}

/** Sincroniza sin esperar y sin tocar el enlace del paciente. */
export function syncAppointmentAsync(appt) {
  setImmediate(() => { syncAppointment(appt, { allowMeet: false }).catch(() => {}); });
}

/**
 * Borra el evento de Google (cita cancelada/eliminada) y olvida el id, para
 * que reactivar la cita la vuelva a crear. Espera a un insert en vuelo.
 * Best-effort.
 */
export function removeEventAsync(appt) {
  if (!configured() || !appt?.professional_id) return;
  const conn = connectionForAppointment(appt);
  if (!conn) return;
  setImmediate(async () => {
    const prev = inflight.get(appt.id);
    if (prev) { try { await prev; } catch { /* noop */ } }
    const row = db.prepare("SELECT google_event_id FROM appointments WHERE id = ?").get(appt.id);
    const eventId = row ? row.google_event_id : appt.google_event_id;
    if (!eventId) return;
    try {
      await gapi(conn.userId, "DELETE", `/calendars/primary/events/${encodeURIComponent(eventId)}`);
      console.log(`[gcal] evento ${eventId} borrado (cita ${appt.id})`);
      clearError(conn.userId);
    } catch (e) {
      // 404/410: ya no existía en Google — no es un error.
      if (!(e instanceof GapiError && (e.status === 404 || e.status === 410))) {
        console.warn("[gcal] borrar evento:", e?.message);
        setError(conn.userId, e?.message);
      }
    }
    // La fila puede ya no existir (DELETE): el UPDATE afecta 0 filas y listo.
    db.prepare("UPDATE appointments SET google_event_id = NULL, video_provider = CASE WHEN video_provider = 'meet' THEN NULL ELSE video_provider END WHERE id = ?").run(appt.id);
  });
}

/**
 * Sincroniza ANTES de avisar al paciente. Si la cita es online y el
 * profesional usa Meet, espera (máx. `timeoutMs`) a que Google devuelva el
 * enlace para que viaje en el aviso; si se agota, la petición se ABORTA
 * (no puede escribir Meet por detrás) y el aviso sale con Jitsi. Si no
 * aplica Meet, sincroniza en segundo plano y devuelve enseguida.
 */
export async function syncBeforeNotify(appt, timeoutMs = 4000) {
  if (!configured() || !appt) return appt;
  const conn = connectionForAppointment(appt);
  if (!conn) return appt;
  if (!isTele(appt.modality) || !conn.useMeet || appt.google_event_id) {
    syncAppointmentAsync(appt);
    return appt;
  }
  return syncAppointment(appt, { allowMeet: true, signal: AbortSignal.timeout(timeoutMs) });
}
