/**
 * Login / registro con Google (OAuth 2.0, flujo de código de autorización).
 *
 *   GET /api/auth/google           → redirige a la pantalla de Google
 *   GET /api/auth/google/callback  → Google vuelve aquí con ?code
 *
 * Qué hace el callback:
 *   1. Canjea el `code` por un `id_token` (JWT firmado por Google).
 *   2. Valida el token contra las claves públicas de Google (aud, iss, exp).
 *   3. Busca al usuario por correo:
 *        - existe  → inicia sesión
 *        - no existe → crea su workspace igual que el registro normal
 *   4. Redirige al front con el token en el fragmento (#), no en la query:
 *      el fragmento no viaja al servidor ni queda en logs/Referer.
 *
 * Sin dependencias nuevas: `fetch` y `crypto` son nativos de Node 18+.
 * El scope es solo openid/email/profile — no requiere verificación de Google.
 */

import { Router } from "express";
import crypto from "node:crypto";
import { db, seedTaskColumns } from "../db.js";
import { signToken } from "../auth.js";
import { sendWelcomeEmail } from "../mailer.js";

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
const states = new Map();
function issueState() {
  const s = crypto.randomBytes(24).toString("hex");
  states.set(s, Date.now());
  // Limpieza oportunista de expirados
  const cutoff = Date.now() - 10 * 60 * 1000;
  for (const [k, t] of states) if (t < cutoff) states.delete(k);
  return s;
}
function consumeState(s) {
  if (!s || !states.has(s)) return false;
  const t = states.get(s);
  states.delete(s);
  return Date.now() - t < 10 * 60 * 1000;
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

// ─── Paso 1: mandar al usuario a Google ──────────────────────────────
router.get("/google", (req, res) => {
  if (!configured()) return fail(res, "no_configurado");
  const state = issueState();
  const params = new URLSearchParams({
    client_id: cfg().clientId,
    redirect_uri: cfg().redirectUri,
    response_type: "code",
    scope: "openid email profile",
    state,
    // Pide seleccionar cuenta siempre: evita entrar con la sesión de
    // Google equivocada sin darse cuenta (típico en equipos compartidos).
    prompt: "select_account",
  });
  res.redirect(`${GOOGLE_AUTH}?${params}`);
});

// ─── Paso 2: Google vuelve con el código ─────────────────────────────
router.get("/google/callback", async (req, res) => {
  if (!configured()) return fail(res, "no_configurado");
  if (req.query.error) return fail(res, "cancelado");
  if (!consumeState(req.query.state)) return fail(res, "state_invalido");

  const code = String(req.query.code ?? "");
  if (!code) return fail(res, "sin_codigo");

  let profile;
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
      return fail(res, "intercambio_fallido");
    }
    profile = await verifyIdToken((await r.json()).id_token);
  } catch (e) {
    console.warn("[google] verificación:", e?.message);
    return fail(res, "verificacion_fallida");
  }

  const email = String(profile.email).toLowerCase();
  const fullName = profile.name || email.split("@")[0];

  // ¿Ya existe? → iniciar sesión con esa cuenta.
  let user = db.prepare(`
    SELECT u.*, w.name AS workspace_name, w.mode AS workspace_mode, w.disabled_at
    FROM users u JOIN workspaces w ON w.id = u.workspace_id
    WHERE LOWER(u.email) = LOWER(?)
  `).get(email);

  if (user) {
    if (user.role === "paciente") {
      // Los pacientes tienen su propio portal; no entran por acá.
      return res.redirect(`${cfg().appUrl}/p/login?google_error=usa_portal_paciente`);
    }
    if (user.disabled_at && !user.is_platform_admin && !user.is_legal_admin) {
      return fail(res, "cuenta_deshabilitada");
    }
    // Marcar el correo como verificado: Google ya lo comprobó.
    try {
      db.prepare(
        "UPDATE users SET last_login_at = ?, email_verified_at = COALESCE(email_verified_at, ?) WHERE id = ?",
      ).run(new Date().toISOString(), new Date().toISOString(), user.id);
    } catch { /* tracking no bloquea el login */ }
  } else {
    // No existe → alta automática, misma forma que el registro normal.
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
                             professional_id, auth_provider, email_verified_at, photo_url)
          VALUES (?, ?, ?, ?, ?, 'super_admin', ?, 'google', ?, ?)
        `).run(
          wsId, username, `!google!${crypto.randomBytes(24).toString("hex")}`,
          fullName, email, profId, new Date().toISOString(), profile.picture ?? null,
        ).lastInsertRowid;
        return { wsId, userId, profId, username, wsName };
      })();

      console.log(`[google] alta nueva ws=${created.wsId} user=${created.userId} email=${email}`);
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
      console.error("[google] alta falló:", e?.message);
      return fail(res, "alta_fallida");
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

export default router;
