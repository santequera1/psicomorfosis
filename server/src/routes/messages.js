import { Router } from "express";
import { db } from "../db.js";
import { requireAuth } from "../auth.js";

const router = Router();
router.use(requireAuth);

function hydrateThread(thread, withMessages = false) {
  const result = {
    id: thread.id,
    patientId: thread.patient_id,
    patientName: thread.patient_name,
    preferredName: thread.preferred_name ?? undefined,
    preview: thread.preview,
    lastAt: thread.last_at,
    unread: thread.unread,
    pinned: !!thread.pinned,
    risk: thread.risk,
  };
  if (withMessages) {
    result.messages = db.prepare("SELECT id, sender AS `from`, text, at, read FROM messages WHERE thread_id = ? ORDER BY id ASC").all(thread.id);
  }
  return result;
}

router.get("/threads", (req, res) => {
  const threads = db.prepare("SELECT * FROM message_threads ORDER BY pinned DESC, unread DESC, last_at DESC").all();
  res.json(threads.map((t) => hydrateThread(t, false)));
});

router.get("/threads/:id", (req, res) => {
  const row = db.prepare("SELECT * FROM message_threads WHERE id = ?").get(req.params.id);
  if (!row) return res.status(404).json({ error: "Hilo no encontrado" });
  res.json(hydrateThread(row, true));
});

router.post("/threads/:id/messages", (req, res) => {
  const { text, sender = "profesional" } = req.body ?? {};
  if (!text?.trim()) return res.status(400).json({ error: "Texto requerido" });
  const thread = db.prepare("SELECT * FROM message_threads WHERE id = ?").get(req.params.id);
  if (!thread) return res.status(404).json({ error: "Hilo no encontrado" });

  const at = new Date().toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" });
  const r = db.prepare("INSERT INTO messages (thread_id, sender, text, at, read) VALUES (?, ?, ?, ?, 1)")
    .run(req.params.id, sender, text, at);

  db.prepare("UPDATE message_threads SET preview = ?, last_at = ? WHERE id = ?")
    .run(text.slice(0, 80), at, req.params.id);

  const message = { id: r.lastInsertRowid, from: sender, text, at, read: 1 };
  req.app.get("io")?.emit("message:created", { threadId: req.params.id, message });
  res.status(201).json(message);
});

router.post("/threads/:id/read", (req, res) => {
  db.prepare("UPDATE message_threads SET unread = 0 WHERE id = ?").run(req.params.id);
  db.prepare("UPDATE messages SET read = 1 WHERE thread_id = ?").run(req.params.id);
  res.json({ ok: true });
});

export default router;
