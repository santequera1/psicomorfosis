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
 *  - La tabla `notifications` que existía se mantiene por compatibilidad
 *    pero NO se usa: el seed antiguo se está limpiando.
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

router.get("/", (req, res) => {
  const wsId = req.user.workspace_id;
  const isPlatformAdmin = !!req.user.is_platform_admin;
  const out = [];

  // ─── 1) Citas próximas (próximas 24h confirmadas, no atendidas) ─────
  // Filtramos por status != 'atendida' y != 'cancelada'. La marca
  // automática de atendida (lazy backfill en GET de appointments) hace
  // que las pasadas con grace queden fuera.
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
      read: false,
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
      read: false,
      // Tests con interpretación de riesgo alto/crítico marcamos como urgent.
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
      read: false,
      urgent: false,
    });
  }

  // ─── 3b) Entregas de tareas kanban (paciente subió archivo, últimos 7d) ─
  // Cuando el paciente entrega vía /api/portal/tasks/:id/submit, marcamos
  // tareas.submitted_at y status='IN_REVIEW'. Aquí derivamos la notif para
  // que aparezca en /api/notifications sin depender de la tabla legacy.
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
      read: false,
      // No urgente: la entrega es buena noticia, no exige acción inmediata.
      // El psicólogo la revisa cuando pueda.
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
      read: false,
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
        read: false,
        urgent: false,
      });
    }
  }

  // Orden final: urgentes primero, luego por raw_at descendente
  // (más reciente arriba). raw_at vacío al final.
  out.sort((a, b) => {
    if (a.urgent !== b.urgent) return a.urgent ? -1 : 1;
    if (!a.raw_at) return 1;
    if (!b.raw_at) return -1;
    return a.raw_at < b.raw_at ? 1 : -1;
  });

  // Limpiamos raw_at antes de enviar — el cliente solo necesita `at`
  // formateado y el id estable.
  res.json(out.map(({ raw_at, ...rest }) => rest));
});

/**
 * Endpoints legacy que ya no aplican con notificaciones dinámicas:
 * un POST /:id/read no tiene a quién marcar (las notif son derivadas
 * y se regeneran en cada GET). Mantengo los routes por compatibilidad
 * pero responden 200 ok sin hacer nada — el front no debería llamarlos.
 */
router.post("/:id/read", (_req, res) => res.json({ ok: true }));
router.post("/mark-all-read", (_req, res) => res.json({ ok: true }));

export default router;
