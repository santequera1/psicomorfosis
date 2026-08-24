import { Router } from "express";
import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import rateLimit from "express-rate-limit";
import { db, seedTaskColumns } from "../db.js";
import { signToken, requireAuth, invalidateUserTokens } from "../auth.js";
import { validateUsername, validateEmail, looksLikeEmail } from "../lib/validators.js";
import { sendWelcomeEmail, sendPasswordResetEmail } from "../mailer.js";
import { recordSignupAcceptances } from "./legal.js";
import { notifyStaffWhatsappLinked, notifyWhatsappSetup } from "../lib/psicobot.js";

const router = Router();

/**
 * Rate limiter para login. Mitiga ataques de fuerza bruta — sin esto, un
 * atacante puede probar 1000+ contraseñas por segundo. Lo aplicamos por
 * IP (trust proxy=1 hace que express-rate-limit lea X-Forwarded-For de
 * nginx). 10 intentos por 15 minutos balancea: suficientes para que un
 * usuario que se equivoca varias veces no quede bloqueado, pero detiene
 * cualquier bruteforce automático real. El header Retry-After le dice al
 * cliente cuándo reintentar.
 *
 * Nota: NO bloqueamos por username (sería trivial bloquear cuentas ajenas
 * inyectando intentos con el username de la víctima). Solo por IP. Si una
 * IP corporativa con NAT se ve afectada, pueden contactar a la psicóloga.
 */
export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 min
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  // Solo cuentan requests fallidos (skipSuccessfulRequests). Si te logueas
  // bien y la sesión expira y vuelves a loguearte, no contamos esos.
  skipSuccessfulRequests: true,
  message: { error: "Demasiados intentos de login. Espera 15 minutos e intenta de nuevo." },
});

/**
 * POST /api/auth/login
 * Body: { identifier?: string, username?: string, password: string }
 *
 * Acepta `identifier` (username O email) o `username` legacy. Si el
 * identifier contiene @ buscamos por email (case-insensitive); si no,
 * por username. Mantenemos compat con clientes viejos que envíen el
 * campo `username`.
 *
 * Si dos usuarios tuvieran mismo email (no debería pasar — validamos
 * unicidad al editar/crear), se prefiere el match por username.
 */
router.post("/login", loginLimiter, (req, res) => {
  const body = req.body ?? {};
  const password = body.password;
  const rawIdentifier = body.identifier ?? body.username;
  if (!rawIdentifier || !password) {
    return res.status(400).json({ error: "Usuario/correo y contraseña requeridos" });
  }
  const identifier = String(rawIdentifier).trim();
  const lookupSql = `
    SELECT u.*, w.name AS workspace_name, w.mode AS workspace_mode, w.disabled_at, w.disabled_reason
    FROM users u JOIN workspaces w ON u.workspace_id = w.id
    WHERE LOWER(u.username) = LOWER(?) OR LOWER(u.email) = LOWER(?)
    -- Si por error existieran dos coincidencias (un user cuyo username
    -- coincide con el email de otro), preferimos username match.
    ORDER BY (LOWER(u.username) = LOWER(?)) DESC
    LIMIT 1
  `;
  const user = db.prepare(lookupSql).get(identifier, identifier, identifier);
  if (!user) return res.status(401).json({ error: "Credenciales inválidas" });
  const ok = bcrypt.compareSync(password, user.password_hash);
  if (!ok) return res.status(401).json({ error: "Credenciales inválidas" });

  // Pacientes NO pueden entrar por el login del staff. Tienen su propio
  // flujo en /p/login que les enseña UI cálida + tabs propios. Sin este
  // guard, un paciente que ponga sus credenciales acá recibía un token
  // de paciente cargado en el shell del staff — confuso y rompe varias
  // queries de staff que asumen role distinto.
  if (user.role === "paciente") {
    return res.status(403).json({
      error: "Esta cuenta es de paciente. Ingresa desde el portal de pacientes.",
      hint: "use_patient_portal",
      patient_portal_url: "/p/login",
    });
  }

  // Bloquear login si el workspace está deshabilitado. Excepción: platform
  // admins y legal admins pueden seguir entrando (necesitan acceso para
  // reactivar cuentas o publicar políticas aunque su workspace esté off).
  if (user.disabled_at && !user.is_platform_admin && !user.is_legal_admin) {
    return res.status(403).json({
      error: user.disabled_reason
        ? `Cuenta deshabilitada: ${user.disabled_reason}`
        : "Esta cuenta está deshabilitada. Contacta al administrador.",
    });
  }

  // Tracking de uso para el panel de plataforma.
  try {
    db.prepare("UPDATE users SET last_login_at = ? WHERE id = ?").run(new Date().toISOString(), user.id);
  } catch { /* no bloquear login si falla tracking */ }

  // Log de login exitoso con navegador: permite correlacionar desde QUÉ
  // contexto entró el usuario cuando después aparecen 401 de otro token.
  console.log(`[auth-diag] ${new Date().toISOString()} LOGIN OK user=${user.id} ua=${String(req.headers["user-agent"] ?? "").slice(0, 70)}`);
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
  res.json({
    token,
    user: {
      id: user.id,
      username: user.username,
      name: user.name,
      email: user.email,
      role: user.role,
      isPlatformAdmin: !!user.is_platform_admin,
      isLegalAdmin: !!user.is_legal_admin,
      workspaceId: user.workspace_id,
      workspaceName: user.workspace_name,
      workspaceMode: user.workspace_mode,
    },
  });
});

router.get("/me", requireAuth, (req, res) => {
  const user = db.prepare(`
    SELECT u.id, u.username, u.name, u.email, u.role, u.workspace_id,
           u.is_platform_admin, u.is_legal_admin,
           w.name AS workspace_name, w.mode AS workspace_mode, w.disabled_at
    FROM users u JOIN workspaces w ON u.workspace_id = w.id
    WHERE u.id = ?
  `).get(req.user.id);
  if (!user) return res.status(404).json({ error: "No encontrado" });
  if (user.disabled_at && !user.is_platform_admin && !user.is_legal_admin) {
    return res.status(403).json({ error: "Cuenta deshabilitada" });
  }
  res.json({
    user: {
      id: user.id,
      username: user.username,
      name: user.name,
      email: user.email,
      role: user.role,
      isPlatformAdmin: !!user.is_platform_admin,
      isLegalAdmin: !!user.is_legal_admin,
      workspaceId: user.workspace_id,
      workspaceName: user.workspace_name,
      workspaceMode: user.workspace_mode,
    },
  });
});

/**
 * GET /api/auth/check-availability?username=X&email=Y&excludeId=N
 *
 * Endpoint público: lo usamos en el formulario de signup futuro y en
 * los formularios de "editar mis credenciales" / panel admin.
 *
 * `excludeId` opcional permite ignorar al propio usuario al editar
 * (para que su username actual no aparezca como "ya en uso por mí
 * mismo"). Se acepta sin auth porque solo retorna boolean — no leak
 * de datos sensibles. Pero limitamos para no convertirlo en oráculo
 * de enumeración: NO devolvemos info de quién lo tiene, solo
 * available true/false.
 */
router.get("/check-availability", (req, res) => {
  const { username, email, excludeId } = req.query;
  const exclude = Number(excludeId) || 0;
  const out = {};

  if (typeof username === "string" && username.trim()) {
    const v = validateUsername(username);
    if (!v.ok) {
      out.usernameAvailable = false;
      out.usernameError = v.error;
    } else {
      const row = db.prepare(
        "SELECT id FROM users WHERE LOWER(username) = ? AND id != ?"
      ).get(v.value, exclude);
      out.usernameAvailable = !row;
    }
  }

  if (typeof email === "string" && email.trim()) {
    const v = validateEmail(email);
    if (!v.ok) {
      out.emailAvailable = false;
      out.emailError = v.error;
    } else {
      // Email solo es "ocupado" si lo tiene OTRO usuario staff (no
      // paciente — los pacientes usan email como username así que
      // ya bloquean por la columna username).
      const row = db.prepare(
        "SELECT id FROM users WHERE LOWER(email) = ? AND role != 'paciente' AND id != ?"
      ).get(v.value, exclude);
      out.emailAvailable = !row;
    }
  }

  res.json(out);
});

/**
 * POST /api/auth/change-password — el usuario autenticado cambia su propia
 * contraseña. Verifica la contraseña actual antes de actualizar para evitar
 * que un token comprometido la cambie sin saber la actual.
 *
 * Body: { current_password: string, new_password: string }
 */
router.post("/change-password", requireAuth, (req, res) => {
  const { current_password, new_password } = req.body ?? {};
  if (typeof new_password !== "string") {
    return res.status(400).json({ error: "Datos inválidos" });
  }
  if (new_password.length < 8) {
    return res.status(400).json({ error: "La nueva contraseña debe tener al menos 8 caracteres" });
  }
  const user = db.prepare("SELECT id, password_hash FROM users WHERE id = ?").get(req.user.id);
  if (!user) return res.status(404).json({ error: "Usuario no encontrado" });

  // Una cuenta creada con Google no tiene contraseña: guardamos un hash
  // aleatorio con prefijo `!google!` para no dejar el campo vacío. Su
  // dueño no puede conocerlo, así que exigirle la "actual" lo dejaba sin
  // salida: no podía definir una, no podía desvincular Google, y perder
  // el acceso a su Gmail significaba perder la cuenta. En ese caso el
  // JWT ya prueba su identidad — es la misma garantía que respalda
  // cualquier otra acción sensible de la sesión.
  const sinPassword = String(user.password_hash ?? "").startsWith("!google!");
  if (!sinPassword) {
    if (typeof current_password !== "string") {
      return res.status(400).json({ error: "Datos inválidos" });
    }
    if (current_password === new_password) {
      return res.status(400).json({ error: "La nueva contraseña debe ser distinta de la actual" });
    }
    if (!bcrypt.compareSync(current_password, user.password_hash)) {
      return res.status(401).json({ error: "La contraseña actual no es correcta" });
    }
  }
  const newHash = bcrypt.hashSync(new_password, 10);
  db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(newHash, user.id);
  // Defensa en profundidad: al cambiar contraseña, invalidamos todos los
  // tokens previos. Si alguien tenía un JWT exfiltrado, deja de servir.
  const cutoff = invalidateUserTokens(user.id);
  // Emitimos un token nuevo para no forzar re-login en el mismo browser que
  // acaba de cambiar la contraseña — UX. El frontend debe usar este token
  // en adelante; los viejos quedaron revocados. El iat va anclado al corte:
  // si no, el token nace por debajo del umbral y lo rechaza verifyToken.
  const fresh = db.prepare(`
    SELECT u.id, u.username, u.name, u.role, u.workspace_id,
           u.professional_id, u.is_platform_admin, u.is_legal_admin
    FROM users u WHERE u.id = ?
  `).get(user.id);
  const token = signToken({
    id: fresh.id,
    workspace_id: fresh.workspace_id,
    username: fresh.username,
    role: fresh.role,
    name: fresh.name,
    professional_id: fresh.professional_id ?? null,
    is_platform_admin: !!fresh.is_platform_admin,
    is_legal_admin: !!fresh.is_legal_admin,
  }, { issuedAtMs: new Date(cutoff).getTime() });
  res.json({ ok: true, token });
});

/**
 * POST /api/auth/logout — invalida TODAS las sesiones JWT del usuario
 * actual. El JWT es stateless, así que no podemos "borrar" un token
 * específico; lo que hacemos es marcar un timestamp en la fila del user,
 * y verifyToken rechaza cualquier JWT con iat < timestamp.
 *
 * Esto significa que logout cierra sesión en todos los dispositivos del
 * usuario — comportamiento deseado: si un usuario sospecha que su token
 * está comprometido, hace logout y todos los tokens quedan inválidos.
 */
router.post("/logout", requireAuth, (req, res) => {
  invalidateUserTokens(req.user.id);
  res.json({ ok: true });
});

/**
 * POST /api/auth/update-credentials — el usuario autenticado cambia su
 * propio username y/o email. Exige password actual por seguridad
 * (mismo razonamiento que change-password: token comprometido no
 * basta para tomar el control de la cuenta).
 *
 * Body: { current_password: string, username?: string, email?: string }
 *
 * Devuelve el user actualizado + token nuevo (porque el JWT carga el
 * username y queremos que el client lo refresque sin re-login).
 */
router.post("/update-credentials", requireAuth, (req, res) => {
  const { current_password, username, email } = req.body ?? {};
  if (typeof current_password !== "string") {
    return res.status(400).json({ error: "Confirma tu contraseña actual" });
  }
  const wantsUsername = typeof username === "string" && username.trim().length > 0;
  const wantsEmail = typeof email === "string" && email.trim().length > 0;
  if (!wantsUsername && !wantsEmail) {
    return res.status(400).json({ error: "Nada que actualizar" });
  }

  const user = db.prepare("SELECT id, username, email, password_hash, role FROM users WHERE id = ?").get(req.user.id);
  if (!user) return res.status(404).json({ error: "Usuario no encontrado" });
  if (!bcrypt.compareSync(current_password, user.password_hash)) {
    return res.status(401).json({ error: "La contraseña actual no es correcta" });
  }

  const updates = [];
  const params = [];

  let nextUsername = user.username;
  if (wantsUsername) {
    const v = validateUsername(username);
    if (!v.ok) return res.status(400).json({ error: v.error });
    if (v.value !== user.username.toLowerCase()) {
      const taken = db.prepare("SELECT id FROM users WHERE LOWER(username) = ? AND id != ?")
        .get(v.value, user.id);
      if (taken) return res.status(409).json({ error: "Ese nombre de usuario ya está en uso" });
      nextUsername = v.value;
      updates.push("username = ?");
      params.push(v.value);
    }
  }

  let nextEmail = user.email;
  if (wantsEmail) {
    const v = validateEmail(email);
    if (!v.ok) return res.status(400).json({ error: v.error });
    if (v.value !== (user.email ?? "").toLowerCase()) {
      // Para staff exigimos email único entre sí (NO contra pacientes).
      const taken = db.prepare(
        "SELECT id FROM users WHERE LOWER(email) = ? AND role != 'paciente' AND id != ?"
      ).get(v.value, user.id);
      if (taken) return res.status(409).json({ error: "Ese correo ya está en uso por otra cuenta" });
      nextEmail = v.value;
      updates.push("email = ?");
      params.push(v.value);
    }
  }

  if (updates.length === 0) {
    // Safety: NUNCA devolver password_hash en respuestas (aunque sea bcrypt).
    // El SELECT lo trae para verificar la contraseña actual; pero acá ya no
    // se necesita. Antes hacíamos {...user} y se filtraba.
    const { password_hash: _omit, ...safeUser } = user;
    return res.json({ ok: true, noop: true, user: { ...safeUser, username: nextUsername, email: nextEmail } });
  }
  params.push(user.id);
  db.prepare(`UPDATE users SET ${updates.join(", ")} WHERE id = ?`).run(...params);

  // Re-emitimos el token con el username actualizado para que el cliente
  // no quede con un JWT desincronizado de su username.
  const fresh = db.prepare(`
    SELECT u.id, u.username, u.name, u.email, u.role, u.workspace_id,
           u.is_platform_admin, u.is_legal_admin, u.professional_id,
           w.name AS workspace_name, w.mode AS workspace_mode
    FROM users u JOIN workspaces w ON u.workspace_id = w.id
    WHERE u.id = ?
  `).get(user.id);

  const token = signToken({
    id: fresh.id,
    workspace_id: fresh.workspace_id,
    username: fresh.username,
    role: fresh.role,
    name: fresh.name,
    professional_id: fresh.professional_id ?? null,
    is_platform_admin: !!fresh.is_platform_admin,
    is_legal_admin: !!fresh.is_legal_admin,
  });

  res.json({
    ok: true,
    token,
    user: {
      id: fresh.id,
      username: fresh.username,
      name: fresh.name,
      email: fresh.email,
      role: fresh.role,
      isPlatformAdmin: !!fresh.is_platform_admin,
      isLegalAdmin: !!fresh.is_legal_admin,
      workspaceId: fresh.workspace_id,
      workspaceName: fresh.workspace_name,
      workspaceMode: fresh.workspace_mode,
    },
  });
});

/**
 * Rate limiter del registro público. Más estricto que el login: crear una
 * cuenta es caro (workspace + professional + user + columnas kanban) y es
 * el vector obvio de abuso. 5 registros por IP cada 6 horas.
 */
const registerLimiter = rateLimit({
  windowMs: 6 * 60 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Demasiados registros desde esta conexión. Intenta más tarde." },
});

/** ¿Está abierto el registro público? Se puede cerrar sin redeploy. */
export function publicSignupEnabled() {
  return String(process.env.ALLOW_PUBLIC_SIGNUP ?? "true").toLowerCase() !== "false";
}

/** Deriva un username libre desde el email (ana.perez@x.com -> ana.perez, ana.perez2...). */
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

/**
 * POST /api/auth/register — registro público de un psicólogo.
 *
 * Crea su espacio de trabajo (workspace individual) + su ficha de
 * profesional + su usuario super_admin, y devuelve la sesión ya iniciada.
 * El plan arranca en 'free'; cuando exista cobro se cambia desde ahí.
 *
 * Público a propósito (nadie tiene cuenta todavía). Protegido con rate
 * limit, validación estricta y unicidad de correo.
 */
router.post("/register", registerLimiter, (req, res) => {
  if (!publicSignupEnabled()) {
    return res.status(403).json({ error: "El registro está cerrado por ahora." });
  }

  const b = req.body ?? {};
  const name = String(b.name ?? "").trim();
  const email = String(b.email ?? "").trim().toLowerCase();
  const password = String(b.password ?? "");
  const phone = String(b.phone ?? "").trim() || null;
  const nameFirst = name.split(" ")[0] || "";
  const workspaceName = String(b.workspaceName ?? "").trim() || ("Consulta " + nameFirst).trim();
  const acceptedTerms = b.acceptedTerms === true || b.acceptedTerms === "true";

  if (name.length < 3) return res.status(400).json({ error: "Escribe tu nombre completo" });
  if (!looksLikeEmail(email)) return res.status(400).json({ error: "Correo inválido" });
  if (password.length < 8) {
    return res.status(400).json({ error: "La contraseña debe tener al menos 8 caracteres" });
  }
  if (!acceptedTerms) {
    return res.status(400).json({ error: "Debes aceptar los términos y el aviso de privacidad" });
  }
  if (db.prepare("SELECT 1 FROM users WHERE LOWER(email) = LOWER(?)").get(email)) {
    return res.status(409).json({
      error: "Ya existe una cuenta con ese correo. Inicia sesión o recupera tu contraseña.",
      hint: "email_taken",
    });
  }

  const username = deriveUsername(email);
  if (!username) return res.status(400).json({ error: "No pudimos generar un usuario para ese correo" });

  const tx = db.transaction(() => {
    const wsId = db.prepare(
      "INSERT INTO workspaces (name, mode, plan, plan_since, signup_source) VALUES (?, 'individual', 'free', datetime('now'), ?)"
    ).run(workspaceName, "web").lastInsertRowid;

    // Sin esto el kanban de Tareas queda sin columnas y las tareas se crean
    // pero no se ven (bug histórico de workspaces creados en runtime).
    seedTaskColumns(wsId);

    const profId = db.prepare(
      "INSERT INTO professionals (workspace_id, name, title, email, phone, active) VALUES (?, ?, 'Psicólogo/a', ?, ?, 1)"
    ).run(wsId, name, email, phone).lastInsertRowid;

    const userId = db.prepare(
      "INSERT INTO users (workspace_id, username, password_hash, name, email, role, professional_id, auth_provider) VALUES (?, ?, ?, ?, ?, 'super_admin', ?, 'password')"
    ).run(wsId, username, bcrypt.hashSync(password, 10), name, email, profId).lastInsertRowid;

    return { wsId, userId, profId };
  });

  let created;
  try {
    created = tx();
  } catch (err) {
    console.error("[register] fallo:", err?.message);
    return res.status(500).json({ error: "No pudimos crear tu cuenta. Intenta de nuevo." });
  }

  console.log("[register] nueva cuenta ws=" + created.wsId + " user=" + created.userId + " email=" + email);

  // La casilla "Acepto los términos y condiciones" del formulario es la
  // aceptación real: la dejamos registrada con IP y user-agent. Sin esto
  // el usuario aceptaba en el registro y la app le abría acto seguido el
  // modal bloqueante pidiéndole exactamente lo mismo.
  const nAcc = recordSignupAcceptances(created.userId, req);
  // Si dio su WhatsApp al registrarse, Laura lo saluda y lo suscribe.
  if (phone) {
    notifyStaffWhatsappLinked({
      user: { id: created.userId, name, workspace_id: created.wsId },
      professional: { id: created.profId, name, phone },
    });
  } else {
    notifyWhatsappSetup(created.wsId, created.userId);
  }
  if (nAcc) console.log("[register] " + nAcc + " documento(s) legal(es) aceptado(s) en el alta");

  // Bienvenida best-effort: si el correo falla, el registro NO se cae.
  try {
    sendWelcomeEmail({ to: email, name, username }).catch((e) =>
      console.warn("[register] welcome mail:", e?.message));
  } catch { /* noop */ }

  // Sesión iniciada de una: el usuario acaba de definir su contraseña.
  const token = signToken({
    id: created.userId,
    workspace_id: created.wsId,
    username,
    role: "super_admin",
    name,
    professional_id: created.profId,
    is_platform_admin: false,
    is_legal_admin: false,
  });

  res.status(201).json({
    token,
    user: {
      id: created.userId,
      username,
      name,
      email,
      role: "super_admin",
      isPlatformAdmin: false,
      isLegalAdmin: false,
      workspaceId: created.wsId,
      workspaceName,
      workspaceMode: "individual",
    },
  });
});

/** GET /api/auth/signup-status — el front consulta si mostrar el formulario. */
// ─── Olvidé mi contraseña ─────────────────────────────────────────────

const forgotLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Demasiadas solicitudes. Espera unos minutos e inténtalo de nuevo." },
});
const RESET_TTL_MIN = 60;
const hashToken = (t) => crypto.createHash("sha256").update(String(t)).digest("hex");

/**
 * POST /api/auth/forgot-password  { identifier }
 *
 * Acepta correo o usuario. Responde SIEMPRE { ok: true }, exista o no la
 * cuenta: la respuesta no puede servir para averiguar qué correos están
 * registrados. El correo sale solo si hay una cuenta de staff con ese
 * dato y tiene correo.
 *
 * Si el mismo correo está en varias cuentas (dos workspaces), se elige
 * la que coincide por usuario exacto; si no, la de último acceso más
 * reciente. El correo nombra el usuario para que la persona sepa cuál.
 */
router.post("/forgot-password", forgotLimiter, (req, res) => {
  const identifier = String(req.body?.identifier ?? req.body?.email ?? "").trim();
  res.json({ ok: true });
  if (!identifier || identifier.length > 200) return;

  const user = db.prepare(`
    SELECT id, name, username, email, role
    FROM users
    WHERE role <> 'paciente' AND (LOWER(username) = LOWER(?) OR LOWER(email) = LOWER(?))
    ORDER BY (LOWER(username) = LOWER(?)) DESC, last_login_at DESC NULLS LAST, id ASC
    LIMIT 1
  `).get(identifier, identifier, identifier);
  if (!user?.email || !user.email.includes("@")) {
    console.log(`[auth] forgot-password sin destinatario para "${identifier.slice(0, 60)}"`);
    return;
  }

  const token = crypto.randomBytes(32).toString("base64url");
  const expires = new Date(Date.now() + RESET_TTL_MIN * 60 * 1000).toISOString();
  db.transaction(() => {
    // Un enlace vigente por cuenta: los anteriores sin usar se anulan.
    db.prepare("UPDATE password_resets SET used_at = COALESCE(used_at, ?) WHERE user_id = ?")
      .run(new Date().toISOString(), user.id);
    db.prepare("INSERT INTO password_resets (user_id, token_hash, expires_at) VALUES (?, ?, ?)")
      .run(user.id, hashToken(token), expires);
  })();

  const appUrl = (process.env.PUBLIC_APP_URL || "https://psicomorfosis.co").replace(/\/$/, "");
  const url = `${appUrl}/restablecer/${token}`;
  console.log(`[auth] forgot-password user=${user.id} → correo enviado`);
  sendPasswordResetEmail({ to: user.email, name: user.name, username: user.username, url })
    .catch((e) => console.warn("[auth] reset mail:", e?.message));
});

/** GET /api/auth/reset-password/:token — ¿sigue vigente? (para la página). */
router.get("/reset-password/:token", (req, res) => {
  const row = db.prepare(`
    SELECT pr.id, pr.expires_at, pr.used_at, u.name
    FROM password_resets pr JOIN users u ON u.id = pr.user_id
    WHERE pr.token_hash = ?
  `).get(hashToken(req.params.token));
  const valid = !!row && !row.used_at && new Date(row.expires_at).getTime() > Date.now();
  res.json({ valid, name: valid ? row.name : null });
});

/**
 * POST /api/auth/reset-password  { token, password }
 *
 * Cambia la contraseña, quema el token, revoca todas las sesiones
 * previas (si el correo fue leído por quien no debía, aquí se corta) y
 * devuelve una sesión nueva para que la persona entre de una.
 */
router.post("/reset-password", forgotLimiter, (req, res) => {
  const token = String(req.body?.token ?? "");
  const password = String(req.body?.password ?? "");
  if (password.length < 8) {
    return res.status(400).json({ error: "La contraseña debe tener al menos 8 caracteres" });
  }
  const row = db.prepare(`
    SELECT pr.id AS reset_id, pr.expires_at, pr.used_at, u.*,
           w.name AS workspace_name, w.mode AS workspace_mode, w.disabled_at
    FROM password_resets pr
    JOIN users u ON u.id = pr.user_id
    JOIN workspaces w ON w.id = u.workspace_id
    WHERE pr.token_hash = ?
  `).get(hashToken(token));
  if (!row || row.used_at || new Date(row.expires_at).getTime() <= Date.now()) {
    return res.status(400).json({ error: "Este enlace ya no es válido. Pide uno nuevo desde «Olvidé mi contraseña»." });
  }
  if (row.disabled_at && !row.is_platform_admin && !row.is_legal_admin) {
    return res.status(403).json({ error: "Esta cuenta está deshabilitada. Escríbenos a soporte." });
  }

  const hash = bcrypt.hashSync(password, 10);
  db.transaction(() => {
    db.prepare("UPDATE users SET password_hash = ?, auth_provider = CASE WHEN auth_provider = 'google' THEN 'password+google' ELSE auth_provider END WHERE id = ?")
      .run(hash, row.id);
    db.prepare("UPDATE password_resets SET used_at = ? WHERE id = ?").run(new Date().toISOString(), row.reset_id);
  })();
  const cutoff = invalidateUserTokens(row.id);
  console.log(`[auth] reset-password OK user=${row.id}`);

  const fresh = signToken({
    id: row.id,
    workspace_id: row.workspace_id,
    username: row.username,
    role: row.role,
    name: row.name,
    professional_id: row.professional_id ?? null,
    is_platform_admin: !!row.is_platform_admin,
    is_legal_admin: !!row.is_legal_admin,
  }, { issuedAtMs: new Date(cutoff).getTime() });
  res.json({
    token: fresh,
    user: {
      id: row.id, username: row.username, name: row.name, email: row.email, role: row.role,
      isPlatformAdmin: !!row.is_platform_admin, isLegalAdmin: !!row.is_legal_admin,
      workspaceId: row.workspace_id, workspaceName: row.workspace_name, workspaceMode: row.workspace_mode,
    },
  });
});

router.get("/signup-status", (_req, res) => {
  res.json({ enabled: publicSignupEnabled() });
});

export default router;
