#!/usr/bin/env node
/**
 * Mock del bot externo de messaging. Recibe los eventos que Psicomorfosis
 * dispara y valida la firma HMAC. NO envía nada por WhatsApp — solo
 * loguea bonito.
 *
 * Uso:
 *   # En una terminal:
 *   MESSAGING_OUTBOUND_SECRET=<el mismo del server> \
 *   node scripts/mock-messaging-bot.mjs
 *
 *   # En otra terminal:
 *   #   Configura el server con:
 *   #     MESSAGING_ENABLED=1
 *   #     MESSAGING_BOT_URL=http://localhost:4001/inbound
 *   #     MESSAGING_OUTBOUND_SECRET=<...>
 *   #   y reinicia.
 *
 * Bonus: el mock también puede SIMULAR un webhook entrante con:
 *   node scripts/mock-messaging-bot.mjs --simulate-opt-out +573041234567 1
 *
 *   (workspace_id, phone) → POST a /api/webhooks/messaging firmado con
 *   MESSAGING_INBOUND_SECRET hacia el server (default localhost:3002).
 */

import crypto from "node:crypto";
import http from "node:http";

const PORT = Number(process.env.MOCK_BOT_PORT ?? 4001);
const OUTBOUND_SECRET = process.env.MESSAGING_OUTBOUND_SECRET;
const INBOUND_SECRET = process.env.MESSAGING_INBOUND_SECRET;
const APP_URL = process.env.PSICOMORFOSIS_URL ?? "http://localhost:3002";

if (!OUTBOUND_SECRET) {
  console.error("✗ Falta MESSAGING_OUTBOUND_SECRET (el secret que el server usa para firmar saliente).");
  process.exit(1);
}

// ── Subcomando opcional: simular webhook entrante hacia el server ────
const args = process.argv.slice(2);
if (args[0] === "--simulate-opt-out") {
  const phone = args[1];
  const workspace_id = Number(args[2] ?? 1);
  if (!phone) {
    console.error("Uso: --simulate-opt-out <phone> [workspace_id]");
    process.exit(1);
  }
  if (!INBOUND_SECRET) {
    console.error("✗ Falta MESSAGING_INBOUND_SECRET para firmar el webhook simulado.");
    process.exit(1);
  }
  await simulateInbound({
    event_id: `mock-${Date.now()}`,
    event: "patient_opt_out",
    workspace_id,
    phone,
    occurred_at: new Date().toISOString(),
    payload: { raw_text: "STOP" },
  });
  process.exit(0);
}

// ── Verificación de firma saliente (Psicomorfosis → este bot) ────────
function verify(rawBody, header, secret) {
  if (!header || !secret) return false;
  const parts = Object.fromEntries(header.split(",").map((s) => s.split("=")));
  const t = Number(parts.t);
  if (!Number.isFinite(t)) return false;
  if (Math.abs(Date.now() / 1000 - t) > 300) return false;
  const expected = crypto
    .createHmac("sha256", secret)
    .update(`${t}.${rawBody}`)
    .digest("hex");
  const a = Buffer.from(expected, "hex");
  const b = Buffer.from(parts.v1 ?? "", "hex");
  if (a.length !== b.length) return false;
  try { return crypto.timingSafeEqual(a, b); }
  catch { return false; }
}

// ── HTTP server ───────────────────────────────────────────────────────
const server = http.createServer((req, res) => {
  if (req.method !== "POST") {
    res.statusCode = 405;
    return res.end("Method Not Allowed");
  }
  let chunks = [];
  req.on("data", (c) => chunks.push(c));
  req.on("end", () => {
    const raw = Buffer.concat(chunks).toString("utf8");
    const sig = req.headers["x-psicomorfosis-signature"] ?? "";
    const event = req.headers["x-psicomorfosis-event"] ?? "?";
    const ws = req.headers["x-psicomorfosis-workspace"] ?? "?";

    if (!verify(raw, sig, OUTBOUND_SECRET)) {
      console.log(`[bot] ✗ 401 firma inválida — event=${event} ws=${ws}`);
      res.statusCode = 401;
      return res.end(JSON.stringify({ error: "Bad signature" }));
    }

    let body;
    try { body = JSON.parse(raw); }
    catch {
      res.statusCode = 400;
      return res.end(JSON.stringify({ error: "Invalid JSON" }));
    }

    console.log(`\n[bot] ✓ ${body.event} ws=${body.workspace_id}`);
    console.log(`      to: ${body.recipient.kind} ${body.recipient.phone} (${body.recipient.name})`);
    console.log(`      idempotency_key: ${body.idempotency_key ?? "(none)"}`);
    console.log(`      ──── mensaje ────`);
    for (const line of String(body.rendered_message ?? "").split("\n")) {
      console.log(`      ${line}`);
    }
    console.log(`      ─────────────────`);

    res.statusCode = 200;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ ok: true, message_id: `mock-${Date.now()}` }));
  });
});

server.listen(PORT, () => {
  console.log(`[bot] mock de messaging escuchando en http://localhost:${PORT}`);
  console.log(`[bot] outbound secret OK (sha256 prefix=${crypto.createHash("sha256").update(OUTBOUND_SECRET).digest("hex").slice(0, 8)})`);
  console.log(`[bot] esperando POST /inbound de Psicomorfosis...\n`);
});

// ── Simulación de webhook entrante ───────────────────────────────────
async function simulateInbound(body) {
  const raw = JSON.stringify(body);
  const t = Math.floor(Date.now() / 1000);
  const sig = crypto.createHmac("sha256", INBOUND_SECRET).update(`${t}.${raw}`).digest("hex");
  const url = `${APP_URL.replace(/\/$/, "")}/api/webhooks/messaging`;
  console.log(`[bot→app] POST ${url}`);
  console.log(`           event=${body.event} phone=${body.phone}`);
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Psicomorfosis-Signature": `t=${t},v1=${sig}`,
    },
    body: raw,
  });
  const respBody = await res.text();
  console.log(`           ← ${res.status} ${respBody}`);
}
