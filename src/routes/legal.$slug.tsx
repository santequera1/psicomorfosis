import { createFileRoute } from "@tanstack/react-router";
import { LegalPublicPage } from "@/components/legal/LegalPublicPage";

/**
 * Lector público de cualquier documento legal por slug.
 *
 * /terminos y /privacidad tienen ruta propia por ser URLs de cara al
 * público. El resto —acuerdo de beta, convenio de beta tester— no tenía
 * dónde leerse antes de crear cuenta: solo aparecía dentro del modal
 * bloqueante, ya con la sesión abierta. Ahora el formulario de registro
 * puede enlazarlos y la aceptación es informada.
 */
export const Route = createFileRoute("/legal/$slug")({
  head: () => ({ meta: [{ title: "Documento legal — Psicomorfosis" }] }),
  component: LegalSlugPage,
});

function LegalSlugPage() {
  const { slug } = Route.useParams();
  return <LegalPublicPage slug={slug} fallbackTitle="Documento legal" />;
}
