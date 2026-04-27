import express from "express";
import cors from "cors";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "node:http";
import { Server as SocketIOServer } from "socket.io";
import "dotenv/config";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

import { initDb } from "./db.js";
import { verifyToken } from "./auth.js";

import authRoutes from "./routes/auth.js";
import workspaceRoutes from "./routes/workspace.js";
import patientsRoutes from "./routes/patients.js";
import appointmentsRoutes from "./routes/appointments.js";
import testsRoutes from "./routes/tests.js";
import tasksRoutes from "./routes/tasks.js";
import tareasRoutes from "./routes/tareas.js";
import documentsRoutes from "./routes/documents.js";
import invoicesRoutes from "./routes/invoices.js";
import notificationsRoutes from "./routes/notifications.js";
import settingsRoutes from "./routes/settings.js";
import notesRoutes from "./routes/notes.js";
import portalRoutes from "./routes/portal.js";

const PORT = Number(process.env.PORT ?? 3002);

initDb();

const app = express();
const http = createServer(app);
const io = new SocketIOServer(http, { cors: { origin: "*" } });
app.set("io", io);

app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: "4mb" }));

app.get("/api/health", (_req, res) => res.json({ ok: true, ts: new Date().toISOString() }));

// Servir assets subidos como static bajo /api/uploads para que nginx (que solo
// proxea /api/*) los entregue. Las URLs incluyen 12 bytes random en el filename
// (unguessable). Esto sirve imágenes inline del editor TipTap (img tags no
// pueden enviar Authorization). PDFs y archivos sensibles siguen pasando por
// /api/documents/:id/file con auth.
const UPLOADS_DIR = path.join(__dirname, "..", "uploads");
app.use("/api/uploads", express.static(UPLOADS_DIR, {
  maxAge: "1d",
  fallthrough: false,
  setHeaders: (res) => { res.setHeader("Cache-Control", "private, max-age=86400"); },
}));

app.use("/api/auth", authRoutes);
app.use("/api/workspace", workspaceRoutes);
app.use("/api/patients", patientsRoutes);
app.use("/api/appointments", appointmentsRoutes);
app.use("/api/tests", testsRoutes);
app.use("/api/tasks", tasksRoutes);
app.use("/api/tareas", tareasRoutes);
app.use("/api/documents", documentsRoutes);
app.use("/api/invoices", invoicesRoutes);
app.use("/api/notifications", notificationsRoutes);
app.use("/api/settings", settingsRoutes);
// portalRoutes va ANTES que notesRoutes porque expone endpoints públicos
// (/api/patient-invite/*, /api/auth/patient/login). notesRoutes aplica
// requireAuth global, así que si va primero intercepta cualquier /api/*.
app.use("/api", portalRoutes); // /patients/:id/invite, /patient-invite/*, /auth/patient/login, /portal/*
app.use("/api", notesRoutes);  // /patients/:id/notes y /notes/:id (require auth)

app.use((err, _req, res, _next) => {
  console.error("[api error]", err);
  res.status(err.status ?? 500).json({ error: err.message ?? "Internal server error" });
});

// Socket.IO: autenticar con token y unir al "room" del workspace
io.use((socket, next) => {
  const token = socket.handshake.auth?.token ?? socket.handshake.query?.token;
  const payload = token ? verifyToken(token) : null;
  if (!payload) return next(new Error("Unauthorized"));
  socket.data.user = payload;
  next();
});
io.on("connection", (socket) => {
  const wsRoom = `ws-${socket.data.user.workspace_id}`;
  socket.join(wsRoom);
  console.log("[socket] connected", socket.id, "→", wsRoom);
  socket.on("disconnect", () => console.log("[socket] disconnected", socket.id));
});

http.listen(PORT, () => {
  console.log(`[psicomorfosis-server] http://localhost:${PORT}`);
});
