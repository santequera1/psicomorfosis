/**
 * Notificaciones — calculadas dinámicamente desde la data real del
 * workspace (no son persistentes, no requieren triggers ni eventos).
 *
 * Diseño:
 *  - Cada GET deriva notificaciones desde tablas existentes (citas,
 *    tests, tareas, documentos). Si la condición ya no aplica
 *    (ej: la cita ya pasó), la notificación deja de aparecer
 *    automáticamente sin necesidad de "borrarla".
 *  - El campo `id` es estable por evento (ej: `appt-123`) para que el
 *    frontend pueda persistir flags "ya vista" en localStorage si
 *    quiere (más adelante).
 *
 * Dismissals (descarte por usuario):
 *  - Tabla `notification_dismissals` (user_id, notification_id) persiste
 *    cuáles notifs cada usuario ya descartó (botón X o "marcar todas").
 *  - El GET filtra las dismissadas → el panel queda limpio aunque la
 *    notif siga generándose en bruto.
 *  - Las re-aplicaciones del mismo evento (mismo id) NO vuelven a
 *    aparecer una vez dismissadas. Si una entrega de tarea se reenvía
 *    con el mismo id pero distinto submitted_at, podría no aparecer
 *    de nuevo — caso raro, lo iteramos si pasa.
 *
 * Tipos:
 *  - 'cita'      → cita confirmada en las próximas 24h sin atender
 *  - 'test'      → test_application status='completado' en últimos 7d
 *  - 'tarea'     → therapy_task vencida y no completada
 *  - 'entrega'   → paciente entregó archivo a una tarea kanban (últimos 7d)
 *  - 'documento' → documento firmado por paciente en los últimos 7d
 *  - 'reporte'   → solo platform admin: error_reports abiertos
 *
 * Orden: urgentes primero, luego por fecha descendente del evento.
 */
import { Router } from "express";
import { db } from "../db.js";
import { requireAuth } from "../auth.js";

const router = Router();
router.use(requireAuth);

/** Formato relativo amigable. Aproximado — no usamos Intl.RelativeTimeFormat
 *  para no bajar la fecha del usuario; el output es estable y simple. */
function relativeTime(iso) {
  if (!iso) return "";
  const date = new Date(iso);
  const now = Date.now();
  const diff = now - date.getTime();
  const min = Math.round(diff / 60_000);
  if (min < 1) return "ahora";
  if (min < 60) return `hace ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.round(h / 24);
  if (d === 1) return "ayer";
  if (d < 7) return `hace ${d} d`;
  return iso.slice(0, 10);
}

/**
 * Combina date 'YYYY-MM-DD' + time 'HH:MM' en ISO con la TZ del server.
 * Para citas, el user típicamente está en la misma TZ que el server
 * (Bogotá), así que esto es razonable. Si llegamos a multi-TZ tocaría
 * guardar tz_offset en la cita.
 */
function apptInstantISO(date, time) {
  if (!date || !time) return null;
  // SQLite guarda strings, no Date. Construimos un ISO manualmente.
  return `${date}T${time}:00`;
}

/**
 * Computa las notificaciones del workspace SIN aplicar dismissals.
 * Lo extrajimos a función pura para que GET y mark-all-read compartan
 * la misma lógica de qué notifs existen ahora mismo.
 *
 * Devuelve objetos con campo `raw_at` (para ordenar) que el caller debe
 * limpiar antes de enviar al cliente.
 */
function computeNotifications({ wsId, isPlatformAdmin }) {
  const out = [];

  // ─── 1) Citas próximas (próximas 24h confirmadas, no atendidas) ─────
  const upcoming = db.prepare(`
    SELECT id, patient_name, date, time, modality, status
    FROM appointments
    WHERE workspace_id = ?
      AND status NOT IN ('cancelada', 'atendida')
      AND datetime(date || 'T' || time) BETWEEN datetime('now') AND datetime('now', '+1 day')
    ORDER BY date, time
    LIMIT 8
  `).all(wsId);

  for (const a of upcoming) {
    const at = apptInstantISO(a.date, a.time);
    out.push({
      id: `appt-${a.id}`,
      type: "cita",
      title: `Cita próxima · ${a.patient_name}`,
      description: `${a.date} ${a.time} · ${a.modality}`,
      at: relativeTime(at),
      raw_at: at,
      urgent: false,
    });
  }

  // ─── 2) Tests completados pendientes de revisar (últimos 7d) ────────
  const tests = db.prepare(`
    SELECT id, patient_name, test_code, test_name, date, level
    FROM test_applications
    WHERE workspace_id = ?
      AND status = 'completado'
      AND date >= date('now', '-7 days')
    ORDER BY date DESC
    LIMIT 8
  `).all(wsId);

  for (const t of tests) {
    out.push({
      id: `test-${t.id}`,
      type: "test",
      title: `${t.test_code} pendiente de revisar`,
      description: `${t.patient_name} · completó ${t.test_name}`,
      at: relativeTime(t.date),
      raw_at: t.date,
      urgent: t.level === "high" || t.level === "critical",
    });
  }

  // ─── 3) Tareas terapéuticas vencidas y no completadas ──────────────
  const overdueTasks = db.prepare(`
    SELECT id, patient_name, title, due_at, adherence
    FROM therapy_tasks
    WHERE workspace_id = ?
      AND status != 'completada'
      AND due_at IS NOT NULL
      AND date(due_at) < date('now')
    ORDER BY due_at DESC
    LIMIT 6
  `).all(wsId);

  for (const t of overdueTasks) {
    const adh = typeof t.adherence === "number" ? `Adherencia ${t.adherence}%` : "Sin avance reportado";
    out.push({
      id: `task-${t.id}`,
      type: "tarea",
      title: `Tarea vencida · ${t.patient_name}`,
      description: `${t.title} · ${adh}`,
      at: relativeTime(t.due_at),
      raw_at: t.due_at,
      urgent: false,
    });
  }

  // ─── 3b) Entregas de tareas kanban (paciente subió archivo, últimos 7d) ─
  const submissions = db.prepare(`
    SELECT t.id, t.title, t.submitted_at, t.patient_id,
           p.name AS patient_name, p.preferred_name
    FROM tareas t
    LEFT JOIN patients p ON t.patient_id = p.id
    WHERE t.workspace_id = ?
      AND t.submitted_at IS NOT NULL
      AND date(t.submitted_at) >= date('now', '-7 days')
      AND t.archived_at IS NULL AND t.deleted_at IS NULL
    ORDER BY t.submitted_at DESC
    LIMIT 8
  `).all(wsId);

  for (const s of submissions) {
    const who = s.preferred_name || s.patient_name || "Paciente";
    out.push({
      id: `entrega-${s.id}`,
      type: "entrega",
      title: `Entrega recibida · ${who}`,
      description: `Entregó "${s.title}"`,
      at: relativeTime(s.submitted_at),
      raw_at: s.submitted_at,
      urgent: false,
    });
  }

  // ─── 4) Documentos firmados recientemente por pacientes (últimos 7d) ─
  const signedDocs = db.prepare(`
    SELECT id, name, patient_name, signed_at
    FROM documents
    WHERE workspace_id = ?
      AND status = 'firmado'
      AND signed_at IS NOT NULL
      AND date(signed_at) >= date('now', '-7 days')
    ORDER BY signed_at DESC
    LIMIT 6
  `).all(wsId);

  for (const d of signedDocs) {
    out.push({
      id: `doc-${d.id}`,
      type: "documento",
      title: `Documento firmado · ${d.patient_name}`,
      description: d.name,
      at: relativeTime(d.signed_at),
      raw_at: d.signed_at,
      urgent: false,
    });
  }

  // ─── 5) Solo platform admin: reportes abiertos ─────────────────────
  if (isPlatformAdmin) {
    const reports = db.prepare(`
      SELECT id, user_description, message, created_at
      FROM error_reports
      WHERE status = 'open'
      ORDER BY created_at DESC
      LIMIT 5
    `).all();

    for (const r of reports) {
      out.push({
        id: `report-${r.id}`,
        type: "alerta",
        title: `Nuevo reporte de problema #${r.id}`,
        description: (r.user_description ?? r.message ?? "").slice(0, 120),
        at: relativeTime(r.created_at),
        raw_at: r.created_at,
        urgent: false,
      });
    }
  }

  return out;
}

router.get("/", (req, res) => {
  const wsId = req.user.workspace_id;
  const isPlatformAdmin = !!req.user.is_platform_admin;
  const userId = req.user.id;

  const all = computeNotifications({ wsId, isPlatformAdmin });

  // Lookup de dismissals del user actual. Una sola query → Set para O(1).
  const dismissedRows = db.prepare(`
    SELECT notification_id FROM notification_dismissals WHERE user_id = ?
  `).all(userId);
  const dismissed = new Set(dismissedRows.map((r) => r.notification_id));

  // Filtramos las descartadas. El panel queda limpio una vez el user
  // marca como leída, aunque la condición de generación siga viva.
  const visible = all.filter((n) => !dismissed.has(n.id));

  // Orden final: urgentes primero, luego por raw_at descendente
  // (más reciente arriba). raw_at vacío al final.
  visible.sort((a, b) => {
    if (a.urgent !== b.urgent) return a.urgent ? -1 : 1;
    if (!a.raw_at) return 1;
    if (!b.raw_at) return -1;
    return a.raw_at < b.raw_at ? 1 : -1;
  });

  // Cliente recibe `read: false` para todo lo visible (si estuviera
  // dismissado ya lo habríamos filtrado). Limpiamos raw_at.
  res.json(visible.map(({ raw_at, ...rest }) => ({ ...rest, read: false })));
});

/**
 * POST /api/notifications/:id/dismiss — el usuario descarta UNA notif.
 * Idempotente (INSERT OR IGNORE) — clicks repetidos no rompen nada.
 *
 * Alias legacy /:id/read que ya existía como no-op ahora hace lo mismo:
 * dismissar = marcar como leída en este modelo (el panel solo muestra
 * lo accionable, sin estado intermedio "leído pero visible").
 */
function dismissOne(req, res) {
  const userId = req.user.id;
  const notifId = req.params.id;
  if (!notifId) return res.status(400).json({ error: "id requerido" });
  db.prepare(`
    INSERT OR IGNORE INTO notification_dismissals (user_id, notification_id)
    VALUES (?, ?)
  `).run(userId, notifId);
  res.json({ ok: true });
}
router.post("/:id/dismiss", dismissOne);
router.post("/:id/read", dismissOne);

/**
 * POST /api/notifications/mark-all-read — descarta TODAS las notifs que el
 * usuario ve actualmente. Computamos el conjunto en el momento (mismo
 * código que GET) y registramos un dismissal por cada una. Las que se
 * generen DESPUÉS (eventos nuevos) reaparecen, las actuales se silencian.
 */
router.post("/mark-all-read", (req, res) => {
  const wsId = req.user.workspace_id;
  const userId = req.user.id;
  const isPlatformAdmin = !!req.user.is_platform_admin;

  const all = computeNotifications({ wsId, isPlatformAdmin });
  const ins = db.prepare(`
    INSERT OR IGNORE INTO notification_dismissals (user_id, notification_id)
    VALUES (?, ?)
  `);
  const tx = db.transaction((ids) => {
    for (const id of ids) ins.run(userId, id);
  });
  tx(all.map((n) => n.id));

  res.json({ ok: true, dismissed: all.length });
});

export default router;
