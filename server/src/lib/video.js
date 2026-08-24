import crypto from "node:crypto";
import { db } from "../db.js";

/**
 * Videollamada de una cita online.
 *
 * Jitsi Meet: la reunión ES la URL. No hay cuenta, no hay OAuth, no hay
 * verificación de Google; quien abre el enlace entra. La sala lleva un
 * nombre aleatorio imposible de adivinar — nunca el nombre del paciente,
 * que quedaría en el historial del navegador y en los logs de Jitsi.
 *
 * VIDEO_BASE_URL permite cambiar a un Jitsi propio (p. ej.
 * https://video.psicomorfosis.co) sin tocar código.
 */
const baseUrl = () => (process.env.VIDEO_BASE_URL || "https://meet.jit.si").replace(/\/$/, "");

export const isTele = (modality) => modality === "tele" || modality === "virtual";

export function newMeetingUrl() {
  // 9 bytes → 12 caracteres url-safe. Prefijo para que se reconozca en
  // la lista de salas del navegador y para no chocar con salas ajenas.
  const room = "Psicomorfosis-" + crypto.randomBytes(9).toString("base64url").replace(/[-_]/g, "x");
  return `${baseUrl()}/${room}`;
}

/**
 * Garantiza que una cita online tenga enlace; si la cita dejó de ser
 * online, lo quita. Devuelve la fila actualizada. Idempotente: llamarla
 * dos veces no cambia el enlace (el paciente ya lo recibió por correo).
 */
export function ensureMeetingUrl(row) {
  if (!row) return row;
  if (isTele(row.modality)) {
    if (row.meeting_url) return row;
    const url = newMeetingUrl();
    db.prepare("UPDATE appointments SET meeting_url = ?, video_provider = 'jitsi' WHERE id = ?").run(url, row.id);
    return { ...row, meeting_url: url, video_provider: "jitsi" };
  }
  if (row.meeting_url) {
    db.prepare("UPDATE appointments SET meeting_url = NULL, video_provider = NULL WHERE id = ?").run(row.id);
    return { ...row, meeting_url: null, video_provider: null };
  }
  return row;
}
