/**
 * Rutas del módulo Laura (asistente IA).
 *
 *   STAFF (requireAuth):
 *     GET   /api/laura/health        — estado de DARIO + modelo
 *     GET   /api/laura/usage         — mensajes/tokens del día por usuario
 *     GET   /api/laura/conversations — listar conversaciones del user
 *     POST  /api/laura/conversations — crear conversación (opcional patient_id)
 *     GET   /api/laura/conversations/:id — detalle + historial de mensajes
 *     DELETE /api/laura/conversations/:id — soft delete (archived_at)
 *     POST  /api/laura/chat          — endpoint SSE de chat streaming
 *
 * Todas las queries filtran por user_id Y workspace_id para garantizar
 * aislamiento (un usuario nunca ve conversaciones de otro, ni siquiera
 * dentro del mismo workspace).
 */

import { Router } from "express";
import { db } from "../db.js";
import { requireAuth } from "../auth.js";
import { buildSystemPrompt, streamMessage, healthCheck, darioStatus, claudeUsage, LAURA_MODEL } from "../lib/laura.js";

const router = Router();
router.use(requireAuth);

// ── Health ────────────────────────────────────────────────────────────

router.get("/laura/health", async (_req, res) => {
  const [h, ds] = await Promise.all([healthCheck(), darioStatus()]);
  res.json({
    ...h,
    model: LAURA_MODEL,
    subscription: {
      status: ds.status ?? null,
      expires_in: ds.expires_in ?? null,
      ok: ds.ok,
      error: ds.error ?? null,
    },
  });
});

// Cuota real de Claude (sesión + semanal %) — endpoint separado del
// health porque el comando subyacente (claude -p /usage) tarda ~3-5s
// la primera vez. Cache 5min interna; siguientes calls instantáneos.
router.get("/laura/quota", async (_req, res) => {
  const q = await claudeUsage();
  res.json(q);
});

// ── Usage diario ──────────────────────────────────────────────────────
//
// Devuelve cuántos mensajes y tokens consumió el usuario hoy. Útil para
// el banner de cuota del chat: "Estás en beta — usado X mensajes hoy".

router.get("/laura/usage", (req, res) => {
  const today = new Date().toISOString().slice(0, 10);
  const stats = db.prepare(`
    SELECT
      COUNT(*) AS messages_today,
      COALESCE(SUM(m.tokens_in), 0)  AS tokens_in_today,
      COALESCE(SUM(m.tokens_out), 0) AS tokens_out_today
    FROM laura_messages m
    JOIN laura_conversations c ON c.id = m.conversation_id
    WHERE c.user_id = ?
      AND m.role = 'assistant'
      AND substr(m.created_at, 1, 10) = ?
  `).get(req.user.id, today);
  res.json({
    date: today,
    messages_today: stats.messages_today,
    tokens_in_today: stats.tokens_in_today,
    tokens_out_today: stats.tokens_out_today,
  });
});

// ── Conversations CRUD ────────────────────────────────────────────────

router.get("/laura/conversations", (req, res) => {
  const limit = Math.min(Number(req.query.limit ?? 30), 100);
  const rows = db.prepare(`
    SELECT c.id, c.title, c.patient_id, c.created_at, c.updated_at,
           p.name AS patient_name, p.preferred_name AS patient_preferred,
           (SELECT COUNT(*) FROM laura_messages WHERE conversation_id = c.id) AS message_count
    FROM laura_conversations c
    LEFT JOIN patients p ON p.id = c.patient_id
    WHERE c.user_id = ? AND c.workspace_id = ? AND c.archived_at IS NULL
    ORDER BY c.updated_at DESC
    LIMIT ?
  `).all(req.user.id, req.user.workspace_id, limit);
  res.json({ items: rows });
});

router.post("/laura/conversations", (req, res) => {
  const { patient_id, title } = req.body ?? {};
  // Validar que el paciente (si vino) pertenece al workspace del user.
  if (patient_id) {
    const owned = db.prepare("SELECT 1 FROM patients WHERE id = ? AND workspace_id = ?")
      .get(patient_id, req.user.workspace_id);
    if (!owned) return res.status(403).json({ error: "Paciente no pertenece al workspace" });
  }
  const r = db.prepare(`
    INSERT INTO laura_conversations (workspace_id, user_id, patient_id, title)
    VALUES (?, ?, ?, ?)
  `).run(req.user.workspace_id, req.user.id, patient_id ?? null, title ?? null);
  res.status(201).json({ id: r.lastInsertRowid });
});

router.get("/laura/conversations/:id", (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: "id inválido" });
  const c = db.prepare(`
    SELECT c.id, c.title, c.patient_id, c.created_at, c.updated_at,
           p.name AS patient_name, p.preferred_name AS patient_preferred
    FROM laura_conversations c
    LEFT JOIN patients p ON p.id = c.patient_id
    WHERE c.id = ? AND c.user_id = ? AND c.workspace_id = ? AND c.archived_at IS NULL
  `).get(id, req.user.id, req.user.workspace_id);
  if (!c) return res.status(404).json({ error: "Conversación no encontrada" });
  const messages = db.prepare(`
    SELECT id, role, content, model, tokens_in, tokens_out, error, created_at, proposed_actions_json
    FROM laura_messages
    WHERE conversation_id = ?
    ORDER BY id ASC
  `).all(id).map((m) => {
    let proposed_actions = null;
    if (m.proposed_actions_json) {
      try { proposed_actions = JSON.parse(m.proposed_actions_json); }
      catch { /* tolerar JSON corrupto */ }
    }
    const { proposed_actions_json, ...rest } = m;
    void proposed_actions_json;
    return { ...rest, proposed_actions };
  });
  res.json({ conversation: c, messages });
});

router.delete("/laura/conversations/:id", (req, res) => {
  const id = Number(req.params.id);
  const r = db.prepare(`
    UPDATE laura_conversations SET archived_at = CURRENT_TIMESTAMP
    WHERE id = ? AND user_id = ? AND workspace_id = ?
  `).run(id, req.user.id, req.user.workspace_id);
  if (r.changes === 0) return res.status(404).json({ error: "no encontrado" });
  res.json({ ok: true });
});

// ── Chat streaming SSE ────────────────────────────────────────────────
//
// Patrón SSE clásico:
//   - El cliente abre el endpoint con fetch+ReadableStream o EventSource.
//   - El server emite eventos `data: {json}\n\n`.
//   - Eventos custom: { type: "conversation_id", id } al crear hilo nuevo,
//     { type: "delta", text } por cada token, { type: "done", usage } al
//     final, { type: "error", message } si algo falla.
//   - La conversación se persiste atómicamente al final del stream.
//
// Body esperado:
//   {
//     conversation_id?: number,   // si null, se crea una nueva
//     patient_id?: string,        // contexto activo (de la URL del cliente)
//     current_path?: string,      // URL actual del cliente para meta-contexto
//     message: string             // texto del usuario
//   }

router.post("/laura/chat", async (req, res) => {
  const { conversation_id, patient_id, current_path, message, images } = req.body ?? {};
  const imgCount = Array.isArray(images) ? images.length : 0;
  console.log(`[laura/chat] user=${req.user?.id} ws=${req.user?.workspace_id} conv=${conversation_id ?? "new"} patient=${patient_id ?? "—"} msg.len=${(message ?? "").length} images=${imgCount}`);
  if (typeof message !== "string") {
    return res.status(400).json({ error: "Falta el mensaje" });
  }
  // Permitimos message vacío si vienen imágenes (caso "pegué una imagen
  // sin escribir nada"). Cuando no hay imágenes, el mensaje sí es
  // obligatorio.
  if (message.trim().length === 0 && imgCount === 0) {
    return res.status(400).json({ error: "Escribe un mensaje o adjunta una imagen" });
  }
  if (message.length > 8000) {
    return res.status(400).json({ error: "Mensaje demasiado largo (máx 8000 caracteres)" });
  }
  if (imgCount > 5) {
    return res.status(400).json({ error: "Máximo 5 imágenes por mensaje" });
  }

  // Validar imágenes: base64 + media_type permitido. Tope individual
  // 4MB de raw bytes (Anthropic acepta hasta 5MB en base64, dejamos
  // margen). Total combinado: 12MB para no inflar requests al backend.
  const ALLOWED_IMG_TYPES = new Set([
    "image/jpeg", "image/png", "image/gif", "image/webp",
  ]);
  let totalImageBytes = 0;
  if (imgCount > 0) {
    for (const img of images) {
      if (!img || typeof img !== "object") {
        return res.status(400).json({ error: "Imagen con formato inválido" });
      }
      if (!ALLOWED_IMG_TYPES.has(img.media_type)) {
        return res.status(400).json({ error: `Tipo de imagen no soportado: ${img.media_type}. Usa JPEG, PNG, GIF o WebP.` });
      }
      if (typeof img.data !== "string" || img.data.length === 0) {
        return res.status(400).json({ error: "Imagen sin datos" });
      }
      // base64 a bytes aprox: len * 0.75
      const approxBytes = Math.floor(img.data.length * 0.75);
      if (approxBytes > 4 * 1024 * 1024) {
        return res.status(400).json({ error: "Cada imagen debe pesar máximo 4MB" });
      }
      totalImageBytes += approxBytes;
    }
    if (totalImageBytes > 12 * 1024 * 1024) {
      return res.status(400).json({ error: "El conjunto de imágenes excede 12MB" });
    }
  }

  // Configurar SSE
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no"); // hint para nginx: no buffer
  res.flushHeaders?.();

  const emit = (obj) => {
    try {
      res.write(`data: ${JSON.stringify(obj)}\n\n`);
    } catch { /* socket cerrado */ }
  };

  // Resolver conversación: existente o nueva. Validamos ownership.
  let convId = Number(conversation_id);
  if (Number.isFinite(convId) && convId > 0) {
    const owned = db.prepare(`
      SELECT id, patient_id FROM laura_conversations
      WHERE id = ? AND user_id = ? AND workspace_id = ? AND archived_at IS NULL
    `).get(convId, req.user.id, req.user.workspace_id);
    if (!owned) {
      emit({ type: "error", message: "Conversación no encontrada" });
      return res.end();
    }
    // Si patient_id no vino en el body, usamos el que tenía la conversación.
  } else {
    // Validar patient si vino al crear conversación
    if (patient_id) {
      const owned = db.prepare("SELECT 1 FROM patients WHERE id = ? AND workspace_id = ?")
        .get(patient_id, req.user.workspace_id);
      if (!owned) {
        emit({ type: "error", message: "Paciente no pertenece al workspace" });
        return res.end();
      }
    }
    // Título inicial: primeras palabras del mensaje (recortado a 80 chars).
    const title = message.trim().split(/\s+/).slice(0, 8).join(" ").slice(0, 80);
    const r = db.prepare(`
      INSERT INTO laura_conversations (workspace_id, user_id, patient_id, title)
      VALUES (?, ?, ?, ?)
    `).run(req.user.workspace_id, req.user.id, patient_id ?? null, title);
    convId = r.lastInsertRowid;
    emit({ type: "conversation_id", id: convId });
  }

  // Recuperar patient_id efectivo (puede venir del body o de la conversación)
  const conv = db.prepare(
    "SELECT patient_id FROM laura_conversations WHERE id = ?"
  ).get(convId);
  const effectivePatientId = patient_id || conv?.patient_id || null;

  // Historial de la conversación (anterior al mensaje actual)
  const history = db.prepare(`
    SELECT role, content FROM laura_messages
    WHERE conversation_id = ?
    ORDER BY id ASC
  `).all(convId);

  // Guardar el mensaje del usuario antes de invocar al modelo.
  // Si la generación falla, el mensaje del user igual quedó persistido —
  // así puede reintentarse desde el frontend sin perder lo escrito.
  //
  // Para imágenes: guardamos solo un marcador (no el base64) en el
  // content para que el historial no infle la BD. El modelo igual
  // recibe las imágenes vía userImages en este turno; en turnos
  // siguientes el contexto visual no se reenvía (decisión: costo
  // de tokens y privacidad — Laura "vio" la imagen pero no la
  // recuerda byte por byte en próximas vueltas).
  const persistedContent = imgCount > 0
    ? `${message}${message ? "\n\n" : ""}[${imgCount} imagen${imgCount === 1 ? "" : "es"} adjunta${imgCount === 1 ? "" : "s"}]`
    : message;
  db.prepare(`
    INSERT INTO laura_messages (conversation_id, role, content)
    VALUES (?, 'user', ?)
  `).run(convId, persistedContent);

  // Armar system prompt con todo el contexto disponible.
  const systemPrompt = buildSystemPrompt({
    workspaceId: req.user.workspace_id,
    userId: req.user.id,
    patientId: effectivePatientId,
    currentPath: current_path ?? null,
  });

  // Stream al modelo y al cliente al mismo tiempo.
  let accumulated = "";
  let usage = null;
  let errorMsg = null;

  // Manejo de cliente desconectado: usamos res.on('close') en lugar
  // de req.on('close'). Lo segundo dispara cuando termina el upload
  // del request body — para POST con SSE, el req ya está "cerrado"
  // al entrar al handler, y eso provocaba que aborted=true antes del
  // primer yield del stream, matando todo silenciosamente.
  let aborted = false;
  res.on("close", () => {
    if (!res.writableEnded) {
      console.log(`[laura/chat] client disconnected conv=${convId}`);
      aborted = true;
    }
  });

  console.log(`[laura/chat] starting stream conv=${convId} systemPromptLen=${systemPrompt.length} historyLen=${history.length} images=${imgCount}`);
  const proposedActions = [];
  try {
    let deltaCount = 0;
    for await (const ev of streamMessage({ systemPrompt, history, userMessage: message, userImages: images })) {
      if (aborted) {
        console.log(`[laura/chat] aborted mid-stream conv=${convId} deltas=${deltaCount}`);
        break;
      }
      if (ev.type === "delta") {
        deltaCount++;
        accumulated += ev.text;
        emit({ type: "delta", text: ev.text });
      } else if (ev.type === "tool_call") {
        console.log(`[laura/chat] tool_call conv=${convId} name=${ev.name}`);
        proposedActions.push({ tool_id: ev.tool_id, name: ev.name, input: ev.input });
        emit({ type: "tool_call", tool_id: ev.tool_id, name: ev.name, input: ev.input });
      } else if (ev.type === "done") {
        usage = ev.usage;
        console.log(`[laura/chat] done conv=${convId} deltas=${deltaCount} tools=${proposedActions.length} in=${usage?.input_tokens} out=${usage?.output_tokens} stop=${usage?.stop_reason}`);
      }
    }
  } catch (err) {
    console.error(`[laura/chat] STREAM ERROR conv=${convId}:`, err);
    errorMsg = err?.message ?? String(err);
    // Mapeo de errores comunes para UX
    if (/quota|rate_limit|usage_limit|out of credits/i.test(errorMsg)) {
      emit({ type: "error", code: "quota_exhausted", message: "Laura está temporalmente sin cupo de la suscripción. Reintenta en unas horas." });
    } else if (/ECONNREFUSED|fetch failed/i.test(errorMsg)) {
      emit({ type: "error", code: "dario_down", message: "Laura no está disponible ahora mismo (servicio interno caído)." });
    } else {
      emit({ type: "error", code: "generation_failed", message: "No pude generar respuesta. Reintenta o cambia la pregunta." });
    }
  }

  // Persistir respuesta del assistant (o error si no hubo contenido).
  const actionsJson = proposedActions.length > 0 ? JSON.stringify(proposedActions) : null;
  if (accumulated.length > 0 || usage || proposedActions.length > 0) {
    db.prepare(`
      INSERT INTO laura_messages
      (conversation_id, role, content, model, tokens_in, tokens_out, stop_reason, error, proposed_actions_json)
      VALUES (?, 'assistant', ?, ?, ?, ?, ?, ?, ?)
    `).run(
      convId,
      accumulated,
      LAURA_MODEL,
      usage?.input_tokens ?? null,
      usage?.output_tokens ?? null,
      usage?.stop_reason ?? null,
      errorMsg,
      actionsJson,
    );
  } else if (errorMsg) {
    db.prepare(`
      INSERT INTO laura_messages (conversation_id, role, content, model, error)
      VALUES (?, 'assistant', '', ?, ?)
    `).run(convId, LAURA_MODEL, errorMsg);
  }

  // Actualizar updated_at de la conversación
  db.prepare("UPDATE laura_conversations SET updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(convId);

  emit({ type: "done", usage, conversation_id: convId });
  res.end();
});

export default router;
