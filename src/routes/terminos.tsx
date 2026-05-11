import { createFileRoute } from "@tanstack/react-router";
import { LegalPublicPage } from "@/components/legal/LegalPublicPage";

/**
 * Términos y condiciones de uso de la plataforma Psicomorfosis.
 *
 * Documento público — el contenido vive en base de datos y lo edita
 * el asesor legal desde /legal-admin. Esta ruta solo carga y muestra.
 */

export const Route = createFileRoute("/terminos")({
  head: () => ({ meta: [{ title: "Términos y condiciones — Psicomorfosis" }] }),
  component: TerminosPage,
});

function TerminosPage() {
  return (
    <LegalPublicPage
      slug="terminos"
      fallbackTitle="Términos y condiciones"
    />
  );
}
