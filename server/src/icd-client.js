/**
 * Cliente de la API CIE-11 de la OMS.
 *
 * Permite búsqueda live de códigos CIE-11 desde el bloque "Impresión
 * diagnóstica", complementando el catálogo curado local. La psicóloga
 * ve primero los ~32 dx más comunes (catálogo local, búsqueda instantánea)
 * y opcionalmente puede expandir a TODA la clasificación CIE-11 con un
 * "buscar más en OMS".
 *
 * Autenticación: OAuth2 client_credentials grant. El access_token tiene
 * TTL de ~1 hora; lo cacheamos en memoria y lo refrescamos solo cuando
 * está por expirar. No persiste entre restarts del server (es trivial
 * volver a pedirlo).
 *
 * Configuración (.env):
 *   ICD_CLIENT_ID=...
 *   ICD_CLIENT_SECRET=...
 *
 * Si las credenciales no están seteadas, el módulo expone null como
 * search() y los endpoints proxy responden 503 "ICD no configurado",
 * sin romper nada.
 *
 * Docs: https://icd.who.int/docs/icd-api/APIDoc-Version2/
 */

const TOKEN_URL = "https://icdaccessmanagement.who.int/connect/token";
const API_BASE = "https://id.who.int";
const SCOPE = "icdapi_access";
// Versión actual del archivo MMS (Morbidity & Mortality Statistics) —
// es la que usan EPS/IPS para reportes. Si la OMS publica una nueva
// versión y queremos saltar, basta cambiar acá.
const ICD_RELEASE = "2024-01";

function getCreds() {
  return {
    clientId: process.env.ICD_CLIENT_ID,
    clientSecret: process.env.ICD_CLIENT_SECRET,
  };
}

export function isIcdConfigured() {
  const { clientId, clientSecret } = getCreds();
  return !!(clientId && clientSecret);
}

// ─── Token cache ─────────────────────────────────────────────────────

let _token = null;       // string actual
let _tokenExpiresAt = 0; // epoch ms

async function getAccessToken() {
  // Margen de 60s antes de expirar para evitar requests con token muerto.
  if (_token && Date.now() < _tokenExpiresAt - 60_000) return _token;

  const { clientId, clientSecret } = getCreds();
  if (!clientId || !clientSecret) {
    throw new Error("ICD_CLIENT_ID / ICD_CLIENT_SECRET no configurados");
  }

  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: clientId,
    client_secret: clientSecret,
    scope: SCOPE,
  });

  const resp = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    // El endpoint de la OMS suele responder en <500ms; 10s da margen
    // amplio sin colgar el server si su servicio está lento.
    signal: AbortSignal.timeout(10_000),
  });

  if (!resp.ok) {
    const txt = await resp.text().catch(() => "");
    throw new Error(`ICD token request ${resp.status}: ${txt.slice(0, 200)}`);
  }

  const json = await resp.json();
  if (!json.access_token) {
    throw new Error("ICD token response sin access_token");
  }
  _token = json.access_token;
  // expires_in viene en segundos. Convertimos a epoch ms.
  _tokenExpiresAt = Date.now() + (Number(json.expires_in ?? 3600) * 1000);
  return _token;
}

// ─── Search ──────────────────────────────────────────────────────────

/**
 * Busca términos en CIE-11 (capítulo MMS, español si está disponible).
 *
 * @param {string} query - Texto a buscar (libre, ej "ansiedad social", "F41.1", "trastorno depresivo")
 * @param {object} [opts]
 * @param {string} [opts.lang='es'] - Idioma preferido en el Accept-Language
 * @param {number} [opts.limit=10] - Máximo de resultados a devolver
 * @returns {Promise<Array<{ code: string; name: string; chapter?: string; isLeaf?: boolean }>>}
 */
export async function searchIcd11(query, opts = {}) {
  const { lang = "es", limit = 10 } = opts;
  const q = String(query ?? "").trim();
  if (!q) return [];

  const token = await getAccessToken();
  const url = new URL(`${API_BASE}/icd/release/11/${ICD_RELEASE}/mms/search`);
  url.searchParams.set("q", q);
  // useFlexisearch=true permite búsqueda con tolerancia a typos / palabras
  // parciales. flatResults=true devuelve la lista plana sin jerarquía.
  url.searchParams.set("useFlexisearch", "true");
  url.searchParams.set("flatResults", "true");

  const resp = await fetch(url, {
    headers: {
      "Authorization": `Bearer ${token}`,
      "Accept": "application/json",
      "Accept-Language": lang,
      "API-Version": "v2",
    },
    signal: AbortSignal.timeout(10_000),
  });

  if (!resp.ok) {
    const txt = await resp.text().catch(() => "");
    throw new Error(`ICD search ${resp.status}: ${txt.slice(0, 200)}`);
  }

  const json = await resp.json();
  const entities = Array.isArray(json?.destinationEntities) ? json.destinationEntities : [];

  // Normalizamos a la forma que consume el frontend. theCode puede traer
  // tags HTML <em> (highlighting de la búsqueda) — los limpiamos.
  const results = entities.slice(0, limit).map((e) => ({
    code: stripHtml(String(e.theCode ?? "")),
    name: stripHtml(String(e.title ?? "")),
    chapter: stripHtml(String(e.chapter ?? "")),
    isLeaf: !!e.isLeaf,
    // URL canónica del concepto en la OMS (útil para enlazar en el futuro).
    id: typeof e.id === "string" ? e.id : null,
  })).filter((r) => r.code && r.name);

  return results;
}

function stripHtml(s) {
  return s.replace(/<[^>]+>/g, "");
}

/** Para debug en arranque: imprime si ICD está configurado. */
export function logIcdStatus() {
  if (isIcdConfigured()) {
    console.log("[icd] cliente ICD-11 OMS listo (credenciales presentes)");
  } else {
    console.warn("[icd] ICD-11 NO configurado — el catálogo curado funciona, pero no hay búsqueda live OMS. Setea ICD_CLIENT_ID/SECRET en .env.");
  }
}
