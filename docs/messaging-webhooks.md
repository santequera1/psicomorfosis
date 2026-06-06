# Contrato Psicomorfosis ↔ Bot externo (Messaging)

Versión: **1.0** (5 jun 2026)
Owner: Stiven (dev@dtgrowthpartners.com)

Este documento describe el contrato HTTP que usa Psicomorfosis para
comunicarse con un bot externo de mensajería (WhatsApp/Telegram/etc).
**Psicomorfosis no habla con WHAPI/Meta directamente.** Solo emite
eventos firmados a una URL configurable y recibe webhooks del bot.

Esto te permite cambiar de WHAPI a Meta Cloud API, a Twilio o a 360Dialog
sin tocar Psicomorfosis — solo cambia el bot.

---

## 1. Configuración

En el `.env` del server de Psicomorfosis:

```bash
# Habilita el módulo globalmente. Si está vacío o no es "1", todos los
# envíos quedan registrados con status="skipped_disabled" pero NO se
# envían al bot. Útil en staging para dry-run.
MESSAGING_ENABLED=1

# URL del bot que recibe los POST de Psicomorfosis con cada evento.
MESSAGING_BOT_URL=https://tubot.com/inbound/psicomorfosis

# Secret compartido con el bot para firmar requests salientes (HMAC-SHA256).
# Genéralo con: openssl rand -hex 32
MESSAGING_OUTBOUND_SECRET=<64 hex chars>

# Secret compartido con el bot para verificar webhooks entrantes.
# Puede ser distinto del outbound para rotar separadamente.
MESSAGING_INBOUND_SECRET=<64 hex chars>

# Prefijo telefónico por defecto cuando un patient.phone no incluye "+".
MESSAGING_DEFAULT_COUNTRY=+57

# (Opcional) URLs que se inyectan en las plantillas como {{portal_url}}
# y {{app_url}}. Si no se setean, default es https://psico.wailus.co
PUBLIC_PORTAL_URL=https://psico.wailus.co
PUBLIC_APP_URL=https://psico.wailus.co
```

---

## 2. Firma HMAC (estilo Stripe)

Ambos lados (saliente y entrante) usan el mismo esquema.

**Header:**

```
X-Psicomorfosis-Signature: t=<unix_seconds>,v1=<hex_hmac>
```

**Cálculo:**

```js
const t = Math.floor(Date.now() / 1000);            // unix seconds
const payload = `${t}.${rawBody}`;                  // concatenación literal
const v1 = crypto
  .createHmac("sha256", SECRET)
  .update(payload)
  .digest("hex");                                    // 64 chars
const header = `t=${t},v1=${v1}`;
```

**Reglas de verificación:**

1. El header debe parsearse como `t=<num>,v1=<hex>`.
2. `t` debe estar dentro de **±300 segundos (5 minutos)** del `now()` del receptor.
3. El HMAC recalculado debe coincidir con `v1` en **tiempo constante** (`crypto.timingSafeEqual` en Node).

**Implementación de referencia (Node):**

```js
function verify(rawBody, header, secret) {
  const parts = Object.fromEntries(header.split(",").map(s => s.split("=")));
  const t = Number(parts.t);
  if (!Number.isFinite(t) || Math.abs(Date.now() / 1000 - t) > 300) return false;
  const expected = crypto.createHmac("sha256", secret).update(`${t}.${rawBody}`).digest("hex");
  const a = Buffer.from(expected, "hex");
  const b = Buffer.from(parts.v1, "hex");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
```

**Importante:** el body debe firmarse y verificarse como el **string exacto**
que se manda por la red, sin re-serializar JSON. Si el bot recibe el body
con `express.json()` y luego intenta firmarlo con `JSON.stringify(req.body)`,
**la firma fallará** por whitespace o orden de keys.

Usa `express.raw({ type: "application/json" })` y guarda el buffer original.

---

## 3. Eventos SALIENTES (Psicomorfosis → Bot)

Psicomorfosis hace `POST` a `MESSAGING_BOT_URL` con uno de los 14 eventos
del catálogo (ver §6). El bot debe:

1. **Verificar la firma** (§2).
2. **Responder 2xx** rápido. Cualquier procesamiento pesado debe ir en background.
3. **No reintentar** lado bot — Psicomorfosis ya reintenta hasta 3 veces en 5xx/timeout.

### 3.1 Headers

| Header | Valor | Notas |
|---|---|---|
| `Content-Type` | `application/json` | Siempre |
| `X-Psicomorfosis-Signature` | `t=<unix>,v1=<hmac>` | §2 |
| `X-Psicomorfosis-Event` | nombre del evento | Para enrutamiento rápido sin parsear body |
| `X-Psicomorfosis-Workspace` | ID numérico | Para enrutamiento sin parsear body |

### 3.2 Body

```json
{
  "event": "appointment.reminder.24h",
  "workspace_id": 1,
  "sent_at": "2026-06-06T14:00:00.000Z",
  "idempotency_key": "appt-67-reminder-24h",
  "recipient": {
    "kind": "patient",
    "id": "P-1000",
    "phone": "+573041234567",
    "name": "Giannlucas Tamayo"
  },
  "data": {
    "patient": {
      "id": "P-1000",
      "full_name": "Giannlucas Tamayo Giraldo",
      "preferred_name": "",
      "first_name": "Giannlucas"
    },
    "appointment": {
      "id": 67,
      "date": "2026-06-07",
      "date_human": "7 de junio de 2026",
      "time": "10:00",
      "duration_min": 50,
      "modality": "individual",
      "modality_human": "presencial individual",
      "room": "Consultorio A",
      "room_suffix": " · Consultorio A"
    }
  },
  "rendered_message": "Hola Giannlucas 👋\n\nTe recuerdo tu sesión...",
  "meta": {
    "sender_label": "Dra. Nathaly",
    "app": "psicomorfosis",
    "version": 1
  }
}
```

### 3.3 Campos siempre presentes

| Campo | Tipo | Notas |
|---|---|---|
| `event` | string | Uno de §6 |
| `workspace_id` | number | ID interno del psicólogo en Psicomorfosis |
| `sent_at` | ISO 8601 | Momento del envío server-side |
| `idempotency_key` | string \| null | Si llega el mismo dos veces, Psicomorfosis ya lo dedupea. El bot **puede** usarlo para deduplicar su propio envío a WhatsApp si quiere extra seguridad. |
| `recipient.kind` | `"patient"` \| `"professional"` | A quién va |
| `recipient.id` | string \| number | `patient_id` o `user_id` |
| `recipient.phone` | string E.164 | Ya viene normalizado (`+57...`) |
| `recipient.name` | string | Para que el bot pueda usarlo en logs |
| `data` | object | Específico del evento (ver §6) |
| `rendered_message` | string | Texto **ya renderizado** que el bot debe enviar tal cual. Las plantillas las maneja Psicomorfosis. |
| `meta.sender_label` | string | Cómo firma el psicólogo (p. ej. "Dra. Nathaly") |

### 3.4 Respuesta esperada del bot

**Caso normal:**
```json
HTTP/1.1 200 OK
Content-Type: application/json

{ "ok": true, "message_id": "wamid.HBgL..." }
```

`message_id` es opcional. Si el bot te lo provee, podrías guardarlo en
auditoría (campo no implementado en v1 pero el contrato lo permite).

**Errores que el bot puede devolver:**

| Status | Significado | ¿Psicomorfosis reintenta? |
|---|---|---|
| `2xx` | Aceptado | No |
| `400` | Body mal formado | **No** — error nuestro, no reintentar |
| `401`/`403` | Firma inválida | **No** |
| `404` | Bot no reconoce el evento | **No** |
| `409` | Mensaje duplicado (idempotency) | No (también es éxito) |
| `429` | Rate limited | **Sí** (3 intentos con backoff 300ms / 1.5s / 5s) |
| `5xx` | Error en bot | **Sí** (3 intentos) |

### 3.5 Reintentos del lado Psicomorfosis

3 intentos con backoff `[300, 1500, 5000]` ms + jitter <250ms. Timeout
por intento: 10 s. Tras agotar, el `messaging_outbound_log.status` queda
en `"failed"` y el psicólogo ve el error en su panel.

---

## 4. Webhooks ENTRANTES (Bot → Psicomorfosis)

El bot hace `POST` a:

```
https://psico.wailus.co/api/webhooks/messaging
```

### 4.1 Headers

| Header | Valor |
|---|---|
| `Content-Type` | `application/json` |
| `X-Psicomorfosis-Signature` | `t=<unix>,v1=<hmac>` (con `MESSAGING_INBOUND_SECRET`) |

### 4.2 Body

```json
{
  "event_id": "<uuid>",
  "event": "patient_opt_out" | "patient_confirmed" | "patient_cancelled" | "patient_reply" | "delivery_status" | "clinical_risk_signal",
  "workspace_id": 1,
  "occurred_at": "2026-06-06T14:15:00.000Z",
  "phone": "+573041234567",
  "payload": { ... }
}
```

- `event_id` (string, **requerido**): UUID único por evento. Si el bot
  reintenta el mismo `event_id`, Psicomorfosis responde 200 con
  `{ "ok": true, "deduped": true }` sin reprocesar.
- `workspace_id` (number, opcional pero recomendado): facilita el routing.
- `phone` (string E.164): número del paciente. Psicomorfosis lo usa para
  encontrar al paciente correspondiente vía sufijo de 10 dígitos.

### 4.3 Tipos de evento entrantes

#### `patient_opt_out`
El paciente respondió `STOP` / `PARAR` / `BAJA` a un mensaje. Psicomorfosis
marca `patients.whatsapp_opt_in = 0` y `whatsapp_opt_out_at = now()`. A
partir de ese momento ningún evento se le envía hasta que reactive vía
portal o nueva activación explícita.

```json
{
  "event_id": "evt-01HXYZ...",
  "event": "patient_opt_out",
  "workspace_id": 1,
  "phone": "+573041234567",
  "payload": { "raw_text": "STOP" }
}
```

#### `patient_confirmed`
Paciente respondió `SÍ` / `CONFIRMO` a un recordatorio. v1: solo se
registra en `messaging_inbound_events`. v2: marcará la cita como
`confirmada` por el `idempotency_key` del recordatorio original.

```json
{
  "event_id": "...",
  "event": "patient_confirmed",
  "workspace_id": 1,
  "phone": "+573041234567",
  "payload": {
    "in_response_to": "appt-67-reminder-24h",
    "appointment_id": 67
  }
}
```

#### `patient_cancelled`
Inverso: paciente respondió `NO` / `CANCELAR`. Mismo schema que
`patient_confirmed`.

#### `patient_reply`
Texto libre. v1: solo audit log. El bot probablemente lo procesa con
su IA y solo envía a Psicomorfosis los casos que requieran acción
clínica.

```json
{
  "event_id": "...",
  "event": "patient_reply",
  "workspace_id": 1,
  "phone": "+573041234567",
  "payload": {
    "text": "Doctora, ¿podríamos cambiar la cita?",
    "in_response_to": null
  }
}
```

#### `delivery_status`
Ack del proveedor (WhatsApp Business / WHAPI). v1: solo audit log.

```json
{
  "event_id": "...",
  "event": "delivery_status",
  "phone": "+573041234567",
  "payload": {
    "outbound_log_id": 12345,
    "status": "sent" | "delivered" | "read" | "failed"
  }
}
```

#### `clinical_risk_signal`
Tu bot detectó (con IA, regex, o lo que sea) algo que parece riesgo
clínico en un mensaje del paciente. Psicomorfosis lo registra y a futuro
disparará alerta al psicólogo.

```json
{
  "event_id": "...",
  "event": "clinical_risk_signal",
  "workspace_id": 1,
  "phone": "+573041234567",
  "payload": {
    "severity": "high" | "medium" | "low",
    "category": "suicidal_ideation" | "self_harm" | "psychosis" | "other",
    "snippet": "no puedo más, ya no quiero...",
    "confidence": 0.92
  }
}
```

### 4.4 Respuestas de Psicomorfosis

| Status | Significado |
|---|---|
| `200 { ok: true }` | Aceptado y procesado |
| `200 { ok: true, deduped: true }` | Aceptado y deduplicado (no reproceses) |
| `400` | Body mal formado o falta `event_id`/`event` |
| `401` | Firma inválida o timestamp viejo |
| `503` | `MESSAGING_INBOUND_SECRET` no está configurado en el server |

---

## 5. Opt-in del paciente

Habeas Data (Ley 1581/2012 art. 8c) exige consentimiento **previo,
expreso e informado**. Reglas en Psicomorfosis:

1. Por defecto `patients.whatsapp_opt_in = 0`. **Sin opt-in, no se envía nada.**
2. El paciente acepta vía `POST /api/portal/me/whatsapp-opt-in` desde su portal,
   o (a futuro) vía checkbox al activar su cuenta.
3. El paciente puede revocar vía `POST /api/portal/me/whatsapp-opt-out` o
   respondiendo `STOP`/`PARAR` por WhatsApp (webhook `patient_opt_out`).
4. Conservamos `whatsapp_opt_in_at` y `whatsapp_opt_out_at` para auditoría SIC.

El bot **no debe** enviar mensajes a personas que no consintieron, incluso
si Psicomorfosis (por bug) le manda un evento. Por seguridad en profundidad,
el bot puede tener su propia lista de opt-outs.

---

## 6. Catálogo de eventos

| Evento | Destinatario | Trigger en Psicomorfosis |
|---|---|---|
| `appointment.created` | patient | Nueva cita agendada |
| `appointment.reminder.24h` | patient | Cron 24h antes |
| `appointment.reminder.1h` | patient | Cron 1h antes |
| `appointment.cancelled` | both | Cita cancelada (por cualquier lado) |
| `appointment.confirmed_by_patient` | professional | Webhook entrante `patient_confirmed` |
| `document.shared` | patient | `shared_with_patient = 1` |
| `document.signature_requested` | patient | Sign request creada |
| `document.signed` | professional | Paciente firmó |
| `task.assigned` | patient | Nueva tarea |
| `task.submitted` | professional | Paciente entregó tarea |
| `test.assigned` | patient | Nuevo test psicométrico |
| `invoice.paid` | patient | Recibo registrado |
| `clinical_risk.alert` | professional | Test con riesgo alto o webhook entrante |
| `portal.invite` | patient | Invitación a activar portal |

`kind` por evento (a quién va por default) está hardcoded en
`server/src/lib/messaging-events.js`. El psicólogo puede deshabilitar
eventos pero no cambiar su destinatario.

---

## 7. Ejemplo end-to-end con `curl`

Probar saliente local (asumiendo que tu bot mock corre en `localhost:4001`):

```bash
# 1. Levantar el server local
cd server && npm run dev

# 2. Levantar el mock bot
node scripts/mock-messaging-bot.mjs

# 3. Login como super_admin y obtener token
TOKEN=$(curl -s -X POST http://localhost:3002/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"nathaly","password":"<pwd>"}' | jq -r .token)

# 4. Configurar el workspace
curl -X PATCH http://localhost:3002/api/messaging/config \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"enabled":true,"sender_label":"Dra. Nathaly","test_phone":"+573041234567"}'

# 5. Disparar evento de prueba
curl -X POST http://localhost:3002/api/messaging/test \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"event_type":"appointment.reminder.24h"}'

# El mock bot debería loggear el evento recibido con firma válida.
```

---

## 8. Roadmap

- **v1 (este doc)**: saliente + entrante + opt-in + plantillas + audit.
- **v1.1**: UI en `/configuracion` para editar plantillas y revisar log.
- **v1.2**: cron de recordatorios + hooks reales en controllers de
  `appointments`/`documents`/`tareas`/`tests`/`invoices`.
- **v2**: multi-profesional por workspace (`recipient.user_id` cuando
  haya más de un profesional), media (PDFs adjuntos a mensajes),
  templates aprobadas de WhatsApp Business si se migra a Meta.

---

## 9. Contacto

Cambios al contrato requieren bump de `meta.version`. Stiven debe ser
notificado antes de cambios breaking en el bot.
