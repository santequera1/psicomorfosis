/**
 * Rutas para el bot de Laura en WhatsApp.
 *
 * Autenticación:
 *  - Todos los endpoints requieren el header `X-Bot-Api-Key` con el
 *    valor de process.env.BOT_API_KEY (definido en .env, NO commiteado).
 *  - El bot NO usa JWT de usuario. En su lugar, cuando llama a
 *    endpoints regulares de la app, manda `X-Bot-Api-Key` +
 *    `X-Bot-Actor-User-Id` — el middleware requireAuth de auth.js
 *    reconoce esa combinación y setea req.user al actor real.
 *  - Este esquema mantiene la auditoría intacta: cada request queda
 *    con el usuario que "actuó" (aunque el bot sea el llamante).
 *
 * Endpoints:
 *  - POST /api/bot/identify — phone → user context (role, ids, scope).
 */

import { Router } from "express";
import { db } from "../db.js";

const router = Router();

const MAX_PHONE_MATCH_LEN = 15; // ITU-T E.164 max

/** Quita todo lo que no sea dígito. "+57 310 482 1290" → "573104821290" */
function normalizePhone(raw) {
  if (typeof raw !== "string") return "";
  return raw.replace(/\D/g, "");
}

/** Middleware: valida el header X-Bot-Api-Key contra BOT_API_KEY del .env.
 *  Sin BOT_API_KEY definido, rechaza todas las requests (seguridad
 *  por defecto — no queremos que un bot "abierto" existiera si alguien
 *  se olvida de configurar la key). */
function requireBotApiKey(req, res, next) {
  const expected = process.env.BOT_API_KEY?.trim();
  if (!expected) {
    return res.status(503).json({
      error: "Bot API no configurada en el servidor",
      hint: "Falta BOT_API_KEY en .env",
    });
  }
  const got = req.headers["x-bot-api-key"];
  if (!got || got !== expected) {
    return res.status(401).json({ error: "X-Bot-Api-Key inválida" });
  }
  next();
}

router.use(requireBotApiKey);

/**
 * POST /api/bot/identify
 *
 * Body: { phone: string }
 *   Ej: { "phone": "+57 310 482 1290" } o { "phone": "573104821290" }
 *
 * Respuesta si es paciente:
 *   {
 *     kind: "patient",
 *     actor_user_id: 123,        // ← el bot usa esto en X-Bot-Actor-User-Id
 *     user_id: 123,              // (alias por claridad)
 *     workspace_id: 1,
 *     workspace_name: "Consulta Nathaly",
 *     patient: {
 *       id: "P-1013",
 *       name: "Daniel Felipe Angulo",
 *       preferred_name: null,
 *       email: "...",
 *     },
 *     professional: {            // el psicólogo del paciente
 *       id: 5,
 *       name: "Nathaly Ferrer",
 *       phone: "+57 304 219 0650",
 *     },
 *     scope: {
 *       // qué puede leer/hacer el bot en nombre de este actor
 *       can_read_own_appointments: true,
 *       can_read_own_tasks: true,
 *       can_read_own_tests: true,
 *       can_read_own_documents: true,
 *       can_confirm_own_appointments: true,
 *       can_reagenda_own_appointments: "requires_professional_approval",
 *     }
 *   }
 *
 * Respuesta si es staff:
 *   {
 *     kind: "staff",
 *     actor_user_id: 42,
 *     user_id: 42,
 *     workspace_id: 1,
 *     workspace_name: "Consulta Nathaly",
 *     role: "psicologa",
 *     name: "Nathaly Ferrer",
 *     email: "...",
 *     professional_id: 5,
 *     scope: {
 *       can_read_workspace_agenda: true,
 *       can_read_workspace_patients: true,
 *       can_read_workspace_tasks: true,
 *       can_write_appointments: true,
 *       can_write_tasks: true,
 *       is_admin: false,
 *       is_super_admin: false,
 *     }
 *   }
 *
 * Respuesta si no matchea:
 *   404 { kind: "unknown" }
 */
router.post("/bot/identify", (req, res) => {
  const raw = req.body?.phone;
  const normalized = normalizePhone(raw);
  if (!normalized || normalized.length < 6 || normalized.length > MAX_PHONE_MATCH_LEN) {
    return res.status(400).json({ error: "phone requerido (formato E.164 o dígitos)" });
  }

  // Matching flexible: el phone guardado puede tener espacios, guiones,
  // el prefijo +57, o solo el número local. Normalizamos ambos lados
  // y matcheamos por sufijo — el número puede estar guardado como
  // "+57 310 482 1290" o "3104821290" y ambos deben resolver al mismo
  // paciente. Solo comparamos los últimos 10 dígitos (el número local)
  // como fallback si el match completo falla.
  const last10 = normalized.slice(-10);

  // 1) Match staff — via professionals.phone → users con professional_id
  //    Solo consideramos usuarios que NO son pacientes.
  const staffCandidates = db.prepare(`
    SELECT
      u.id           AS user_id,
      u.workspace_id AS workspace_id,
      u.role         AS role,
      u.name         AS name,
      u.email        AS email,
      u.professional_id AS professional_id,
      p.phone        AS prof_phone,
      p.name         AS prof_name,
      w.name         AS workspace_name
    FROM users u
    JOIN professionals p ON p.id = u.professional_id
    LEFT JOIN workspaces w ON w.id = u.workspace_id
    WHERE u.role != 'paciente'
      AND p.phone IS NOT NULL
      AND p.phone != ''
  `).all();

  const staffMatch = staffCandidates.find((s) => {
    const n = normalizePhone(s.prof_phone);
    return n === normalized || n.endsWith(last10) || normalized.endsWith(n.slice(-10));
  });

  if (staffMatch) {
    return res.json({
      kind: "staff",
      actor_user_id: staffMatch.user_id,
      user_id: staffMatch.user_id,
      workspace_id: staffMatch.workspace_id,
      workspace_name: staffMatch.workspace_name ?? null,
      role: staffMatch.role,
      name: staffMatch.name,
      email: staffMatch.email,
      professional_id: staffMatch.professional_id,
      scope: {
        can_read_workspace_agenda: true,
        can_read_workspace_patients: true,
        can_read_workspace_tasks: true,
        can_read_workspace_documents: true,
        can_write_appointments: true,
        can_write_tasks: true,
        can_write_notes: true,
        is_admin: staffMatch.role === "admin" || staffMatch.role === "super_admin",
        is_super_admin: staffMatch.role === "super_admin",
      },
    });
  }

  // 2) Match paciente — via patients.phone. También devolvemos el user
  //    asociado (si el paciente activó su cuenta del portal) — el bot
  //    lo usará como actor_user_id para llamar endpoints.
  const patientCandidates = db.prepare(`
    SELECT
      p.id               AS patient_id,
      p.workspace_id     AS workspace_id,
      p.name             AS name,
      p.preferred_name   AS preferred_name,
      p.email            AS email,
      p.phone            AS phone,
      p.professional_id  AS professional_id,
      w.name             AS workspace_name,
      pr.name            AS prof_name,
      pr.phone           AS prof_phone,
      u.id               AS user_id
    FROM patients p
    LEFT JOIN workspaces w ON w.id = p.workspace_id
    LEFT JOIN professionals pr ON pr.id = p.professional_id
    LEFT JOIN users u ON u.patient_id = p.id
    WHERE p.phone IS NOT NULL
      AND p.phone != ''
      AND p.archived_at IS NULL
  `).all();

  const patientMatch = patientCandidates.find((p) => {
    const n = normalizePhone(p.phone);
    return n === normalized || n.endsWith(last10) || normalized.endsWith(n.slice(-10));
  });

  if (patientMatch) {
    return res.json({
      kind: "patient",
      // Si el paciente activó el portal, tiene user_id. Si no, es null
      // — el bot igual puede identificarlo pero no puede "actuar como
      // él" en endpoints que requieren req.user (ej: marcar tarea
      // completada). En ese caso el bot debería invitarlo a activar
      // la cuenta.
      actor_user_id: patientMatch.user_id,
      user_id: patientMatch.user_id,
      workspace_id: patientMatch.workspace_id,
      workspace_name: patientMatch.workspace_name ?? null,
      patient: {
        id: patientMatch.patient_id,
        name: patientMatch.name,
        preferred_name: patientMatch.preferred_name,
        email: patientMatch.email,
      },
      professional: patientMatch.professional_id ? {
        id: patientMatch.professional_id,
        name: patientMatch.prof_name,
        phone: patientMatch.prof_phone,
      } : null,
      account_activated: patientMatch.user_id != null,
      scope: {
        can_read_own_appointments: true,
        can_read_own_tasks: true,
        can_read_own_tests: true,
        can_read_own_documents: true,
        can_confirm_own_appointments: true,
        can_reagenda_own_appointments: "requires_professional_approval",
        can_mark_own_task_completed: true,
      },
    });
  }

  // 3) Desconocido
  return res.status(404).json({ kind: "unknown" });
});

/**
 * GET /api/bot/health
 * Diagnóstico simple para que el bot verifique que la API es alcanzable
 * y su API key es correcta. Útil para el bootstrap del bot.
 */
router.get("/bot/health", (_req, res) => {
  res.json({ ok: true, timestamp: new Date().toISOString() });
});

export default router;
