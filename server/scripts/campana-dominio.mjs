/**
 * Campaña: cambio de dominio a psicomorfosis.co (+ novedades).
 *
 * Uso (en el VPS, dentro de ~/apps/psicomorfosis):
 *   node server/scripts/campana-dominio.mjs                 → DRY RUN: lista destinatarios, no envía
 *   node server/scripts/campana-dominio.mjs --send          → envía de verdad, uno a uno, con pausa
 *   node server/scripts/campana-dominio.mjs --send --only=correo@x.com   → prueba con un solo destinatario
 *
 * Por qué un script y no una herramienta de email marketing: son ~12
 * personas reales. Un envío individual desde nuestro Mailcow, con pausa
 * entre correos, llega mejor que un BCC masivo (que dispara filtros).
 *
 * Excluye cuentas demo/internas y pacientes. Marca en `campaign_log`
 * quién recibió qué, así re-ejecutar no duplica.
 */
import "dotenv/config";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import nodemailer from "nodemailer";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, "..", "data.db");
const db = new Database(DB_PATH);

const SEND = process.argv.includes("--send");
const ONLY = (process.argv.find((a) => a.startsWith("--only=")) || "").split("=")[1]?.toLowerCase();
const CAMPAIGN = "dominio-2026-08";
const APP = "https://psicomorfosis.co";

// Cuentas que NO reciben: demo, internas, las del propio Stiven.
const EXCLUDE = new Set([
  "psicologo.demo@psicomorfosis.co",
  "admin@miclinica.co",
  "stivenantequera@gmail.com",
  "stivenatequera@gmail.com",
  "legal@psicomorfosis.co",
  // Cuentas de prueba (revisor de Google, pruebas de OAuth).
  "revisor.google@psicomorfosis.co",
  "oauthtestks@gmail.com",
]);

db.exec(`CREATE TABLE IF NOT EXISTS campaign_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  campaign TEXT NOT NULL,
  user_id INTEGER NOT NULL,
  email TEXT NOT NULL,
  status TEXT NOT NULL,
  error TEXT,
  sent_at TEXT DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(campaign, user_id)
)`);

const rows = db.prepare(`
  SELECT u.id, u.name, u.email, u.username, u.last_login_at, u.auth_provider,
         (SELECT COUNT(*) FROM patients p WHERE p.workspace_id = u.workspace_id) AS pacientes
  FROM users u
  WHERE u.role <> 'paciente' AND u.is_legal_admin = 0
    AND u.email IS NOT NULL AND u.email LIKE '%@%'
  ORDER BY u.last_login_at DESC NULLS LAST
`).all().filter((r) => ONLY ? true : !EXCLUDE.has(r.email.toLowerCase())); // con --only se permite probar con una excluida (la de Stiven)

const already = new Set(db.prepare("SELECT user_id FROM campaign_log WHERE campaign = ? AND status = 'sent'").all(CAMPAIGN).map((r) => r.user_id));
const targets = rows.filter((r) => !already.has(r.id)).filter((r) => !ONLY || r.email.toLowerCase() === ONLY);

console.log(`Campaña ${CAMPAIGN} — ${SEND ? "ENVÍO REAL" : "dry run"}`);
console.table(targets.map((r) => ({
  id: r.id, email: r.email, nombre: r.name,
  entró: r.last_login_at ? r.last_login_at.slice(0, 10) : "nunca",
  pacientes: r.pacientes,
})));
if (!SEND) { console.log("\nNada enviado. Añade --send para enviar."); process.exit(0); }

const c = {
  host: process.env.SMTP_HOST, port: Number(process.env.SMTP_PORT ?? 465),
  secure: String(process.env.SMTP_SECURE ?? "true") === "true",
  user: process.env.SMTP_USER, pass: process.env.SMTP_PASS,
};
if (!c.host || !c.user || !c.pass) { console.error("SMTP no configurado en .env"); process.exit(1); }
const transport = nodemailer.createTransport({ host: c.host, port: c.port, secure: c.secure, auth: { user: c.user, pass: c.pass } });
const FROM = process.env.CAMPAIGN_FROM || `Stiven de Psicomorfosis <${process.env.SMTP_FROM || c.user}>`;
const REPLY_TO = process.env.CAMPAIGN_REPLY_TO || "hola@psicomorfosis.co";

function html({ name, neverLoggedIn, username }) {
  const first = String(name || "").split(" ")[0];
  const reinvite = neverLoggedIn ? `
    <p style="font-size:15px;line-height:1.6;margin:0 0 16px;padding:12px 14px;background:#F7F8F6;border:1px solid #E3E8E6;border-radius:10px">
      Vi que aún no has entrado. Tu cuenta sigue activa y es gratuita — tu usuario es <strong>${username}</strong>.
      Si no recuerdas la contraseña, en el login está <strong>«¿Olvidaste la contraseña?»</strong>: te llega un enlace al correo y la cambias en un minuto.
    </p>` : "";
  return `
  <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:560px;margin:0 auto;color:#1f2937">
    <div style="background:#2E5F66;padding:24px 32px;border-radius:14px 14px 0 0">
      <div style="color:#fff;font-size:20px;font-weight:600;letter-spacing:-.01em">Psicomorfosis</div>
    </div>
    <div style="border:1px solid #E3E8E6;border-top:none;border-radius:0 0 14px 14px;padding:28px 32px">
      <p style="font-size:15px;line-height:1.6;margin:0 0 14px">Hola${first ? " " + first : ""},</p>
      <p style="font-size:15px;line-height:1.6;margin:0 0 14px">
        Te escribo porque Psicomorfosis estrena casa: desde hoy vive en
        <a href="${APP}" style="color:#2E5F66;font-weight:600">psicomorfosis.co</a>.
      </p>
      <p style="font-size:15px;line-height:1.6;margin:0 0 14px">
        Nada cambia en tu cuenta: mismo usuario, misma contraseña, mismos pacientes e historias. Solo cambia la dirección.
        La antigua te redirige sola, pero conviene que actualices el favorito. La primera vez que entres por la nueva
        dirección te pedirá iniciar sesión de nuevo — es normal, la sesión va atada al dominio.
      </p>
      ${reinvite}
      <p style="font-size:15px;line-height:1.6;margin:0 0 8px">Y las novedades que llegan con el cambio:</p>
      <ul style="font-size:15px;line-height:1.7;margin:0 0 18px;padding-left:20px">
        <li><strong>Entrar con Google</strong>, con un clic, si lo prefieres (y recuperar la contraseña tú mismo desde el login).</li>
        <li><strong>Google Calendar y Meet</strong>: conecta tu calendario en Configuración y cada cita aparece allí; las citas online traen su enlace de Meet, que le llega al paciente por correo y WhatsApp.</li>
        <li><strong>Tu enlace público de reservas</strong> (psicomorfosis.co/perfil/tu-nombre): tus pacientes piden cita y tú la confirmas desde la agenda con un clic.</li>
        <li><strong>Laura por WhatsApp</strong>: pon tu número en tu perfil y te avisa de reservas, confirmaciones y recordatorios; tus pacientes reciben los suyos.</li>
      </ul>
      <a href="${APP}/login" style="display:inline-block;background:#2E5F66;color:#fff;text-decoration:none;padding:12px 26px;border-radius:10px;font-weight:600;font-size:14px">Entrar a psicomorfosis.co</a>
      <p style="font-size:13px;line-height:1.6;color:#6b7280;margin:24px 0 0">Si algo no te funciona, responde a este correo y lo miro yo.<br>Stiven</p>
    </div>
    <p style="font-size:11px;color:#9ca3af;text-align:center;margin:16px 0 0">Psicomorfosis · Plataforma clínica para psicólogos</p>
  </div>`;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = db.prepare("INSERT OR REPLACE INTO campaign_log (campaign, user_id, email, status, error) VALUES (?, ?, ?, ?, ?)");

for (const r of targets) {
  try {
    await transport.sendMail({
      from: FROM, to: r.email, replyTo: REPLY_TO,
      subject: "Psicomorfosis estrena casa: psicomorfosis.co",
      html: html({ name: r.name, neverLoggedIn: !r.last_login_at, username: r.username }),
    });
    log.run(CAMPAIGN, r.id, r.email, "sent", null);
    console.log(`✓ ${r.email}`);
  } catch (e) {
    log.run(CAMPAIGN, r.id, r.email, "failed", String(e?.message ?? e).slice(0, 300));
    console.log(`✗ ${r.email} — ${e?.message}`);
  }
  await sleep(4000 + Math.random() * 3000);
}
console.log("\nListo. Resumen:");
console.table(db.prepare("SELECT status, COUNT(*) n FROM campaign_log WHERE campaign = ? GROUP BY status").all(CAMPAIGN));
