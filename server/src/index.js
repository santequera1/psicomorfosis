import express from "express";
import cors from "cors";
import helmet from "helmet";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "node:http";
import { Server as SocketIOServer } from "socket.io";
import { config as dotenvConfig } from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Cargar .env desde la RAÍZ DEL REPO (no desde cwd, porque el cwd del
// proceso PM2 puede variar — actualmente está en /server, pero el .env
// vive un nivel arriba). __dirname está en server/src, así que ../../
// apunta a la raíz del repo donde está .env.
dotenvConfig({ path: path.resolve(__dirname, "../../.env") });

import { initDb } from "./db.js";
import { verifyToken } from "./auth.js";
import { logSmtpStatus } from "./mailer.js";
import { logIcdStatus } from "./icd-client.js";

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
import platformRoutes from "./routes/platform.js";
import errorReportsRoutes from "./routes/errorReports.js";
import legalRoutes from "./routes/legal.js";
import bankAccountsRoutes from "./routes/bankAccounts.js";
import diagnosesRoutes from "./routes/diagnoses.js";

const PORT = Number(process.env.PORT ?? 3002);

initDb();
logSmtpStatus();
logIcdStatus();

const app = express();
const http = createServer(app);
const io = new SocketIOServer(http, { cors: { origin: "*" } });
app.set("io", io);

// Security headers — HSTS, X-Frame-Options (clickjacking), X-Content-Type-Options
// (no sniff), Referrer-Policy, etc. Helmet aplica defaults sanos para una API.
// crossOriginEmbedderPolicy=false porque el portal embebe imágenes/PDFs desde
// /api/uploads y /api/documents/:id/file, y un COEP=require-corp rompería eso.
// contentSecurityPolicy=false porque la app principal vive en el frontend SSR
// (TanStack Start), no en este server. Lo ideal es definir CSP en el frontend.
app.use(helmet({
  crossOriginEmbedderPolicy: false,
  contentSecurityPolicy: false,
}));
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: "4mb" }));
// Confiar en X-Forwarded-* de nginx para que express-rate-limit cuente IPs
// reales (no 127.0.0.1 de todos los requests proxied). nginx en VPS marca
// el header con la IP del cliente final.
app.set("trust proxy", 1);

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
app.use("/api/platform", platformRoutes);
// Documentos legales: rutas públicas (/public/*), del usuario (/me/*) y
// del asesor legal (/admin/*). Cada banda aplica su propio middleware
// de auth interno; aquí solo lo montamos en el prefijo.
app.use("/api/legal", legalRoutes);
app.use("/api/workspace", workspaceRoutes);
app.use("/api/patients", patientsRoutes);
app.use("/api/appointments", appointmentsRoutes);
app.use("/api/tests", testsRoutes);
app.use("/api/tasks", tasksRoutes);
app.use("/api/tareas", tareasRoutes);
app.use("/api/documents", documentsRoutes);
app.use("/api/invoices", invoicesRoutes);
app.use("/api/bank-accounts", bankAccountsRoutes);
app.use("/api/notifications", notificationsRoutes);
app.use("/api/settings", settingsRoutes);
// portalRoutes va ANTES que notesRoutes porque expone endpoints públicos
// (/api/patient-invite/*, /api/auth/patient/login). notesRoutes aplica
// requireAuth global, así que si va primero intercepta cualquier /api/*.
app.use("/api", portalRoutes); // /patients/:id/invite, /patient-invite/*, /auth/patient/login, /portal/*
// Reportes de errores: público (no exige token) — un usuario en pantalla
// "Something went wrong" puede no tener sesión válida y aún así queremos
// recibirlo. Mismo razonamiento que portalRoutes: ir antes que notesRoutes.
app.use("/api", errorReportsRoutes); // /error-reports
// Diagnósticos clínicos: /diagnoses/catalog, /patients/:id/diagnoses,
// /diagnoses/:id. requireAuth global. Va antes de notesRoutes para
// que sus rutas con /patients/:id/diagnoses no choquen con notes.
app.use("/api", diagnosesRoutes);
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
