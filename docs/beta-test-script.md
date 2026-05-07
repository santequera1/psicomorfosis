# Guion de prueba — Beta privada Psicomorfosis

> Pegar este documento tal cual en Notion / Google Docs. El formato es Markdown estandar; ambas plataformas lo parsean al pegar.

**Antes de empezar:** prueba en escritorio (Chrome o Firefox). Si encuentras cualquier cosa rara — visual, lenta, mal redactada, confusa — usa el boton **"Reportar problema"** del sidebar (pega capturas con Ctrl+V).

**Tiempo total estimado:** 45-60 min en una sesion, o partido en 2 sesiones de 30 min.

---

## 1. Acceso (2 min)

| # | Que hacer | Que deberias ver |
|---|---|---|
| 1.1 | Entra a https://psico.wailus.co/login con el usuario y contrasena que te enviamos | Pantalla de login con la palabra "Psicomorfosis", footer con links a Privacidad y Terminos |
| 1.2 | Antes de loguearte, click en "Aviso de privacidad" | Documento legal con RUT y direccion visibles, sin "Por completar" |
| 1.3 | Vuelve atras y haz login | El **tour de Bienvenida** debe arrancar solo en menos de 1s, mostrando 7 pasos con flecha "Siguiente" |
| 1.4 | Recorre el tour completo o saltalo con el boton X | Termina y no vuelve a aparecer aunque refresques |

## 2. Configura tu perfil (3 min)

| # | Que hacer | Que deberias ver |
|---|---|---|
| 2.1 | Sidebar → **Configuracion** → **Perfil profesional** | Formulario con tus datos |
| 2.2 | Edita tu titulo, telefono, enfoque terapeutico, guarda | Toast verde "Perfil actualizado" |
| 2.3 | Pestana **Apariencia** → cambia a tema oscuro (o usa Ctrl+Shift+L) | Toda la app cambia a oscuro inmediatamente, sin flash blanco al recargar |
| 2.4 | Vuelve a tema claro | Mismo comportamiento, sin parpadeos |

## 3. Crea un paciente y agenda una cita (8 min)

| # | Que hacer | Que deberias ver |
|---|---|---|
| 3.1 | Sidebar → **Pacientes** | Lista (vacia si es tu primera cuenta). El **tour de Pacientes** arranca solo |
| 3.2 | Click "Nuevo paciente". Llena: nombre completo, documento, fecha de nacimiento, sexo, telefono, **email tuyo real** (lo usaremos en el bloque 4), modalidad "Individual", motivo de consulta breve | El paciente aparece arriba de la lista |
| 3.3 | Click en su nombre | Se abre la ficha. **Tour de Historia clinica** arranca |
| 3.4 | Verifica que el header muestre: avatar con iniciales, nombre, edad, etiquetas | Todo correcto y sin "undefined" / cuadros vacios |
| 3.5 | Boton **+** desde el FAB (abajo derecha) → "Nueva cita" | Se abre modal con el paciente pre-seleccionado si vienes de su ficha; si no, se busca |
| 3.6 | Programa la cita para **manana**, modalidad individual, hora 10:30 am, duracion 50 min | Toast verde, vuelves a la pagina |
| 3.7 | Sidebar → **Agenda** | La cita aparece en manana. Click en ella |
| 3.8 | En el modal de la cita prueba **"Generar recibo"** | Se abre el modal de recibo con el paciente y concepto pre-rellenados. Llena monto, metodo, **referencia/comprobante** y guarda. **El modal NO debe cerrarse al hacer click en el campo Referencia** |
| 3.9 | Sidebar → **Recibos** (`/facturacion`) | **Tour de Recibos** arranca. El recibo recien creado aparece arriba |

## 4. Invita al paciente al portal (5 min)

> Aqui vas a alternar entre tu cuenta de psicologo y la del paciente. Usa una **ventana de incognito** para no chocar las dos sesiones.

| # | Que hacer | Que deberias ver |
|---|---|---|
| 4.1 | Vuelve a la ficha del paciente del bloque 3 → boton **"Invitar al portal"** | Modal con un link unico. Copialo |
| 4.2 | Abre **ventana de incognito**, pega el link | Pagina "Hola, [primer nombre]" con tu psicologa, formulario de contrasena, **checkbox obligatorio** "He leido y acepto..." |
| 4.3 | Intenta hacer click en "Activar mi cuenta" sin tildar el checkbox | El boton esta deshabilitado |
| 4.4 | Tilda, crea contrasena de minimo 8 caracteres, click "Activar" | Te lleva a `/p/inicio`, saluda con tu nombre, ves la cita de manana |
| 4.5 | Como paciente, navega: Inicio, Citas, Tareas, Tests, Documentos | Todas las pestanas cargan sin error |
| 4.6 | Footer del portal → click **"Reportar problema"** | Modal de reporte abre. Cierra sin enviar |
| 4.7 | Logout del portal y vuelve a entrar con email + contrasena | Login del paciente funciona |

## 5. Aplica un test psicometrico (5 min)

| # | Que hacer | Que deberias ver |
|---|---|---|
| 5.1 | Como psicologo, sidebar → **Tests** | Catalogo. **Tour de Tests** arranca |
| 5.2 | Busca "MCMI" o cualquier test del catalogo | Aparece en la lista |
| 5.3 | Click en el → "Asignar a paciente" → escoge el paciente del bloque 3 | Toast verde, queda pendiente |
| 5.4 | (Como paciente, en incognito) → portal → **Tests** → respondelo completo | Al terminar muestra "test enviado" |
| 5.5 | (Como psicologo) → ficha del paciente → pestana **Tests** | El test aparece como completado. Click "Ver detalle por escala" abre modal con resultados |

## 6. Crea y firma un documento (8 min)

| # | Que hacer | Que deberias ver |
|---|---|---|
| 6.1 | Sidebar → **Documentos** → vista **Carpetas** | Cada paciente con docs es una carpeta. El tuyo aun no aparece (no tiene docs) |
| 6.2 | Cambia a **Lista** o **Tarjetas** → "Nuevo documento" → escoge "Consentimiento informado" → vincula al paciente | Editor abre con el documento |
| 6.3 | Edita el cuerpo, guarda, click en **"Enviar para firma"** | Estado cambia a "pendiente_firma" |
| 6.4 | (Como paciente, incognito) → portal → **Documentos** → tu documento aparece marcado "para firmar" | Lo abre y muestra preview |
| 6.5 | Click "Firmar" → si el paciente tiene firma guardada, la usa; si no, se la pide | Tras firmar, el documento queda firmado |
| 6.6 | (Como psicologo) → /documentos → vuelve a vista carpetas | El paciente ahora aparece como una carpeta con "1 documento". **Comprueba que el nombre aparece sin importar si pusiste apodo o no** |

## 7. Reportar problema (3 min)

> Lo mas importante del piloto. Lo que reportes aqui lo recibe el equipo de Psicomorfosis.

| # | Que hacer | Que deberias ver |
|---|---|---|
| 7.1 | Toma una captura de pantalla de cualquier cosa que te parecio confusa hasta aqui (Win+Shift+S en Windows, Cmd+Shift+4 en Mac) | Tienes la imagen en el portapapeles |
| 7.2 | Click en **"Reportar problema"** en el sidebar | Modal abre |
| 7.3 | Pega con **Ctrl+V** dentro del modal | La imagen aparece como thumbnail |
| 7.4 | Escribe una descripcion breve (minimo 5 caracteres). Puedes adjuntar mas con drag & drop o el boton "Adjuntar imagen" (max 5) | Contador "1/5" o "2/5" segun cuantas |
| 7.5 | Click "Enviar reporte" | Toast "Gracias! Tu reporte fue enviado" |

## 8. Casos especificos a probar (10 min)

Estos son casos donde sospechamos que aun hay rugosidades. Si encuentras algo, **siempre reportalo** con captura.

| # | Caso | Resultado esperado |
|---|---|---|
| 8.1 | Edita el paciente del bloque 3 y borra el campo "nombre preferido (apodo)" si lo tenia. Guarda | En la lista, ficha y carpeta de docs el nombre sigue apareciendo correctamente — **nunca debe quedar en blanco** |
| 8.2 | En la agenda, deja pasar la hora de una cita mas 30 min sin hacer nada. Refresca | La cita debe quedar marcada como "atendida" automaticamente |
| 8.3 | En `/configuracion` → **Tutoriales** → **"Reiniciar tutoriales"** | Toast con cuantos se reiniciaron. Refresca y deberian volver a aparecer al entrar a cada pagina |
| 8.4 | Cierra sesion (sidebar → Cerrar sesion) y vuelve a entrar | Te queda en `/login`. No debe haber un loop ni redireccion a otra cuenta |
| 8.5 | Prueba en **movil** (o reduce la ventana a ~375px de ancho): sidebar, agenda, ficha de paciente, modal de cita | Todo legible, sin scroll horizontal, botones tocables |
| 8.6 | Prueba a borrar un paciente. Lee el dialogo de confirmacion con atencion | Debe pedir escribir el nombre completo del paciente antes de eliminar |

## 9. Mientras pruebas, observa y anota

Cosas que valen oro como feedback aunque no sean bugs:

- **Idioma:** hay alguna palabra que NO se diria asi en Colombia? (vos vs tu, "actualmente" vs "ahorita", etc.)
- **Jerga clinica:** algun termino te suena ajeno o generico? Tu sabes la jerga real que usas dia a dia
- **Velocidad sentida:** algo se sintio lento? Algun boton al que diste click no respondio de inmediato?
- **Atajos que esperabas:** "Aqui esperaba poder..." — anotalo aunque parezca obvio
- **Funciones que no encontraste:** si buscaste algo en el menu y no lo viste, dilo aunque despues lo encontraras
- **Formularios incomodos:** campos que se sintieron mal puestos, en mal orden, o con etiquetas confusas

## 10. Cierre

Manda **un audio de WhatsApp de 2-3 minutos** al final con tu impresion general. No tiene que ser estructurado:

- Volverias a usarla manana? Por que si o no?
- Las 2 cosas que mas te gustaron
- Las 2 cosas que mas te molestaron
- Que le falta para reemplazar lo que usas hoy (Excel, papel, otro software)?

---

Gracias por ayudarnos a probar. Cualquier reporte tuyo nos ahorra dias de bugs en cuentas reales.
