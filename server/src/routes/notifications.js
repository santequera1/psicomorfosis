import { Router } from "express";
import { db } from "../db.js";
import { requireAuth } from "../auth.js";

const router = Router();
router.use(requireAuth);

router.get("/", (req, res) => {
  const rows = db.prepare("SELECT * FROM notifications WHERE workspace_id = ? ORDER BY urgent DESC, read ASC").all(req.user.workspace_id);
  res.json(rows.map((n) => ({ ...n, read: !!n.read, urgent: !!n.urgent })));
});

router.post("/:id/read", (req, res) => {
  db.prepare("UPDATE notifications SET read = 1 WHERE id = ? AND workspace_id = ?").run(req.params.id, req.user.workspace_id);
  res.json({ ok: true });
});

router.post("/mark-all-read", (req, res) => {
  db.prepare("UPDATE notifications SET read = 1 WHERE workspace_id = ?").run(req.user.workspace_id);
  res.json({ ok: true });
});

export default router;
