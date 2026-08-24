# Verificación de la app en Google (scope de Calendar)

Estado: **ENVIADA el 24 de agosto de 2026** (Centro de verificación → "en proceso de revisión").
Vídeo: https://youtu.be/9iKQRb7unfI · Cuenta de prueba para el revisor: `revisor.google@psicomorfosis.co`
(workspace aislado "Consulta de prueba (Google review)", user id 45, paciente ficticio P-26000).
Contacto del revisor: stivenantequera@gmail.com. Si piden algo, responder en <3 días o cierran la solicitud.
Cuando aprueben: desactivar o conservar la cuenta de prueba (la vuelven a pedir si se añaden scopes).

## Por qué hace falta

`https://www.googleapis.com/auth/calendar.events` es un scope *sensible*. Sin
verificación, al conectar aparece «Google no ha verificado esta aplicación» y
hay un tope de 100 usuarios. Con verificación desaparece el aviso y el tope.
No es un scope *restringido*, así que **no piden auditoría CASA** — pero el
formulario actual del Centro de verificación **sí pide un vídeo de
demostración** (corregido el 24/8: antes decía que no).

## Antes de enviar (checklist)

- [ ] Pantalla de consentimiento en **Producción** (ya).
- [ ] Añadir el scope `.../auth/calendar.events` en *Pantalla de consentimiento → Permisos* (además de `openid`, `email`, `profile`).
- [ ] Dominio autorizado `psicomorfosis.co` (ya) y **verificado en Search Console** con la misma cuenta de Google Cloud.
- [ ] Página principal: `https://psicomorfosis.co/inicio` · Privacidad: `https://psicomorfosis.co/privacidad` · Términos: `https://psicomorfosis.co/terminos`.
- [ ] Que la política de privacidad **mencione Google Calendar**: qué datos se leen/escriben y que el usuario puede revocar el acceso. Texto sugerido abajo.
- [ ] Logo de la app subido (aparece en el consentimiento; si se pone logo, Google exige verificación — ya la vamos a pedir).

## Vídeo de demostración (lo pide el formulario)

Grabación de pantalla, 2–3 minutos, sin editar, subida a YouTube como
**"no listado"** (unlisted) y pegar el enlace. Google quiere ver, en este orden:

1. **El consentimiento completo**: desde Configuración → Integraciones pulsas
   "Conectar Google Calendar" → se ve la URL `accounts.google.com`, el nombre
   de la app **Psicomorfosis**, la pantalla "app no verificada" (Google dice
   expresamente que es normal y debe salir en el vídeo) → Avanzado → ir a
   psicomorfosis.co → la casilla del permiso "Ver y editar eventos en tus
   calendarios" → Permitir.
2. **Para qué se usa el permiso**: creas una cita online en la agenda de
   Psicomorfosis → abres Google Calendar en otra pestaña → se ve el evento
   "Sesión · <paciente>" con el enlace de Meet. Reprogramas la cita → el
   evento se mueve. La cancelas → desaparece.
3. **Cómo se revoca**: Integraciones → Desconectar.

Consejos: usa un paciente de prueba con nombre ficticio (el vídeo lo ve un
revisor externo), idioma da igual, sin música. Si el proyecto está en
producción y prefieres no exponer a usuarios reales al scope no verificado
mientras revisan, la nota de Google sugiere grabar con un proyecto de prueba;
a nuestra escala (beta, menos de 100 usuarios) no hace falta.

## Texto para "Justificación del scope" (copiar/pegar)

> Psicomorfosis es una plataforma de gestión clínica para psicólogos. El usuario
> (psicólogo) conecta voluntariamente su Google Calendar desde Configuración →
> Integraciones. Con el scope `calendar.events` la aplicación **crea, actualiza y
> elimina únicamente los eventos que corresponden a las citas que el propio
> usuario registra en Psicomorfosis** (título "Sesión · <paciente>", fecha,
> hora, duración, modalidad) en su calendario principal, y opcionalmente
> solicita un enlace de Google Meet para las citas online. No se leen ni
> listan otros eventos del calendario del usuario, no se accede a calendarios
> de terceros y no se comparten datos con terceros. El usuario puede
> desconectar la integración en cualquier momento desde la aplicación (se
> revoca el token) o desde su cuenta de Google.

## Texto para la política de privacidad (sección nueva)

> **Integración con Google Calendar (opcional).** Si conectas tu cuenta de
> Google, Psicomorfosis crea, actualiza y elimina en tu calendario principal los
> eventos correspondientes a tus citas, y puede generar enlaces de Google Meet
> para citas online. Solo escribimos los eventos que tú creas en la plataforma;
> no leemos tus otros eventos. Guardamos un token de acceso cifrado para
> mantener la sincronización; puedes revocarlo cuando quieras desde
> Configuración → Integraciones o desde https://myaccount.google.com/permissions.
> El uso de la información recibida de las API de Google se ajusta a la
> [Política de datos de usuario de los servicios de API de Google](https://developers.google.com/terms/api-services-user-data-policy),
> incluidos los requisitos de uso limitado.

## Cómo funciona por dentro (para responder preguntas del revisor)

- OAuth 2.0 con `access_type=offline` + `prompt=consent`; el `refresh_token` se guarda cifrado (AES-256-GCM) en la base de datos del servidor.
- Llamadas: `events.insert`, `events.patch`, `events.delete` sobre `calendars/primary`, con `conferenceDataVersion=1` para Meet.
- Desconexión: `POST https://oauth2.googleapis.com/revoke` y borrado del token.
- Código: `server/src/lib/gcal.js`, `server/src/routes/google-auth.js`.
