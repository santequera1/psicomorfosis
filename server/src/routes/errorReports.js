/**
 * Endpoint público para reportes de problemas / errores capturados desde
 * el frontend. Se diseñó público intencionalmente: si el bug ocurre en
 * login o durante una pantalla de error genérico ("Something went
 * wrong"), el usuario puede no tener sesión válida y aun así queremos
 * recibir el reporte.
 *
 * Si el reporte llega con un token Authorization válido lo enriquecemos
 * con user_id, role y workspace; si no, queda anónimo.
 *
 * Acepta multipart/form-data con campos de texto + hasta 5 imágenes
 * adjuntas (capturas de pantalla típicamente). El campo legacy JSON
 * sigue funcionando para clientes que no manden imágenes.
 *
 * Rate limit por IP simple (memoria del proceso) para evitar abuso —
 * en producción seria se reemplaza por Redis o un middleware dedicado,
 * pero para una beta de 5-10 personas con un solo proceso PM2 sobra.
 */
import { Router } from "express";
import multer from "multer";
import path from "node:path";
import fs from "node:fs";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { db } from "../db.js";
import { verifyToken } from "../auth.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ATTACH_DIR = path.join(__dirname, "..", "..", "uploads", "error-reports");

// Solo imágenes — los reportes son típicamente capturas de pantalla.
// PDFs, videos, etc. quedan fuera del scope para no inflar la BD.
const IMG_EXTS = /\.(jpe?g|png|webp|gif)$/i;
const MAX_FILES = 5;
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB por imagen

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    fs.mkdirSync(ATTACH_DIR, { recursive: true });
    cb(null, ATTACH_DIR);
  },
  filename: (_req, file, cb) => {
    // Nombre con random bytes (12 bytes = 24 hex chars). El path es
    // unguessable — quien tenga el link lo abre, sin auth requerida
    // (igual que /api/uploads/* ya está expuesto público).
    const ext = path.extname(file.originalname).toLowerCase();
    const id = crypto.randomBytes(12).toString("hex");
    cb(null, `${Date.now()}-${id}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: MAX_FILE_SIZE, files: MAX_FILES },
  fileFilter: (_req, file, cb) => {
    if (!IMG_EXTS.test(file.originalname)) {
      return cb(new Error("Solo se permiten imágenes (JPG, PNG, WEBP, GIF)."));
    }
    cb(null, true);
  },
});

const router = Router();

const RATE_LIMIT_WINDOW_MS = 60_000;       // 1 minuto
const RATE_LIMIT_MAX_PER_IP = 20;           // 20 reportes/min/IP
const ipBuckets = new Map();                // ip -> { count, resetAt }

function rateLimitOk(ip) {
  const now = Date.now();
  const bucket = ipBuckets.get(ip);
  if (!bucket || bucket.resetAt < now) {
    ipBuckets.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }
  if (bucket.count >= RATE_LIMIT_MAX_PER_IP) return false;
  bucket.count++;
  return true;
}

function trunc(s, max) {
  return typeof s === "string" ? s.slice(0, max) : null;
}

function authUser(req) {
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ")) return null;
  try { return verifyToken(auth.slice(7)); } catch { return null; }
}

/**
 * POST /api/error-reports
 * Acepta dos content-types:
 *   - multipart/form-data con campos + imágenes adjuntas (hasta 5)
 *   - application/json (legacy, sin adjuntos)
 *
 * En ambos casos guarda el reporte y los archivos asociados.
 */
router.post("/error-reports", (req, res) => {
  const ip = req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.ip || "unknown";
  if (!rateLimitOk(ip)) {
    return res.status(429).json({ error: "Demasiados reportes. Intenta en un minuto." });
  }

  const contentType = req.headers["content-type"] ?? "";
  const isMultipart = contentType.includes("multipart/form-data");

  // Para multipart corremos multer primero, para JSON usamos req.body
  // tal cual (express.json ya lo parseó).
  const handler = isMultipart
    ? upload.array("attachments", MAX_FILES)
    : (_req, _res, next) => next();

  handler(req, res, (err) => {
    if (err) {
      // multer manda errores de tipo / límite con .code y .message.
      const msg = err.code === "LIMIT_FILE_SIZE"
        ? "Una de las imágenes es muy grande (máximo 5 MB cada una)."
        : err.code === "LIMIT_FILE_COUNT"
          ? `Máximo ${MAX_FILES} imágenes por reporte.`
          : err.message ?? "No se pudo procesar el adjunto.";
      return res.status(400).json({ error: msg });
    }

    const body = isMultipart ? req.body : (req.body ?? {});
    const {
      kind, url, message, stack, user_description, user_agent,
    } = body;

    // Validación: tiene que haber descripción o mensaje. Sin esto no
    // sirve guardar nada — para imágenes solas, el textarea del modal
    // ya exige mínimo 5 caracteres en el front.
    const hasMessage = typeof message === "string" && message.trim().length > 0;
    const hasDescription = typeof user_description === "string" && user_description.trim().length > 0;
    if (!hasMessage && !hasDescription) {
      // Si subió archivos pero no escribió, los borramos antes de salir
      // — no queremos huérfanos en disco.
      cleanupFiles(req.files);
      return res.status(400).json({ error: "Falta mensaje o descripción del problema." });
    }

    const user = authUser(req);
    const reportKind = kind === "auto" ? "auto" : "manual";

    try {
      const tx = db.transaction(() => {
        const ins = db.prepare(`
          INSERT INTO error_reports (
            workspace_id, user_id, user_role, user_name, kind,
            url, message, stack, user_description, user_agent
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          user?.workspace_id ?? null,
          user?.id ?? null,
          user?.role ?? null,
          user?.name ?? null,
          reportKind,
          trunc(url, 500),
          trunc(message, 2000),
          trunc(stack, 8000),
          trunc(user_description, 4000),
          trunc(user_agent, 500),
        );
        const reportId = ins.lastInsertRowid;

        // Guardamos los adjuntos asociados al reporte. La URL pública
        // es /api/uploads/error-reports/<filename> (servido como static
        // por express en index.js).
        const insertAttach = db.prepare(`
          INSERT INTO error_report_attachments (report_id, url, mime, size, original_name)
          VALUES (?, ?, ?, ?, ?)
        `);
        const files = req.files ?? [];
        const uploadedUrls = [];
        for (const f of files) {
          const publicUrl = `/api/uploads/error-reports/${f.filename}`;
          insertAttach.run(reportId, publicUrl, f.mimetype, f.size, f.originalname);
          uploadedUrls.push(publicUrl);
        }
        return { reportId, uploadedUrls };
      });
      const { reportId, uploadedUrls } = tx();
      res.status(201).json({ id: reportId, attachments: uploadedUrls });
    } catch (insErr) {
      console.error("[error-reports] insert failed:", insErr);
      cleanupFiles(req.files);
      res.status(202).json({ ok: false, message: "Reporte recibido pero no se pudo guardar; lo investigamos." });
    }
  });
});

function cleanupFiles(files) {
  if (!files?.length) return;
  for (const f of files) {
    try { fs.unlinkSync(f.path); } catch { /* ignore */ }
  }
}

export default router;
