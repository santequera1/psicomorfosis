import { createFileRoute } from "@tanstack/react-router";
import { LegalPublicPage } from "@/components/legal/LegalPublicPage";

/**
 * Aviso de privacidad / Política de tratamiento de datos personales.
 *
 * Documento público, visible sin autenticación. El contenido vive en
 * la base de datos y lo edita la asesora legal desde /legal-admin.
 * Esta página solo lo carga y lo renderiza con TOC sticky lateral.
 *
 * Ley 1581/2012 (Habeas Data) + Decreto 1377/2013.
 */

export const Route = createFileRoute("/privacidad")({
  head: () => ({ meta: [{ title: "Aviso de privacidad — Psicomorfosis" }] }),
  component: PrivacidadPage,
});

function PrivacidadPage() {
  return (
    <LegalPublicPage
      slug="privacidad"
      fallbackTitle="Aviso de privacidad"
    />
  );
}
