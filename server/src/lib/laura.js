/**
 * Cliente y lógica de la asistente IA "Laura" (Mnemosine).
 *
 * Apunta al SDK de Anthropic configurado contra DARIO local
 * (http://localhost:3456) que reusa la suscripción de Claude Pro
 * sin cobrar per-token.
 *
 * Si DARIO no está disponible, las llamadas fallan y el endpoint
 * devuelve 503 al cliente — no hay fallback a API key porque eso
 * implicaría facturación inesperada.
 *
 * Reglas de alcance, identidad y safety viven en
 * laura/laura-condicionantes.md (cargado en boot, embebido en el
 * system prompt). Features y fases en laura/laura-features.md.
 */

import Anthropic from "@anthropic-ai/sdk";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { db } from "../db.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ─── Cliente lazy ──────────────────────────────────────────────────────
//
// El SDK lee API_BASE_URL/API_KEY al instanciarse. Lo hacemos lazy para
// que dotenv haya corrido antes (mismo patrón de mailer.js / auth.js).

let _client = null;
function getClient() {
  if (_client) return _client;
  _client = new Anthropic({
    baseURL: process.env.LAURA_BASE_URL || "http://localhost:3456",
    apiKey: process.env.LAURA_API_KEY || "dario",
  });
  return _client;
}

export const LAURA_MODEL = process.env.LAURA_MODEL || "claude-sonnet-4-5";

// ─── Condicionantes (cargadas una vez en boot) ─────────────────────────
//
// Leemos el .md textual y lo embebemos en el system prompt. Si el
// archivo se actualiza, hay que reiniciar el server para recargar.
// Es a propósito: queremos que el prompt sea estable y auditable, no
// dinámico desde el cliente.

const CONDICIONANTES_PATH = join(__dirname, "..", "..", "..", "laura", "laura-condicionantes.md");
let _condicionantes = null;
function loadCondicionantes() {
  if (_condicionantes) return _condicionantes;
  try {
    _condicionantes = readFileSync(CONDICIONANTES_PATH, "utf8");
  } catch (err) {
    console.warn("[laura] no se pudo leer laura-condicionantes.md:", err.message);
    _condicionantes = ""; // fallback: prompt mínimo, mejor algo que crash
  }
  return _condicionantes;
}

// ─── Carga de contexto del paciente ────────────────────────────────────
//
// Si la URL del cliente trae patient_id, cargamos un dossier compacto
// y se lo damos al modelo en el system prompt. Compacto = no todo el
// historial; solo lo más útil para razonamiento clínico inmediato.

function loadPatientContext(workspaceId, patientId) {
  if (!patientId) return null;
  const p = db.prepare(`
    SELECT id, name, preferred_name, doc, age, sex, modality, status, reason, pronouns,
           insurance_provider, insurance_plan, created_at, updated_at
    FROM patients
    WHERE id = ? AND workspace_id = ?
  `).get(patientId, workspaceId);
  if (!p) return null;

  // Últimas N citas (cualquier estado) — para que Laura sepa si hubo
  // sesiones recientes, cuándo es la próxima, etc.
  const appts = db.prepare(`
    SELECT id, date, time, modality, status, room
    FROM appointments
    WHERE patient_id = ? AND workspace_id = ?
    ORDER BY date DESC, time DESC
    LIMIT 8
  `).all(patientId, workspaceId);

  // Notas clínicas recientes (bloque libre o SOAP) — limitadas en
  // longitud para no inflar el prompt.
  const notes = db.prepare(`
    SELECT kind, content, signed_at, created_at
    FROM clinical_notes
    WHERE patient_id = ? AND archived_at IS NULL
    ORDER BY created_at DESC
    LIMIT 6
  `).all(patientId).map((n) => ({
    ...n,
    content: (n.content || "").slice(0, 1200),
  }));

  // Tareas activas
  const tasks = db.prepare(`
    SELECT id, title, description, status, due_date, completed_at
    FROM tareas
    WHERE patient_id = ? AND workspace_id = ?
      AND archived_at IS NULL AND deleted_at IS NULL
      AND visibility != 'private'
    ORDER BY created_at DESC
    LIMIT 8
  `).all(patientId, workspaceId);

  // Tests recientes
  const tests = db.prepare(`
    SELECT test_name, test_code, date, score, level, interpretation, status
    FROM test_applications
    WHERE patient_id = ? AND workspace_id = ?
    ORDER BY date DESC
    LIMIT 6
  `).all(patientId, workspaceId);

  // Diagnósticos clínicos vigentes (archived_at IS NULL para excluir
  // los retirados)
  const diagnoses = db.prepare(`
    SELECT system, code, name, is_primary, note
    FROM clinical_diagnoses
    WHERE patient_id = ? AND workspace_id = ? AND archived_at IS NULL
    ORDER BY is_primary DESC, created_at DESC
    LIMIT 6
  `).all(patientId, workspaceId);

  return { patient: p, appointments: appts, notes, tasks, tests, diagnoses };
}

// ─── Profesional / workspace ───────────────────────────────────────────

function loadProfessionalContext(workspaceId, userId) {
  const ws = db.prepare("SELECT name, mode FROM workspaces WHERE id = ?").get(workspaceId);
  const u = db.prepare("SELECT name, role FROM users WHERE id = ?").get(userId);
  const prof = db.prepare(`
    SELECT p.name, p.title, p.approach
    FROM professionals p
    JOIN users u ON u.professional_id = p.id
    WHERE u.id = ?
  `).get(userId);
  return { workspace: ws, user: u, professional: prof };
}

// ─── Builder del system prompt ─────────────────────────────────────────

/**
 * Arma el system prompt con:
 *   1. Condicionantes textuales (alcance, identidad, safety)
 *   2. Identidad del psicólogo actual y workspace
 *   3. Hora/fecha actual
 *   4. Dossier del paciente activo (si existe en contexto)
 *
 * El cliente puede pasar `currentPath` con la URL actual; si es
 * /pacientes/<id>, extraemos el patient_id como contexto activo.
 */
export function buildSystemPrompt({ workspaceId, userId, patientId, currentPath }) {
  const condicionantes = loadCondicionantes();
  const profCtx = loadProfessionalContext(workspaceId, userId);
  const patCtx = patientId ? loadPatientContext(workspaceId, patientId) : null;

  const profDisplay = profCtx.professional?.name ?? profCtx.user?.name ?? "Profesional";
  const profTitle = profCtx.professional?.title ?? "Psicólogo/a";
  const wsName = profCtx.workspace?.name ?? "su consulta";
  const today = new Date().toLocaleDateString("es-CO", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  });
  const nowTime = new Date().toLocaleTimeString("es-CO", { hour: "numeric", minute: "2-digit", hour12: true });

  const sections = [];

  // 1. Identidad y reglas (condicionantes literal)
  sections.push("# Identidad, alcance y reglas de Laura\n\n" + (condicionantes || "Laura es la asistente clínica de Psicomorfosis."));

  // 2. Contexto del profesional actual
  sections.push(`# Contexto del profesional actual

Estás hablando con **${profDisplay}** (${profTitle}), del workspace "${wsName}" (modo ${profCtx.workspace?.mode ?? "individual"}).
Es ${today}, son aproximadamente las ${nowTime}.

Trata a este profesional como un colega del equipo clínico, no como un estudiante. Lleva 100% el peso de la responsabilidad clínica — tu rol es apoyar, no decidir.`);

  // 3. Aviso transversal de propose-approve
  sections.push(`# Regla transversal (NO negociable)

Solo lectura: tienes acceso de lectura completa al workspace, pero **toda acción que escriba, envíe o modifique** (notas en historia, mensajes a pacientes, agenda, tareas, documentos) requiere **confirmación explícita** del profesional.

En esta versión beta, **solo puedes consultar y proponer en texto**. Cualquier operación de escritura real está deshabilitada — el psicólogo la ejecuta manualmente. Si te piden "agenda esto" o "manda este mensaje", propón el texto/payload claro pero deja claro que él tiene que confirmarlo en la app.`);

  // 4. Contexto del paciente activo (si hay)
  if (patCtx) {
    const p = patCtx.patient;
    const fmt = (s) => (s ?? "").toString().trim() || "—";
    const appointmentsBlock = patCtx.appointments.length
      ? patCtx.appointments.map((a) => `  - ${a.date} ${a.time} · ${a.modality ?? ""} · ${a.status}${a.room ? " · " + a.room : ""}`).join("\n")
      : "  (sin citas registradas)";
    const tasksBlock = patCtx.tasks.length
      ? patCtx.tasks.map((t) => `  - [${t.status}] ${t.title}${t.due_date ? " · vence " + t.due_date : ""}`).join("\n")
      : "  (sin tareas activas)";
    const testsBlock = patCtx.tests.length
      ? patCtx.tests.map((t) => `  - ${t.test_code} (${t.date}) · score ${t.score ?? "—"} · ${t.level ?? "—"} · ${t.status}${t.interpretation ? " · " + t.interpretation : ""}`).join("\n")
      : "  (sin tests registrados)";
    const diagBlock = patCtx.diagnoses.length
      ? patCtx.diagnoses.map((d) => `  - ${d.system} ${d.code} · ${d.name}${d.is_primary ? " (principal)" : ""}${d.note ? " · " + d.note : ""}`).join("\n")
      : "  (sin diagnósticos registrados)";
    const notesBlock = patCtx.notes.length
      ? patCtx.notes.map((n) => `  ── ${n.kind} · ${n.created_at}${n.signed_at ? " · FIRMADO" : ""}\n${(n.content || "").split("\n").map(l => "    " + l).join("\n")}`).join("\n\n")
      : "  (sin notas registradas)";

    sections.push(`# Paciente en contexto

Estás conversando dentro de la ficha de un paciente:

- **Nombre:** ${fmt(p.name)}${p.preferred_name ? ` ("${p.preferred_name}")` : ""}
- **ID interno:** ${p.id}
- **Documento:** ${fmt(p.doc)}
- **Edad:** ${fmt(p.age)} · **Sexo:** ${fmt(p.sex)} · **Pronombres:** ${fmt(p.pronouns)}
- **Modalidad:** ${fmt(p.modality)} · **Estado:** ${fmt(p.status)}
- **Motivo de consulta:** ${fmt(p.reason)}

## Citas recientes
${appointmentsBlock}

## Tareas activas
${tasksBlock}

## Tests recientes
${testsBlock}

## Diagnósticos vigentes
${diagBlock}

## Últimas notas clínicas (parciales)
${notesBlock}

Cuando cites información de las notas o tests, **siempre menciona la fecha y el tipo** (ej: "según la nota SOAP del 15 de marzo"). Si la información no aparece arriba, dilo explícitamente — no inventes.`);
  } else if (currentPath) {
    sections.push(`# Contexto de ubicación

El profesional está navegando en \`${currentPath}\` de la plataforma. No hay un paciente específicamente activo en el contexto. Si te pregunta sobre un paciente concreto, pídele que lo abra desde la lista o referenciarlo por nombre/ID.`);
  }

  // 5. Formato esperado de respuestas
  sections.push(`# Estilo

- Español neutro, profesional, cálido. Trata al profesional con respeto pero sin formalismo excesivo.
- Conciso. Sin párrafos largos a menos que el contenido lo justifique (ej: redacción de evolución clínica).
- Usa listas con guiones cuando enumeras; tablas markdown cuando comparas.
- Si te piden algo fuera de alcance, redirige con cortesía (ver condicionantes §3).
- Si te piden una acción que escribiría datos, **propón el contenido pero recuerda que el profesional tiene que ejecutarla manualmente** en la sección correspondiente de la app.`);

  return sections.join("\n\n---\n\n");
}

// ─── Cliente HTTP ──────────────────────────────────────────────────────

/**
 * Genera respuesta streaming. Devuelve un async generator que emite
 * { type: 'delta', text } por cada token, y al final un evento
 * { type: 'done', usage: { input_tokens, output_tokens, stop_reason } }.
 *
 * No persiste nada — el caller maneja la BD para que el commit sea
 * atómico con el end-of-stream.
 */
export async function* streamMessage({ systemPrompt, history, userMessage, model = LAURA_MODEL, maxTokens = 1500 }) {
  const messages = [
    ...history.map((m) => ({ role: m.role, content: m.content })),
    { role: "user", content: userMessage },
  ];

  const stream = getClient().messages.stream({
    model,
    max_tokens: maxTokens,
    system: systemPrompt,
    messages,
  });

  let inputTokens = 0;
  let outputTokens = 0;
  let stopReason = null;

  for await (const event of stream) {
    if (event.type === "content_block_delta" && event.delta?.type === "text_delta") {
      yield { type: "delta", text: event.delta.text };
    } else if (event.type === "message_start") {
      inputTokens = event.message?.usage?.input_tokens ?? 0;
    } else if (event.type === "message_delta") {
      outputTokens = event.usage?.output_tokens ?? outputTokens;
      stopReason = event.delta?.stop_reason ?? stopReason;
    }
  }

  // El SDK también expone .finalMessage() pero ya tenemos los tokens.
  yield {
    type: "done",
    usage: { input_tokens: inputTokens, output_tokens: outputTokens, stop_reason: stopReason },
  };
}

// ─── Health check ──────────────────────────────────────────────────────

/**
 * Ping al backend DARIO. Devuelve { ok, status?, latencyMs? }.
 * Se usa desde /api/laura/health para que la UI muestre el estado.
 */
export async function healthCheck() {
  const start = Date.now();
  const url = (process.env.LAURA_BASE_URL || "http://localhost:3456").replace(/\/$/, "");
  try {
    const controller = new AbortController();
    const tm = setTimeout(() => controller.abort(), 3000);
    const res = await fetch(`${url}/v1/models`, { signal: controller.signal });
    clearTimeout(tm);
    return {
      ok: res.ok,
      status: res.status,
      latencyMs: Date.now() - start,
    };
  } catch (err) {
    return {
      ok: false,
      error: err.name === "AbortError" ? "timeout" : (err.message ?? String(err)),
      latencyMs: Date.now() - start,
    };
  }
}

// ─── Estado de la suscripción Claude (parseado de `dario status`) ─────
//
// DARIO no expone un endpoint de "usage" como API — solo el binario
// imprime el estado. Lo ejecutamos como child process y parseamos el
// output para devolverlo como JSON al cliente. Cache 60s para no
// fork-bombear si la UI lo pide a menudo.

import { exec as execCb } from "node:child_process";
import { promisify } from "node:util";
const exec = promisify(execCb);

let _statusCache = null;
let _statusCacheAt = 0;

/**
 * Devuelve el estado de la suscripción de Claude reportado por DARIO.
 * Estructura típica del output:
 *
 *   dario — Status
 *   ──────────────
 *
 *   Status: healthy
 *   Expires in: 7h 59m
 *
 * Devolvemos: { ok, status, expiresIn, raw } o { ok: false, error }.
 * Cache 60s para no spawn un proceso por cada request.
 */
export async function darioStatus() {
  const now = Date.now();
  if (_statusCache && now - _statusCacheAt < 60_000) return _statusCache;
  const cmd = process.env.LAURA_DARIO_BIN || "dario";
  try {
    const { stdout } = await exec(`${cmd} status`, {
      timeout: 5000,
      env: { ...process.env, PATH: `${process.env.PATH}:/home/ubuntu/.npm-global/bin` },
    });
    const text = String(stdout);
    const statusMatch = text.match(/Status:\s*(\S+)/i);
    const expiresMatch = text.match(/Expires in:\s*([^\n]+)/i);
    const result = {
      ok: Boolean(statusMatch && /healthy/i.test(statusMatch[1])),
      status: statusMatch?.[1] ?? null,
      expires_in: expiresMatch?.[1]?.trim() ?? null,
      raw: text.trim(),
    };
    _statusCache = result;
    _statusCacheAt = now;
    return result;
  } catch (err) {
    const result = { ok: false, error: err?.message ?? String(err) };
    // No cacheamos errores tanto tiempo — 10s permite recuperar rápido
    _statusCache = result;
    _statusCacheAt = now - 50_000;
    return result;
  }
}
