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
import { isQuery, runQuery, summarizeQuery, labelOf } from "../lib/laura-tools.js";
import { extractFilesText, FILE_TYPES, MAX_FILES, MAX_FILE_BYTES } from "../lib/laura-files.js";
import { notifyPatientMessage } from "../lib/psicobot.js";
import { requireAuth } from "../auth.js";
import {
  buildSystemPrompt, streamMessage, healthCheck, darioStatus, claudeUsage,
  buildBriefingPrompt, gatherBriefingContext,
  buildProgressPrompt, gatherProgressContext,
  buildRewritePrompt, LAURA_MODEL,
} from "../lib/laura.js";

const router = Router();

// IMPORTANTE: NO usar `router.use(requireAuth)` global.
//
// Este router se monta en `app.use("/api", lauraRoutes)` en index.js,
// que va ANTES de portalRoutes y errorReportsRoutes (que tienen
// endpoints públicos como /api/patient-invite/:token o /api/auth/patient/login).
//
// Cuando un router con `router.use(middleware)` se monta sin prefijo
// específico, Express ejecuta el middleware en TODA request a /api/*
// — aunque el path no matchee ninguna ruta del router. requireAuth no
// llama next() en 401, así que cualquier path bajo /api/ sin token
// devolvía "Missing token" antes de llegar a portalRoutes. Esto rompía
// el flujo de activación de pacientes (caso real reportado 2026-06-25).
//
// Solución: aplicar requireAuth EN CADA endpoint individual.

// ── Health ────────────────────────────────────────────────────────────

router.get("/laura/health", requireAuth, async (_req, res) => {
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
router.get("/laura/quota", requireAuth, async (_req, res) => {
  const q = await claudeUsage();
  res.json(q);
});

// ── Usage diario ──────────────────────────────────────────────────────
//
// Devuelve cuántos mensajes y tokens consumió el usuario hoy. Útil para
// el banner de cuota del chat: "Estás en beta — usado X mensajes hoy".

router.get("/laura/usage", requireAuth, (req, res) => {
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

router.get("/laura/conversations", requireAuth, (req, res) => {
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

router.post("/laura/conversations", requireAuth, (req, res) => {
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

router.get("/laura/conversations/:id", requireAuth, (req, res) => {
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
  const decisions = Object.fromEntries(
    db.prepare("SELECT tool_id, decision FROM laura_action_decisions WHERE conversation_id = ?").all(id).map((r) => [r.tool_id, r.decision]),
  );
  res.json({ conversation: c, messages, decisions });
});

router.delete("/laura/conversations/:id", requireAuth, (req, res) => {
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

/** Contenido multimodal (imágenes + texto) con el formato de la API. */
function multimodal(text, images) {
  return [
    ...images.map((img) => ({ type: "image", source: { type: "base64", media_type: img.media_type, data: img.data } })),
    ...(text ? [{ type: "text", text }] : []),
  ];
}

router.post("/laura/chat", requireAuth, async (req, res) => {
  const { conversation_id, patient_id, current_path, message, images } = req.body ?? {};
  const imgCount = Array.isArray(images) ? images.length : 0;
  console.log(`[laura/chat] user=${req.user?.id} ws=${req.user?.workspace_id} conv=${conversation_id ?? "new"} patient=${patient_id ?? "—"} msg.len=${(message ?? "").length} images=${imgCount}`);
  if (typeof message !== "string") {
    return res.status(400).json({ error: "Falta el mensaje" });
  }
  // Permitimos message vacío si vienen imágenes (caso "pegué una imagen
  // sin escribir nada"). Cuando no hay imágenes, el mensaje sí es
  // obligatorio.
  // Archivos (PDF/Word) — se validan AQUÍ, antes de abrir el stream SSE:
  // un res.status().json() después de flushHeaders() tira
  // ERR_HTTP_HEADERS_SENT y, en un handler async, tumbaba el proceso.
  const files = Array.isArray(req.body?.files) ? req.body.files : [];
  if (files.length > MAX_FILES) return res.status(400).json({ error: `Máximo ${MAX_FILES} archivos por mensaje` });
  for (const f of files) {
    const type = f?.media_type ?? "";
    const ext = String(f?.name ?? "").toLowerCase().split(".").pop();
    if (!f || (!FILE_TYPES.has(type) && !["pdf", "docx"].includes(ext))) {
      return res.status(400).json({ error: "Solo se aceptan PDF y Word (.docx)" });
    }
    if (typeof f.data !== "string" || f.data.length === 0) return res.status(400).json({ error: "Archivo sin datos" });
    if (Math.floor(f.data.length * 0.75) > MAX_FILE_BYTES) return res.status(400).json({ error: `${f.name ?? "El archivo"} supera 8 MB` });
    // Tipo por extensión si el navegador no lo puso (pasa con .docx en Windows).
    if (!FILE_TYPES.has(type)) f.media_type = ext === "pdf" ? "application/pdf" : "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  }
  if (message.trim().length === 0 && imgCount === 0 && files.length === 0) {
    return res.status(400).json({ error: "Escribe un mensaje o adjunta una imagen o un archivo" });
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
    const title = (message.trim().split(/\s+/).slice(0, 8).join(" ").slice(0, 80)) || (files[0]?.name ? `Archivo: ${String(files[0].name).slice(0, 60)}` : "Conversación");
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
  // Archivos (PDF/Word): se convierten a texto y viajan dentro del
  // mensaje del usuario. Solo el marcador queda persistido. (Ya están
  // validados arriba, antes del SSE.)
  const { text: filesText, notes: fileNotes } = await extractFilesText(files);
  const messageForModel = filesText ? `${message}${message ? "\n\n" : ""}${filesText}` : message;
  const fileMarker = files.length > 0 ? ` [${files.map((f) => `archivo: ${String(f.name ?? "adjunto").slice(0, 80)}`).join(", ")}]` : "";
  const persistedContent = imgCount > 0
    ? `${message}${message ? "\n\n" : ""}[${imgCount} imagen${imgCount === 1 ? "" : "es"} adjunta${imgCount === 1 ? "" : "s"}]${fileMarker}`
    : message + fileMarker;
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
  for (const n of fileNotes) emit({ type: "query", name: "files", status: "error", label: "Archivo adjunto", summary: n });
  try {
    // Bucle de consultas en vivo: el modelo emite [[LAURA_ACTION:query_x:{…}]]
    // y se detiene; ejecutamos la consulta (solo lectura, acotada al
    // workspace), se la devolvemos como un turno del usuario y sigue.
    // Máximo 3 vueltas por respuesta.
    const MAX_HOPS = 3;
    let hops = 0;
    let turnHistory = history;
    let turnMessage = messageForModel;
    let turnImages = Array.isArray(images) ? images : []; // sin imágenes llega undefined
    const queryCtx = { workspaceId: req.user.workspace_id, userId: req.user.id, professionalId: req.user.professional_id ?? null };
    let deltaCount = 0;
    while (true) {
      let pendingQuery = null;
      let hopText = "";
      // Tras la 3.ª consulta ya no se ejecutan más en esta respuesta: los
      // markers que lleguen se ignoran SIN emitir "running" (antes quedaba
      // un spinner eterno) y el modelo ya fue avisado en el último resultado.
      const canQuery = hops < MAX_HOPS;
      for await (const ev of streamMessage({ systemPrompt, history: turnHistory, userMessage: turnMessage, userImages: turnImages })) {
        if (aborted) {
          console.log(`[laura/chat] aborted mid-stream conv=${convId} deltas=${deltaCount}`);
          break;
        }
        if (ev.type === "delta") {
          deltaCount++;
          hopText += ev.text;
          accumulated += ev.text;
          emit({ type: "delta", text: ev.text });
        } else if (ev.type === "tool_call") {
          if (isQuery(ev.name)) {
            if (pendingQuery || !canQuery) continue; // una consulta por vuelta; ninguna tras el tope
            pendingQuery = ev;
            emit({ type: "query", name: ev.name, status: "running", label: labelOf(ev.name) });
            console.log(`[laura/chat] query conv=${convId} ${ev.name} ${JSON.stringify(ev.input).slice(0, 120)}`);
          } else {
            console.log(`[laura/chat] tool_call conv=${convId} name=${ev.name}`);
            proposedActions.push({ tool_id: ev.tool_id, name: ev.name, input: ev.input });
            emit({ type: "tool_call", tool_id: ev.tool_id, name: ev.name, input: ev.input });
          }
        } else if (ev.type === "done") {
          usage = usage
            ? { ...usage, input_tokens: (usage.input_tokens ?? 0) + (ev.usage?.input_tokens ?? 0), output_tokens: (usage.output_tokens ?? 0) + (ev.usage?.output_tokens ?? 0), stop_reason: ev.usage?.stop_reason ?? usage.stop_reason }
            : ev.usage;
        }
      }
      if (aborted || !pendingQuery) break;
      hops += 1;
      const result = runQuery(pendingQuery.name, pendingQuery.input, queryCtx);
      emit({ type: "query", name: pendingQuery.name, status: result.ok ? "done" : "error", label: labelOf(pendingQuery.name), summary: summarizeQuery(pendingQuery.name, pendingQuery.input, result) });
      // El texto que Laura ya escribió en esta vuelta se conserva como su
      // turno; el resultado entra como turno del usuario.
      // El turno del assistant lleva su texto (si lo hubo) MÁS el marker,
      // así el historial refleja qué consultó; un texto solo de espacios
      // era un turno vacío que la API rechaza.
      const marker = `[[LAURA_ACTION:${pendingQuery.name}:${JSON.stringify(pendingQuery.input ?? {})}]]`;
      turnHistory = [
        ...turnHistory,
        // Las imágenes del mensaje original se conservan en su turno para
        // que el modelo las siga "viendo" al continuar.
        { role: "user", content: turnImages.length > 0 ? multimodal(turnMessage, turnImages) : turnMessage },
        { role: "assistant", content: (hopText.trim() ? hopText.trimEnd() + "\n" : "") + marker },
      ];
      const lastAllowed = hops >= MAX_HOPS;
      turnMessage = result.ok
        ? `[RESULTADO de ${pendingQuery.name}]\n${result.json}${result.truncated ? "\n(resultado truncado)" : ""}\n\nContinúa tu respuesta con estos datos. No repitas la consulta ni pegues el JSON.${lastAllowed ? " Esta fue tu última consulta posible en esta respuesta: responde con lo que tienes y, si faltó algo, dilo." : ""}`
        : `[RESULTADO de ${pendingQuery.name}: ERROR] ${result.error}\n\nExplícale al profesional qué pasó o prueba otra consulta.${lastAllowed ? " Ya no puedes consultar más en esta respuesta." : ""}`;
      turnImages = [];
      // Separador visual suave entre lo escrito antes y después de la consulta.
      if (hopText && !/\s$/.test(hopText)) { accumulated += "\n"; emit({ type: "delta", text: "\n" }); }
    }
    console.log(`[laura/chat] done conv=${convId} deltas=${deltaCount} hops=${hops} tools=${proposedActions.length} in=${usage?.input_tokens} out=${usage?.output_tokens} stop=${usage?.stop_reason}`);
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

// ── Preparador de sesión (briefing) ──────────────────────────────────
//
// Genera un briefing por cita: dada una appointment_id, recopila las
// últimas notas + tareas pendientes + próxima cita del paciente, y
// stream una síntesis estructurada para que el psicólogo abra la
// sesión con contexto cargado. NO persiste en BD (es one-shot).
//
// Body: { appointment_id: number }
// Stream SSE: { type: "delta" | "done" | "error", ... }

/** Decisión sobre una tarjeta (aprobada/descartada), persistida. */
router.post("/laura/conversations/:id/decisions", requireAuth, (req, res) => {
  const id = Number(req.params.id);
  const toolId = String(req.body?.tool_id ?? "").slice(0, 120);
  const decision = req.body?.decision === "approved" ? "approved" : req.body?.decision === "dismissed" ? "dismissed" : null;
  if (!Number.isFinite(id) || !toolId || !decision) return res.status(400).json({ error: "tool_id y decision requeridos" });
  const own = db.prepare("SELECT 1 FROM laura_conversations WHERE id = ? AND user_id = ? AND workspace_id = ?").get(id, req.user.id, req.user.workspace_id);
  if (!own) return res.status(404).json({ error: "Conversación no encontrada" });
  db.prepare(`INSERT INTO laura_action_decisions (conversation_id, tool_id, decision) VALUES (?, ?, ?)
              ON CONFLICT(conversation_id, tool_id) DO UPDATE SET decision = excluded.decision, decided_at = CURRENT_TIMESTAMP`).run(id, toolId, decision);
  res.json({ ok: true });
});

// ─── Memoria de Laura ─────────────────────────────────────────────────
const MEMORY_MAX = 2000;
router.get("/laura/memory", requireAuth, (req, res) => {
  const row = db.prepare("SELECT notes, updated_at FROM laura_memory WHERE user_id = ?").get(req.user.id);
  res.json({ notes: row?.notes ?? "", updatedAt: row?.updated_at ?? null, max: MEMORY_MAX });
});
router.put("/laura/memory", requireAuth, (req, res) => {
  const notes = String(req.body?.notes ?? "").slice(0, MEMORY_MAX);
  db.prepare(`INSERT INTO laura_memory (user_id, notes, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)
              ON CONFLICT(user_id) DO UPDATE SET notes = excluded.notes, updated_at = CURRENT_TIMESTAMP`).run(req.user.id, notes);
  res.json({ ok: true, notes });
});
router.post("/laura/memory/append", requireAuth, (req, res) => {
  const note = String(req.body?.note ?? "").trim().replace(/\s+/g, " ").slice(0, 300);
  if (!note) return res.status(400).json({ error: "Nota vacía" });
  const row = db.prepare("SELECT notes FROM laura_memory WHERE user_id = ?").get(req.user.id);
  const current = (row?.notes ?? "").trim();
  if (current.includes(note)) return res.json({ ok: true, notes: current, duplicate: true });
  let notes = current ? `${current}\n- ${note}` : `- ${note}`;
  if (notes.length > MEMORY_MAX) {
    return res.status(409).json({ error: "La memoria está llena (2000 caracteres). Edítala desde el chat de Laura para hacer espacio." });
  }
  db.prepare(`INSERT INTO laura_memory (user_id, notes, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)
              ON CONFLICT(user_id) DO UPDATE SET notes = excluded.notes, updated_at = CURRENT_TIMESTAMP`).run(req.user.id, notes);
  res.json({ ok: true, notes });
});

// ─── WhatsApp al paciente (propuesto por Laura, aprobado por el profesional) ──
router.post("/laura/whatsapp", requireAuth, async (req, res) => {
  const patientId = String(req.body?.patient_id ?? "");
  const text = String(req.body?.text ?? "").trim();
  if (!patientId || !text) return res.status(400).json({ error: "patient_id y text requeridos" });
  if (text.length > 1500) return res.status(400).json({ error: "Máximo 1500 caracteres" });
  const patient = db.prepare("SELECT id, name, preferred_name, phone, whatsapp_opt_in, workspace_id FROM patients WHERE id = ? AND workspace_id = ?")
    .get(patientId, req.user.workspace_id);
  if (!patient) return res.status(404).json({ error: "Paciente no encontrado" });
  const prof = req.user.professional_id
    ? db.prepare("SELECT name FROM professionals WHERE id = ?").get(req.user.professional_id)
    : null;
  const sent = await notifyPatientMessage({ patient, text, professionalName: prof?.name ?? req.user.name });
  if (!sent.ok) {
    const msgs = {
      sin_telefono: "El paciente no tiene teléfono.",
      sin_opt_in: "El paciente no tiene WhatsApp activo (no dio su consentimiento).",
      bot_no_configurado: "El bot de WhatsApp no está configurado.",
      texto_vacio: "El mensaje está vacío.",
      bot_error: "El bot de WhatsApp no aceptó el mensaje. Inténtalo de nuevo en un momento.",
    };
    return res.status(sent.reason === "bot_error" ? 502 : 409).json({ error: msgs[sent.reason] ?? "No se pudo enviar." });
  }
  console.log(`[laura/whatsapp] user=${req.user.id} → paciente ${patient.id} (${text.length} chars)`);
  res.json({ ok: true });
});

router.post("/laura/briefing", requireAuth, async (req, res) => {
  const apptId = Number(req.body?.appointment_id);
  if (!Number.isFinite(apptId) || apptId <= 0) {
    return res.status(400).json({ error: "appointment_id requerido" });
  }

  // Cargar la cita y validar ownership por workspace
  const appointment = db.prepare(`
    SELECT id, patient_id, date, time, duration_min, modality, notes, status
    FROM appointments
    WHERE id = ? AND workspace_id = ?
  `).get(apptId, req.user.workspace_id);
  if (!appointment) {
    return res.status(404).json({ error: "Cita no encontrada" });
  }
  if (!appointment.patient_id) {
    return res.status(400).json({ error: "La cita no tiene paciente asociado" });
  }

  console.log(`[laura/briefing] user=${req.user.id} ws=${req.user.workspace_id} appt=${apptId} patient=${appointment.patient_id}`);

  // Recopilar contexto + construir prompt
  let systemPrompt;
  try {
    const ctx = gatherBriefingContext({
      workspaceId: req.user.workspace_id,
      patientId: appointment.patient_id,
      appointment,
    });
    if (!ctx.patient) {
      return res.status(404).json({ error: "Paciente no encontrado" });
    }
    systemPrompt = buildBriefingPrompt({ ...ctx, appointment });
  } catch (err) {
    console.error("[laura/briefing] gather/build error:", err);
    return res.status(500).json({ error: "No pude preparar el contexto del briefing" });
  }

  // SSE setup
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders?.();

  const emit = (obj) => {
    try { res.write(`data: ${JSON.stringify(obj)}\n\n`); } catch { /* socket cerrado */ }
  };

  let aborted = false;
  res.on("close", () => {
    if (!res.writableEnded) {
      console.log(`[laura/briefing] client disconnected appt=${apptId}`);
      aborted = true;
    }
  });

  // Mensaje "user" mínimo — el contenido real va en el system prompt.
  // Anthropic requiere al menos 1 mensaje user para iniciar el stream.
  const userTrigger = "Genera el briefing siguiendo la estructura indicada.";

  console.log(`[laura/briefing] starting stream appt=${apptId} systemPromptLen=${systemPrompt.length}`);
  try {
    let deltaCount = 0;
    let usage = null;
    for await (const ev of streamMessage({
      systemPrompt,
      history: [],
      userMessage: userTrigger,
      maxTokens: 700, // briefing es corto por diseño
    })) {
      if (aborted) break;
      if (ev.type === "delta") {
        deltaCount++;
        emit({ type: "delta", text: ev.text });
      } else if (ev.type === "done") {
        usage = ev.usage;
        console.log(`[laura/briefing] done appt=${apptId} deltas=${deltaCount} in=${usage?.input_tokens} out=${usage?.output_tokens}`);
      }
      // Ignoramos tool_call: el system prompt prohíbe markers.
    }
    emit({ type: "done", usage });
  } catch (err) {
    console.error(`[laura/briefing] STREAM ERROR appt=${apptId}:`, err);
    const msg = err?.message ?? String(err);
    if (/quota|rate_limit|usage_limit|out of credits/i.test(msg)) {
      emit({ type: "error", code: "quota_exhausted", message: "Laura está temporalmente sin cupo. Reintenta en unas horas." });
    } else if (/ECONNREFUSED|fetch failed/i.test(msg)) {
      emit({ type: "error", code: "dario_down", message: "Laura no está disponible ahora mismo." });
    } else {
      emit({ type: "error", code: "generation_failed", message: "No pude generar el briefing. Reintenta." });
    }
  }
  res.end();
});

// ── Análisis de progreso (Fase 3.2) ───────────────────────────────────
//
// Stream SSE one-shot que devuelve un análisis descriptivo de la
// evolución del paciente en los últimos N meses (default 6).
// Body: { patient_id: string, months?: number }

router.post("/laura/progress", requireAuth, async (req, res) => {
  const patientId = String(req.body?.patient_id ?? "").trim();
  const months = Number.isFinite(Number(req.body?.months)) ? Number(req.body.months) : 6;
  if (!patientId) {
    return res.status(400).json({ error: "patient_id requerido" });
  }
  // Validar ownership
  const owns = db.prepare("SELECT 1 FROM patients WHERE id = ? AND workspace_id = ?")
    .get(patientId, req.user.workspace_id);
  if (!owns) {
    return res.status(404).json({ error: "Paciente no encontrado" });
  }

  let systemPrompt;
  try {
    const ctx = gatherProgressContext({
      workspaceId: req.user.workspace_id,
      patientId,
      months: Math.max(1, Math.min(24, months)),
    });
    if (!ctx) return res.status(404).json({ error: "Paciente no encontrado" });
    systemPrompt = buildProgressPrompt(ctx);
  } catch (err) {
    console.error("[laura/progress] gather error:", err);
    return res.status(500).json({ error: "No pude preparar el análisis" });
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders?.();

  const emit = (obj) => { try { res.write(`data: ${JSON.stringify(obj)}\n\n`); } catch { /* socket closed */ } };

  let aborted = false;
  res.on("close", () => { if (!res.writableEnded) aborted = true; });

  console.log(`[laura/progress] starting stream patient=${patientId} months=${months} systemPromptLen=${systemPrompt.length}`);
  try {
    let deltaCount = 0;
    let usage = null;
    for await (const ev of streamMessage({
      systemPrompt,
      history: [],
      userMessage: "Genera el análisis de progreso siguiendo la estructura indicada.",
      maxTokens: 900,
    })) {
      if (aborted) break;
      if (ev.type === "delta") { deltaCount++; emit({ type: "delta", text: ev.text }); }
      else if (ev.type === "done") { usage = ev.usage; }
    }
    console.log(`[laura/progress] done patient=${patientId} deltas=${deltaCount} in=${usage?.input_tokens} out=${usage?.output_tokens}`);
    emit({ type: "done", usage });
  } catch (err) {
    console.error("[laura/progress] STREAM ERROR:", err);
    const msg = err?.message ?? String(err);
    if (/quota|rate_limit|usage_limit|out of credits/i.test(msg)) {
      emit({ type: "error", code: "quota_exhausted", message: "Laura está temporalmente sin cupo. Reintenta en unas horas." });
    } else {
      emit({ type: "error", code: "generation_failed", message: "No pude generar el análisis. Reintenta." });
    }
  }
  res.end();
});

// ── Reescritura clínica (Fase 1.2 — "Mejorar con Laura") ─────────────
//
// Endpoint NO streaming porque el output es corto y la UX más natural
// es "esperar y mostrar el resultado completo" para que el usuario
// pueda comparar con el original y decidir reemplazar.
//
// Body: { text: string, mode: "clinical"|"concise"|"soap"|"humanize"|"expand" }
// Response: { rewritten: string }
const REWRITE_MODES = new Set(["clinical", "concise", "soap", "humanize", "expand"]);

router.post("/laura/rewrite", requireAuth, async (req, res) => {
  const { text, mode } = req.body ?? {};
  if (typeof text !== "string" || text.trim().length === 0) {
    return res.status(400).json({ error: "Falta el texto a reescribir" });
  }
  if (text.length > 8000) {
    return res.status(400).json({ error: "Texto demasiado largo (máx 8000 caracteres)" });
  }
  const safeMode = REWRITE_MODES.has(mode) ? mode : "clinical";

  console.log(`[laura/rewrite] user=${req.user.id} ws=${req.user.workspace_id} mode=${safeMode} len=${text.length}`);

  try {
    const systemPrompt = buildRewritePrompt(safeMode);
    let rewritten = "";
    for await (const ev of streamMessage({
      systemPrompt,
      history: [],
      userMessage: text,
      maxTokens: 1500,
    })) {
      if (ev.type === "delta") rewritten += ev.text;
      // Ignoramos tool_call (no aplica en rewrite) y done.
    }
    res.json({ rewritten: rewritten.trim(), mode: safeMode });
  } catch (err) {
    console.error("[laura/rewrite] STREAM ERROR:", err);
    const msg = err?.message ?? String(err);
    if (/quota|rate_limit|usage_limit|out of credits/i.test(msg)) {
      return res.status(503).json({ error: "Laura está temporalmente sin cupo. Reintenta en unas horas.", code: "quota_exhausted" });
    }
    if (/ECONNREFUSED|fetch failed/i.test(msg)) {
      return res.status(503).json({ error: "Laura no está disponible ahora mismo.", code: "dario_down" });
    }
    return res.status(500).json({ error: "No pude reescribir el texto. Reintenta.", code: "generation_failed" });
  }
});

export default router;
