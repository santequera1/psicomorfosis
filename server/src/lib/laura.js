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

// ─── Resumen estructural del workspace ─────────────────────────────────
//
// Vista panorámica que Laura recibe en CADA turno (sea o no que haya un
// paciente activo en contexto). Lo justo para responder preguntas como
// "¿cuántos pacientes tengo?", "¿qué tengo mañana?", "¿quién está
// pendiente de firmar X?", sin tener que cargar la BD entera en el
// prompt. Tope de ~1500 tokens estimados.

function loadWorkspaceSummary(workspaceId) {
  // Conteos rápidos
  const counts = {
    patients_active: db.prepare(
      "SELECT COUNT(*) AS n FROM patients WHERE workspace_id = ? AND status = 'activo' AND archived_at IS NULL",
    ).get(workspaceId).n,
    patients_total: db.prepare(
      "SELECT COUNT(*) AS n FROM patients WHERE workspace_id = ? AND archived_at IS NULL",
    ).get(workspaceId).n,
    patients_archived: db.prepare(
      "SELECT COUNT(*) AS n FROM patients WHERE workspace_id = ? AND archived_at IS NOT NULL",
    ).get(workspaceId).n,
    patients_at_risk: db.prepare(
      "SELECT COUNT(*) AS n FROM patients WHERE workspace_id = ? AND risk IN ('moderado','alto') AND archived_at IS NULL",
    ).get(workspaceId).n,
  };

  // Próximas 7 citas (no atendidas ni canceladas)
  const todayIso = new Date().toISOString().slice(0, 10);
  const upcomingAppts = db.prepare(`
    SELECT a.id, a.date, a.time, a.modality, a.status, a.room,
           p.name AS patient_name, p.preferred_name AS patient_preferred
    FROM appointments a
    LEFT JOIN patients p ON p.id = a.patient_id
    WHERE a.workspace_id = ?
      AND a.date >= ?
      AND a.status IN ('pendiente','confirmada','agendada','en_curso')
    ORDER BY a.date ASC, a.time ASC
    LIMIT 7
  `).all(workspaceId, todayIso);

  // Pacientes activos (top 20 — lista corta para que Laura pueda
  // resolver "qué paciente es X" o "muéstrame mis pacientes")
  const patientsList = db.prepare(`
    SELECT id, name, preferred_name, modality, status, risk, last_contact
    FROM patients
    WHERE workspace_id = ? AND archived_at IS NULL
    ORDER BY
      CASE WHEN status = 'activo' THEN 0 ELSE 1 END,
      updated_at DESC
    LIMIT 20
  `).all(workspaceId);

  // Tareas pendientes (no completadas)
  const pendingTasks = db.prepare(`
    SELECT t.id, t.title, t.due_date, t.status,
           p.name AS patient_name, p.preferred_name AS patient_preferred
    FROM tareas t
    LEFT JOIN patients p ON p.id = t.patient_id
    WHERE t.workspace_id = ?
      AND t.archived_at IS NULL AND t.deleted_at IS NULL
      AND t.status != 'DONE'
      AND t.visibility != 'private'
    ORDER BY
      CASE WHEN t.due_date IS NULL THEN 1 ELSE 0 END,
      t.due_date ASC
    LIMIT 10
  `).all(workspaceId);

  // Tests recientes (30 días)
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const recentTests = db.prepare(`
    SELECT t.test_code, t.test_name, t.date, t.score, t.level, t.status,
           p.name AS patient_name, p.preferred_name AS patient_preferred
    FROM test_applications t
    LEFT JOIN patients p ON p.id = t.patient_id
    WHERE t.workspace_id = ? AND t.date >= ?
    ORDER BY t.date DESC
    LIMIT 10
  `).all(workspaceId, thirtyDaysAgo);

  // Documentos recientes con paciente vinculado
  const recentDocs = db.prepare(`
    SELECT d.id, d.name, d.type, d.status, d.signed_at, d.created_at,
           p.name AS patient_name, p.preferred_name AS patient_preferred
    FROM documents d
    LEFT JOIN patients p ON p.id = d.patient_id
    WHERE d.workspace_id = ? AND d.archived_at IS NULL
    ORDER BY d.updated_at DESC
    LIMIT 8
  `).all(workspaceId);

  // Sedes / consultorios configurados
  const sedes = db.prepare(
    "SELECT name, address FROM sedes WHERE workspace_id = ? AND active = 1 ORDER BY id ASC LIMIT 5",
  ).all(workspaceId);

  // Settings clave (horario, consultorio principal)
  const settings = Object.fromEntries(
    db.prepare(
      "SELECT key, value FROM settings WHERE workspace_id = ? AND key IN ('consultorio_name','address','phone','work_start_hour','work_end_hour','work_days','tarifa_sesion')",
    ).all(workspaceId).map((s) => [s.key, s.value]),
  );

  return { counts, upcomingAppts, patientsList, pendingTasks, recentTests, recentDocs, sedes, settings };
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
  const wsSummary = loadWorkspaceSummary(workspaceId);
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

  // 4. Resumen estructural del workspace — la "memoria" panorámica
  // que Laura tiene siempre disponible para responder preguntas
  // generales sin necesidad de ir paciente por paciente.
  const fmt = (v) => (v == null || v === "" ? "—" : String(v));
  const apptBlock = wsSummary.upcomingAppts.length
    ? wsSummary.upcomingAppts.map((a) =>
        `  - ${a.date} ${a.time} · ${a.patient_preferred || a.patient_name || "(sin paciente)"} · ${a.modality ?? "—"} · ${a.status}${a.room ? " · " + a.room : ""}`,
      ).join("\n")
    : "  (sin citas próximas)";
  const patientsBlock = wsSummary.patientsList.length
    ? wsSummary.patientsList.map((p) =>
        `  - ${p.preferred_name || p.name} (ID ${p.id}) · ${p.modality ?? "—"} · ${p.status ?? "—"}${p.risk && p.risk !== "ninguno" ? ` · riesgo ${p.risk}` : ""}`,
      ).join("\n")
    : "  (sin pacientes registrados)";
  const tasksBlock = wsSummary.pendingTasks.length
    ? wsSummary.pendingTasks.map((t) =>
        `  - [${t.status}] ${t.title}${t.patient_name ? ` · ${t.patient_preferred || t.patient_name}` : ""}${t.due_date ? ` · vence ${t.due_date}` : ""}`,
      ).join("\n")
    : "  (sin tareas pendientes)";
  const testsBlock = wsSummary.recentTests.length
    ? wsSummary.recentTests.map((t) =>
        `  - ${t.test_code} (${t.date}) · ${t.patient_preferred || t.patient_name || "—"} · score ${fmt(t.score)} · ${fmt(t.level)} · ${t.status}`,
      ).join("\n")
    : "  (sin tests recientes)";
  const docsBlock = wsSummary.recentDocs.length
    ? wsSummary.recentDocs.map((d) =>
        `  - "${d.name}" · ${d.type ?? "—"} · ${d.status ?? "—"}${d.signed_at ? " · FIRMADO" : ""}${d.patient_name ? ` · ${d.patient_preferred || d.patient_name}` : ""}`,
      ).join("\n")
    : "  (sin documentos recientes)";
  const sedesBlock = wsSummary.sedes.length
    ? wsSummary.sedes.map((s) => `  - ${s.name}${s.address ? ` · ${s.address}` : ""}`).join("\n")
    : "  (sin sedes adicionales)";
  const settingsLines = [];
  if (wsSummary.settings.consultorio_name)
    settingsLines.push(`  - Consultorio principal: ${wsSummary.settings.consultorio_name}${wsSummary.settings.address ? ` · ${wsSummary.settings.address}` : ""}`);
  if (wsSummary.settings.work_start_hour && wsSummary.settings.work_end_hour)
    settingsLines.push(`  - Horario configurado: ${wsSummary.settings.work_start_hour}:00–${wsSummary.settings.work_end_hour}:00 (días: ${wsSummary.settings.work_days ?? "—"})`);
  if (wsSummary.settings.tarifa_sesion)
    settingsLines.push(`  - Tarifa por sesión: COP ${wsSummary.settings.tarifa_sesion}`);

  sections.push(`# Estado actual del workspace

Estos son los datos en tiempo real del workspace del profesional. Úsalos para responder preguntas como "¿cuántos pacientes tengo?", "¿qué tengo mañana?", "¿quién tiene tareas pendientes?", etc.

## Conteos
- **Pacientes activos:** ${wsSummary.counts.patients_active}
- **Pacientes totales (no archivados):** ${wsSummary.counts.patients_total}
- **Pacientes archivados:** ${wsSummary.counts.patients_archived}
- **Pacientes con riesgo moderado/alto:** ${wsSummary.counts.patients_at_risk}

## Próximas citas (hasta 7)
${apptBlock}

## Pacientes recientes (hasta 20, ordenados por última actualización)
${patientsBlock}

## Tareas pendientes (hasta 10)
${tasksBlock}

## Tests recientes (últimos 30 días)
${testsBlock}

## Documentos recientes (hasta 8)
${docsBlock}

## Sedes adicionales
${sedesBlock}

## Configuración del consultorio
${settingsLines.length ? settingsLines.join("\n") : "  (sin configuración)"}

**Importante**: si el profesional pregunta por información puntual de un paciente que NO está en las 20 listadas arriba, pídele que abra la ficha del paciente para tener su contexto completo. No inventes datos.`);

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
/**
 * Stream de respuesta del modelo. Acepta:
 *   - systemPrompt: string
 *   - history: [{ role, content }]   — assistants y users previos
 *   - userMessage: string            — texto del usuario actual
 *   - userImages?: [{ data, media_type }]
 *       Imágenes en base64 que acompañan al userMessage. Se mandan
 *       como content multimodal según el formato de Anthropic
 *       (visión nativa de Claude Sonnet 4.x). Si están presentes y
 *       el texto está vacío, mandamos solo las imágenes (Claude
 *       responde describiéndolas / interpretándolas).
 */
export async function* streamMessage({
  systemPrompt, history, userMessage, userImages = [],
  model = LAURA_MODEL, maxTokens = 1500,
}) {
  // Si hay imágenes, el content del último mensaje es array con
  // image blocks + text block al final. Si no, el content es string
  // (más simple y eficiente en tokens).
  let userContent;
  if (Array.isArray(userImages) && userImages.length > 0) {
    userContent = [
      ...userImages.map((img) => ({
        type: "image",
        source: { type: "base64", media_type: img.media_type, data: img.data },
      })),
      ...(userMessage && userMessage.length > 0
        ? [{ type: "text", text: userMessage }]
        : []),
    ];
  } else {
    userContent = userMessage;
  }

  const messages = [
    ...history.map((m) => ({ role: m.role, content: m.content })),
    { role: "user", content: userContent },
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

// ─── Cuota real de Claude (parseado de `claude -p /usage`) ─────────────
//
// Claude Code CLI sí expone los % reales que muestra claude.ai. Lo
// ejecutamos via child process y parseamos. El comando tarda ~3-5s
// (consulta API de Anthropic), así que cacheamos 5 min y devolvemos
// "stale" inmediato si tenemos algo en cache mientras refresca background.

let _quotaCache = null;
let _quotaCacheAt = 0;
let _quotaRefreshInFlight = null;
const QUOTA_TTL_MS = 5 * 60_000;

async function _fetchClaudeUsage() {
  const cmd = process.env.LAURA_CLAUDE_BIN || "claude";
  const { stdout } = await exec(`${cmd} -p "/usage"`, {
    timeout: 20_000,
    env: { ...process.env, PATH: `${process.env.PATH}:/home/ubuntu/.npm-global/bin` },
  });
  const text = String(stdout);
  // Patrón típico:
  //   Current session: 93% used · resets Jun 22, 8:29pm (UTC)
  //   Current week (all models): 17% used · resets Jun 24, 10:59am (UTC)
  const sessionMatch = text.match(/Current session:\s*(\d+)% used · resets ([^\n]+)/i);
  const weekMatch    = text.match(/Current week[^:]*:\s*(\d+)% used · resets ([^\n]+)/i);
  return {
    session: sessionMatch
      ? { percent: Number(sessionMatch[1]), resets_at: sessionMatch[2].trim() }
      : null,
    week: weekMatch
      ? { percent: Number(weekMatch[1]), resets_at: weekMatch[2].trim() }
      : null,
    raw: text.trim(),
    fetched_at: new Date().toISOString(),
  };
}

/**
 * Devuelve la cuota actual de la suscripción Claude tal como la
 * reporta `claude -p /usage`. Estructura:
 *
 *   { session: { percent, resets_at }, week: { percent, resets_at } }
 *
 * Si nunca se ha consultado, hace un fetch sincrónico (~3-5s) la
 * primera vez. Llamadas siguientes devuelven la cache. Si la cache
 * está stale (>5min), responde con la cache vieja Y dispara un
 * refresh en background — el cliente nunca espera.
 */
export async function claudeUsage({ forceRefresh = false } = {}) {
  const now = Date.now();
  const fresh = _quotaCache && now - _quotaCacheAt < QUOTA_TTL_MS;

  if (fresh && !forceRefresh) return _quotaCache;

  // Si hay cache stale, devolvemos eso ya y refrescamos en background.
  if (_quotaCache && !forceRefresh) {
    if (!_quotaRefreshInFlight) {
      _quotaRefreshInFlight = _fetchClaudeUsage()
        .then((r) => { _quotaCache = r; _quotaCacheAt = Date.now(); })
        .catch((err) => { console.warn("[laura] claudeUsage refresh failed:", err.message); })
        .finally(() => { _quotaRefreshInFlight = null; });
    }
    return _quotaCache;
  }

  // Primera vez (o forced): hacemos fetch sincrónico.
  try {
    const r = await _fetchClaudeUsage();
    _quotaCache = r;
    _quotaCacheAt = now;
    return r;
  } catch (err) {
    return { error: err?.message ?? String(err), session: null, week: null };
  }
}
