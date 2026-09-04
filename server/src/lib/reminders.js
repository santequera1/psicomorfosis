/**
 * Scheduler de recordatorios de cita por WhatsApp (P0 del handoff del
 * bot, 26-ago → implementado 4-sep-2026).
 *
 * Cada 5 minutos barre las citas pendientes/confirmadas de hoy y mañana
 * (hora Colombia) y dispara al bot:
 *   - appointment.reminder.24h → pide confirmación SÍ/NO
 *   - appointment.reminder.1h  → recordatorio final, con enlace si es tele
 *
 * Idempotencia en dos capas: un Set en memoria evita reposts del mismo
 * proceso, y el idempotency_key estable (evt_appt<id>_<fecha>_<h>) hace
 * que el bot dedupe entre reinicios. Solo pacientes con opt-in de
 * WhatsApp (canPush del lado de psicobot vuelve a validar).
 */
import { db } from "../db.js";
import { notifyAppointmentReminder } from "./psicobot.js";

// Ventanas en minutos hasta el inicio de la cita.
const WINDOWS = [
  { horizon: "24h", min: 1410, max: 1470 }, // 23.5h – 24.5h
  { horizon: "1h", min: 45, max: 75 },      // 45 – 75 min
];

const sentKeys = new Set(); // dedupe por proceso; el bot dedupe global

export function runReminderSweep() {
  const now = Date.now();
  const rows = db.prepare(`
    SELECT a.id, a.workspace_id, a.date, a.time, a.modality, a.meeting_url, a.professional,
           p.name AS patient_name, p.preferred_name, p.phone, p.whatsapp_opt_in
    FROM appointments a
    JOIN patients p ON p.id = a.patient_id
    WHERE a.status IN ('pendiente', 'confirmada')
      AND a.date >= date('now', '-5 hours')
      AND a.date <= date('now', '-5 hours', '+2 days')
      AND p.phone IS NOT NULL AND p.phone != ''
      AND p.whatsapp_opt_in = 1
  `).all();

  let sent = 0;
  for (const r of rows) {
    const start = Date.parse(`${r.date}T${r.time}:00-05:00`);
    if (Number.isNaN(start)) continue;
    const minutes = (start - now) / 60_000;
    for (const w of WINDOWS) {
      if (minutes <= w.min || minutes > w.max) continue;
      const key = `evt_appt${r.id}_${r.date}_${w.horizon}`;
      if (sentKeys.has(key)) continue;
      sentKeys.add(key);
      notifyAppointmentReminder({
        patient: { name: r.patient_name, preferred_name: r.preferred_name, phone: r.phone, whatsapp_opt_in: r.whatsapp_opt_in },
        appointment: { id: r.id, workspace_id: r.workspace_id, date: r.date, time: r.time, modality: r.modality, meeting_url: r.meeting_url },
        professionalName: r.professional,
        horizon: w.horizon,
      });
      sent++;
    }
  }
  // El Set no debe crecer sin tope en un proceso de semanas.
  if (sentKeys.size > 5000) sentKeys.clear();
  if (sent > 0) console.log(`[reminders] ${sent} recordatorio(s) despachados al bot`);
}

export function startReminderScheduler() {
  setTimeout(() => {
    try { runReminderSweep(); } catch (e) { console.warn("[reminders]", e?.message); }
  }, 30_000);
  setInterval(() => {
    try { runReminderSweep(); } catch (e) { console.warn("[reminders]", e?.message); }
  }, 5 * 60_000);
  console.log("[reminders] scheduler activo (barrido cada 5 min)");
}
