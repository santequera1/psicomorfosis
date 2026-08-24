/**
 * Consultas en vivo de Laura ("drivers" de lectura).
 *
 * Hasta ahora Laura respondía con una FOTO del consultorio metida en el
 * prompt (resumen + paciente en contexto). Con esto puede PREGUNTARLE a
 * la base de datos a mitad de respuesta: "¿qué tengo el jueves?",
 * "busca a Carolina", "¿qué tests tiene P-1015?".
 *
 * Mecánica (sin tools nativas: el proxy las descarta): el modelo emite
 *   [[LAURA_ACTION:query_agenda:{"date":"2026-08-28"}]]
 * y se detiene. routes/laura.js intercepta cualquier acción cuyo nombre
 * empiece por `query_`, la ejecuta aquí (siempre acotada al workspace),
 * le devuelve el resultado al modelo como un turno más y lo deja
 * continuar. Máximo 3 consultas por respuesta.
 *
 * Todo es SOLO LECTURA. Las escrituras siguen siendo propuestas que el
 * profesional aprueba en la UI.
 */
import { db } from "../db.js";

const MAX_ROWS = 40;

/** Normaliza para búsqueda tolerante: minúsculas, sin tildes, espacios simples. */
export function fold(s) {
  return String(s ?? "")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().replace(/\s+/g, " ").trim();
}

const todayIso = () => {
  const d = new Date(Date.now() - 5 * 3600 * 1000); // Colombia (UTC-5, sin DST)
  return d.toISOString().slice(0, 10);
};
const isDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s ?? ""));

// ─── Consultas ────────────────────────────────────────────────────────

function agenda({ workspaceId }, { date, from, to } = {}) {
  let sql = `
    SELECT a.id, a.date, a.time, a.duration_min, a.status, a.modality, a.room, a.meeting_url,
           a.patient_id, COALESCE(p.preferred_name, p.name, a.patient_name) AS patient, a.professional
    FROM appointments a LEFT JOIN patients p ON p.id = a.patient_id
    WHERE a.workspace_id = ?`;
  const args = [workspaceId];
  if (isDate(date)) { sql += " AND a.date = ?"; args.push(date); }
  else {
    const f = isDate(from) ? from : todayIso();
    const t = isDate(to) ? to : f;
    sql += " AND a.date >= ? AND a.date <= ?"; args.push(f, t);
  }
  sql += ` ORDER BY a.date, a.time LIMIT ${MAX_ROWS}`;
  const rows = db.prepare(sql).all(...args);
  return { rango: isDate(date) ? date : `${args[1]} → ${args[2]}`, total: rows.length, citas: rows };
}

function buscarPaciente({ workspaceId }, { q } = {}) {
  const needle = fold(q);
  if (needle.length < 2) return { error: "Indica al menos 2 letras del nombre, documento o teléfono." };
  const rows = db.prepare(`
    SELECT id, name, preferred_name, doc, phone, age, status, risk, modality, reason
    FROM patients WHERE workspace_id = ? AND archived_at IS NULL
  `).all(workspaceId);
  const tokens = needle.split(" ");
  const scored = rows.map((p) => {
    const hay = fold(`${p.name} ${p.preferred_name ?? ""} ${p.doc ?? ""} ${p.phone ?? ""} ${p.id}`);
    let score = 0;
    for (const t of tokens) if (hay.includes(t)) score += t.length;
    if (fold(p.name).startsWith(needle)) score += 10;
    return { p, score };
  }).filter((x) => x.score > 0).sort((a, b) => b.score - a.score).slice(0, 8);
  return {
    total: scored.length,
    pacientes: scored.map(({ p }) => ({
      id: p.id, nombre: p.name, preferido: p.preferred_name, edad: p.age, estado: p.status,
      riesgo: p.risk, modalidad: p.modality, telefono: p.phone, motivo: (p.reason ?? "").slice(0, 160),
    })),
    nota: scored.length === 0 ? "Sin coincidencias. Prueba con otra parte del nombre." : undefined,
  };
}

function requirePatient(workspaceId, patientId) {
  const p = db.prepare("SELECT id, name, preferred_name, age, status, risk, modality, reason, phone, email FROM patients WHERE id = ? AND workspace_id = ?")
    .get(String(patientId ?? ""), workspaceId);
  if (!p) throw new Error(`No existe el paciente ${patientId} en este workspace. Búscalo primero con query_buscar_paciente.`);
  return p;
}

function ficha({ workspaceId }, { patient_id } = {}) {
  const p = requirePatient(workspaceId, patient_id);
  const citas = db.prepare(`SELECT id, date, time, status, modality, meeting_url FROM appointments WHERE patient_id = ? AND workspace_id = ? ORDER BY date DESC, time DESC LIMIT 8`).all(p.id, workspaceId);
  const notas = db.prepare(`SELECT kind, substr(content, 1, 400) AS extracto, created_at, signed_at FROM clinical_notes WHERE patient_id = ? AND workspace_id = ? AND archived_at IS NULL ORDER BY created_at DESC LIMIT 3`).all(p.id, workspaceId);
  const diagnosticos = db.prepare(`SELECT system, code, name, is_primary FROM clinical_diagnoses WHERE patient_id = ? AND workspace_id = ? AND archived_at IS NULL ORDER BY is_primary DESC LIMIT 6`).all(p.id, workspaceId);
  const tareas = db.prepare(`SELECT id, title, status, due_at FROM therapy_tasks WHERE patient_id = ? AND workspace_id = ? ORDER BY assigned_at DESC LIMIT 6`).all(p.id, workspaceId);
  const tests = db.prepare(`SELECT test_name, date, score, level, status FROM test_applications WHERE patient_id = ? AND workspace_id = ? ORDER BY date DESC LIMIT 5`).all(p.id, workspaceId);
  const atendidas = db.prepare(`SELECT COUNT(*) AS n FROM appointments WHERE patient_id = ? AND workspace_id = ? AND status = 'atendida'`).get(p.id, workspaceId).n;
  return { paciente: p, sesiones_atendidas: atendidas, citas, notas, diagnosticos, tareas, tests };
}

function notas({ workspaceId }, { patient_id, limit } = {}) {
  const p = requirePatient(workspaceId, patient_id);
  const n = Math.min(Math.max(Number(limit) || 5, 1), 10);
  const rows = db.prepare(`
    SELECT id, kind, author_name, created_at, signed_at, substr(content, 1, 1500) AS content
    FROM clinical_notes WHERE patient_id = ? AND workspace_id = ? AND archived_at IS NULL
    ORDER BY created_at DESC LIMIT ?
  `).all(p.id, workspaceId, n);
  return { paciente: { id: p.id, nombre: p.name }, total: rows.length, notas: rows };
}

function tests({ workspaceId }, { patient_id } = {}) {
  const p = requirePatient(workspaceId, patient_id);
  const rows = db.prepare(`
    SELECT id, test_code, test_name, date, score, level, interpretation, status, assigned_at, completed_at
    FROM test_applications WHERE patient_id = ? AND workspace_id = ? ORDER BY COALESCE(date, assigned_at) DESC LIMIT 12
  `).all(p.id, workspaceId);
  return { paciente: { id: p.id, nombre: p.name }, total: rows.length, tests: rows };
}

function catalogoTests({ workspaceId }) {
  // Mismo filtro que GET /tests/catalog: oficiales + personalizados de ESTE workspace.
  const rows = db.prepare(`
    SELECT id, code, name, short_name, items, minutes, category, age_range, is_custom
    FROM psych_tests
    WHERE (is_custom = 0 OR is_custom IS NULL) OR workspace_id = ?
    ORDER BY is_custom ASC, category, name LIMIT 80
  `).all(workspaceId);
  return { total: rows.length, tests: rows };
}

function tareas({ workspaceId, professionalId, userId }, { patient_id } = {}) {
  if (patient_id) {
    const p = requirePatient(workspaceId, patient_id);
    const terapeuticas = db.prepare(`SELECT id, title, type, status, adherence, assigned_at, due_at FROM therapy_tasks WHERE patient_id = ? AND workspace_id = ? ORDER BY assigned_at DESC LIMIT 15`).all(p.id, workspaceId);
    const internas = db.prepare(`SELECT id, title, status, priority, due_date FROM tareas WHERE patient_id = ? AND workspace_id = ? AND archived_at IS NULL AND deleted_at IS NULL AND (visibility != 'private' OR creator_id = ? OR assignee_id = ?) ORDER BY created_at DESC LIMIT 15`).all(p.id, workspaceId, userId ?? -1, professionalId ?? -1);
    return { paciente: { id: p.id, nombre: p.name }, tareas_terapeuticas: terapeuticas, tareas_internas: internas };
  }
  const rows = db.prepare(`
    SELECT t.id, t.title, t.status, t.priority, t.due_date, t.patient_id, p.name AS patient_name
    FROM tareas t LEFT JOIN patients p ON p.id = t.patient_id
    WHERE t.workspace_id = ? AND t.archived_at IS NULL AND t.deleted_at IS NULL AND t.status != 'DONE'
      AND (t.assignee_id = ? OR t.assignee_id IS NULL)
      AND (t.visibility != 'private' OR t.creator_id = ? OR t.assignee_id = ?)
    ORDER BY CASE t.priority WHEN 'URGENT' THEN 0 WHEN 'HIGH' THEN 1 WHEN 'MEDIUM' THEN 2 ELSE 3 END, t.due_date
    LIMIT ${MAX_ROWS}
  `).all(workspaceId, professionalId ?? -1, userId ?? -1, professionalId ?? -1);
  return { total: rows.length, pendientes: rows };
}

function cobros({ workspaceId }, { patient_id } = {}) {
  let sql = `SELECT id, patient_id, patient_name, concept, amount, method, status, date FROM invoices WHERE workspace_id = ? AND status != 'pagada'`;
  const args = [workspaceId];
  if (patient_id) { sql += " AND patient_id = ?"; args.push(String(patient_id)); }
  sql += ` ORDER BY date DESC LIMIT ${MAX_ROWS}`;
  const rows = db.prepare(sql).all(...args);
  const total = rows.reduce((a, r) => a + (Number(r.amount) || 0), 0);
  return { total_pendiente_cop: total, cantidad: rows.length, recibos: rows };
}

// ─── Dispatcher ───────────────────────────────────────────────────────

export const QUERY_TOOLS = {
  query_agenda: agenda,
  query_buscar_paciente: buscarPaciente,
  query_ficha: ficha,
  query_notas: notas,
  query_tests: tests,
  query_catalogo_tests: catalogoTests,
  query_tareas: tareas,
  query_cobros: cobros,
};

export const isQuery = (name) => typeof name === "string" && name.startsWith("query_");

/**
 * Ejecuta una consulta. Nunca lanza: devuelve { ok, data | error } para
 * que el modelo pueda explicarle al usuario qué falló.
 */
export function runQuery(name, input, ctx) {
  const fn = QUERY_TOOLS[name];
  if (!fn) return { ok: false, error: `Consulta desconocida: ${name}` };
  try {
    const data = fn(ctx, input ?? {});
    const json = JSON.stringify(data);
    // Tope duro para no inflar el prompt con una consulta enorme.
    const truncated = json.length > 12000;
    return { ok: true, data, truncated, json: truncated ? json.slice(0, 12000) + "…(truncado)" : json };
  } catch (e) {
    return { ok: false, error: String(e?.message ?? e).slice(0, 300) };
  }
}

/** Resumen de una línea para la UI ("Agenda 26/08: 3 citas"). */
export function summarizeQuery(name, input, result) {
  if (!result?.ok) return `${labelOf(name)}: ${result?.error ?? "error"}`;
  const d = result.data ?? {};
  switch (name) {
    case "query_agenda": return `Agenda ${d.rango}: ${d.total} cita${d.total === 1 ? "" : "s"}`;
    case "query_buscar_paciente": return `Búsqueda «${input?.q ?? ""}»: ${d.total} resultado${d.total === 1 ? "" : "s"}`;
    case "query_ficha": return `Ficha de ${d.paciente?.name ?? input?.patient_id}`;
    case "query_notas": return `${d.total} nota${d.total === 1 ? "" : "s"} de ${d.paciente?.nombre ?? ""}`;
    case "query_tests": return `${d.total} test${d.total === 1 ? "" : "s"} de ${d.paciente?.nombre ?? ""}`;
    case "query_catalogo_tests": return `Catálogo: ${d.total} tests`;
    case "query_tareas": return d.paciente ? `Tareas de ${d.paciente.nombre}` : `${d.total} tareas pendientes`;
    case "query_cobros": return `${d.cantidad} recibo${d.cantidad === 1 ? "" : "s"} por cobrar`;
    default: return labelOf(name);
  }
}
export function labelOf(name) {
  return ({
    query_agenda: "Consultando la agenda", query_buscar_paciente: "Buscando paciente", query_ficha: "Abriendo la ficha",
    query_notas: "Leyendo notas", query_tests: "Revisando tests", query_catalogo_tests: "Consultando catálogo de tests",
    query_tareas: "Revisando tareas", query_cobros: "Revisando cobros",
  })[name] ?? "Consultando";
}

// ─── Documentación para el prompt ─────────────────────────────────────

export const QUERY_DOCS = `
## CONSULTAS EN VIVO (lectura) — úsalas en vez de adivinar

Además de las acciones, puedes CONSULTAR la base de datos del workspace a mitad de respuesta. Emite el marker en una línea propia y **DETENTE** (no escribas nada después del marker): recibirás el resultado y podrás continuar.

\`[[LAURA_ACTION:query_agenda:{"date":"YYYY-MM-DD"}]]\` — citas de un día (o {"from","to"} para un rango). Sin fecha = hoy.
\`[[LAURA_ACTION:query_buscar_paciente:{"q":"caro"}]]\` — buscar por nombre/documento/teléfono (tolerante a errores).
\`[[LAURA_ACTION:query_ficha:{"patient_id":"P-1015"}]]\` — resumen de un paciente: citas, últimas notas, diagnósticos, tareas, tests.
\`[[LAURA_ACTION:query_notas:{"patient_id":"P-1015","limit":5}]]\` — notas clínicas completas (hasta 10).
\`[[LAURA_ACTION:query_tests:{"patient_id":"P-1015"}]]\` — tests aplicados/asignados con puntajes.
\`[[LAURA_ACTION:query_catalogo_tests:{}]]\` — tests disponibles para asignar (id, nombre, ítems, minutos).
\`[[LAURA_ACTION:query_tareas:{"patient_id":"P-1015"}]]\` — tareas de un paciente; sin patient_id = tus pendientes.
\`[[LAURA_ACTION:query_cobros:{"patient_id":"P-1015"}]]\` — recibos pendientes de cobro (sin patient_id = todos).

Reglas:
- Si la respuesta depende de datos reales (qué hay tal día, cómo va X, qué debe Y), **consulta primero**; el resumen del prompt es solo una foto parcial.
- Máximo 3 consultas por respuesta. Si el usuario nombra a alguien y no tienes su ID, primero query_buscar_paciente; si hay varios candidatos, pregunta cuál.
- El resultado te llega como texto JSON en un turno del usuario que empieza por "[RESULTADO". Úsalo, no lo repitas literalmente ni lo menciones como "JSON".
- Nunca inventes citas, notas ni cifras: si la consulta viene vacía, dilo.
`;
