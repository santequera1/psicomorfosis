import { createFileRoute, Link } from "@tanstack/react-router";
import { PortalCanvas } from "./p_.activar.$token";

/**
 * Términos y condiciones de uso de la plataforma Psicomorfosis.
 *
 * Documento público. Cubre el uso del software como servicio (SaaS) por
 * parte de psicólogos y, separadamente, el uso del portal por parte de
 * pacientes. Pensado para una beta privada — debe revisarse con un
 * abogado antes de la operación a escala.
 */

const PROVEEDOR = {
  nombre: "Psicomorfosis (Wailus S.A.S.)",
  email: "santequera@wailus.co",
  sitio: "https://psico.wailus.co",
};

const ULTIMA_ACTUALIZACION = "6 de mayo de 2026";

export const Route = createFileRoute("/terminos")({
  head: () => ({ meta: [{ title: "Términos y condiciones — Psicomorfosis" }] }),
  component: TerminosPage,
});

function TerminosPage() {
  return (
    <PortalCanvas>
      <article className="max-w-3xl mx-auto">
        <header className="mb-8">
          <p className="text-xs uppercase tracking-widest text-brand-700 font-medium">
            Documento legal
          </p>
          <h1 className="font-serif text-3xl sm:text-4xl text-ink-900 mt-2 leading-tight">
            Términos y condiciones de uso
          </h1>
          <p className="text-sm text-ink-500 mt-3">
            Última actualización: {ULTIMA_ACTUALIZACION}
          </p>
        </header>

        <Section title="1. Aceptación">
          <p>
            Al usar la plataforma Psicomorfosis aceptas estos términos. Si no
            estás de acuerdo con alguna parte, te pedimos no usar el servicio.
            Estos términos complementan al{" "}
            <Link to="/privacidad" className="text-brand-700 underline">
              aviso de privacidad
            </Link>{" "}
            y deben leerse en conjunto con él.
          </p>
        </Section>

        <Section title="2. Qué es Psicomorfosis">
          <p>
            Psicomorfosis es una plataforma de software como servicio (SaaS)
            para profesionales de la psicología en Colombia. Permite gestionar
            historia clínica, agendamiento, tests psicométricos, tareas
            terapéuticas, documentos y cobros, así como ofrecer un portal a
            los pacientes para que consulten sus citas, tareas y documentos.
          </p>
          <p>
            <strong>Psicomorfosis no presta servicios de salud.</strong> La
            atención psicológica la presta el profesional con quien tienes
            relación contractual o de servicio. Psicomorfosis solo provee la
            herramienta tecnológica.
          </p>
        </Section>

        <Section title="3. Cuentas">
          <p>
            Hay dos tipos de cuentas:
          </p>
          <ul>
            <li>
              <strong>Cuenta de profesional:</strong> creada por el equipo de
              Psicomorfosis o por una organización autorizada.
            </li>
            <li>
              <strong>Cuenta de paciente:</strong> creada por invitación de
              tu psicóloga, mediante un enlace personal.
            </li>
          </ul>
          <p>
            Eres responsable de mantener tu contraseña en secreto y de las
            actividades que se realicen desde tu cuenta. Si sospechas que
            alguien accedió sin autorización, escríbenos de inmediato a{" "}
            <a href={`mailto:${PROVEEDOR.email}`} className="text-brand-700 underline">
              {PROVEEDOR.email}
            </a>
            .
          </p>
        </Section>

        <Section title="4. Uso aceptable">
          <p>Al usar Psicomorfosis te comprometes a:</p>
          <ul>
            <li>
              No subir contenido ilícito, ofensivo, fraudulento o que infrinja
              derechos de terceros.
            </li>
            <li>
              No intentar acceder a cuentas o información que no te pertenece.
            </li>
            <li>
              No realizar ingeniería inversa del software, ni intentar evadir
              medidas de seguridad.
            </li>
            <li>
              No usar la plataforma para enviar spam, phishing o software
              malicioso.
            </li>
            <li>
              Usar el servicio cumpliendo la legislación colombiana aplicable
              (Ley 1581 de 2012, Resolución 1995 de 1999, Código Deontológico
              y Bioético del Psicólogo Ley 1090 de 2006, entre otras).
            </li>
          </ul>
          <p>
            El incumplimiento de estos compromisos puede resultar en suspensión
            o cancelación de tu cuenta.
          </p>
        </Section>

        <Section title="5. Propiedad de la información">
          <p>
            <strong>Profesionales:</strong> los datos clínicos que ingresan en
            la plataforma son responsabilidad suya como tratantes. Pueden
            exportarlos en cualquier momento. Conservamos la información el
            tiempo que la ley exige (Resolución 1995/1999) aunque cancelen su
            cuenta.
          </p>
          <p>
            <strong>Pacientes:</strong> los datos personales que ingresas son
            tuyos. Puedes solicitar acceso, corrección o supresión según lo
            descrito en el aviso de privacidad.
          </p>
        </Section>

        <Section title="6. Disponibilidad del servicio">
          <p>
            Trabajamos para mantener la plataforma disponible 24/7, pero
            durante esta fase beta no garantizamos disponibilidad ininterrumpida.
            Pueden ocurrir mantenimientos planeados o no planeados. Te
            avisaremos con anticipación cuando sean previsibles.
          </p>
          <p>
            Hacemos respaldos diarios automáticos de la información, pero te
            recomendamos exportar periódicamente la información crítica para
            tu práctica.
          </p>
        </Section>

        <Section title="7. Pagos (cuando aplique)">
          <p>
            Durante la fase beta el servicio puede ser gratuito para los
            psicólogos invitados. Cuando el servicio sea de pago, los precios,
            métodos y condiciones de cobro se comunicarán con anticipación
            antes de aplicar cualquier cargo.
          </p>
        </Section>

        <Section title="8. Limitación de responsabilidad">
          <p>
            Psicomorfosis se ofrece "tal cual" durante la fase beta. En la
            máxima medida permitida por la ley, no somos responsables por:
          </p>
          <ul>
            <li>
              Decisiones clínicas tomadas por los profesionales con base en
              información de la plataforma — la responsabilidad clínica es del
              profesional.
            </li>
            <li>
              Pérdidas económicas indirectas derivadas de interrupciones del
              servicio.
            </li>
            <li>
              Datos cargados incorrectamente por los usuarios.
            </li>
          </ul>
          <p>
            Esta limitación no aplica a daños ocasionados por culpa grave o
            dolo nuestro, ni a obligaciones que por ley no puedan limitarse.
          </p>
        </Section>

        <Section title="9. Cambios a los términos">
          <p>
            Podemos actualizar estos términos. Si los cambios son sustanciales,
            te avisaremos por email o dentro de la plataforma con al menos 15
            días de anticipación. El uso continuado tras la entrada en vigor
            implica aceptación.
          </p>
        </Section>

        <Section title="10. Ley aplicable">
          <p>
            Estos términos se rigen por la legislación colombiana. Cualquier
            controversia se resolverá ante los jueces competentes de la
            República de Colombia.
          </p>
        </Section>

        <Section title="11. Contacto">
          <p>
            <strong>{PROVEEDOR.nombre}</strong>
            <br />
            Email:{" "}
            <a href={`mailto:${PROVEEDOR.email}`} className="text-brand-700 underline">
              {PROVEEDOR.email}
            </a>
            <br />
            Sitio:{" "}
            <a href={PROVEEDOR.sitio} className="text-brand-700 underline">
              {PROVEEDOR.sitio}
            </a>
          </p>
        </Section>

        <footer className="mt-10 pt-6 border-t border-line-200 text-sm text-ink-500">
          <Link to="/privacidad" className="text-brand-700 hover:underline">
            Aviso de privacidad
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
