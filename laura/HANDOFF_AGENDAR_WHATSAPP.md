# Handoff — Agendar citas NUEVAS por WhatsApp (4 sep 2026)

## Contexto / caso real

Oriana (paciente de Nathaly) le escribió a Laura: **"¿Cómo programo la
siguiente cita?"** — y Laura no tenía con qué responder: sabía reagendar
citas existentes (`/api/bot/reschedule-request`) pero no pedir una cita
NUEVA ni saber si el psicólogo tiene enlace público de reservas.

La plataforma ya expone los dos endpoints que faltaban (desplegados en
producción). Este documento es el contrato para implementar el lado
conversacional en el bot.

Dato clave: **el portal del paciente NO crea citas nuevas** (solo
reagendar/cancelar las existentes). Para una cita nueva las vías son:
el enlace público del psicólogo, o que Laura registre la solicitud.

---

## Endpoint 1 — contexto de agendamiento

```
GET https://psicomorfosis.co/api/bot/booking-info?phone=<numero>
Header: X-Bot-Api-Key: <la misma BOT_API_KEY de siempre>
```

Identifica al paciente por los últimos 10 dígitos (igual que el resto
de endpoints del bot). Respuesta:

```json
{
  "found": true,
  "matches": [
    {
      "patient": { "id": "P-1015", "name": "Oriana …", "preferred_name": null },
      "professional": {
        "name": "Nathaly Ferrer Pacheco",
        "public_enabled": true,
        "public_url": "https://psicomorfosis.co/perfil/nathaly-ferrer-pacheco"
      },
      "next_appointment": { "id": 512, "date": "2026-09-10", "time": "15:00", "status": "confirmada", "modality": "tele" },
      "available_slots": [
        { "date": "2026-09-05", "times": ["08:00", "09:00", "10:00"] },
        { "date": "2026-09-06", "times": ["08:00", "14:00"] }
      ]
    }
  ]
}
```

- `found: false` → el número no corresponde a ningún paciente registrado.
- `matches` puede traer **varias entradas** (misma persona, paciente de
  dos psicólogos distintos) → desambiguar preguntando con cuál psicólogo
  quiere la cita, y usar su `patient.id` en el endpoint 2.
- `next_appointment` sirve para responder "ya tienes cita el …" antes de
  crear otra.
- `available_slots` son horarios REALES libres (respetan el horario de
  atención configurado y las citas ocupadas) — úsalos para proponer.

## Endpoint 2 — crear la solicitud

```
POST https://psicomorfosis.co/api/bot/appointment-request
Header: X-Bot-Api-Key: …
Body: {
  "phone": "573001234567",
  "date": "2026-09-05",          // YYYY-MM-DD
  "time": "10:00",               // HH:mm (los slots son en punto)
  "modality": "videollamada",    // opcional: tele|virtual|videollamada|online → tele; presencial; omitido → la modalidad habitual del paciente
  "motivo": "control mensual",   // opcional, máx 300 chars
  "patient_id": "P-1015"         // solo si booking-info devolvió varios matches
}
```

**201** →
```json
{ "ok": true, "appointment_id": 545, "status": "solicitada",
  "professional_name": "Nathaly Ferrer Pacheco", "date": "…", "time": "…", "modality": "tele" }
```

**Errores que el bot debe manejar conversacionalmente:**
- `409 multiple_patients` → trae `matches[]`; preguntar con cuál psicólogo y reintentar con `patient_id`.
- `409 slot_not_available` (fuera del horario de atención) y
  `409 slot_taken` (hora ocupada) → ambos traen `available_slots` con
  alternativas reales; ofrécelas ("esa hora no está disponible, pero
  tiene libre el viernes a las 8 o a las 10").
- `404 patient_not_found` → número no registrado.
- `409 no_professional` → workspace sin profesional activo (raro).

**Qué dispara la plataforma al crear la solicitud** (el bot NO debe
duplicar nada de esto): cita en estado `solicitada` visible en la
agenda y en el botón "Solicitudes", campana urgente in-app, correo al
psicólogo, y WhatsApp al psicólogo vía Laura ("Nueva solicitud de cita
por WhatsApp con Laura"). Cuando el psicólogo la **confirme**, al
paciente le llegan la confirmación por WhatsApp y el correo con el
evento de calendario — los flujos que ya existen.

---

## Flujo conversacional sugerido

Trigger: el paciente pide agendar/programar una cita nueva ("cómo
programo la siguiente cita", "quiero otra cita", "me das una cita para
el viernes").

1. `GET booking-info` con su número.
2. **No registrado** (`found: false`) → explicar con calidez que no lo
   encuentras como paciente y que le escriba directamente a su
   psicólogo.
3. **Varios matches** → "¿La cita es con Nathaly o con Carlos?" →
   recordar el `patient_id` elegido.
4. **Tiene cita próxima** → mencionarla primero: "Ya tienes cita el
   jueves 10 a las 3 pm. ¿Quieres otra adicional o cambiar esa?" (si
   quiere cambiarla → flujo de reschedule que ya existe).
5. **Ofrecer las dos vías**:
   - Si `public_enabled`: mandar el `public_url` ("puedes elegir día y
     hora tú misma aquí: …") **y además** ofrecer hacerlo por chat.
   - Siempre: "o dime qué día y hora te sirven y yo le paso la solicitud
     a {psicólogo}". Proponer 2-3 de los `available_slots`.
6. El paciente elige → `POST appointment-request` → confirmar: "Listo,
   le pasé tu solicitud a Nathaly para el viernes 5 a las 10 am. Ella la
   confirma y te aviso por aquí." (la confirmación real llega sola por
   los flujos existentes).
7. Si 409 con alternativas → ofrecerlas y reintentar.

Notas de tono: la paciente es una persona en proceso terapéutico — cero
presión, cero datos clínicos por este canal (regla de siempre).

## Pruebas

- Cuenta demo ws24 (Consulta Edgardo) tiene pacientes con teléfono para
  probar sin tocar consultas reales. Verificado en producción:
  booking-info responde matches con `available_slots`, y
  appointment-request creó y luego se limpió una solicitud de prueba.
- Para Oriana (caso real pendiente): cuando el bot tenga el flujo,
  puede responderle retomando su mensaje del 4/9.

## Al terminar

Actualizar el catálogo de eventos/endpoints del bot y avisar a Stiven.
