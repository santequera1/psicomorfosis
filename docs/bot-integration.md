# Integración del bot de Laura (WhatsApp) con la plataforma

Guía técnica para el desarrollador del bot. Cubre autenticación, endpoint
de identificación por teléfono, y cómo llamar el resto de la API "actuando
como" un usuario específico.

---

## 1. Credenciales

**Base URL:** `https://psico.wailus.co/api`

**API key:** definida en `.env` del servidor como `BOT_API_KEY`. La key
actual empieza con `psb_...`. **Compartila fuera de este repo por canal
seguro** (Bitwarden, 1Password, no en Slack/email plano).

**Todos los requests del bot** llevan:

```
X-Bot-Api-Key: psb_<clave>
```

Requests que actúan en nombre de un usuario específico también llevan:

```
X-Bot-Actor-User-Id: <user_id numérico>
```

El `actor_user_id` viene del endpoint `/bot/identify` (ver §3).

---

## 2. Health check

```
GET /api/bot/health
Headers: X-Bot-Api-Key: psb_<clave>
```

Respuesta:

```json
{ "ok": true, "timestamp": "2026-07-01T14:32:11.482Z" }
```

Usalo en el bootstrap del bot para verificar que la API es alcanzable
y la key es válida. Si devuelve `401`, revisar la key.

---

## 3. Identify — resolver un número de WhatsApp a un usuario

```
POST /api/bot/identify
Headers:
  X-Bot-Api-Key: psb_<clave>
  Content-Type: application/json

Body: { "phone": "+57 310 482 1290" }
```

El `phone` acepta cualquier formato (con/sin `+`, con espacios, guiones)
— el server normaliza a solo dígitos y hace matching por sufijo, así
que `"+57 310 482 1290"`, `"3104821290"` y `"+573104821290"` resuelven al
mismo usuario si está registrado con cualquiera de esos.

### 3.1 Respuesta si es psicólogo/staff

```json
{
  "kind": "staff",
  "actor_user_id": 1,
  "user_id": 1,
  "workspace_id": 1,
  "workspace_name": "Consulta Psic. Nathaly Ferrer",
  "role": "super_admin",
  "name": "Nathaly Ferrer Pacheco",
  "email": "nathaly@psicomorfosis.co",
  "professional_id": 1,
  "scope": {
    "can_read_workspace_agenda": true,
    "can_read_workspace_patients": true,
    "can_read_workspace_tasks": true,
    "can_read_workspace_documents": true,
    "can_write_appointments": true,
    "can_write_tasks": true,
    "can_write_notes": true,
    "is_admin": true,
    "is_super_admin": true
  }
}
```

### 3.2 Respuesta si es paciente

```json
{
  "kind": "patient",
  "actor_user_id": 42,
  "user_id": 42,
  "workspace_id": 1,
  "workspace_name": "Consulta Psic. Nathaly Ferrer",
  "patient": {
    "id": "P-1013",
    "name": "Daniel Felipe Angulo Carrascal",
    "preferred_name": null,
    "email": "daniel@correo.co"
  },
  "professional": {
    "id": 1,
    "name": "Nathaly Ferrer Pacheco",
    "phone": "+57 304 219 0650"
  },
  "account_activated": true,
  "scope": {
    "can_read_own_appointments": true,
    "can_read_own_tasks": true,
    "can_read_own_tests": true,
    "can_read_own_documents": true,
    "can_confirm_own_appointments": true,
    "can_reagenda_own_appointments": "requires_professional_approval",
    "can_mark_own_task_completed": true
  }
}
```

**`account_activated: false`** significa que el paciente existe pero
nunca activó su cuenta del portal. En ese caso `actor_user_id` es `null`
y el bot no puede "actuar como él" en endpoints que requieren req.user
(marcar tareas completadas, subir tests). El bot debería invitarlo a
activar su cuenta antes de operar.

### 3.3 Respuesta si no matchea

```
HTTP 404
{ "kind": "unknown" }
```

El bot debería pedir la identidad amablemente (correo, número
alternativo, o pedirle que hable con el psicólogo para que lo
registre).

---

## 4. Actuar como un usuario en endpoints de datos

Después de identificar, el bot llama endpoints regulares de la app
usando la API key + el actor:

```
GET /api/appointments?date=2026-07-01
Headers:
  X-Bot-Api-Key: psb_<clave>
  X-Bot-Actor-User-Id: 1
```

El middleware `requireAuth` de la app reconoce esta combinación y setea
`req.user` al actor real (mismo shape que un usuario logueado con JWT).
Todo el downstream funciona igual — los endpoints filtran por
`workspace_id`, ownership, etc. automáticamente.

### 4.1 Endpoints útiles para el bot

Los endpoints de la app que ya existen y sirven al bot:

| Uso del bot | Endpoint | Método |
|---|---|---|
| Agenda del psicólogo (día) | `/api/appointments?date=YYYY-MM-DD` | GET |
| Detalle de una cita | `/api/appointments/:id` | GET |
| Confirmar/reagendar cita | `/api/appointments/:id` | PATCH |
| Crear cita | `/api/appointments` | POST |
| Tareas de un paciente | `/api/tasks?patient_id=P-XXXX` | GET |
| Tareas del workspace | `/api/tasks` | GET |
| Crear tarea a paciente | `/api/tasks` | POST |
| Marcar tarea completada | `/api/tasks/:id` | PATCH `{ status: 'completada' }` |
| Tests de un paciente | `/api/tests/applications?patient_id=X` | GET |
| Documentos de un paciente | `/api/documents?patient_id=X` | GET |
| Ficha de paciente | `/api/patients/:id` | GET |
| Buscar pacientes | `/api/patients?q=Carlos` | GET |
| Notas clínicas | `/api/patients/:id/notes` | GET |

Todos filtran por el workspace del actor. Si el bot llama con
`X-Bot-Actor-User-Id: 1` (Nathaly), solo verá lo del workspace 1.

### 4.2 Ejemplo — "¿Qué tengo hoy?"

```
GET /api/appointments?date=2026-07-01
X-Bot-Api-Key: psb_...
X-Bot-Actor-User-Id: 1
```

Respuesta: array de citas del día de Nathaly.

### 4.3 Ejemplo — paciente marca tarea completada

Paciente Daniel (user_id=42) manda "hecho" en WhatsApp:

```
PATCH /api/tasks/TK-1-12345
X-Bot-Api-Key: psb_...
X-Bot-Actor-User-Id: 42

{ "status": "completada" }
```

El endpoint valida que la tarea pertenece a un paciente del mismo
workspace que el actor. Como el actor es el paciente Daniel y la tarea
es suya, pasa. Si Daniel intentara marcar la tarea de Carlos, 403.

---

## 5. Seguridad

### 5.1 Qué protege

- La `BOT_API_KEY` es un secreto compartido — quien la tenga puede
  llamar cualquier endpoint como cualquier usuario. Guardala como
  cualquier password (env vars, secrets manager, no en el repo).
- El `actor_user_id` no lo elige el bot arbitrariamente — sale del
  `/identify` que resuelve del phone. **Nunca hardcodear un actor**
  que no viene del identify.

### 5.2 Qué NO protege (aún)

- **Phone spoofing**: si alguien usa el celular de Nathaly, el bot lo
  autentica como Nathaly. Para v1 aceptable dado el volumen de usuarios
  (~15). Para v2: OTP one-time al vincular el número por primera vez.
- **Rate limiting**: no está implementado en la app. El bot debe
  implementarlo del lado del WhatsApp Cloud API (30 msgs/min por
  número recomendado).

### 5.3 Auditoría

Cada request queda con `req.user.id` real en los logs del server, así
que la traza es la misma que si el usuario hubiera actuado desde la
web. El campo `_bot: true` está en `req.user` por si algún endpoint
quiere bloquear al bot en el futuro.

---

## 6. Datos NO expuestos al bot (por diseño)

El bot NO debería mandar por WhatsApp:
- Diagnósticos DSM-5/CIE-11
- Contenido de notas clínicas (S/O/A/P completo)
- Resultados detallados de tests psicométricos
- Datos de otros pacientes

Los endpoints anteriores SÍ devuelven esos datos si el actor tiene
permiso — es responsabilidad del bot **NO reenviar** esa información
por WhatsApp. Solo debe usar logística (fechas, títulos, links
autenticados).

Si necesitás un endpoint que devuelva solo la parte "logística" de una
nota (fecha, tipo) sin el contenido, avisame y agrego un flag.

---

## 7. Testing

### 7.1 Health

```bash
curl https://psico.wailus.co/api/bot/health \
  -H "X-Bot-Api-Key: psb_..."
# → { "ok": true, "timestamp": "..." }
```

### 7.2 Identify — staff

```bash
curl -X POST https://psico.wailus.co/api/bot/identify \
  -H "X-Bot-Api-Key: psb_..." \
  -H "Content-Type: application/json" \
  -d '{"phone":"+57 304 219 0650"}'
# → { "kind": "staff", "actor_user_id": 1, ... }
```

### 7.3 Identify — desconocido

```bash
curl -X POST https://psico.wailus.co/api/bot/identify \
  -H "X-Bot-Api-Key: psb_..." \
  -H "Content-Type: application/json" \
  -d '{"phone":"+57 111 111 1111"}'
# → HTTP 404 { "kind": "unknown" }
```

### 7.4 Actuar como usuario

```bash
curl "https://psico.wailus.co/api/appointments?date=2026-07-01" \
  -H "X-Bot-Api-Key: psb_..." \
  -H "X-Bot-Actor-User-Id: 1"
# → agenda del día de Nathaly
```

---

## 8. Roadmap

**v1 (ya listo)**
- ✅ `POST /bot/identify` — phone → user context + scope
- ✅ `GET /bot/health`
- ✅ Auth via API key + actor header en TODOS los endpoints existentes

**v2 (cuando escale)**
- OTP one-time al primer vínculo phone ↔ workspace
- Endpoint `POST /bot/register-phone` para agregar/actualizar el
  número del staff sin pasar por la UI
- Rate limiting server-side por API key
- Endpoints "logística-only" para docs/notas/tests

---

## 9. Contacto

Para cualquier cambio de esta interfaz, tocar `server/src/routes/bot.js`
y `server/src/auth.js` (bloque `tryBotAuth`).
