/**
 * Captador global de errores del frontend.
 *
 * Hace dos cosas:
 *   1. Se engancha a `window.onerror` y `window.onunhandledrejection`
 *      y mantiene en memoria los últimos N errores capturados, para
 *      que el modal de "Reportar problema" pueda mostrárselos al
 *      usuario y mandarlos junto a su descripción.
 *   2. Expone helpers `submitErrorReport()` para mandar reportes al
 *      backend (POST /api/error-reports — endpoint público).
 *
 * Filosofía: los errores siempre se guardan en memoria; el envío al
 * backend SOLO ocurre cuando el usuario explícitamente reporta. Así
 * evitamos enviar telemetría sin consentimiento.
 *
 * Si después queremos auto-envío de errores, basta con llamar
 * submitErrorReport({ kind: "auto", ... }) desde el handler — pero
 * ahora mismo no lo hacemos por respeto al usuario y para no llenar
 * la BD con duplicados.
 */

import { getToken } from "./api";

export type CapturedError = {
  message: string;
  stack: string | null;
  url: string;
  ts: number;
};

const MAX_CAPTURED = 5;
const captured: CapturedError[] = [];

/** Devuelve copia inmutable de los errores capturados (más recientes primero). */
export function getCapturedErrors(): CapturedError[] {
  return [...captured].reverse();
}

/** Limpia el buffer (útil después de enviar un reporte exitoso). */
export function clearCapturedErrors() {
  captured.length = 0;
}

function record(message: string, stack: string | null) {
  captured.push({
    message: message.slice(0, 1000),
    stack: stack ? stack.slice(0, 4000) : null,
    url: typeof window !== "undefined" ? window.location.href : "",
    ts: Date.now(),
  });
  // Mantenemos solo los últimos N — los reportes deberían ser sobre
  // errores recientes, no sobre algo que pasó al inicio de la sesión.
  while (captured.length > MAX_CAPTURED) captured.shift();
}

let installed = false;

/** Instala los handlers globales. Idempotente. */
export function installErrorReporter() {
  if (installed || typeof window === "undefined") return;
  installed = true;

  window.addEventListener("error", (e) => {
    const err = e.error;
    record(
      err?.message ?? e.message ?? "Unknown error",
      err?.stack ?? null,
    );
  });

  window.addEventListener("unhandledrejection", (e) => {
    const reason = e.reason;
    record(
      reason?.message ?? String(reason ?? "Unhandled promise rejection"),
      reason?.stack ?? null,
    );
  });
}

/** Payload que recibe el endpoint POST /api/error-reports. */
export type ErrorReportPayload = {
  kind?: "manual" | "auto";
  url?: string;
  message?: string;
  stack?: string;
  user_description?: string;
  user_agent?: string;
  /** Adjuntos (capturas de pantalla normalmente). Máximo 5, máx 5 MB c/u. */
  attachments?: File[];
};

export type SubmitResult = { id?: number; attachments?: string[] };

/**
 * Envía un reporte al backend. Funciona sin token (anónimo); si hay
 * token activo lo mandamos para que el backend asocie al user.
 *
 * Si hay attachments usa multipart/form-data. Si no, JSON (más liviano
 * y mantiene compatibilidad con clientes legacy).
 */
export async function submitErrorReport(payload: ErrorReportPayload): Promise<SubmitResult> {
  const headers: Record<string, string> = {};
  const tok = getToken();
  if (tok) headers["Authorization"] = `Bearer ${tok}`;

  const url = payload.url ?? (typeof window !== "undefined" ? window.location.href : undefined);
  const userAgent = payload.user_agent ?? (typeof navigator !== "undefined" ? navigator.userAgent : undefined);

  let body: BodyInit;
  if (payload.attachments && payload.attachments.length > 0) {
    // Multipart: el browser pone Content-Type con boundary automáticamente,
    // NO debemos setearlo manualmente.
    const fd = new FormData();
    if (payload.kind) fd.append("kind", payload.kind);
    if (url) fd.append("url", url);
    if (payload.message) fd.append("message", payload.message);
    if (payload.stack) fd.append("stack", payload.stack);
    if (payload.user_description) fd.append("user_description", payload.user_description);
    if (userAgent) fd.append("user_agent", userAgent);
    for (const file of payload.attachments) {
      fd.append("attachments", file, file.name);
    }
    body = fd;
  } else {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify({
      kind: payload.kind,
      url,
      message: payload.message,
      stack: payload.stack,
      user_description: payload.user_description,
      user_agent: userAgent,
    });
  }

  const res = await fetch("/api/error-reports", {
    method: "POST",
    headers,
    body,
  });
  if (!res.ok && res.status !== 202) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error ?? "No se pudo enviar el reporte");
  }
  return res.json().catch(() => ({}));
}
