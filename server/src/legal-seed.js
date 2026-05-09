/**
 * Documentos legales iniciales — semilla.
 *
 * Cada entrada se inserta como `legal_documents` + una primera versión
 * en estado **draft** (la abogada los revisa, ajusta y publica desde
 * /legal-admin). El HTML está construido con la misma estructura del
 * editor TipTap para que cargue limpio al editarlo.
 *
 * Si más adelante se quiere reimportar un doc desde cero, basta con
 * borrar la fila de `legal_documents` y reiniciar — el backfill lo
 * vuelve a sembrar como draft.
 */

const RESPONSABLE = {
  nombre: "Douglas Stiven Antequera Ferrer",
  rut: "1007418662-8",
  direccion: "Calle 31A - 107, Barrio 13 de Junio, Cartagena de Indias, Colombia (cód. postal 130001)",
  email: "santequera@wailus.co",
  sitio: "https://psico.wailus.co",
};

// HTML del aviso de privacidad — réplica del contenido actual de
// src/routes/privacidad.tsx pero como HTML editable. La abogada puede
// reescribir todo desde el editor.
const PRIVACIDAD_HTML = `
<h2>1. Quién trata tus datos</h2>
<p>El Responsable del tratamiento de tus datos personales es <strong>${RESPONSABLE.nombre} (Psicomorfosis)</strong>, persona natural identificada con RUT ${RESPONSABLE.rut}, con domicilio en ${RESPONSABLE.direccion}. Para cualquier consulta, ejercicio de derechos o queja relacionada con tus datos puedes escribir a <a href="mailto:${RESPONSABLE.email}">${RESPONSABLE.email}</a>.</p>

<h2>2. Qué datos tratamos</h2>
<p>Recopilamos y tratamos las siguientes categorías de datos:</p>
<ul>
  <li><strong>Identificación:</strong> nombre, documento de identidad, fecha de nacimiento, sexo, dirección, ciudad, teléfono, email.</li>
  <li><strong>Datos clínicos sensibles:</strong> historia clínica, motivo de consulta, antecedentes, evoluciones de sesión, planes de tratamiento, prescripciones, resultados de tests psicológicos y cualquier nota que tu psicóloga registre durante la atención.</li>
  <li><strong>Datos biométricos:</strong> firma manuscrita digital (cuando firmas consentimientos en línea).</li>
  <li><strong>Datos económicos:</strong> recibos, facturas, métodos de pago utilizados, información para reembolsos a EPS o medicina prepagada cuando aplique.</li>
  <li><strong>Datos de uso de la plataforma:</strong> fecha y hora de ingreso, dirección IP, navegador y dispositivo, páginas visitadas dentro de la plataforma. Usamos esta información solo para detectar fallas y proteger tu cuenta.</li>
</ul>
<p>Los datos clínicos y biométricos son datos <em>sensibles</em> según el artículo 5 de la Ley 1581 de 2012; su tratamiento requiere tu autorización previa, expresa e informada, que recolectamos al activar tu cuenta.</p>

<h2>3. Para qué los usamos</h2>
<p>Tratamos tus datos exclusivamente para:</p>
<ul>
  <li>Prestar el servicio de atención psicológica que has acordado con tu profesional (registro de historia clínica, agendamiento de citas, aplicación de tests, entrega de tareas terapéuticas y documentos).</li>
  <li>Cumplir las obligaciones legales aplicables a la práctica de la psicología en Colombia, especialmente la conservación de la historia clínica conforme a la Resolución 1995 de 1999.</li>
  <li>Generar comprobantes de pago y soportes contables.</li>
  <li>Comunicarte recordatorios de citas, novedades de la consulta y avisos operacionales relativos al servicio (no marketing).</li>
  <li>Mantener la seguridad de la plataforma y prevenir accesos no autorizados a tu información.</li>
</ul>
<p><strong>No vendemos, alquilamos ni compartimos tus datos clínicos con terceros</strong> con fines comerciales o publicitarios.</p>

<h2>4. Quién puede ver tu información</h2>
<p>Solo tienen acceso a tus datos:</p>
<ul>
  <li>Tu psicóloga (la profesional con la que tienes consulta).</li>
  <li>El equipo técnico de Psicomorfosis con fines estrictamente operacionales (mantenimiento, soporte, respaldo) bajo deber de confidencialidad.</li>
  <li>Autoridades cuando exista una orden judicial, requerimiento legítimo o cuando la ley lo exija expresamente.</li>
</ul>

<h2>5. Por cuánto tiempo guardamos tus datos</h2>
<p>La historia clínica se conserva durante el tiempo que exija la normatividad colombiana (Resolución 1995 de 1999: mínimo 15 años desde la última atención). Los demás datos se conservan mientras tu cuenta esté activa y, posteriormente, durante el tiempo necesario para cumplir obligaciones legales y contables.</p>

<h2>6. Tus derechos</h2>
<p>Como titular de los datos, en cualquier momento puedes ejercer los derechos consagrados en el artículo 8 de la Ley 1581 de 2012:</p>
<ul>
  <li><strong>Conocer</strong> los datos que tenemos sobre ti.</li>
  <li><strong>Actualizar</strong> o <strong>rectificar</strong> datos inexactos o incompletos.</li>
  <li><strong>Solicitar prueba</strong> de la autorización otorgada para el tratamiento.</li>
  <li><strong>Ser informado</strong> sobre el uso que se ha dado a tus datos.</li>
  <li><strong>Revocar</strong> la autorización o solicitar la <strong>supresión</strong> de los datos cuando no exista deber legal de conservarlos.</li>
  <li><strong>Presentar quejas</strong> ante la Superintendencia de Industria y Comercio (SIC).</li>
</ul>
<p>Para ejercer cualquiera de estos derechos, escríbenos a <a href="mailto:${RESPONSABLE.email}">${RESPONSABLE.email}</a>. Respondemos en un máximo de 10 días hábiles para consultas y 15 para reclamos, conforme al Decreto 1377 de 2013.</p>

<h2>7. Seguridad</h2>
<p>Aplicamos medidas técnicas y administrativas para proteger tu información: las contraseñas se almacenan cifradas (nunca tenemos acceso a la contraseña en texto plano), las comunicaciones viajan por HTTPS, hacemos respaldos periódicos y limitamos el acceso al personal autorizado mediante registro de sesiones.</p>

<h2>8. Cambios al aviso</h2>
<p>Si modificamos esta política, publicaremos la nueva versión con su fecha de actualización. Si los cambios afectan de manera sustancial el tratamiento de tus datos, te lo notificaremos por email o dentro de la plataforma antes de su entrada en vigor.</p>

<h2>9. Contacto</h2>
<p><strong>${RESPONSABLE.nombre}</strong><br>
RUT: ${RESPONSABLE.rut}<br>
Dirección: ${RESPONSABLE.direccion}<br>
Email: <a href="mailto:${RESPONSABLE.email}">${RESPONSABLE.email}</a><br>
Sitio web: <a href="${RESPONSABLE.sitio}">${RESPONSABLE.sitio}</a></p>
`.trim();

// Términos y condiciones — versión beta. Estructura basada en Psiris pero
// adaptada a operación de persona natural y fase de prueba sin pago.
const TERMINOS_HTML = `
<h2>1. Qué es Psicomorfosis</h2>
<p>Psicomorfosis es una plataforma SaaS de gestión administrativa y clínica para psicólogos. Actualmente se encuentra en <strong>fase beta privada y por invitación</strong>, sin contraprestación económica entre las partes. Operamos bajo persona natural: ${RESPONSABLE.nombre}, RUT ${RESPONSABLE.rut}, con domicilio en ${RESPONSABLE.direccion}.</p>
<p>Psicomorfosis no presta servicios de salud. Es una herramienta tecnológica usada por psicólogos para organizar su consulta. La relación clínica es siempre entre el profesional y su paciente.</p>

<h2>2. Aceptación de los términos</h2>
<p>Al crear o acceder a una cuenta en Psicomorfosis aceptas estos Términos y la <a href="/privacidad">Política de privacidad</a>. Si no estás de acuerdo, no debes usar la plataforma. Estos términos pueden cambiar; cuando ocurra te notificaremos con anticipación y, si los cambios son sustanciales, requeriremos tu nueva aceptación.</p>

<h2>3. Naturaleza beta del servicio</h2>
<p>El usuario reconoce y acepta expresamente que:</p>
<ul>
  <li>El software se encuentra en pruebas y puede contener errores, fallos, interrupciones o comportamientos inesperados.</li>
  <li>No garantizamos disponibilidad ininterrumpida, integridad absoluta de los datos, ni desempeño determinado durante esta fase.</li>
  <li>Las funcionalidades pueden cambiar, suspenderse o eliminarse sin previo aviso durante la beta.</li>
  <li>El usuario conserva la responsabilidad última sobre la integridad de la historia clínica y se compromete a mantener respaldos paralelos adecuados conforme a la Resolución 1995 de 1999.</li>
</ul>

<h2>4. Tipos de cuenta</h2>
<ul>
  <li><strong>Cuenta de profesional</strong> — psicólogo que gestiona su consulta y atiende pacientes en la plataforma.</li>
  <li><strong>Cuenta de consultante</strong> — persona que recibe atención profesional y accede al portal del paciente.</li>
  <li><strong>Cuenta de administración de plataforma</strong> — propietario y soporte técnico.</li>
  <li><strong>Cuenta de asesor legal</strong> — persona autorizada para mantener actualizadas las políticas y términos del servicio.</li>
</ul>

<h2>5. Reglas de uso</h2>
<p>El usuario se compromete a:</p>
<ul>
  <li>Usar la plataforma de buena fe y conforme a su finalidad declarada.</li>
  <li>No realizar ingeniería inversa, descompilación o desensamblaje del software.</li>
  <li>No compartir credenciales con terceros ni acceder a datos de otros usuarios.</li>
  <li>No cargar contenido ilícito, ofensivo o que infrinja derechos de terceros.</li>
  <li>No realizar ataques de seguridad, denegación de servicio o sondeos de penetración no autorizados.</li>
  <li>Cumplir la Ley 1090 de 2006 (Código Deontológico del Psicólogo) y demás normas aplicables a la práctica profesional en Colombia.</li>
</ul>

<h2>6. Propiedad intelectual</h2>
<p>El software, su código fuente, diseño y marca <strong>"Psicomorfosis"</strong> son propiedad exclusiva de Psicomorfosis. Los presentes Términos no transfieren derechos de propiedad intelectual, sino una licencia limitada, no exclusiva, no transferible y revocable de uso del servicio.</p>
<p>Los datos clínicos, administrativos y comerciales que el usuario ingrese al software son y permanecen de su propiedad (o de los titulares correspondientes, según el caso). El usuario otorga a Psicomorfosis una licencia limitada para tratar dichos datos exclusivamente para los fines previstos en este documento.</p>

<h2>7. Tratamiento de datos personales</h2>
<p>El tratamiento de los datos personales se rige por nuestra <a href="/privacidad">Política de privacidad</a>, que forma parte integral de estos Términos. En particular, en relación con los datos de pacientes, Psicomorfosis actúa como Encargado del tratamiento bajo las instrucciones del psicólogo, quien actúa como Responsable conforme al artículo 25 del Decreto 1377 de 2013.</p>

<h2>8. Cancelación de la cuenta</h2>
<p>El usuario puede solicitar la eliminación total de su cuenta y datos en cualquier momento desde <em>Configuración → Mi cuenta → Eliminar mi cuenta</em>, o por escrito a <a href="mailto:${RESPONSABLE.email}">${RESPONSABLE.email}</a>. La eliminación se ejecuta en un plazo máximo de 5 días hábiles e incluye base de datos y respaldos en el siguiente ciclo de rotación (máx. 14 días).</p>
<p>Recomendamos exportar tu información antes de eliminar la cuenta cuando estés obligado a conservar la historia clínica conforme a la Resolución 1995 de 1999.</p>

<h2>9. Limitación de responsabilidad</h2>
<p>Durante la fase beta, el servicio se presta "tal cual", sin garantías expresas o implícitas. La responsabilidad total acumulada de Psicomorfosis frente al usuario por cualquier concepto se limita a <strong>mil pesos colombianos (COP $1.000)</strong>, dado que el servicio se presta sin contraprestación económica.</p>
<p>Esta limitación no aplica frente a (i) dolo o culpa grave, (ii) violación de obligaciones de confidencialidad, ni (iii) violaciones de la Ley 1581 de 2012 imputables a Psicomorfosis.</p>

<h2>10. Soporte y mantenimiento</h2>
<p>Brindamos soporte técnico por correo electrónico en <a href="mailto:${RESPONSABLE.email}">${RESPONSABLE.email}</a>, con respuesta en un máximo de 48 horas hábiles durante la beta. Realizamos mantenimiento programado fuera de horarios laborales y notificamos con al menos 24 horas de antelación cuando sea posible.</p>

<h2>11. Modificación de los términos</h2>
<p>Podemos modificar estos Términos. Te notificaremos con al menos 5 días de antelación a través de la plataforma o por correo electrónico. Si los cambios afectan sustancialmente tus derechos, te pediremos una nueva aceptación. La continuidad en el uso del servicio después de la entrada en vigor implica aceptación.</p>

<h2>12. Ley aplicable y jurisdicción</h2>
<p>Estos Términos se rigen por la <strong>Ley colombiana</strong>. Cualquier controversia se intentará resolver primero por arreglo directo durante 30 días. De no lograrse, se someterá a la <strong>jurisdicción ordinaria colombiana</strong>, ante los jueces civiles competentes de Cartagena de Indias, salvo que las partes acepten someterse a un centro de conciliación autorizado.</p>

<h2>13. Contacto</h2>
<p><strong>${RESPONSABLE.nombre}</strong><br>
RUT: ${RESPONSABLE.rut}<br>
${RESPONSABLE.direccion}<br>
<a href="mailto:${RESPONSABLE.email}">${RESPONSABLE.email}</a> · <a href="${RESPONSABLE.sitio}">${RESPONSABLE.sitio}</a></p>
`.trim();

// Acuerdo Beta + DPA — el documento más importante. Versión resumida del
// borrador completo en notas_claude/legal/01-acuerdo-beta-y-dpa.md.
// La abogada lo expandirá en el editor.
const ACUERDO_BETA_HTML = `
<h2>1. Naturaleza del acuerdo</h2>
<p>Este documento formaliza la participación del profesional en el programa <strong>Beta Privada de Psicomorfosis</strong> y regula el tratamiento de datos personales de sus pacientes a través de la plataforma. Conforme al artículo 25 del Decreto 1377 de 2013:</p>
<ul>
  <li><strong>El profesional</strong> es <em>Responsable del tratamiento</em>.</li>
  <li><strong>Psicomorfosis</strong> (${RESPONSABLE.nombre}, RUT ${RESPONSABLE.rut}) es <em>Encargado del tratamiento</em>.</li>
  <li><strong>El paciente</strong> es <em>Titular</em> y debe autorizar previamente conforme al artículo 9 de la Ley 1581 de 2012.</li>
</ul>

<h2>2. Naturaleza beta del software</h2>
<p>El software se encuentra en fase de pruebas y puede contener errores. Psicomorfosis no garantiza disponibilidad ininterrumpida ni integridad absoluta de los datos durante la beta. El profesional conserva la responsabilidad última sobre la integridad de la historia clínica conforme a la Resolución 1995 de 1999.</p>

<h2>3. Finalidad del tratamiento</h2>
<p>Psicomorfosis tratará los datos exclusivamente para operar el software (almacenamiento, búsqueda, generación de PDFs, notificaciones operacionales), realizar respaldos automáticos y resolver incidentes técnicos reportados. Psicomorfosis se abstiene expresamente de:</p>
<ul>
  <li>Vender, alquilar, ceder o compartir los datos con terceros con fines comerciales o publicitarios.</li>
  <li>Utilizar los datos para entrenar modelos de inteligencia artificial.</li>
  <li>Acceder a contenido clínico salvo cuando sea estrictamente necesario para resolver incidentes técnicos reportados, dejando registro de tal acceso.</li>
</ul>

<h2>4. Medidas de seguridad</h2>
<ul>
  <li>Cifrado en tránsito mediante TLS 1.2+ (HTTPS).</li>
  <li>Cifrado de contraseñas mediante hash bcrypt.</li>
  <li>Aislamiento por workspace a nivel de base de datos con foreign keys de eliminación en cascada.</li>
  <li>Respaldos automáticos diarios retenidos por 14 días.</li>
  <li>Acceso técnico limitado a una única persona autorizada bajo deber de confidencialidad permanente.</li>
  <li>Servidor ubicado en infraestructura de proveedor IaaS profesional.</li>
</ul>

<h2>5. Borrado y portabilidad</h2>
<p>El profesional puede solicitar en cualquier momento, mediante el botón "Eliminar mi cuenta" disponible en Configuración → Mi cuenta, o por escrito a <a href="mailto:${RESPONSABLE.email}">${RESPONSABLE.email}</a>, el borrado total de su workspace y todos los datos asociados. El borrado se ejecuta en un plazo máximo de 5 días hábiles e incluye respaldos en el siguiente ciclo de rotación (máx. 14 días).</p>

<h2>6. Notificación de incidentes</h2>
<p>Psicomorfosis notificará al profesional cualquier incidente de seguridad que afecte sus datos en un plazo máximo de 72 horas desde su detección, incluyendo naturaleza del incidente, datos afectados y medidas adoptadas.</p>

<h2>7. Confidencialidad y propiedad intelectual</h2>
<p>Cada parte se obliga a mantener confidencialidad sobre la información de la otra. El software es propiedad exclusiva de Psicomorfosis; los datos clínicos son propiedad del profesional o sus pacientes según corresponda.</p>

<h2>8. Vigencia y terminación</h2>
<p>Este acuerdo entra en vigencia desde la aceptación y permanece vigente mientras dure la beta o hasta que cualquiera de las partes lo termine con 15 días calendario de antelación. Al terminar opera el borrado de datos según la cláusula 5.</p>

<h2>9. Limitación de responsabilidad</h2>
<p>La responsabilidad total acumulada de Psicomorfosis se limita a <strong>mil pesos colombianos (COP $1.000)</strong>, dado que la beta se presta sin contraprestación económica. La limitación no aplica frente a dolo, violación de confidencialidad o de Ley 1581 de 2012.</p>

<h2>10. Ley aplicable</h2>
<p>Este acuerdo se rige por la Ley colombiana. Las disputas se resolverán ante los jueces civiles de Cartagena, Colombia.</p>
`.trim();

// Convenio Beta Tester — anexo del Acuerdo principal.
const CONVENIO_BETA_HTML = `
<h2>1. Naturaleza del programa</h2>
<p>La Beta Privada de Psicomorfosis es un programa cerrado y por invitación, sin contraprestación económica. Su objeto es validar el software con casos clínicos reales y recibir retroalimentación antes de la apertura comercial.</p>

<h2>2. Duración</h2>
<p>La beta tiene una duración estimada de 3 meses, prorrogable de común acuerdo. Psicomorfosis notificará el cierre con al menos 15 días de antelación.</p>

<h2>3. Compromisos del profesional</h2>
<ul>
  <li>Usar el software de buena fe y conforme a su finalidad clínica.</li>
  <li>Reportar errores y observaciones mediante el botón "Reportar problema" o por correo.</li>
  <li>No realizar ingeniería inversa, descompilación o desensamblaje del software.</li>
  <li>Mantener respaldo paralelo de la historia clínica conforme a la Resolución 1995 de 1999.</li>
  <li>Mantener confidencialidad sobre los aspectos no públicos del software.</li>
</ul>

<h2>4. Compromisos de Psicomorfosis</h2>
<ul>
  <li>Acceso gratuito al software durante toda la beta con todas las funcionalidades ofrecidas.</li>
  <li>Soporte técnico prioritario por correo, con respuesta en máx. 48 horas hábiles.</li>
  <li>Migración asistida sin costo si el profesional decide continuar tras la beta.</li>
  <li>Posibilidad de plan vitalicio con descuento de fundador al lanzamiento comercial (porcentaje a definir).</li>
</ul>

<h2>5. Política de uso aceptable</h2>
<p>Está prohibido tratar datos de menores sin autorización del representante legal, compartir credenciales, cargar contenido ilegal o usar el servicio en contravención al Código Deontológico del Psicólogo (Ley 1090 de 2006).</p>

<h2>6. Cesación</h2>
<p>Psicomorfosis podrá suspender o terminar la participación con preaviso de 5 días salvo causa grave, en caso de incumplimiento, uso indebido o inactividad prolongada. El profesional podrá retirarse en cualquier momento mediante eliminación de su cuenta.</p>

<h2>7. Naturaleza experimental</h2>
<p>El profesional reconoce que algunas funcionalidades pueden estar etiquetadas como "experimental" o "preview", que pueden cambiar o eliminarse sin previo aviso, y que el software no es un dispositivo médico ni sustituye el juicio clínico.</p>
`.trim();

// Plantilla del párrafo de consentimiento informado para que el psicólogo
// agregue a SU consentimiento clínico con sus pacientes.
const CONSENTIMIENTO_PACIENTE_HTML = `
<h2>Para qué sirve este texto</h2>
<p>Este es el <strong>párrafo modelo</strong> que cada psicólogo debe incorporar a su propio formato de consentimiento informado clínico que firma con sus pacientes al iniciar el proceso terapéutico. Cumple el artículo 9 de la Ley 1581 de 2012 y el artículo 6 del Decreto 1377 de 2013.</p>
<p><em>No reemplaza el consentimiento informado completo del psicólogo</em>; complementa la sección sobre tratamiento de datos.</p>

<h2>Texto sugerido</h2>
<blockquote>
<p><strong>Tratamiento de datos personales en la plataforma Psicomorfosis</strong></p>
<p>Para la gestión administrativa y clínica de tu proceso terapéutico utilizo la plataforma <strong>Psicomorfosis</strong> (<a href="${RESPONSABLE.sitio}">${RESPONSABLE.sitio}</a>), operada por <strong>${RESPONSABLE.nombre}</strong>, identificado con RUT ${RESPONSABLE.rut}, con domicilio en Cartagena de Indias, Colombia (en adelante, "el Encargado"). En esta plataforma se almacenan, de manera digital y protegida:</p>
<ul>
  <li>Tus datos de identificación (nombre, documento, contacto, fecha de nacimiento).</li>
  <li>Tu historia clínica: motivo de consulta, antecedentes, evolución de las sesiones, planes de tratamiento, prescripciones, resultados de tests psicológicos y notas clínicas.</li>
  <li>Tu firma manuscrita digital cuando firmes documentos en línea (dato biométrico).</li>
  <li>Información económica relacionada con los pagos de tus sesiones.</li>
</ul>
<p><strong>Finalidad</strong>: estos datos se tratan exclusivamente para prestarte el servicio profesional acordado, cumplir las obligaciones legales aplicables a la psicología en Colombia (incluida la conservación de la historia clínica conforme a la Resolución 1995 de 1999) y emitir los soportes contables.</p>
<p><strong>Datos sensibles</strong>: los datos clínicos y biométricos son datos sensibles según el artículo 5 de la Ley 1581 de 2012. Su tratamiento requiere tu autorización previa, expresa e informada, que otorgas al firmar este documento. Tu negativa <strong>no afecta</strong> la prestación del servicio: si lo prefieres, puedes pedirme una alternativa en papel.</p>
<p><strong>Quién puede ver tu información</strong>: yo como profesional tratante, el Encargado de la plataforma con fines técnicos bajo deber de confidencialidad permanente, y autoridades competentes únicamente cuando exista orden judicial o requerimiento legal expreso. El Encargado <strong>no usa</strong> tus datos para fines comerciales, publicitarios, entrenamiento de IA, ni los comparte con terceros.</p>
<p><strong>Tiempo de conservación</strong>: la historia clínica se conserva el tiempo que exige la ley colombiana (mínimo 15 años desde la última atención, Resolución 1995 de 1999). Los demás datos se conservan mientras nuestra relación profesional esté vigente y el tiempo necesario para cumplir obligaciones legales.</p>
<p><strong>Tus derechos</strong> (Habeas Data, art. 8 Ley 1581 de 2012): puedes conocer, actualizar, rectificar o solicitar la supresión de tus datos en cualquier momento. Puedes solicitar prueba de la presente autorización, ser informado sobre el uso dado a tus datos y revocar la autorización cuando no exista deber legal de conservar la información. Para ejercerlos, escríbeme a <strong>[email del psicólogo]</strong>, o contacta directamente al Encargado en <a href="mailto:${RESPONSABLE.email}">${RESPONSABLE.email}</a>. También puedes presentar quejas ante la Superintendencia de Industria y Comercio (SIC).</p>
<p><strong>Aceptación</strong>: al firmar este documento, autorizas expresamente a que tu psicólogo/a y el Encargado traten tus datos personales y sensibles bajo los términos descritos.</p>
</blockquote>

<h2>Notas para el psicólogo</h2>
<ul>
  <li>Este texto no reemplaza tu consentimiento informado completo (encuadre, secreto profesional, deberes éticos según Ley 1090/2006).</li>
  <li>Para pacientes menores de edad, la autorización debe firmarla quien ejerza la patria potestad o representación legal.</li>
  <li>Guarda una copia firmada en tu archivo personal y, si la plataforma lo permite, súbela como adjunto al expediente del paciente.</li>
  <li>Si los términos cambian, deberás obtener una nueva autorización del paciente.</li>
  <li>Si un paciente se niega, ofrécele una alternativa de gestión en papel y respeta su decisión.</li>
</ul>
`.trim();

const stripHtml = (html) =>
  html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

// Política de aceptación bloqueante:
//   - privacidad y terminos: aceptación implícita por uso. Páginas
//     públicas, sin modal de re-aceptación; cumple con la Ley 1581
//     porque las páginas están disponibles permanentemente y los
//     pacientes ya consienten formalmente al activar su cuenta.
//   - acuerdo-beta y convenio-beta-tester: SÍ requieren aceptación
//     explícita en modal bloqueante para todo psicólogo nuevo —
//     son documentos contractuales que definen la relación durante
//     la beta privada.
//   - consentimiento-paciente: plantilla informativa, no se acepta
//     en plataforma; se firma fuera (paciente con su psicólogo).
export const LEGAL_DOCUMENTS_SEED = [
  {
    slug: "privacidad",
    title: "Política de tratamiento de datos personales",
    description:
      "Política pública sobre tratamiento de datos personales conforme a la Ley 1581 de 2012.",
    public_path: "/privacidad",
    requires_acceptance: 0,
    acceptance_audience: "none",
    body_html: PRIVACIDAD_HTML,
  },
  {
    slug: "terminos",
    title: "Términos y condiciones",
    description: "Términos generales del servicio durante la beta privada.",
    public_path: "/terminos",
    requires_acceptance: 0,
    acceptance_audience: "none",
    body_html: TERMINOS_HTML,
  },
  {
    slug: "acuerdo-beta",
    title: "Acuerdo de prueba beta + Tratamiento de datos (DPA)",
    description:
      "Acuerdo entre Psicomorfosis (Encargado) y cada psicólogo (Responsable). Define obligaciones recíprocas, seguridad, retención y borrado.",
    public_path: null,
    requires_acceptance: 1,
    acceptance_audience: "staff",
    body_html: ACUERDO_BETA_HTML,
  },
  {
    slug: "convenio-beta-tester",
    title: "Convenio del programa de Beta Tester",
    description:
      "Compromisos y beneficios del psicólogo participante en la beta privada.",
    public_path: null,
    requires_acceptance: 1,
    acceptance_audience: "staff",
    body_html: CONVENIO_BETA_HTML,
  },
  {
    slug: "consentimiento-paciente",
    title: "Plantilla de consentimiento informado del paciente",
    description:
      "Texto modelo que cada psicólogo agrega a su consentimiento clínico para autorizar el tratamiento de datos en Psicomorfosis.",
    public_path: null,
    requires_acceptance: 0,
    acceptance_audience: "none",
    body_html: CONSENTIMIENTO_PACIENTE_HTML,
  },
];

/**
 * Inserta los documentos iniciales como version 1 en estado **draft**
 * (para que la abogada los revise y publique). Idempotente por slug:
 * si un documento ya existe, no se toca.
 *
 * También sincroniza los flags de aceptación (`requires_acceptance` y
 * `acceptance_audience`) de los documentos ya existentes con la
 * política definida en LEGAL_DOCUMENTS_SEED. Esto permite cambiar la
 * política de aceptación (por ejemplo, "términos ya no requiere modal
 * bloqueante") sin tocar la DB a mano. NO toca el `body_html` de los
 * documentos existentes — eso lo edita la asesora.
 */
export function seedLegalDocuments(db) {
  const insDoc = db.prepare(`
    INSERT INTO legal_documents (slug, title, description, public_path, requires_acceptance, acceptance_audience)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  const insVer = db.prepare(`
    INSERT INTO legal_document_versions
      (document_id, version_label, body_html, body_text, summary_of_changes, status)
    VALUES (?, ?, ?, ?, ?, 'draft')
  `);
  const get = db.prepare("SELECT id, requires_acceptance, acceptance_audience FROM legal_documents WHERE slug = ?");
  const updateFlags = db.prepare(`
    UPDATE legal_documents
    SET requires_acceptance = ?, acceptance_audience = ?
    WHERE slug = ?
  `);

  let inserted = 0;
  let synced = 0;
  for (const d of LEGAL_DOCUMENTS_SEED) {
    const existing = get.get(d.slug);
    if (!existing) {
      const docId = insDoc.run(
        d.slug, d.title, d.description, d.public_path,
        d.requires_acceptance, d.acceptance_audience,
      ).lastInsertRowid;
      insVer.run(
        docId, "2026-v1", d.body_html, stripHtml(d.body_html),
        "Importación inicial desde código fuente. Pendiente de revisión por la asesora legal.",
      );
      inserted++;
      continue;
    }
    // Doc ya existía: sincronizar política de aceptación si difiere.
    const flagsChanged =
      existing.requires_acceptance !== d.requires_acceptance ||
      existing.acceptance_audience !== d.acceptance_audience;
    if (flagsChanged) {
      updateFlags.run(d.requires_acceptance, d.acceptance_audience, d.slug);
      synced++;
    }
  }
  if (inserted > 0) {
    console.log(`[db] seed legal docs: ${inserted} documento(s) creado(s) como draft`);
  }
  if (synced > 0) {
    console.log(`[db] seed legal docs: ${synced} documento(s) con flags de aceptación actualizados`);
  }
}
