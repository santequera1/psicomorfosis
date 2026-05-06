import { createFileRoute, Link } from "@tanstack/react-router";
import { PortalCanvas } from "./p_.activar.$token";

/**
 * Aviso de privacidad / Política de tratamiento de datos personales.
 *
 * Documento público, visible sin autenticación. Cumple con los mínimos
 * de la Ley 1581/2012 (Habeas Data) y el Decreto 1377/2013 de Colombia
 * para tratamiento de datos sensibles (historia clínica, tests
 * psicológicos, datos biométricos como firma).
 *
 * Importante: este documento debe ser revisado por un abogado antes de
 * abrir la operación a escala. Los datos del Responsable están como
 * constantes arriba para que sea fácil actualizarlos.
 */

const RESPONSABLE = {
  nombre: "Psicomorfosis (Wailus S.A.S.)",
  // TODO: completar NIT cuando esté.
  nit: "Por completar",
  // TODO: completar dirección física cuando esté.
  direccion: "Por completar",
  email: "santequera@wailus.co",
  sitio: "https://psico.wailus.co",
};

const ULTIMA_ACTUALIZACION = "6 de mayo de 2026";

export const Route = createFileRoute("/privacidad")({
  head: () => ({ meta: [{ title: "Aviso de privacidad — Psicomorfosis" }] }),
  component: PrivacidadPage,
});

function PrivacidadPage() {
  return (
    <PortalCanvas>
      <article className="max-w-3xl mx-auto prose-psm">
        <header className="mb-8">
          <p className="text-xs uppercase tracking-widest text-brand-700 font-medium">
            Documento legal
          </p>
          <h1 className="font-serif text-3xl sm:text-4xl text-ink-900 mt-2 leading-tight">
            Aviso de privacidad y política de tratamiento de datos
          </h1>
          <p className="text-sm text-ink-500 mt-3">
            Última actualización: {ULTIMA_ACTUALIZACION}
          </p>
        </header>

        <Section title="1. Quién trata tus datos">
          <p>
            El Responsable del tratamiento de tus datos personales es{" "}
            <strong>{RESPONSABLE.nombre}</strong>, identificado con NIT{" "}
            {RESPONSABLE.nit}, con domicilio en {RESPONSABLE.direccion}.
            Para cualquier consulta, ejercicio de derechos o queja
            relacionada con tus datos puedes escribir a{" "}
            <a href={`mailto:${RESPONSABLE.email}`} className="text-brand-700 underline">
              {RESPONSABLE.email}
            </a>
            .
          </p>
        </Section>

        <Section title="2. Qué datos tratamos">
          <p>Recopilamos y tratamos las siguientes categorías de datos:</p>
          <ul>
            <li>
              <strong>Identificación:</strong> nombre, documento de identidad,
              fecha de nacimiento, sexo, dirección, ciudad, teléfono, email.
            </li>
            <li>
              <strong>Datos clínicos sensibles:</strong> historia clínica,
              motivo de consulta, antecedentes, evoluciones de sesión, planes
              de tratamiento, prescripciones, resultados de tests psicológicos
              y cualquier nota que tu psicóloga registre durante la atención.
            </li>
            <li>
              <strong>Datos biométricos:</strong> firma manuscrita digital
              (cuando firmas consentimientos en línea).
            </li>
            <li>
              <strong>Datos económicos:</strong> recibos, facturas, métodos de
              pago utilizados, información para reembolsos a EPS o medicina
              prepagada cuando aplique.
            </li>
            <li>
              <strong>Datos de uso de la plataforma:</strong> fecha y hora de
              ingreso, dirección IP, navegador y dispositivo, páginas visitadas
              dentro de la plataforma. Usamos esta información solo para
              detectar fallas y proteger tu cuenta.
            </li>
          </ul>
          <p>
            Los datos clínicos y biométricos son datos <em>sensibles</em> según
            el artículo 5 de la Ley 1581 de 2012; su tratamiento requiere tu
            autorización previa, expresa e informada, que recolectamos al
            activar tu cuenta.
          </p>
        </Section>

        <Section title="3. Para qué los usamos">
          <p>Tratamos tus datos exclusivamente para:</p>
          <ul>
            <li>
              Prestar el servicio de atención psicológica que has acordado con
              tu profesional (registro de historia clínica, agendamiento de
              citas, aplicación de tests, entrega de tareas terapéuticas y
              documentos).
            </li>
            <li>
              Cumplir las obligaciones legales aplicables a la práctica de la
              psicología en Colombia, especialmente la conservación de la
              historia clínica conforme a la Resolución 1995 de 1999.
            </li>
            <li>
              Generar comprobantes de pago y soportes contables.
            </li>
            <li>
              Comunicarte recordatorios de citas, novedades de la consulta y
              avisos operacionales relativos al servicio (no marketing).
            </li>
            <li>
              Mantener la seguridad de la plataforma y prevenir accesos no
              autorizados a tu información.
            </li>
          </ul>
          <p>
            <strong>No vendemos, alquilamos ni compartimos tus datos clínicos
              con terceros</strong> con fines comerciales o publicitarios.
          </p>
        </Section>

        <Section title="4. Quién puede ver tu información">
          <p>Solo tienen acceso a tus datos:</p>
          <ul>
            <li>Tu psicóloga (la profesional con la que tienes consulta).</li>
            <li>
              El equipo técnico de Psicomorfosis con fines estrictamente
              operacionales (mantenimiento, soporte, respaldo) bajo deber de
              confidencialidad.
            </li>
            <li>
              Autoridades cuando exista una orden judicial, requerimiento
              legítimo o cuando la ley lo exija expresamente.
            </li>
          </ul>
          <p>
            Si tu psicóloga trabaja en una organización con varios
            profesionales, los datos administrativos (citas, recibos) pueden
            ser visibles para personal autorizado de esa organización; los
            datos clínicos (historia, notas, tests) permanecen visibles solo
            para la profesional tratante salvo que tú autorices lo contrario.
          </p>
        </Section>

        <Section title="5. Por cuánto tiempo guardamos tus datos">
          <p>
            La historia clínica se conserva durante el tiempo que exija la
            normatividad colombiana (Resolución 1995 de 1999: mínimo 15 años
            desde la última atención). Los demás datos se conservan mientras
            tu cuenta esté activa y, posteriormente, durante el tiempo
            necesario para cumplir obligaciones legales y contables.
          </p>
        </Section>

        <Section title="6. Tus derechos">
          <p>
            Como titular de los datos, en cualquier momento puedes ejercer los
            derechos consagrados en el artículo 8 de la Ley 1581 de 2012:
          </p>
          <ul>
            <li>
              <strong>Conocer</strong> los datos que tenemos sobre ti.
            </li>
            <li>
              <strong>Actualizar</strong> o <strong>rectificar</strong> datos
              inexactos o incompletos.
            </li>
            <li>
              <strong>Solicitar prueba</strong> de la autorización otorgada
              para el tratamiento.
            </li>
            <li>
              <strong>Ser informado</strong> sobre el uso que se ha dado a tus
              datos.
            </li>
            <li>
              <strong>Revocar</strong> la autorización o solicitar la{" "}
              <strong>supresión</strong> de los datos cuando no exista deber
              legal de conservarlos.
            </li>
            <li>
              <strong>Presentar quejas</strong> ante la Superintendencia de
              Industria y Comercio (SIC).
            </li>
          </ul>
          <p>
            Para ejercer cualquiera de estos derechos, escríbenos a{" "}
            <a href={`mailto:${RESPONSABLE.email}`} className="text-brand-700 underline">
              {RESPONSABLE.email}
            </a>
            . Respondemos en un máximo de 10 días hábiles para consultas y 15
            para reclamos, conforme al Decreto 1377 de 2013.
          </p>
        </Section>

        <Section title="7. Seguridad">
          <p>
            Aplicamos medidas técnicas y administrativas para proteger tu
            información: las contraseñas se almacenan cifradas (nunca tenemos
            acceso a la contraseña en texto plano), las comunicaciones viajan
            por HTTPS, hacemos respaldos periódicos y limitamos el acceso al
            personal autorizado mediante registro de sesiones.
          </p>
        </Section>

        <Section title="8. Cambios al aviso">
          <p>
            Si modificamos esta política, publicaremos la nueva versión con
            su fecha de actualización. Si los cambios afectan de manera
            sustancial el tratamiento de tus datos, te lo notificaremos por
            email o dentro de la plataforma antes de su entrada en vigor.
          </p>
        </Section>

        <Section title="9. Contacto">
          <p>
            <strong>{RESPONSABLE.nombre}</strong>
            <br />
            Email:{" "}
            <a href={`mailto:${RESPONSABLE.email}`} className="text-brand-700 underline">
              {RESPONSABLE.email}
            </a>
            <br />
            Sitio web:{" "}
            <a href={RESPONSABLE.sitio} className="text-brand-700 underline">
              {RESPONSABLE.sitio}
            </a>
          </p>
        </Section>

        <footer className="mt-10 pt-6 border-t border-line-200 text-sm text-ink-500">
          <Link to="/terminos" className="text-brand-700 hover:underline">
            Términos y condiciones
          </Link>
          {" · "}
          <Link to="/login" className="text-brand-700 hover:underline">
            Volver al inicio
          </Link>
        </footer>
      </article>
    </PortalCanvas>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-8">
      <h2 className="font-serif text-xl text-ink-900 mb-3">{title}</h2>
      <div className="text-sm text-ink-700 leading-relaxed space-y-3 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:space-y-1.5 [&_a]:text-brand-700 [&_strong]:text-ink-900 [&_strong]:font-semibold">
        {children}
      </div>
    </section>
  );
}
