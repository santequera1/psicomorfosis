import { Router } from "express";
import { db } from "../db.js";
import { requireAuth } from "../auth.js";

const router = Router();
router.use(requireAuth);

router.get("/", (req, res) => {
  const rows = db.prepare("SELECT key, value FROM settings WHERE workspace_id = ?").all(req.user.workspace_id);
  const obj = {};
  for (const r of rows) obj[r.key] = r.value;
  res.json(obj);
});

router.put("/", (req, res) => {
  const data = req.body ?? {};
  const upsert = db.prepare("INSERT INTO settings (workspace_id, key, value) VALUES (?, ?, ?) ON CONFLICT(workspace_id, key) DO UPDATE SET value = excluded.value");
  const tx = db.transaction(() => {
    for (const [key, value] of Object.entries(data)) {
      upsert.run(req.user.workspace_id, key, String(value));
    }
  });
  tx();
  res.json({ ok: true });
});

export default router;
