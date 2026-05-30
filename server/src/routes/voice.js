/**
 * POST /api/voice/transcribe — proxy a OpenAI Whisper / gpt-4o-transcribe.
 *
 * Diseño:
 *  - Multer con MEMORY storage: el audio nunca toca disco. Lo recibimos,
 *    lo reenviamos a OpenAI, devolvemos el texto y el buffer se libera.
 *    Requisito explícito del producto: NO retener audio del paciente.
 *  - Auth requerida (requireAuth aplicado al router). Solo staff
 *    (psicólogo o admin) puede dictar. Pacientes están en otro flujo.
 *  - Rate limit por IP+user: 30 transcripciones / 5 min. Genérico para
 *    cubrir abuso accidental (botón mantenido pulsado) sin estorbar
 *    un dictado normal de sesión clínica.
 *  - Tamaño max del archivo: 25MB (límite duro de Whisper). Por encima
 *    Multer responde 413 antes de llegar a OpenAI.
 *  - Modelo: gpt-4o-mini-transcribe — el más barato de los nuevos
 *    ($0.003/min input), suficiente para dictado clínico en español.
 *    Si se necesita más calidad: cambiar a "gpt-4o-transcribe" o
 *    "whisper-1" (legacy, $0.006/min).
 *  - Lectura LAZY de process.env.OPENAI_API_KEY: los imports ESM se
 *    hoistean, así que leerla al top-level captura undefined antes de
 *    dotenv.config(). Misma técnica que usamos en mailer.js.
 */

import { Router } from "express";
import multer from "multer";
import rateLimit from "express-rate-limit";
import { requireAuth } from "../auth.js";

const router = Router();
router.use(requireAuth);

const MODEL = "gpt-4o-transcribe";
const MAX_BYTES = 25 * 1024 * 1024; // 25MB — límite de OpenAI Whisper API

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_BYTES, files: 1 },
});

const transcribeLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  // keyGenerator: por user (no solo IP) — un consultorio multi-staff
  // detrás de una sola IP no debe pisarse entre sí.
  keyGenerator: (req) => `voice:${req.user?.id ?? req.ip}`,
  message: { success: false, error: "Demasiadas transcripciones. Espera unos minutos." },
});

function getOpenAIKey() {
  return process.env.OPENAI_API_KEY?.trim() || null;
}

router.post("/transcribe", transcribeLimiter, upload.single("audio"), async (req, res) => {
  const key = getOpenAIKey();
  if (!key) {
    return res.status(503).json({
      success: false,
      error: "Transcripción no configurada en el servidor.",
    });
  }
  if (!req.file) {
    return res.status(400).json({
      success: false,
      error: "Falta el campo 'audio' en el formulario.",
    });
  }

  try {
    // FormData nativa de Node 20+ — no requiere paquete extra.
    // Blob también es nativo. OpenAI exige un nombre de archivo con
    // extensión válida; si Multer no lo trae usamos un default
    // matching el mimetype.
    const filename = req.file.originalname || guessFilename(req.file.mimetype);
    const blob = new Blob([req.file.buffer], { type: req.file.mimetype || "audio/webm" });
    const form = new FormData();
    form.append("file", blob, filename);
    form.append("model", MODEL);
    // Lenguaje hint — mejora precisión y latencia para audio en español.
    // OpenAI igual auto-detecta si está vacío, pero forzar 'es' evita
    // que un dictado corto se interprete como portugués/italiano.
    form.append("language", "es");
    // response_format=text → devuelve string plano en lugar de JSON
    // verbose. Ahorra parsing y bytes en respuesta.
    form.append("response_format", "text");

    const started = Date.now();
    const upstream = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}` },
      body: form,
    });
    const elapsed = Date.now() - started;

    if (!upstream.ok) {
      const errText = await upstream.text().catch(() => "");
      console.warn(`[voice] OpenAI ${upstream.status} en ${elapsed}ms: ${errText.slice(0, 200)}`);
      return res.status(502).json({
        success: false,
        error: "El servicio de transcripción rechazó la petición. Intenta de nuevo.",
      });
    }

    const text = (await upstream.text()).trim();
    if (!text) {
      return res.json({ success: true, text: "" });
    }

    console.log(`[voice] OK ws=${req.user.workspace_id} user=${req.user.id} bytes=${req.file.size} ms=${elapsed} chars=${text.length}`);
    return res.json({ success: true, text });
  } catch (err) {
    console.error(`[voice] error: ${err?.message ?? err}`);
    return res.status(500).json({
      success: false,
      error: "Error procesando el audio. Intenta de nuevo.",
    });
  }
});

function guessFilename(mime) {
  if (!mime) return "audio.webm";
  if (mime.includes("mp4") || mime.includes("m4a")) return "audio.mp4";
  if (mime.includes("mpeg") || mime.includes("mp3")) return "audio.mp3";
  if (mime.includes("wav")) return "audio.wav";
  if (mime.includes("ogg")) return "audio.ogg";
  return "audio.webm";
}

export default router;
