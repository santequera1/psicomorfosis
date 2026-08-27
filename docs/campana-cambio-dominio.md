# Campaña: cambio de dominio a psicomorfosis.co

Estado al 21 ago 2026: **todo preparado, nada enviado, redirección sin activar.**

## Qué ya está hecho (para que el correo diga cosas verdaderas)

- [x] Entrar con Google (`/login`), con vinculación para cuentas existentes.
- [x] «¿Olvidaste la contraseña?» en el login, enlace por correo de 60 min y un uso.
- [x] Videollamada Jitsi automática en citas online: correo (+ .ics), WhatsApp de Laura, recordatorios, agenda y portal.
- [x] Todas las referencias a `psico.wailus.co` en código de la app apuntan a `psicomorfosis.co` (OG, plantillas, .ics, mensajería).
- [x] Script de envío uno a uno con registro anti-duplicados: `server/scripts/campana-dominio.mjs` (ya copiado al VPS).
- [ ] Bot: referencias al dominio viejo y `bot.psicomorfosis.co` — en curso en la otra sesión (`docs/prompt-bot-dominio.md`).
- [ ] Redirección 301 (abajo).
- [ ] Anuncio en Novedades.
- [ ] Envío del correo.

## Destinatarios (dry run real, 21 ago)

16 personas. Excluidas: `psicologo.demo@`, `admin@miclinica.co`, `legal@`, y las dos cuentas de Stiven.

| Grupo | Cuántos | Reciben además |
|---|---|---|
| Activos (Nathaly, Dairo) | 2 | — |
| Probaron en mayo y no volvieron | 7 | — |
| Nunca entraron | 7 | bloque de re-invitación con su usuario y cómo recuperar la clave |

Ver la lista exacta con: `cd ~/apps/psicomorfosis && node server/scripts/campana-dominio.mjs` (dry run, no envía).

## Orden de ejecución el día D

1. **Redirección 301** en nginx (cierra la sesión a todos una vez; por eso va el mismo día que el correo, que lo explica).
2. **Anuncio en Novedades** desde `/platform/anuncios` (se auto-abre porque es reciente).
3. **Prueba a un solo destinatario**: `node server/scripts/campana-dominio.mjs --send --only=stivenantequera@gmail.com`
   (la cuenta está excluida del envío general, pero `--only` la fuerza — sirve para ver el correo real en Gmail).
4. **Envío**: `node server/scripts/campana-dominio.mjs --send` — 16 correos con 4–7 s de pausa entre cada uno (~1,5 min). Reejecutar no duplica.
5. Revisar `campaign_log` y el log de Postfix (`status=sent`).

Horario recomendado: martes o miércoles, 9–10 am.

## Redirección 301 (preparada, NO aplicada)

Hoy `/etc/nginx/sites-enabled/psico.wailus.co` sirve los tres nombres en el mismo bloque. Cambio:

```nginx
# Bloque NUEVO, antes del actual: el dominio viejo solo redirige.
server {
    listen 443 ssl;
    server_name psico.wailus.co;
    ssl_certificate     /etc/letsencrypt/live/psico.wailus.co/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/psico.wailus.co/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;
    return 301 https://psicomorfosis.co$request_uri;
}
```

y en el bloque actual quitar `psico.wailus.co` de `server_name`, dejando `psicomorfosis.co www.psicomorfosis.co`.
El bloque de puerto 80 ya redirige a `https://$host…`, que a su vez caerá en el 301 de arriba. `nginx -t` y `systemctl reload nginx`.

**Excepción a considerar**: el bot llama a la API por `PSICO_API_BASE_URL`. Debe estar en `psicomorfosis.co` **antes** del 301 (lo cambia la otra sesión); si no, cada llamada del bot hace un salto extra y los `POST` con cuerpo pueden perderse en la redirección.

## Correo (texto final)

**De:** Stiven de Psicomorfosis <notificaciones@psicomorfosis.co> · **Reply-To:** el correo de Stiven (`CAMPAIGN_REPLY_TO` en `.env`; si no está, responde a notificaciones@)
**Asunto:** Psicomorfosis estrena casa: psicomorfosis.co

> Hola {nombre},
>
> Te escribo porque Psicomorfosis estrena casa: desde hoy vive en **psicomorfosis.co**.
>
> Nada cambia en tu cuenta: mismo usuario, misma contraseña, mismos pacientes e historias. Solo cambia la dirección. La antigua te redirige sola, pero conviene que actualices el favorito. La primera vez que entres por la nueva dirección te pedirá iniciar sesión de nuevo — es normal, la sesión va atada al dominio.
>
> *{solo si nunca entró:}* Vi que aún no has entrado. Tu cuenta sigue activa y es gratuita — tu usuario es **{usuario}**. Si no recuerdas la contraseña, en el login está «¿Olvidaste la contraseña?»: te llega un enlace al correo y la cambias en un minuto.
>
> Y tres novedades que llegan con el cambio:
> - **Entrar con Google**, con un clic, si lo prefieres.
> - **Recuperar la contraseña** tú mismo desde el login.
> - **Videollamada automática** en las citas online: cada cita trae su enlace y le llega al paciente por correo y WhatsApp.
>
> [Entrar a psicomorfosis.co]
>
> Si algo no te funciona, responde a este correo y lo miro yo.
> Stiven

## Lo que falta decidir

1. **Día y hora** del envío (= día de la redirección).
2. Desde qué buzón responder: pon `CAMPAIGN_REPLY_TO=tu@correo` en el `.env` del VPS, o se usa `notificaciones@`.

## Ejecutado — 27 de agosto de 2026
- 11:08 · Campaña enviada a 19 cuentas (más la prueba a Stiven del 26): 14 entregadas por Mailcow; 5 rebotadas
  (Hotmail/Outlook: Microsoft bloquea la red de OVH, `550 5.7.1 S3140`).
- 11:42 · `scripts/dominio-301.sh apply`: `psico.wailus.co` → `psicomorfosis.co` (backup en `/etc/nginx/backups/`).
- 12:xx · Correo saliente conmutado a **Brevo** (dominio autenticado, IP del VPS autorizada); los 5 rebotados reenviados y aceptados.
- Antes, el mismo día: la app pasó a `bot.psicomorfosis.co` (`PSICOBOT_URL`); el bot ya apuntaba a `psicomorfosis.co`.

