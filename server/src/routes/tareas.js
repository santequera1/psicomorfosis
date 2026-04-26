import { Router } from "express";
import { db } from "../db.js";
import { requireAuth } from "../auth.js";

const router = Router();
router.use(requireAuth);

const VALID_STATUS = new Set(["TODO", "IN_PROGRESS", "IN_REVIEW", "DONE"]);
const VALID_PRIORITY = new Set(["LOW", "MEDIUM", "HIGH", "URGENT"]);
const VALID_VISIBILITY = new Set(["private", "team", "workspace"]);
const VALID_TASK_TYPES = new Set([
  "Sesión clínica", "Documentación", "Llamada / Seguimiento",
  "Administrativo", "Capacitación", "Auto-cuidado",
  "Reunión equipo", "Reporte",
]);

// ─── Helpers ────────────────────────────────────────────────────────────────
const now = () => new Date().toISOString();
const wsId = (req) => req.user.workspace_id;
const emit = (req, event, payload) =>
  req.app.get("io")?.to(`ws-${wsId(req)}`).emit(event, payload);

function safeJSON(s) {
  try { return JSON.parse(s); } catch { return null; }
}

function toTask(row) {
  if (!row) return null;
  return {
    ...row,
    recurrence: row.recurrence ? safeJSON(row.recurrence) : null,
    is_recurring_instance: !!row.is_recurring_instance,
  };
}

function getTask(id, workspace_id) {
  return db.prepare("SELECT * FROM tareas WHERE id = ? AND workspace_id = ?")
           .get(id, workspace_id);
}

function canSee(task, user) {
  if (user.role === "super_admin" || user.role === "admin") return true;
  if (task.visibility === "workspace" || task.visibility === "team") return true;
  return task.creator_id === user.id ||
         (user.professional_id && task.assignee_id === user.professional_id);
}

function attachSubresources(task) {
  const comments = db.prepare(`
    SELECT c.*, u.name AS author_name
    FROM tareas_comments c JOIN users u ON c.author_id = u.id
    WHERE c.task_id = ? ORDER BY c.created_at ASC
  `).all(task.id);
  const checklist = db.prepare(`
    SELECT * FROM tareas_checklist WHERE task_id = ? ORDER BY position ASC
  `).all(task.id).map((i) => ({ ...i, completed: !!i.completed }));
  const images = db.prepare(`
    SELECT * FROM tareas_images WHERE task_id = ? ORDER BY position ASC
  `).all(task.id).map((i) => ({ ...i, url: `/uploads/tareas/${task.workspace_id}/${i.filename}` }));
  const pomodoro_sessions = db.prepare(`
    SELECT * FROM tareas_pomodoro_sessions WHERE task_id = ? ORDER BY start_time DESC
  `).all(task.id).map((s) => ({ ...s, completed: !!s.completed }));
  return { ...task, comments, checklist, images, pomodoro_sessions };
}

// ════════════════════════════════════════════════════════════════════════════
// Rutas literales primero (proyectos / columnas / carpetas)
// ════════════════════════════════════════════════════════════════════════════

// ─── Proyectos ──────────────────────────────────────────────────────────────
router.get("/projects", (req, res) => {
  const rows = db.prepare("SELECT * FROM tareas_projects WHERE workspace_id = ? ORDER BY position ASC, created_at ASC")
                 .all(wsId(req))
                 .map((p) => ({ ...p, archived: !!p.archived }));
  res.json(rows);
});

router.post("/projects", (req, res) => {
  const { name, color, description, category, folder_id } = req.body ?? {};
  if (!name) return res.status(400).json({ error: "name requerido" });
  const maxPos = db.prepare("SELECT COALESCE(MAX(position), -1) AS m FROM tareas_projects WHERE workspace_id = ?")
                   .get(wsId(req)).m;
  const ins = db.prepare(`
    INSERT INTO tareas_projects (workspace_id, name, color, description, category, folder_id, position, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(wsId(req), name, color ?? "brand", description ?? null,
         category ?? null, folder_id ?? null, maxPos + 1, now(), now());
  const row = db.prepare("SELECT * FROM tareas_projects WHERE id = ?").get(ins.lastInsertRowid);
  emit(req, "task:project:updated", row);
  res.status(201).json({ ...row, archived: !!row.archived });
});

router.post("/projects/reorder", (req, res) => {
  const { ordered_ids } = req.body ?? {};
  if (!Array.isArray(ordered_ids)) return res.status(400).json({ error: "ordered_ids requerido" });
  const tx = db.transaction(() => {
    ordered_ids.forEach((id, idx) => {
      db.prepare("UPDATE tareas_projects SET position = ?, updated_at = ? WHERE id = ? AND workspace_id = ?")
        .run(idx, now(), id, wsId(req));
    });
  });
  tx();
  res.json({ ok: true });
});

router.patch("/projects/:id", (req, res) => {
  const p = db.prepare("SELECT * FROM tareas_projects WHERE id = ? AND workspace_id = ?")
              .get(req.params.id, wsId(req));
  if (!p) return res.status(404).json({ error: "Proyecto no encontrado" });

  const fields = ["name", "color", "description", "category", "folder_id", "archived"];
  const sets = []; const params = [];
  for (const f of fields) {
    if (req.body?.[f] !== undefined) {
      sets.push(`${f} = ?`);
      params.push(f === "archived" ? (req.body[f] ? 1 : 0) : req.body[f]);
    }
  }
  if (sets.length === 0) return res.json({ ...p, archived: !!p.archived });
  sets.push("updated_at = ?"); params.push(now());
  params.push(req.params.id);
  db.prepare(`UPDATE tareas_projects SET ${sets.join(", ")} WHERE id = ?`).run(...params);
  const row = db.prepare("SELECT * FROM tareas_projects WHERE id = ?").get(req.params.id);
  emit(req, "task:project:updated", row);
  res.json({ ...row, archived: !!row.archived });
});

router.delete("/projects/:id", (req, res) => {
  const p = db.prepare("SELECT * FROM tareas_projects WHERE id = ? AND workspace_id = ?")
              .get(req.params.id, wsId(req));
  if (!p) return res.status(404).json({ error: "Proyecto no encontrado" });
  db.prepare("DELETE FROM tareas_projects WHERE id = ?").run(req.params.id);
  emit(req, "task:project:deleted", { id: Number(req.params.id) });
  res.json({ ok: true });
});

// ─── Columnas ───────────────────────────────────────────────────────────────
router.get("/columns", (req, res) => {
  const rows = db.prepare("SELECT * FROM tareas_columns WHERE workspace_id = ? ORDER BY position ASC")
                 .all(wsId(req))
                 .map((c) => ({ ...c, is_default: !!c.is_default }));
  res.json(rows);
});

// ─── Carpetas ───────────────────────────────────────────────────────────────
router.get("/folders", (req, res) => {
  const rows = db.prepare("SELECT * FROM tareas_folders WHERE workspace_id = ? ORDER BY position ASC")
                 .all(wsId(req))
                 .map((f) => ({ ...f, expanded: !!f.expanded }));
  res.json(rows);
});

// ════════════════════════════════════════════════════════════════════════════
// Tareas (lista + CRUD + acciones)
// ════════════════════════════════════════════════════════════════════════════

// GET /api/tareas?include=archived,deleted
router.get("/", (req, res) => {
  const include = String(req.query.include || "").split(",").filter(Boolean);
  const conds = ["workspace_id = ?"];
  const params = [wsId(req)];
  if (!include.includes("archived")) conds.push("archived_at IS NULL");
  if (!include.includes("deleted")) conds.push("deleted_at IS NULL");

  const rows = db.prepare(`SELECT * FROM tareas WHERE ${conds.join(" AND ")} ORDER BY position ASC, created_at DESC`)
    .all(...params)
    .filter((t) => canSee(t, req.user))
    .map(toTask);

  res.json(rows);
});

router.post("/", (req, res) => {
  const b = req.body ?? {};
  if (!b.title || typeof b.title !== "string") return res.status(400).json({ error: "title requerido" });
  if (b.status && !VALID_STATUS.has(b.status)) return res.status(400).json({ error: "status inválido" });
  if (b.priority && !VALID_PRIORITY.has(b.priority)) return res.status(400).json({ error: "priority inválida" });
  if (b.visibility && !VALID_VISIBILITY.has(b.visibility)) return res.status(400).json({ error: "visibility inválida" });
  if (b.type && !VALID_TASK_TYPES.has(b.type)) return res.status(400).json({ error: "type inválido" });

  const status = b.status ?? "TODO";
  const maxPos = db.prepare("SELECT COALESCE(MAX(position), -1) AS m FROM tareas WHERE workspace_id = ? AND status = ?")
                   .get(wsId(req), status).m;

  const ins = db.prepare(`
    INSERT INTO tareas (
      workspace_id, title, description, type, status, priority,
      assignee_id, creator_id, project_id, patient_id, visibility,
      start_date, due_date, tracking_preset, recurrence, position,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    wsId(req), b.title, b.description ?? null, b.type ?? null,
    status, b.priority ?? "MEDIUM",
    b.assignee_id ?? null, req.user.id, b.project_id ?? null, b.patient_id ?? null,
    b.visibility ?? "team",
    b.start_date ?? null, b.due_date ?? null, b.tracking_preset ?? null,
    b.recurrence ? JSON.stringify(b.recurrence) : null,
    maxPos + 1, now(), now()
  );

  const row = getTask(ins.lastInsertRowid, wsId(req));
  const task = attachSubresources(toTask(row));
  emit(req, "task:created", task);

  if (b.assignee_id && b.assignee_id !== req.user.professional_id) {
    db.prepare(`INSERT INTO notifications (id, workspace_id, type, title, description, at, read, urgent)
                VALUES (?, ?, 'tarea_asignada', ?, ?, ?, 0, ?)`)
      .run(`NTK-${row.id}-${Date.now()}`, wsId(req),
           "Nueva tarea asignada", b.title,
           "ahora", b.priority === "URGENT" ? 1 : 0);
  }

  res.status(201).json(task);
});

router.get("/:id", (req, res) => {
  const t = getTask(req.params.id, wsId(req));
  if (!t) return res.status(404).json({ error: "Tarea no encontrada" });
  if (!canSee(t, req.user)) return res.status(403).json({ error: "Sin permiso" });
  res.json(attachSubresources(toTask(t)));
});

router.patch("/:id", (req, res) => {
  const existing = getTask(req.params.id, wsId(req));
  if (!existing) return res.status(404).json({ error: "Tarea no encontrada" });

  const b = req.body ?? {};
  if (b.status && !VALID_STATUS.has(b.status)) return res.status(400).json({ error: "status inválido" });
  if (b.priority && !VALID_PRIORITY.has(b.priority)) return res.status(400).json({ error: "priority inválida" });
  if (b.visibility && !VALID_VISIBILITY.has(b.visibility)) return res.status(400).json({ error: "visibility inválida" });
  if (b.type && !VALID_TASK_TYPES.has(b.type)) return res.status(400).json({ error: "type inválido" });

  const fields = [
    "title", "description", "type", "status", "priority",
    "assignee_id", "project_id", "patient_id", "visibility",
    "start_date", "due_date", "tracking_preset",
  ];
  const sets = [];
  const params = [];
  for (const f of fields) {
    if (b[f] !== undefined) { sets.push(`${f} = ?`); params.push(b[f]); }
  }
  if (b.recurrence !== undefined) {
    sets.push("recurrence = ?");
    params.push(b.recurrence ? JSON.stringify(b.recurrence) : null);
  }
  if (b.status === "DONE" && !existing.completed_at) {
    sets.push("completed_at = ?"); params.push(now());
  }
  if (sets.length === 0) return res.json(toTask(existing));

  sets.push("updated_at = ?"); params.push(now());
  params.push(req.params.id);

  db.prepare(`UPDATE tareas SET ${sets.join(", ")} WHERE id = ?`).run(...params);
  const row = getTask(req.params.id, wsId(req));
  const task = attachSubresources(toTask(row));
  emit(req, "task:updated", task);
  res.json(task);
});

router.delete("/:id", (req, res) => {
  const t = getTask(req.params.id, wsId(req));
  if (!t) return res.status(404).json({ error: "Tarea no encontrada" });
  db.prepare("UPDATE tareas SET deleted_at = ?, updated_at = ? WHERE id = ?")
    .run(now(), now(), req.params.id);
  emit(req, "task:deleted", { id: Number(req.params.id) });
  res.json({ ok: true });
});

router.post("/:id/restore", (req, res) => {
  const t = getTask(req.params.id, wsId(req));
  if (!t) return res.status(404).json({ error: "Tarea no encontrada" });
  db.prepare("UPDATE tareas SET deleted_at = NULL, archived_at = NULL, updated_at = ? WHERE id = ?")
    .run(now(), req.params.id);
  const row = getTask(req.params.id, wsId(req));
  const task = attachSubresources(toTask(row));
  emit(req, "task:updated", task);
  res.json(task);
});

router.post("/:id/archive", (req, res) => {
  const t = getTask(req.params.id, wsId(req));
  if (!t) return res.status(404).json({ error: "Tarea no encontrada" });
  db.prepare("UPDATE tareas SET archived_at = ?, updated_at = ? WHERE id = ?")
    .run(now(), now(), req.params.id);
  emit(req, "task:updated", { id: Number(req.params.id), archived_at: now() });
  res.json({ ok: true });
});

router.post("/:id/move", (req, res) => {
  const { status, position } = req.body ?? {};
  if (!VALID_STATUS.has(status)) return res.status(400).json({ error: "status inválido" });
  if (typeof position !== "number" || position < 0) return res.status(400).json({ error: "position inválida" });

  const t = getTask(req.params.id, wsId(req));
  if (!t) return res.status(404).json({ error: "Tarea no encontrada" });

  const tx = db.transaction(() => {
    if (t.status !== status) {
      db.prepare("UPDATE tareas SET position = position - 1 WHERE workspace_id = ? AND status = ? AND position > ?")
        .run(wsId(req), t.status, t.position);
      db.prepare("UPDATE tareas SET position = position + 1 WHERE workspace_id = ? AND status = ? AND position >= ?")
        .run(wsId(req), status, position);
    } else {
      if (position < t.position) {
        db.prepare("UPDATE tareas SET position = position + 1 WHERE workspace_id = ? AND status = ? AND position >= ? AND position < ?")
          .run(wsId(req), status, position, t.position);
      } else if (position > t.position) {
        db.prepare("UPDATE tareas SET position = position - 1 WHERE workspace_id = ? AND status = ? AND position > ? AND position <= ?")
          .run(wsId(req), status, t.position, position);
      }
    }

    const newCompletedAt = status === "DONE" && !t.completed_at ? now() : t.completed_at;
    db.prepare("UPDATE tareas SET status = ?, position = ?, completed_at = ?, updated_at = ? WHERE id = ?")
      .run(status, position, newCompletedAt, now(), req.params.id);
  });
  tx();

  const row = getTask(req.params.id, wsId(req));
  emit(req, "task:moved", { id: Number(req.params.id), status, position });

  if (status === "DONE" && t.creator_id !== req.user.id) {
    db.prepare(`INSERT INTO notifications (id, workspace_id, type, title, description, at, read, urgent)
                VALUES (?, ?, 'tarea_completada', ?, ?, ?, 0, 0)`)
      .run(`NTK-${t.id}-${Date.now()}`, wsId(req),
           "Tarea completada", t.title, "ahora");
  }

  res.json(toTask(row));
});

router.post("/:id/duplicate", (req, res) => {
  const t = getTask(req.params.id, wsId(req));
  if (!t) return res.status(404).json({ error: "Tarea no encontrada" });
  const maxPos = db.prepare("SELECT COALESCE(MAX(position), -1) AS m FROM tareas WHERE workspace_id = ? AND status = ?")
                   .get(wsId(req), t.status).m;
  const ins = db.prepare(`
    INSERT INTO tareas (
      workspace_id, title, description, type, status, priority,
      assignee_id, creator_id, project_id, patient_id, visibility,
      start_date, due_date, tracking_preset, recurrence, position,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    wsId(req), `${t.title} (copia)`, t.description, t.type, "TODO", t.priority,
    t.assignee_id, req.user.id, t.project_id, t.patient_id, t.visibility,
    t.start_date, null, t.tracking_preset, t.recurrence,
    maxPos + 1, now(), now()
  );
  const row = getTask(ins.lastInsertRowid, wsId(req));
  const task = attachSubresources(toTask(row));
  emit(req, "task:created", task);
  res.status(201).json(task);
});

// ─── Comentarios ────────────────────────────────────────────────────────────
router.get("/:id/comments", (req, res) => {
  const t = getTask(req.params.id, wsId(req));
  if (!t) return res.status(404).json({ error: "Tarea no encontrada" });
  const rows = db.prepare(`
    SELECT c.*, u.name AS author_name
    FROM tareas_comments c JOIN users u ON c.author_id = u.id
    WHERE c.task_id = ? ORDER BY c.created_at ASC
  `).all(t.id);
  res.json(rows);
});

router.post("/:id/comments", (req, res) => {
  const { text } = req.body ?? {};
  if (!text || typeof text !== "string" || !text.trim()) {
    return res.status(400).json({ error: "text requerido" });
  }
  const t = getTask(req.params.id, wsId(req));
  if (!t) return res.status(404).json({ error: "Tarea no encontrada" });
  const ins = db.prepare(`
    INSERT INTO tareas_comments (task_id, workspace_id, author_id, text, created_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(t.id, wsId(req), req.user.id, text.trim(), now());
  const comment = db.prepare(`
    SELECT c.*, u.name AS author_name
    FROM tareas_comments c JOIN users u ON c.author_id = u.id
    WHERE c.id = ?
  `).get(ins.lastInsertRowid);
  emit(req, "task:comment:added", { task_id: t.id, comment });
  res.status(201).json(comment);
});

router.delete("/:id/comments/:cid", (req, res) => {
  const t = getTask(req.params.id, wsId(req));
  if (!t) return res.status(404).json({ error: "Tarea no encontrada" });
  const c = db.prepare("SELECT * FROM tareas_comments WHERE id = ? AND task_id = ?")
              .get(req.params.cid, t.id);
  if (!c) return res.status(404).json({ error: "Comentario no encontrado" });
  if (c.author_id !== req.user.id && req.user.role !== "super_admin" && req.user.role !== "admin") {
    return res.status(403).json({ error: "Sin permiso" });
  }
  db.prepare("DELETE FROM tareas_comments WHERE id = ?").run(req.params.cid);
  emit(req, "task:comment:deleted", { task_id: t.id, id: Number(req.params.cid) });
  res.json({ ok: true });
});

// ─── Checklist ──────────────────────────────────────────────────────────────
router.post("/:id/checklist", (req, res) => {
  const { text } = req.body ?? {};
  if (!text || !text.trim()) return res.status(400).json({ error: "text requerido" });
  const t = getTask(req.params.id, wsId(req));
  if (!t) return res.status(404).json({ error: "Tarea no encontrada" });
  const maxPos = db.prepare("SELECT COALESCE(MAX(position), -1) AS m FROM tareas_checklist WHERE task_id = ?")
                   .get(t.id).m;
  const ins = db.prepare(`
    INSERT INTO tareas_checklist (task_id, text, completed, position, created_at)
    VALUES (?, ?, 0, ?, ?)
  `).run(t.id, text.trim(), maxPos + 1, now());
  const item = db.prepare("SELECT * FROM tareas_checklist WHERE id = ?").get(ins.lastInsertRowid);
  const out = { ...item, completed: false };
  emit(req, "task:checklist:added", { task_id: t.id, item: out });
  res.status(201).json(out);
});

router.patch("/:id/checklist/:cid", (req, res) => {
  const t = getTask(req.params.id, wsId(req));
  if (!t) return res.status(404).json({ error: "Tarea no encontrada" });
  const item = db.prepare("SELECT * FROM tareas_checklist WHERE id = ? AND task_id = ?")
                 .get(req.params.cid, t.id);
  if (!item) return res.status(404).json({ error: "Item no encontrado" });

  const { text, completed } = req.body ?? {};
  const sets = [];
  const params = [];
  if (typeof text === "string") { sets.push("text = ?"); params.push(text); }
  if (typeof completed === "boolean") {
    sets.push("completed = ?", "completed_at = ?");
    params.push(completed ? 1 : 0, completed ? now() : null);
  }
  if (sets.length === 0) return res.json({ ...item, completed: !!item.completed });
  params.push(req.params.cid);
  db.prepare(`UPDATE tareas_checklist SET ${sets.join(", ")} WHERE id = ?`).run(...params);
  const updated = db.prepare("SELECT * FROM tareas_checklist WHERE id = ?").get(req.params.cid);
  const out = { ...updated, completed: !!updated.completed };
  emit(req, "task:checklist:updated", { task_id: t.id, item: out });
  res.json(out);
});

router.delete("/:id/checklist/:cid", (req, res) => {
  const t = getTask(req.params.id, wsId(req));
  if (!t) return res.status(404).json({ error: "Tarea no encontrada" });
  db.prepare("DELETE FROM tareas_checklist WHERE id = ? AND task_id = ?")
    .run(req.params.cid, t.id);
  emit(req, "task:checklist:deleted", { task_id: t.id, id: Number(req.params.cid) });
  res.json({ ok: true });
});

// ─── Pomodoro ───────────────────────────────────────────────────────────────
router.post("/:id/pomodoro", (req, res) => {
  const t = getTask(req.params.id, wsId(req));
  if (!t) return res.status(404).json({ error: "Tarea no encontrada" });
  const { start_time, end_time, duration_minutes, completed, type, date } = req.body ?? {};
  if (!start_time || !end_time || typeof duration_minutes !== "number") {
    return res.status(400).json({ error: "Campos requeridos faltan" });
  }
  const ins = db.prepare(`
    INSERT INTO tareas_pomodoro_sessions (task_id, user_id, start_time, end_time, duration_minutes, completed, type, date)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(t.id, req.user.id, start_time, end_time, duration_minutes,
         completed ? 1 : 0, type ?? "work", date ?? new Date().toISOString().slice(0, 10));

  if (completed && (type ?? "work") === "work") {
    db.prepare("UPDATE tareas SET total_pomodoros = total_pomodoros + 1 WHERE id = ?").run(t.id);
  }

  const session = db.prepare("SELECT * FROM tareas_pomodoro_sessions WHERE id = ?").get(ins.lastInsertRowid);
  res.status(201).json({ ...session, completed: !!session.completed });
});

export default router;
