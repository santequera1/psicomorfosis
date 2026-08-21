# Prompt para la sesión del bot (psicomorfosis_bot)

> Copia desde la línea siguiente hasta el final.

---

Estás trabajando en `psicomorfosis_bot` (FastAPI + Evolution API, Python). Es el bot de WhatsApp "Laura" de la plataforma clínica Psicomorfosis. Tu tarea tiene dos partes: **(A)** migrar todas las referencias del dominio viejo `psico.wailus.co` al nuevo `psicomorfosis.co`, y **(B)** publicar el propio bot en `bot.psicomorfosis.co` en lugar de `psicobot.wailus.co`. Trabaja en paralelo con otra sesión que está tocando la app principal; **no edites nada fuera de este repo ni del bloque nginx del bot.**

## Contexto verificado (no lo redescubras)

- **VPS**: `ubuntu@51.195.109.26`. El bot vive en `~/apps/psicomorfosis_bot`, corre con PM2 como **`laura-bot`**: `venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8013`. Hay **19 apps** en ese PM2; solo puedes reiniciar `laura-bot`. Nunca `pm2 restart all`, nunca `pm2 delete`.
- **nginx actual del bot**: `/etc/nginx/sites-enabled/psicobot.wailus.co` → `proxy_pass http://127.0.0.1:8013`, cert Let's Encrypt en `/etc/letsencrypt/live/psicobot.wailus.co/`.
- **Evolution** (WhatsApp) envía sus webhooks a `http://localhost:8013/webhook` — **interno**. Cambiar el dominio público NO requiere tocar Evolution ni su instancia `psico`. No reconfigures el webhook de Evolution.
- **Quién llama al dominio público del bot**: solo la app Psicomorfosis (variable `PSICOBOT_URL=https://psicobot.wailus.co/psico/event` en el `.env` de la app — eso lo cambia la otra sesión cuando tú confirmes que el dominio nuevo responde) y el panel web del bot (`app/panel/`).
- **DNS**: el usuario ya apuntó `bot.psicomorfosis.co` al VPS, pero al momento de escribir esto `dig +short bot.psicomorfosis.co` devolvía vacío desde el servidor. **Comprueba propagación antes de pedir el certificado**; si no resuelve, termina la parte A y deja la B documentada.
- El dominio de correo de la plataforma (`mail.psicomorfosis.co`, Mailcow) y la app principal (`psicomorfosis.co`) **no se tocan**.
- El usuario hace los commits de este repo él mismo. Deja los cambios en el working tree y dile exactamente qué archivos tocaste.

## Parte A — referencias al dominio viejo

Encontradas con `grep -rn "psico.wailus.co" .` (excluye `.git/`). Cámbialas a `https://psicomorfosis.co` con la misma ruta:

| Archivo | Línea | Qué es |
|---|---|---|
| `app/claude/prompts.py` | 45 | texto del prompt: "portal (https://psico.wailus.co/p/login)" — **lo leen los pacientes** |
| `app/claude/tools.py` | 31 | idem, enlace al portal en una herramienta |
| `app/flows/conversation.py` | 128 y 275 | mensajes al paciente invitándolo a activar el portal |
| `data/prompts/datacompleta.md` | 49 | ejemplo de enlace de firma en el prompt maestro |
| `app/config.py` | 68 | default de `psico_api_base_url` |
| `app/psicomorfosis/api.py` | 12 | docstring |
| `app/psicomorfosis/client.py` | 5 | docstring (menciona `PSICO_WEBHOOK_OUT_URL` default) |
| `.env.example` | 37 | `PSICO_API_BASE_URL` |
| `.env` **en el VPS** (no está en el repo) | 34 | `PSICO_API_BASE_URL=https://psico.wailus.co` → `https://psicomorfosis.co` |

Revisa también si hay textos en la base de datos del bot (PostgreSQL `psicobot_db`, tablas de prompts/plantillas si existen) con `wailus` y repórtalos — no los cambies sin confirmar.

Además, una mejora pequeña que quedó pendiente: en `app/eventos/handlers.py` el set `EVENTOS_PARA_PSICOLOGO` no incluye `"booking.requested"` (el aviso al psicólogo cuando alguien reserva desde su perfil público). Hoy funciona porque el despacho es genérico, pero añádelo al catálogo para que cualquier validación futura por tipo de evento no lo rompa.

**Verificación de A**: `grep -rn "wailus" app data .env.example` debe devolver 0 líneas. Corre los tests del repo si existen (`pytest`), y un arranque en local o `python -c "from app.config import get_settings; print(get_settings().psico_api_base_url)"`.

## Parte B — publicar en bot.psicomorfosis.co

Solo si `dig +short bot.psicomorfosis.co` devuelve `51.195.109.26`:

1. **nginx**: crea `/etc/nginx/sites-available/bot.psicomorfosis.co` copiando el bloque de `psicobot.wailus.co` (mismo `proxy_pass http://127.0.0.1:8013`, mismos headers), con `server_name bot.psicomorfosis.co;`. Enlázalo en `sites-enabled`, `nginx -t`, `systemctl reload nginx`. **No borres ni edites el bloque de `psicobot.wailus.co`**: debe seguir sirviendo durante la transición (la app sigue apuntando ahí hasta que la otra sesión cambie su `.env`).
2. **Certificado**: `certbot --nginx -d bot.psicomorfosis.co` (sin tocar otros certificados). Verifica `curl -sI https://bot.psicomorfosis.co/health` (o la ruta de salud que tenga `app/main.py`) → 200.
3. **Ajusta en el bot** lo que referencie su propio dominio público: `WHAPI_WEBHOOK_URL` en el `.env` del VPS (hoy `https://psicobot.wailus.co/webhook`; parece legado de la época de Whapi — confirma si algo lo usa; si nada lo usa, cámbialo igual por coherencia) y el default `whapi_webhook_url` en `app/config.py` (hoy apunta a un dominio de dtgrowthpartners que ya no aplica).
4. `pm2 restart laura-bot` y comprueba `pm2 logs laura-bot --lines 30 --nostream` sin errores, y que `pm2 status` sigue mostrando las 19 apps `online`.
5. Prueba de humo del endpoint que usa la app: `POST https://bot.psicomorfosis.co/psico/event` sin cabecera de secreto debe responder **401** (no 404, no 502). Eso confirma que nginx llega al bot y que la ruta existe.

## Restricciones

- Secretos (`PSICO_INBOUND_SECRET`, `EVOLUTION_API_KEY`, `DATABASE_URL`, claves de Anthropic) **solo** viven en el `.env` del VPS. No los copies al repo, no los pegues en el chat.
- Laura es una IA y nunca debe presentarse como humana; los mensajes que edites conservan ese tono.
- No envíes mensajes de WhatsApp de prueba a pacientes reales. Si necesitas probar envío, usa el número del propio usuario (pídeselo).

## Qué entregar al final

1. Lista de archivos modificados en el repo (para que el usuario haga el commit).
2. Confirmación de que `.env` del VPS tiene `PSICO_API_BASE_URL=https://psicomorfosis.co`.
3. Estado de la parte B: si `https://bot.psicomorfosis.co/psico/event` ya responde 401 sin secreto, dilo explícitamente con esa frase — **es la señal para que la otra sesión cambie `PSICOBOT_URL` en la app**. Si el DNS no había propagado, dilo y deja los pasos listos.
4. Cualquier texto con `wailus` que hayas encontrado en la base de datos del bot.
