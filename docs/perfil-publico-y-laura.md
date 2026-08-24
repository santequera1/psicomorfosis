# Perfil público, reservas y Laura — cómo está conectado hoy

> Documento para el repo del bot (`psicomorfosis_bot/docs/`). Complementa
> `GUIA_BOT_DESDE_PLATAFORMA.md`: aquí va lo que la plataforma hace alrededor
> del **perfil público con reserva de citas**, qué eventos manda al bot en cada
> paso, qué endpoints nuevos expone para el bot y qué quedó pendiente.
>
> Fecha de referencia: 2026-08-24. Código: `server/src/routes/public-booking.js`,
> `server/src/routes/appointments.js`, `server/src/routes/bot.js`,
> `server/src/lib/psicobot.js`, `server/src/lib/video.js`, `server/src/mailer.js`.

---

## 1. El perfil público (linktree)

- URL: `https://psicomorfosis.co/perfil/<slug>` (ej. `/perfil/nathaly-ferrer`).
- Es **opt-in por profesional**: se activa en *Configuración → Perfil público*
  (tabla `professionals`: `slug`, `public_enabled`, `public_bio`, `public_location`,
  `public_areas`, `public_links`, `public_socials`, `public_bg`, `public_photo_url`).
  Si `public_enabled = 0` o no hay `slug`, la URL responde 404.
- Muestra: foto (la de perfil de la app si no hay otra), nombre, título, bio,
  áreas, redes (Instagram, TikTok, Facebook, YouTube, LinkedIn, WhatsApp),
  enlaces libres y el botón **Reservar cita**.
- El WhatsApp del perfil público sale de `public_socials.whatsapp` o, si no, del
  `professionals.phone` — el mismo número al que Laura le escribe.

### API pública (sin auth, con rate limit por IP)

| Método | Ruta | Qué hace |
|---|---|---|
| GET | `/api/public/professionals/:slug` | Datos del perfil (solo si está activo) |
| GET | `/api/public/professionals/:slug/availability?days=14` | Huecos libres reales |
| POST | `/api/public/professionals/:slug/booking` | Crea la solicitud de cita |

### Disponibilidad — qué ve el visitante

- Grilla fija v1: **lunes a viernes, 08:00–11:00 y 14:00–17:00**, bloques de 50 min,
  desde mañana y hasta 14 días (máx. 30).
- Se descarta cualquier hora que ya tenga cita del profesional con estado
  **distinto de `cancelada`** — es decir, las `solicitada` también bloquean el
  hueco (dos visitantes no pueden pedir la misma hora).
- Aún **no** lee el "Horario de atención" configurable ni las sedes: es la misma
  grilla para todos. Pendiente.

### La reserva (POST booking)

Body: `{ name, age, phone, email?, motivo?, date, time, modality: "tele"|"individual", website: "" }`

Validaciones: nombre ≥ 3, **edad obligatoria 1–120**, teléfono ≥ 10 dígitos,
fecha `YYYY-MM-DD` futura y hora dentro de la grilla, honeypot `website` vacío,
y comprobación de carrera (409 si el hueco se ocupó entre pintar y enviar).

Qué crea:
1. **Paciente**: reusa por teléfono dentro del workspace (match por últimos 10
   dígitos); si no existe, lo crea *mínimo* con `whatsapp_opt_in = 1`, `reason =
   "[reserva-web] <motivo>"`, `age`. Si existía y no tenía edad, se la completa.
2. **Cita** con `status = 'solicitada'`, `professional_id` del perfil, `patient_name`,
   `notes = "[reserva-web] …"`, `duration_min = 50`, `room = "Por confirmar"` (presencial)
   o `null` (online). Si es **online, nace ya con `meeting_url`** (ver §4).

---

## 2. Qué avisos salen y cuándo

| Momento | A quién | Canal | Quién arma el texto |
|---|---|---|---|
| **Solicitud creada** | Profesional | WhatsApp — evento `booking.requested` | plataforma (`rendered_message`), incluye nombre · edad, teléfono, fecha, modalidad, motivo |
| | Profesional | Correo (`sendBookingRequestEmails`) | plataforma: datos + botón "Confirmar en mi agenda" |
| | Visitante | Correo | plataforma: "tu solicitud llegó, te confirmarán" (Reply-To = correo del profesional) |
| **Profesional confirma** (`solicitada → confirmada`, desde la agenda o vía tool `confirmar_cita`) | Paciente | WhatsApp — evento `appointment.created` | plataforma (`notifyAppointmentCreated`): fecha, hora, duración, modalidad, **🎥 enlace de videollamada** si es online, y "responde *sí* / *no puedo*" |
| | Paciente | Correo con **.ics** (URL de la videollamada dentro) + botón "Unirme a la videollamada" | plataforma (`sendAppointmentEmail`, kind `appointment_created`) |
| **Paciente responde "sí"** | Plataforma | El bot llama `POST /api/bot/appointments/confirm` (ver §3) | — |
| **Paciente responde "no"** | Plataforma | `POST /api/bot/reschedule-request` → notificación al staff | — |
| Recordatorios 24h / 1h | Paciente | Plantillas `appointment.reminder.24h/1h` (llevan `{{appointment.video_suffix}}`) | **pendiente: la plataforma aún no tiene scheduler** |

Notas:
- Al visitante **no** se le manda WhatsApp al solicitar; solo correo. El primer
  WhatsApp que recibe es la confirmación.
- El evento al profesional va con `recipient.phone = professionals.phone` tal cual
  está guardado (ej. `"+57 304 219 0650"`); el bot lo normaliza.
- Si Evolution está caído, el bot registra `evento.enviar_fail` y **no reintenta**
  (caso Catalina, 24/8: el correo llegó, el WhatsApp no). Ver §6.

---

## 3. Endpoints de la plataforma para el bot (cambios recientes)

Todos bajo `/api/bot/*` con `X-Bot-Api-Key`.

### `POST /api/bot/appointments/confirm` — NUEVO
```json
{ "phone": "+573015493375", "appointment_id": 329 }
```
- Clave **por teléfono, sin actor**: pensado para quien reservó desde el perfil
  público y **no tiene cuenta del portal**. Antes el bot le decía "activa tu cuenta"
  al responder "sí" — callejón sin salida.
- Valida que el número sea el del paciente de **esa** cita (403 si no). Solo pasa
  de `pendiente`/`solicitada` a `confirmada` (409 si está atendida/cancelada).
  Idempotente: `{ ok: true, already: true }` si ya estaba confirmada.
- En el bot: `api.confirmar_cita_paciente(phone, appointment_id)`;
  `conversation.py` lo usa cuando `actor is None`.

### `POST /api/appointments` (con actor) — endurecido
- **Fecha pasada → 400** con mensaje legible por el modelo
  (`"La fecha 2025-08-31 ya pasó. Indica una fecha de hoy en adelante…"`).
- Sin `professional_id` → se usa el del usuario que crea; sin `patient_name` → el
  nombre del paciente por su id. (Antes el bot creó una cita en 2025, sin
  profesional ni nombre, que el auto-marcado dejó "atendida" al instante, y el
  paciente recibió dos WhatsApp con dos enlaces distintos.)

### `PATCH /api/appointments/:id { status: "confirmada" }`
- Al pasar de `solicitada` a `confirmada` dispara **WhatsApp + correo** al paciente
  (antes solo WhatsApp). Es lo que usa la tool `confirmar_cita`.

### Lado bot (ya en `main`, desplegado)
- Tool **`confirmar_cita`** (`tools_equipo.py`): confirma una cita existente por
  `appointment_id`. El prompt prohíbe confirmar con `agendar_cita`.
- **Fecha y hora actual (Colombia)** en el bloque de contexto de staff y paciente
  (`_linea_fecha()` en `conversation.py`). Sin esto el modelo asumía 2025.

---

## 4. Videollamada (Jitsi)

- Toda cita con `modality = 'tele'` (o `'virtual'`) tiene `appointments.meeting_url`
  = `https://meet.jit.si/Psicomorfosis-<12 chars aleatorios>` (`server/src/lib/video.js`).
  Se genera al crear (POST, reserva pública) y en cualquier PATCH que la deje
  online; si deja de ser online, se pone a `NULL`. Nunca lleva el nombre del paciente.
- Aparece en: WhatsApp de confirmación, correo (botón + `.ics` con `URL:` y
  `LOCATION`), recordatorios (`{{appointment.video_suffix}}`), tarjetas de la
  agenda ("Unirse a la videollamada") y portal del paciente.
- `VIDEO_BASE_URL` en el `.env` de la app permite pasar a un Jitsi propio
  (p. ej. `https://video.psicomorfosis.co`) sin tocar código.
- Para el bot: el campo `appointment.meeting_url` viene en `data.appointment` de
  `appointment.created` y en las respuestas de `/appointments`. Si Laura describe
  una cita online al psicólogo, puede incluirlo.

---

## 5. `staff.whatsapp_linked` — cuándo lo dispara la plataforma

`server/src/lib/psicobot.js → notifyStaffWhatsappLinked`, teléfono en E.164 (`+57…`):
- `PATCH /api/workspace/professionals/:id` cuando `phone` queda con valor y es
  **distinto** al anterior (Configuración → Perfil profesional).
- `POST /api/auth/register` si el psicólogo dio teléfono al registrarse.
- El registro con Google no pide teléfono: el dashboard muestra un aviso para
  ponerlo, y al guardarlo se dispara.

`idempotency_key = staff-<user_id>-linked-<YYYYMMDD>` → como máximo una
bienvenida por usuario y día.

---

## 6. Pendientes (ordenados)

1. **Scheduler de recordatorios 24h/1h** en la plataforma (el bot ya captura SÍ/NO
   y las plantillas existen). Es el de mayor impacto.
2. **Bot — alerta de desconexión**: Evolution manda `CONNECTION_UPDATE` al webhook;
   hoy se ignora. Al caer la sesión → correo a Stiven ("escanea el QR").
3. **Bot — cola de reintento** para `enviar_fail` por conexión (`500 Connection
   Closed`): guardar y reenviar cuando vuelva la sesión, en vez de perder el aviso.
4. **Bot — health-check externo** (cron 5 min → correo si falla).
5. Disponibilidad pública leyendo el "Horario de atención" configurable.
6. `.ics` también en el correo del profesional (hoy solo lo recibe el paciente).
7. Reinyectar manualmente el `booking.requested` de la cita **329** (Catalina Olivero)
   cuando la sesión de WhatsApp vuelva — el bot lo dio por fallido y no reintenta.

---

## 7. Snippets de prueba

```bash
# Perfil público y disponibilidad
curl -s https://psicomorfosis.co/api/public/professionals/nathaly-ferrer | jq .
curl -s "https://psicomorfosis.co/api/public/professionals/nathaly-ferrer/availability?days=7" | jq .

# Reserva de prueba (usa TU número; crea paciente + cita 'solicitada')
curl -s -X POST https://psicomorfosis.co/api/public/professionals/nathaly-ferrer/booking \
  -H 'Content-Type: application/json' \
  -d '{"name":"Prueba Stiven","age":30,"phone":"3026444564","email":"stiven@psicomorfosis.co",
       "date":"2026-08-27","time":"10:00","modality":"tele","motivo":"prueba"}'

# Confirmación por teléfono (lo que hace el bot cuando el paciente dice "sí")
K=$(grep ^BOT_API_KEY= ~/apps/psicomorfosis/.env | cut -d= -f2-)
curl -s -X POST https://psicomorfosis.co/api/bot/appointments/confirm \
  -H "X-Bot-Api-Key: $K" -H 'Content-Type: application/json' \
  -d '{"phone":"+573026444564","appointment_id":329}'

# Reinyectar un booking.requested perdido (desde el VPS del bot)
S=$(grep ^PSICO_INBOUND_SECRET= ~/apps/psicomorfosis_bot/.env | cut -d= -f2-)
curl -s -X POST https://bot.psicomorfosis.co/psico/event -H "X-Psico-Secret: $S" \
  -H 'Content-Type: application/json' -d '{"event":"booking.requested",
  "idempotency_key":"evt_booking_req_329_retry1",
  "recipient":{"phone":"+573042190650","name":"Nathaly Ferrer Pacheco","role":"psicologo","workspace_id":1},
  "data":{"appointment":{"id":329,"date":"2026-08-26","time":"16:00","modality":"tele"},
          "patient":{"name":"Catalina Olivero","phone":"3015493375","age":26}},
  "rendered_message":"📥 *Nueva solicitud de cita* desde tu perfil público\n\n👤 Catalina Olivero · 26 años\n📱 3015493375\n📅 26 de agosto · 16:00 · online\n\nEntra a tu agenda para *confirmarla o proponer otro horario*."}'
```
