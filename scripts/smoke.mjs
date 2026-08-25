#!/usr/bin/env node
/**
 * Smoke de producción (o de cualquier base): comprueba desde fuera que la
 * app responde, que las rutas públicas siguen públicas (canario de la
 * trampa router.use en /api), que las privadas exigen sesión, que el
 * OAuth de Google está bien cableado y —con credenciales de una cuenta de
 * prueba— que los endpoints principales devuelven datos.
 *
 * Solo lecturas. La única escritura opcional es un mensaje corto a Laura
 * (--laura) en la cuenta de prueba, para verificar el streaming de punta
 * a punta.
 *
 * Uso:
 *   node scripts/smoke.mjs                       # público, sin sesión
 *   SMOKE_USER=usuario SMOKE_PASS=clave node scripts/smoke.mjs --laura
 *   SMOKE_BASE=http://localhost:3012 node scripts/smoke.mjs
 *   SMOKE_SLUG=nathaly-ferrer                     # perfil público a probar
 */

const BASE = (process.env.SMOKE_BASE || "https://psicomorfosis.co").replace(/\/$/, "");
const SLUG = process.env.SMOKE_SLUG || "nathaly-ferrer";
const USER = process.env.SMOKE_USER || "";
const PASS = process.env.SMOKE_PASS || "";
const WITH_LAURA = process.argv.includes("--laura");

const results = [];
let failures = 0;
const ok = (name, detail = "") => { results.push(["OK ", name, detail]); };
const bad = (name, detail = "") => { failures++; results.push(["FAIL", name, detail]); };
const warn = (name, detail = "") => { results.push(["WARN", name, detail]); };

async function req(path, opts = {}) {
  const url = path.startsWith("http") ? path : BASE + path;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), opts.timeout ?? 15000);
  const started = Date.now();
  try {
    const r = await fetch(url, { redirect: "manual", ...opts, signal: ctrl.signal });
    const text = opts.stream ? "" : await r.text();
    return { status: r.status, headers: r.headers, text, ms: Date.now() - started, res: r };
  } finally { clearTimeout(t); }
}
const json = (t) => { try { return JSON.parse(t); } catch { return null; } };

async function expectPage(path, mustContain, label = path) {
  try {
    const r = await req(path);
    if (r.status !== 200) return bad(`GET ${label}`, `HTTP ${r.status}`);
    const missing = (Array.isArray(mustContain) ? mustContain : [mustContain]).filter((s) => s && !r.text.includes(s));
    if (missing.length) return bad(`GET ${label}`, `200 pero sin: ${missing.join(", ")}`);
    ok(`GET ${label}`, `${r.ms} ms`);
    return r;
  } catch (e) { bad(`GET ${label}`, String(e.message ?? e)); }
}
async function expectStatus(path, statuses, label = path, opts = {}) {
  try {
    const r = await req(path, opts);
    const list = Array.isArray(statuses) ? statuses : [statuses];
    if (!list.includes(r.status)) return bad(label, `HTTP ${r.status}, esperado ${list.join("/")}${r.text ? " · " + r.text.slice(0, 100) : ""}`);
    ok(label, `HTTP ${r.status}`);
    return r;
  } catch (e) { bad(label, String(e.message ?? e)); }
}

// ─── 1. Front (SSR) ─────────────────────────────────────────────
console.log(`Smoke contra ${BASE}\n`);
const home = await expectPage("/", "<div", "/ (landing)");
if (home) {
  const cc = home.headers.get("cache-control") || "";
  if (/no-cache|no-store/.test(cc)) ok("HTML sin caché (nginx @ssr)", cc); else warn("HTML sin caché", `cache-control="${cc}" — un cliente puede quedarse con chunks viejos`);
}
await expectPage("/inicio", ["og:image"], "/inicio (og:image)");
await expectPage("/login", "<div", "/login");
await expectPage("/p/login", "<div", "/p/login (portal paciente)");
await expectPage("/privacidad", "<div", "/privacidad");
await expectPage("/terminos", "<div", "/terminos");
await expectPage(`/perfil/${SLUG}`, "<div", `/perfil/${SLUG} (perfil público)`);

// ─── 2. API pública (canarios de router.use en /api) ────────────
{
  const r = await expectStatus("/api/health", 200, "GET /api/health");
  if (r && json(r.text)?.ok !== true) bad("health payload", r.text.slice(0, 80));
}
{
  const r = await expectStatus("/api/auth/google/status", 200, "GET /api/auth/google/status");
  if (r && json(r.text)?.enabled !== true) bad("Google OAuth habilitado", r.text.slice(0, 80));
}
{
  const r = await expectStatus("/api/auth/google", [302, 303], "GET /api/auth/google → redirect a Google");
  if (r) {
    const loc = r.headers.get("location") || "";
    let u = null; try { u = new URL(loc); } catch { /* noop */ }
    if (!u || !/accounts\.google\.com$/.test(u.hostname)) bad("OAuth: destino", loc.slice(0, 120));
    else {
      const scope = u.searchParams.get("scope") || "";
      const redirect = u.searchParams.get("redirect_uri") || "";
      if (!/openid/.test(scope) || !/email/.test(scope)) bad("OAuth: scopes de login", scope);
      else if (/calendar/.test(scope)) bad("OAuth: el login NO debe pedir calendar", scope);
      else ok("OAuth: scopes de login", scope);
      if (redirect === `${BASE}/api/auth/google/callback`) ok("OAuth: redirect_uri", redirect);
      else bad("OAuth: redirect_uri", `${redirect} (esperado ${BASE}/api/auth/google/callback)`);
      if (u.searchParams.get("state")) ok("OAuth: state presente"); else bad("OAuth: falta state");
    }
  }
}
{
  const r = await expectStatus(`/api/public/professionals/${SLUG}`, 200, `GET /api/public/professionals/${SLUG}`);
  const p = r && json(r.text);
  if (p && !(p.name || p.professional?.name)) warn("perfil público: payload sin name", r.text.slice(0, 80));
}
await expectStatus(`/api/public/professionals/${SLUG}/availability`, 200, "GET …/availability");
await expectStatus("/api/public/professionals/no-existe-xyz", 404, "perfil inexistente → 404");

// Privadas sin sesión: 401, nunca 200 ni 500.
for (const p of ["/api/patients", "/api/appointments", "/api/tareas", "/api/invoices", "/api/notifications",
                 "/api/laura/conversations", "/api/laura/memory", "/api/auth/google/calendar", "/api/auth/google/link",
                 "/api/platform/workspaces", "/api/error-reports", "/api/notes/1", "/api/patients/P-1/diagnoses"]) {
  await expectStatus(p, [401, 403], `sin sesión ${p}`);
}
await expectStatus("/api/bot/health", [200, 401, 403], "GET /api/bot/health (clave del bot)");
{
  // Login con clave mala → 401 limpio (no 500). Una sola vez: hay rate limit.
  const r = await expectStatus("/api/auth/login", [400, 401], "POST /api/auth/login (clave inválida)", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ identifier: "smoke-no-existe", password: "x".repeat(12) }),
  });
  if (r && r.status === 401 && !json(r.text)?.error) warn("login inválido: sin mensaje de error", r.text.slice(0, 80));
}

// ─── 3. Con sesión (cuenta de prueba) ───────────────────────────
let token = null;
if (USER && PASS) {
  const r = await req("/api/auth/login", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ identifier: USER, password: PASS }),
  });
  const body = json(r.text);
  token = body?.token ?? null;
  if (r.status === 200 && token) ok(`login ${USER}`, `ws=${body.user?.workspace_id ?? body.workspace_id ?? "?"}`);
  else bad(`login ${USER}`, `HTTP ${r.status} ${r.text.slice(0, 120)}`);
} else {
  warn("sin SMOKE_USER/SMOKE_PASS", "se omiten las comprobaciones con sesión");
}
if (token) {
  const auth = { headers: { authorization: `Bearer ${token}` } };
  const today = new Date().toISOString().slice(0, 10);
  const checks = [
    ["/api/patients", (b) => Array.isArray(b) || Array.isArray(b?.patients)],
    [`/api/appointments?from=${today}&to=${today}`, (b) => Array.isArray(b) || Array.isArray(b?.appointments)],
    ["/api/tareas", (b) => Array.isArray(b) || Array.isArray(b?.tareas) || Array.isArray(b?.tasks)],
    ["/api/invoices", (b) => Array.isArray(b) || Array.isArray(b?.invoices)],
    ["/api/notifications", (b) => Array.isArray(b) || Array.isArray(b?.notifications)],
    ["/api/laura/conversations", (b) => Array.isArray(b) || Array.isArray(b?.items) || Array.isArray(b?.conversations)],
    ["/api/laura/memory", (b) => b && typeof b === "object"],
    ["/api/auth/google/calendar", (b) => b && typeof b.connected === "boolean"],
    ["/api/auth/google/link", (b) => b && typeof b === "object"],
    ["/api/workspace", (b) => b && typeof b === "object"],
  ];
  for (const [path, check] of checks) {
    try {
      const r = await req(path, auth);
      const b = json(r.text);
      if (r.status !== 200) bad(`GET ${path}`, `HTTP ${r.status} ${r.text.slice(0, 100)}`);
      else if (!check(b)) warn(`GET ${path}`, `200 con forma inesperada: ${r.text.slice(0, 80)}`);
      else ok(`GET ${path}`, `${r.ms} ms`);
    } catch (e) { bad(`GET ${path}`, String(e.message ?? e)); }
  }
  // Una cuenta normal NO ve el panel de plataforma.
  await expectStatus("/api/platform/workspaces", [403], "GET /api/platform/workspaces con cuenta normal → 403", auth);

  if (WITH_LAURA) {
    try {
      const r = await req("/api/laura/chat", {
        method: "POST", stream: true, timeout: 60000,
        headers: { ...auth.headers, "content-type": "application/json", accept: "text/event-stream" },
        body: JSON.stringify({ message: "Prueba automática de humo: responde solo con la palabra OK." }),
      });
      if (r.status !== 200) bad("Laura: POST /api/laura/chat", `HTTP ${r.status}`);
      else {
        const reader = r.res.body.getReader();
        const dec = new TextDecoder();
        let buf = "", text = "", done = false, error = null, deltas = 0;
        const deadline = Date.now() + 55000;
        while (!done && Date.now() < deadline) {
          const { value, done: end } = await reader.read();
          if (end) break;
          buf += dec.decode(value, { stream: true });
          let idx;
          while ((idx = buf.indexOf("\n\n")) >= 0) {
            const chunk = buf.slice(0, idx); buf = buf.slice(idx + 2);
            const line = chunk.split("\n").find((l) => l.startsWith("data:"));
            if (!line) continue;
            const ev = json(line.slice(5).trim());
            if (!ev) continue;
            if (ev.type === "delta") { deltas++; text += ev.text ?? ""; }
            else if (ev.type === "done") done = true;
            else if (ev.type === "error") { error = ev.message || ev.code; done = true; }
          }
        }
        if (error) bad("Laura: respuesta", error);
        else if (!done) bad("Laura: stream sin 'done' en 55 s", `deltas=${deltas} texto="${text.slice(0, 60)}"`);
        else ok("Laura: streaming completo", `${deltas} trozos · "${text.trim().slice(0, 60)}"`);
      }
    } catch (e) { bad("Laura: chat", String(e.message ?? e)); }
  }
}

// ─── Informe ────────────────────────────────────────────────────
const w = Math.max(...results.map((r) => r[1].length));
for (const [st, name, detail] of results) console.log(`${st}  ${name.padEnd(w)}  ${detail}`);
console.log(`\n${results.filter((r) => r[0] === "OK ").length} OK · ${results.filter((r) => r[0] === "WARN").length} avisos · ${failures} fallos`);
process.exit(failures ? 1 : 0);
