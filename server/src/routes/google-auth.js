/**
 * Login / registro con Google (OAuth 2.0, flujo de código de autorización).
 *
 *   GET /api/auth/google           → redirige a la pantalla de Google
 *   GET /api/auth/google/callback  → Google vuelve aquí con ?code
 *
 * Qué hace el callback:
 *   1. Canjea el `code` por un `id_token` (JWT firmado por Google).
 *   2. Valida el token contra las claves públicas de Google (aud, iss, exp).
 *   3. Identifica al usuario: primero por `sub` (el id estable de Google,
 *      guardado al vincular), y si no, por correo.
 *        - existe  → inicia sesión
 *        - no existe → crea su workspace igual que el registro normal
 *      POST /api/auth/google/link-start arranca un flujo distinto: en vez
 *      de iniciar sesión, conecta esa cuenta de Google al usuario logueado.
 *      Eso permite entrar con Google aunque el correo de la plataforma
 *      no sea de Google (p. ej. una casilla propia @psicomorfosis.co).
 *   4. Redirige al front con el token en el fragmento (#), no en la query:
 *      el fragmento no viaja al servidor ni queda en logs/Referer.
 *
 * Sin dependencias nuevas: `fetch` y `crypto` son nativos de Node 18+.
 * El scope es solo openid/email/profile — no requiere verificación de Google.
 */

import { Router } from "express";
import crypto from "node:crypto";
import { db, seedTaskColumns } from "../db.js";
import { signToken, requireAuth } from "../auth.js";
import { sendWelcomeEmail } from "../mailer.js";
import { recordSignupAcceptances } from "./legal.js";
import { publicSignupEnabled } from "./auth.js";
import { notifyWhatsappSetup } from "../lib/psicobot.js";
import { SCOPE_CALENDAR, getConnection, saveConnection, disconnect as gcalDisconnect } from "../lib/gcal.js";
import rateLimit from "express-rate-limit";

const router = Router();

const GOOGLE_AUTH = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN = "https://oauth2.googleapis.com/token";
const GOOGLE_CERTS = "https://www.googleapis.com/oauth2/v3/certs";

// Lectura LAZY del env (los imports ESM corren antes de dotenv.config()).
const cfg = () => ({
  clientId: process.env.GOOGLE_CLIENT_ID?.trim(),
  clientSecret: process.env.GOOGLE_CLIENT_SECRET?.trim(),
  redirectUri: process.env.GOOGLE_REDIRECT_URI?.trim()
    || "https://psicomorfosis.co/api/auth/google/callback",
  appUrl: process.env.PUBLIC_APP_URL?.trim() || "https://psicomorfosis.co",
});
const configured = () => Boolean(cfg().clientId && cfg().clientSecret);

/**
 * Estados anti-CSRF. En memoria: son de un solo uso y viven ~10 min, así
 * que un restart solo obliga a reintentar el login. Sin esto, un atacante
 * podría inducir un callback y enlazar su cuenta de Google con otra sesión.
 */
/**
 * Límites. El registro por formulario ya tenía tope (5 cada 6 h); sin
 * esto, Google era la puerta sin cerradura: mismo efecto (crear cuentas)
 * sin ningún freno. El del arranque además acota cuánto puede crecer el
 * Map de states, que solo se purga al emitir uno nuevo.
 */
const googleStartLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => fail(res, "demasiados_intentos"),
});
/**
 * link-start responde JSON, no una redirección: el front lo llama con
 * fetch. Devolverle un 302 haría que el cliente siguiera el redirect,
 * recibiera HTML y fallara al parsear, con un error que no dice nada.
 */
const linkStartLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => res.status(429).json({
    error: "Demasiados intentos seguidos. Espera unos minutos.",
  }),
});
// 60/h por IP. El callback se toca una vez por ingreso, así que a una
// persona le sobra; el tope existe para el abuso con script, que haría
// miles. Holgado a propósito: varios profesionales tras el NAT de un
// mismo consultorio comparten IP, y quedarse fuera de tu propia agenda
// por un límite antiabuso es peor que el abuso.
const googleCallbackLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => fail(res, "demasiados_intentos"),
});

const states = new Map();
/** `linkUserId` presente = flujo de VINCULAR (usuario ya autenticado).
 *  `purpose` = "login" | "link" | "calendar". */
function issueState(linkUserId = null, purpose = linkUserId ? "link" : "login", nonce = null) {
  const s = crypto.randomBytes(24).toString("hex");
  states.set(s, { at: Date.now(), linkUserId, purpose, nonce });
  const cutoff = Date.now() - 10 * 60 * 1000;
  for (const [k, v] of states) if (v.at < cutoff) states.delete(k);
  return s;
}
/** Devuelve null si es inválido/expirado, o { linkUserId } si es válido. */
function consumeState(s) {
  if (!s || !states.has(s)) return null;
  const v = states.get(s);
  states.delete(s);
  return Date.now() - v.at < 10 * 60 * 1000 ? v : null;
}

/** Cache de las claves públicas de Google (rotan cada pocas horas). */
let certsCache = { keys: null, at: 0 };
async function googleKeys() {
  if (certsCache.keys && Date.now() - certsCache.at < 60 * 60 * 1000) return certsCache.keys;
  const r = await fetch(GOOGLE_CERTS);
  if (!r.ok) throw new Error("no se pudieron leer las claves de Google");
  const { keys } = await r.json();
  certsCache = { keys, at: Date.now() };
  return keys;
}

const b64url = (s) => Buffer.from(String(s).replace(/-/g, "+").replace(/_/g, "/"), "base64");

/**
 * Verifica la firma y los claims del id_token. No usamos una librería
 * externa: es RS256 sobre JWK, que `crypto` soporta de forma nativa.
 */
async function verifyIdToken(idToken) {
  const [h, p, sig] = String(idToken).split(".");
  if (!h || !p || !sig) throw new Error("id_token malformado");
  const header = JSON.parse(b64url(h).toString("utf8"));
  const payload = JSON.parse(b64url(p).toString("utf8"));

  const keys = await googleKeys();
  const jwk = keys.find((k) => k.kid === header.kid);
  if (!jwk) throw new Error("clave de firma desconocida");

  const pub = crypto.createPublicKey({ key: jwk, format: "jwk" });
  const ok = crypto.verify(
    "RSA-SHA256",
    Buffer.from(`${h}.${p}`),
    pub,
    b64url(sig),
  );
  if (!ok) throw new Error("firma inválida");

  const now = Math.floor(Date.now() / 1000);
  if (payload.aud !== cfg().clientId) throw new Error("aud no coincide");
  if (!["accounts.google.com", "https://accounts.google.com"].includes(payload.iss)) {
    throw new Error("emisor inválido");
  }
  if (typeof payload.exp !== "number" || payload.exp < now - 60) throw new Error("id_token vencido");
  if (!payload.email) throw new Error("Google no devolvió correo");
  if (payload.email_verified === false) throw new Error("correo no verificado en Google");
  return payload;
}

/** Deriva un username libre desde el correo. */
function deriveUsername(email) {
  const base = String(email).split("@")[0].toLowerCase().replace(/[^a-z0-9._-]/g, "") || "user";
  let candidate = base;
  let n = 1;
  while (db.prepare("SELECT 1 FROM users WHERE LOWER(username) = LOWER(?)").get(candidate)) {
    n += 1;
    candidate = base + n;
    if (n > 999) return null;
  }
  return candidate;
}

/** Redirige al front con un mensaje de error legible. */
function fail(res, code) {
  return res.redirect(`${cfg().appUrl}/login?google_error=${encodeURIComponent(code)}`);
}

/** Arma la URL de autorización de Google con un state fresco. */
/**
 * Los flujos que ESCRIBEN sobre un usuario ya autenticado (vincular Google,
 * conectar calendario) van atados al navegador que los inició: una cookie
 * HttpOnly con un nonce que el callback compara con el state. Sin esto, un
 * usuario podía generar una URL legítima de Google con SU state y hacer
 * que otra persona la completara con SU cuenta ("consent phishing"): la
 * cuenta de Google de la víctima quedaba conectada a la del atacante.
 */
const NONCE_COOKIE = "psm_oauth_nonce";
function setNonceCookie(res) {
  const nonce = crypto.randomBytes(16).toString("hex");
  const secure = (cfg().appUrl || "").startsWith("https://") ? "; Secure" : "";
  res.setHeader("Set-Cookie", `${NONCE_COOKIE}=${nonce}; Path=/api/auth/google; HttpOnly; SameSite=Lax; Max-Age=600${secure}`);
  return nonce;
}
function readNonceCookie(req) {
  const raw = String(req.headers.cookie ?? "");
  const m = raw.match(new RegExp(`(?:^|;\\s*)${NONCE_COOKIE}=([a-f0-9]{32})`));
  return m ? m[1] : null;
}

function authorizeUrl(linkUserId = null, opts = {}) {
  const params = new URLSearchParams({
    client_id: cfg().clientId,
    redirect_uri: cfg().redirectUri,
    response_type: "code",
    scope: opts.scope ?? "openid email profile",
    state: issueState(linkUserId, opts.purpose, opts.nonce ?? null),
    // Pide seleccionar cuenta siempre: evita entrar con la sesión de
    // Google equivocada sin darse cuenta (típico en equipos compartidos).
    prompt: opts.prompt ?? "select_account",
  });
  // Calendario: access_type=offline + prompt=consent garantizan que Google
  // devuelva refresh_token (sin consent solo lo da la primera vez).
  if (opts.offline) { params.set("access_type", "offline"); params.set("include_granted_scopes", "true"); }
  return `${GOOGLE_AUTH}?${params}`;
}

/**
 * Paso 1 del flujo de CONECTAR GOOGLE CALENDAR (usuario autenticado).
 * Devuelve la URL (el JWT viaja en la cabecera, no en la query).
 */
router.post("/google/calendar/start", linkStartLimiter, requireAuth, (req, res) => {
  if (!configured()) return res.status(503).json({ error: "Google no está configurado" });
  res.json({
    url: authorizeUrl(req.user.id, {
      purpose: "calendar",
      scope: `openid email ${SCOPE_CALENDAR}`,
      offline: true,
      // consent → garantiza refresh_token; select_account → en un equipo
      // compartido no conecta la cuenta de Google que estuviera abierta.
      prompt: "consent select_account",
      nonce: setNonceCookie(res),
    }),
  });
});

/** Estado de la conexión de calendario del usuario actual. */
router.get("/google/calendar", requireAuth, (req, res) => {
  const conn = getConnection(req.user.id);
  const u = db.prepare("SELECT gcal_last_error FROM users WHERE id = ?").get(req.user.id);
  res.json({
    enabled: configured(),
    connected: !!conn,
    email: conn?.email ?? null,
    connectedAt: conn?.connectedAt ?? null,
    useMeet: conn?.useMeet ?? false,
    lastError: u?.gcal_last_error ?? null,
  });
});

/** Preferencias: usar Meet (en vez de Jitsi) en citas online. */
router.patch("/google/calendar", requireAuth, (req, res) => {
  if (!getConnection(req.user.id)) return res.status(409).json({ error: "Conecta Google Calendar primero" });
  if (typeof req.body?.useMeet === "boolean") {
    db.prepare("UPDATE users SET gcal_use_meet = ? WHERE id = ?").run(req.body.useMeet ? 1 : 0, req.user.id);
  }
  res.json({ ok: true, useMeet: !!getConnection(req.user.id)?.useMeet });
});

/** Desconectar: revoca en Google y borra el token. Las citas ya creadas
 *  siguen en su calendario (son suyas); solo dejamos de sincronizar. */
router.delete("/google/calendar", requireAuth, async (req, res) => {
  await gcalDisconnect(req.user.id);
  res.json({ ok: true });
});

// ─── Paso 1: mandar al usuario a Google ──────────────────────────────
router.get("/google", googleStartLimiter, (_req, res) => {
  if (!configured()) return fail(res, "no_configurado");
  res.redirect(authorizeUrl());
});

/**
 * Paso 1 del flujo de VINCULAR. Devuelve la URL en vez de redirigir para
 * que el JWT viaje en la cabecera Authorization y no en la query — un
 * token en la URL queda escrito en los logs de nginx y en el Referer.
 */
router.post("/google/link-start", linkStartLimiter, requireAuth, (req, res) => {
  if (!configured()) return res.status(503).json({ error: "Google no está configurado" });
  res.json({ url: authorizeUrl(req.user.id, { nonce: setNonceCookie(res) }) });
});

// ─── Paso 2: Google vuelve con el código ─────────────────────────────
router.get("/google/callback", googleCallbackLimiter, async (req, res) => {
  if (!configured()) return fail(res, "no_configurado");
  // El state se resuelve primero: Google lo devuelve también en la
  // respuesta de error, y sin él "cancelar" en el flujo de calendario
  // mandaba al usuario logueado a /login (que lo rebotaba al dashboard
  // sin ningún mensaje).
  const stateData = consumeState(req.query.state);
  const isCalendar = stateData?.purpose === "calendar";
  const back = `${cfg().appUrl}/configuracion?s=integraciones&gcal_error=`;
  const bail = (code) => isCalendar ? res.redirect(back + code) : fail(res, code);

  if (req.query.error) return bail("cancelado");
  if (!stateData) return bail("state_invalido");
  // Flujos que escriben sobre un usuario ya autenticado: el navegador que
  // completa debe ser el que inició (cookie de nonce).
  if (stateData.linkUserId) {
    const nonce = readNonceCookie(req);
    if (!stateData.nonce || !nonce || nonce !== stateData.nonce) {
      console.warn(`[google] nonce no coincide en flujo ${stateData.purpose} user=${stateData.linkUserId}`);
      return isCalendar ? res.redirect(back + "sesion_invalida") : res.redirect(`${cfg().appUrl}/configuracion?google_error=sesion_invalida`);
    }
    res.setHeader("Set-Cookie", `${NONCE_COOKIE}=; Path=/api/auth/google; HttpOnly; SameSite=Lax; Max-Age=0`);
  }

  const code = String(req.query.code ?? "");
  if (!code) return bail("sin_codigo");

  let profile;
  let tokenJson = {};
  try {
    const r = await fetch(GOOGLE_TOKEN, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: cfg().clientId,
        client_secret: cfg().clientSecret,
        redirect_uri: cfg().redirectUri,
        grant_type: "authorization_code",
      }),
    });
    if (!r.ok) {
      console.warn("[google] token exchange:", r.status, (await r.text()).slice(0, 200));
      return bail("intercambio_fallido");
    }
    tokenJson = await r.json();
    profile = await verifyIdToken(tokenJson.id_token);
  } catch (e) {
    console.warn("[google] verificación:", e?.message);
    return bail("verificacion_fallida");
  }

  const email = String(profile.email).toLowerCase();
  const fullName = profile.name || email.split("@")[0];
  const sub = String(profile.sub);

  const findBySub = (val) => db.prepare(`
    SELECT u.*, w.name AS workspace_name, w.mode AS workspace_mode, w.disabled_at
    FROM users u JOIN workspaces w ON w.id = u.workspace_id
    WHERE u.google_sub = ?
  `).get(val);

  /**
   * Búsqueda por correo. `users.email` NO es único —dos workspaces
   * pueden tener a la misma persona— así que sin ORDER BY el motor
   * elegiría una fila arbitraria y el mismo clic podría entrar a un
   * workspace distinto cada vez. Prioridad explícita:
   *   1. la que ya tiene este `sub` vinculado,
   *   2. staff antes que paciente (el portal es otra puerta),
   *   3. la más antigua.
   */
  const findByEmail = (val, forSub) => db.prepare(`
    SELECT u.*, w.name AS workspace_name, w.mode AS workspace_mode, w.disabled_at
    FROM users u JOIN workspaces w ON w.id = u.workspace_id
    WHERE LOWER(u.email) = LOWER(?)
    ORDER BY (u.google_sub = ?) DESC, (u.role = 'paciente') ASC, u.id ASC
  `).get(val, forSub);

  const countByEmail = (val) => db.prepare(
    "SELECT COUNT(*) AS n FROM users WHERE LOWER(email) = LOWER(?)",
  ).get(val).n;

  // ─── Modo CONECTAR CALENDARIO ──────────────────────────────────────
  // El usuario ya está dentro; Google devolvió refresh_token para el scope
  // de calendario. Se guarda cifrado en SU usuario. No toca el login.
  if (stateData.purpose === "calendar") {
    const back = `${cfg().appUrl}/configuracion?s=integraciones`;
    if (!stateData.linkUserId) return res.redirect(`${back}&gcal_error=sesion_invalida`);
    const granted = String(tokenJson.scope ?? "");
    if (!granted.includes("calendar")) return res.redirect(`${back}&gcal_error=sin_permiso`);
    if (!tokenJson.refresh_token) return res.redirect(`${back}&gcal_error=sin_refresh_token`);
    try {
      saveConnection(stateData.linkUserId, { refreshToken: tokenJson.refresh_token, email });
      console.log(`[gcal] conectado user=${stateData.linkUserId} cuenta=${email}`);
      return res.redirect(`${back}&gcal=ok`);
    } catch (e) {
      console.error("[gcal] guardar conexión:", e?.message);
      return res.redirect(`${back}&gcal_error=guardar_fallo`);
    }
  }

  // ─── Modo VINCULAR ─────────────────────────────────────────────────
  // El usuario ya está dentro y quiere poder entrar con Google. Aquí NO
  // se busca por correo: se conecta esta cuenta de Google a SU usuario,
  // aunque el correo de la plataforma sea otro (p. ej. @psicomorfosis.co).
  if (stateData.linkUserId) {
    const owner = findBySub(sub);
    if (owner && owner.id !== stateData.linkUserId) {
      return res.redirect(`${cfg().appUrl}/configuracion?google_error=google_ya_vinculado`);
    }
    // El JWT puede seguir vivo aunque el workspace se haya deshabilitado
    // entre el login y este momento. No dejamos que una cuenta suspendida
    // se abra una segunda vía de acceso.
    const me = db.prepare(`
      SELECT u.id, w.disabled_at, u.is_platform_admin, u.is_legal_admin
      FROM users u JOIN workspaces w ON w.id = u.workspace_id WHERE u.id = ?
    `).get(stateData.linkUserId);
    if (!me) return fail(res, "sesion_invalida");
    if (me.disabled_at && !me.is_platform_admin && !me.is_legal_admin) {
      return fail(res, "cuenta_deshabilitada");
    }
    try {
      db.prepare(
        "UPDATE users SET google_sub = ?, google_email = ?, google_linked_at = ?, auth_provider = 'password+google' WHERE id = ?",
      ).run(sub, email, new Date().toISOString(), stateData.linkUserId);
    } catch (e) {
      console.error("[google] vinculación falló:", e?.message);
      return res.redirect(`${cfg().appUrl}/configuracion?google_error=vinculacion_fallida`);
    }
    console.log(`[google] vinculada user=${stateData.linkUserId} google=${email}`);
    return res.redirect(`${cfg().appUrl}/configuracion?google_ok=vinculada`);
  }

  // ─── Modo LOGIN ────────────────────────────────────────────────────
  // Primero por `sub` (vínculo explícito, gana siempre), luego por correo.
  // El orden importa: si alguien vinculó su Gmail personal a su cuenta de
  // staff, ese vínculo debe pesar más que una coincidencia de correo con
  // otro registro (p. ej. su propia ficha de paciente).
  // Pre-vinculación: un admin puede dejar `google_email` puesto en la
  // cuenta de staff ANTES de que la persona entre por primera vez con
  // Google (caso: su correo de plataforma es @psicomorfosis.co y su
  // Gmail personal ya figura como paciente). Va antes que la búsqueda
  // por correo para que gane sobre esa ficha de paciente. Al entrar,
  // se guarda el `sub` y desde ahí manda el vínculo fuerte.
  const findPreLinked = (val) => db.prepare(`
    SELECT u.*, w.name AS workspace_name, w.mode AS workspace_mode, w.disabled_at
    FROM users u JOIN workspaces w ON w.id = u.workspace_id
    WHERE LOWER(u.google_email) = LOWER(?) AND u.google_sub IS NULL AND u.role <> 'paciente'
    ORDER BY u.id ASC
  `).get(val);
  let user = findBySub(sub) || findPreLinked(email) || findByEmail(email, sub);
  if (user && !user.google_sub && countByEmail(email) > 1) {
    // Ocurre si la misma persona figura en dos workspaces. Entramos al
    // que manda la prioridad de findByEmail, pero queda en el log: si
    // alguien reporta "entré al consultorio equivocado", esto lo explica.
    console.warn(`[google] ${email} existe en varias cuentas; entrando a user=${user.id} ws=${user.workspace_id}`);
  }

  if (user) {
    if (user.role === "paciente") {
      // Los pacientes tienen su propio portal; no entran por acá.
      return res.redirect(`${cfg().appUrl}/p/login?google_error=usa_portal_paciente`);
    }
    if (user.disabled_at && !user.is_platform_admin && !user.is_legal_admin) {
      return fail(res, "cuenta_deshabilitada");
    }
    // Marcar el correo como verificado: Google ya lo comprobó. Y dejar
    // el vínculo guardado para que siga funcionando si luego cambia de
    // correo en la plataforma (a menos que ese `sub` ya sea de otro).
    try {
      db.prepare(
        "UPDATE users SET last_login_at = ?, email_verified_at = COALESCE(email_verified_at, ?) WHERE id = ?",
      ).run(new Date().toISOString(), new Date().toISOString(), user.id);
      if (!user.google_sub) {
        db.prepare(
          "UPDATE users SET google_sub = ?, google_email = ?, google_linked_at = ? WHERE id = ?",
        ).run(sub, email, new Date().toISOString(), user.id);
      }
    } catch { /* tracking/vínculo no bloquean el login */ }
  } else {
    // No existe → alta automática, misma forma que el registro normal.
    // Y sujeta a la MISMA bandera: si el registro público está cerrado,
    // Google no puede ser la puerta que quedó abierta.
    if (!publicSignupEnabled()) {
      console.warn(`[google] alta rechazada (registro cerrado) email=${email}`);
      return fail(res, "registro_cerrado");
    }
    const username = deriveUsername(email);
    if (!username) return fail(res, "usuario_no_disponible");
    const wsName = `Consulta ${fullName.split(" ")[0]}`.trim();
    try {
      const created = db.transaction(() => {
        const wsId = db.prepare(
          "INSERT INTO workspaces (name, mode, plan, plan_since, signup_source) VALUES (?, 'individual', 'free', datetime('now'), 'google')",
        ).run(wsName).lastInsertRowid;
        seedTaskColumns(wsId);
        const profId = db.prepare(
          "INSERT INTO professionals (workspace_id, name, title, email, active) VALUES (?, ?, 'Psicólogo/a', ?, 1)",
        ).run(wsId, fullName, email).lastInsertRowid;
        // Sin contraseña utilizable: entra por Google. Guardamos un hash
        // aleatorio para no dejar el campo vacío (puede definir una luego
        // con "olvidé mi contraseña").
        const userId = db.prepare(`
          INSERT INTO users (workspace_id, username, password_hash, name, email, role,
                             professional_id, auth_provider, email_verified_at, photo_url,
                             google_sub, google_email, google_linked_at)
          VALUES (?, ?, ?, ?, ?, 'super_admin', ?, 'google', ?, ?, ?, ?, ?)
        `).run(
          wsId, username, `!google!${crypto.randomBytes(24).toString("hex")}`,
          fullName, email, profId, new Date().toISOString(), profile.picture ?? null,
          sub, email, new Date().toISOString(),
        ).lastInsertRowid;
        return { wsId, userId, profId, username, wsName };
      })();

      console.log(`[google] alta nueva ws=${created.wsId} user=${created.userId} email=${email}`);

      // El botón lleva el aviso "Al continuar aceptas los términos y el
      // aviso de privacidad" al lado: pulsarlo es el acto de aceptación
      // (clickwrap). Lo dejamos registrado con IP y user-agent, igual
      // que la casilla del formulario de registro.
      recordSignupAcceptances(created.userId, req);
      // Google no da teléfono: queda el aviso en la campanita.
      notifyWhatsappSetup(created.wsId, created.userId);
      try {
        sendWelcomeEmail({ to: email, name: fullName, username: created.username })
          .catch((e) => console.warn("[google] welcome mail:", e?.message));
      } catch { /* noop */ }

      user = {
        id: created.userId, workspace_id: created.wsId, username: created.username,
        name: fullName, email, role: "super_admin", professional_id: created.profId,
        is_platform_admin: 0, is_legal_admin: 0,
        workspace_name: created.wsName, workspace_mode: "individual",
      };
    } catch (e) {
      // Dos pestañas (o un doble clic) pueden llegar al callback casi a
      // la vez: la primera crea la cuenta y la segunda choca contra el
      // índice único de google_sub. Esa segunda persona SÍ tiene cuenta
      // —acaba de crearse—, así que la buscamos en vez de decirle que
      // el alta falló.
      const raced = findBySub(sub);
      if (raced) {
        console.warn(`[google] alta simultánea para ${email}; reusando user=${raced.id}`);
        user = raced;
      } else {
        console.error("[google] alta falló:", e?.message);
        return fail(res, "alta_fallida");
      }
    }
  }

  const token = signToken({
    id: user.id,
    workspace_id: user.workspace_id,
    username: user.username,
    role: user.role,
    name: user.name,
    professional_id: user.professional_id ?? null,
    is_platform_admin: !!user.is_platform_admin,
    is_legal_admin: !!user.is_legal_admin,
  });

  const payload = Buffer.from(JSON.stringify({
    token,
    user: {
      id: user.id, username: user.username, name: user.name, email: user.email,
      role: user.role, isPlatformAdmin: !!user.is_platform_admin,
      isLegalAdmin: !!user.is_legal_admin, workspaceId: user.workspace_id,
      workspaceName: user.workspace_name, workspaceMode: user.workspace_mode,
    },
  })).toString("base64url");

  // En el FRAGMENTO (#): no llega al servidor, no queda en logs ni Referer.
  res.redirect(`${cfg().appUrl}/auth/google?s=${payload}`.replace("?s=", "#s="));
});

/** El front pregunta si mostrar el botón. */
router.get("/google/status", (_req, res) => res.json({ enabled: configured() }));

/** Estado del vínculo del usuario actual (para Configuración → Seguridad). */
router.get("/google/link", requireAuth, (req, res) => {
  const u = db.prepare(
    "SELECT google_sub, google_email, google_linked_at, password_hash FROM users WHERE id = ?",
  ).get(req.user.id);
  res.json({
    enabled: configured(),
    // google_email sin sub = pre-vinculada por un admin; cuenta como
    // vinculada para la UI (ya puede entrar con ese Gmail).
    linked: Boolean(u?.google_sub || u?.google_email),
    email: u?.google_email ?? null,
    linkedAt: u?.google_linked_at ?? null,
    // Para que Configuración ofrezca "Definir contraseña" en vez de
    // "Cambiar contraseña" a quien entró por Google y nunca tuvo una.
    hasPassword: !String(u?.password_hash ?? "").startsWith("!google!"),
  });
});

/**
 * Desvincular. Solo si queda otra forma de entrar: una cuenta creada con
 * Google no tiene contraseña utilizable, así que desvincular la dejaría
 * sin acceso.
 */
router.delete("/google/link", requireAuth, (req, res) => {
  const u = db.prepare("SELECT auth_provider, password_hash FROM users WHERE id = ?").get(req.user.id);
  if (!u) return res.status(404).json({ error: "No encontrado" });
  if (String(u.password_hash ?? "").startsWith("!google!")) {
    return res.status(409).json({
      error: "Esta cuenta solo entra con Google. Define una contraseña antes de desvincular.",
    });
  }
  db.prepare(
    "UPDATE users SET google_sub = NULL, google_email = NULL, google_linked_at = NULL, auth_provider = 'password' WHERE id = ?",
  ).run(req.user.id);
  res.json({ ok: true });
});

export default router;
