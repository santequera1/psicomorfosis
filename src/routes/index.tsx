import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { AppShell } from "@/components/app/AppShell";
import { AdminDashboard } from "@/components/dashboards/AdminDashboard";
import { useAutoTour, welcomeTour, TOUR_NAMES } from "@/lib/tours";
import { getStoredUser } from "@/lib/api";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Inicio · Psicomorfosis" },
      { name: "description", content: "Panorama clínico y administrativo de la clínica de salud mental Psicomorfosis." },
      { property: "og:title", content: "Psicomorfosis — Sistema clínico de salud mental" },
      { property: "og:description", content: "Dashboard humano y contenido para gestionar pacientes, agenda y atención en salud mental." },
    ],
  }),
  component: IndexPage,
});

function IndexPage() {
  const navigate = useNavigate();

  // El platform admin no usa el flujo clínico día a día — su trabajo
  // es administrar cuentas, ver reportes y monitorear uso. Su dashboard
  // natural es /platform. Redirigimos en cliente (después de hidratar)
  // para no romper SSR ni hacer flash del AdminDashboard.
  useEffect(() => {
    const u = getStoredUser();
    if (u?.isLegalAdmin) {
      // La asesora legal no usa el flujo clínico — su área es /legal-admin.
      navigate({ to: "/legal-admin", replace: true });
      return;
    }
    if (u?.isPlatformAdmin) {
      navigate({ to: "/platform", replace: true });
    }
  }, [navigate]);

  // Tour de bienvenida — auto-arranca la primera vez que el psicólogo
  // entra al dashboard. La lógica idempotente de useAutoTour evita
  // que se vuelva a disparar después.
  useAutoTour(TOUR_NAMES.welcome, welcomeTour);
  return (
    <AppShell>
      <AdminDashboard />
    </AppShell>
  );
}
