# Campaña: cambio de dominio a psicomorfosis.co

Estado: **propuesta, pendiente de aprobación**. Nada enviado.

## Situación real (datos de producción, 21 ago 2026)

Hoy `psico.wailus.co` y `psicomorfosis.co` sirven **la misma app** (mismo
nginx, mismo `server_name`). No hay redirección: quien entre por el dominio
viejo seguirá entrando por el viejo indefinidamente.

Usuarios staff con correo: 19. Pero:

| Grupo | Cuántos | Qué son |
|---|---|---|
| Activos (entraron en agosto) | 4 | Nathaly, Dairo, Stiven ×2 |
| Probaron en mayo y no volvieron | 7 | beta testers de la primera ola |
| Nunca entraron | 7 | cuentas creadas por admin que no se usaron |
| Recién registrados con Google (21 ago) | 1 | `ajtputilidades@gmail.com`, sin actividad |

Conclusión: la "campaña" son **~12 personas reales**. No hace falta
herramienta de email marketing; basta nuestro Mailcow con un script que
envía uno a uno (sin BCC masivo, que dispara filtros de spam).

## Plan en 3 pasos

### 1. Redirección 301 (técnico, 10 min) — **antes** del correo

`psico.wailus.co/*` → `https://psicomorfosis.co/*` (misma ruta). Así el
enlace viejo que tenga alguien guardado sigue funcionando y lo lleva al
nuevo. Sin esto, el correo es solo una sugerencia.

Efecto colateral inevitable: la sesión vive en `localStorage`, que es por
dominio. **Cada persona tendrá que iniciar sesión una vez más** en el
dominio nuevo. Hay que decirlo en el correo para que no parezca un fallo
("se me cerró la sesión sola" otra vez).

Qué NO cambia: usuarios, contraseñas, pacientes, historias. Mismo servidor,
misma base de datos.

### 2. Anuncio dentro de la app (Novedades) — mismo día

Ya existe el sistema de anuncios (campanita). Un anuncio "Nuevo dominio:
psicomorfosis.co" llega a quien entre, sin depender de que lea el correo.
Con el cambio de hoy, solo se auto-abre si es reciente — y lo será.

### 3. Correo — un solo envío, personalizado, desde `hola@psicomorfosis.co`

- **A quién**: los 12 con actividad + los 7 que nunca entraron (para estos
  es más una re-invitación que un aviso). Excluir cuentas demo/internas
  (`psicologo.demo@`, `admin@miclinica.co`, los dos de Stiven).
- **Cuándo**: martes o miércoles, 9–10 am. Nunca viernes tarde.
- **Remitente**: `Stiven de Psicomorfosis <hola@psicomorfosis.co>`, con
  `Reply-To` a tu correo real. Que respondan a una persona.
- **Un solo correo**. No "recordatorio en 3 días": a 12 personas se les
  escribe por WhatsApp si hace falta.

## Borrador del correo

**Asunto:** Psicomorfosis estrena casa: psicomorfosis.co

> Hola {nombre},
>
> Te escribo porque desde hoy Psicomorfosis vive en su propio dominio:
> **https://psicomorfosis.co**
>
> Nada cambia en tu cuenta: mismo usuario, misma contraseña, mismos
> pacientes e historias. Solo cambia la dirección. La antigua
> (psico.wailus.co) te redirige sola, pero conviene que actualices el
> favorito.
>
> Lo único que notarás: la primera vez que entres por la nueva dirección te
> pedirá iniciar sesión de nuevo. Es normal — la sesión va atada al dominio.
>
> Y una novedad que estrenamos con el cambio: ahora puedes **entrar con tu
> cuenta de Google** con un clic, si lo prefieres.
>
> {bloque_si_nunca_entro}
>
> Si algo no te funciona, responde a este correo y lo miro yo.
>
> Stiven
> Psicomorfosis · https://psicomorfosis.co

`{bloque_si_nunca_entro}` (solo para los 7 que nunca iniciaron sesión):

> Vi que aún no has entrado. Tu cuenta sigue activa y es gratuita: entra
> con tu correo y, si no recuerdas la contraseña, respóndeme y te la
> restablezco en el momento.

## Lo que necesito de ti para ejecutar

1. **OK a la redirección 301** (paso 1). Es el único cambio con efecto
   inmediato sobre gente real: les cierra la sesión una vez.
2. **OK al texto** del correo, o tus cambios.
3. **Día y hora** de envío.
4. Si quieres que el correo salga de `hola@` (existe en Mailcow) o de otro
   buzón.

Con eso: hago la redirección, publico el anuncio en Novedades, y envío el
correo desde un script con pausa de unos segundos entre cada destinatario.
Te paso el log con el estado de cada envío.
