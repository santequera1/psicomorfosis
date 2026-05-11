import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/app/AppShell";
import { AdminDashboard } from "@/components/dashboards/AdminDashboard";
import { useAutoTour, welcomeTour, TOUR_NAMES } from "@/lib/tours";
import { api, getStoredUser } from "@/lib/api";

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
  const user = getStoredUser();

  // El platform admin no usa el flujo clínico día a día — su trabajo
  // es administrar cuentas, ver reportes y monitorear uso. Su dashboard
  // natural es /platform. Redirigimos en cliente (después de hidratar)
  // para no romper SSR ni hacer flash del AdminDashboard.
  useEffect(() => {
    const u = getStoredUser();
    if (u?.isLegalAdmin) {
      // El asesor legal no usa el flujo clínico — su área es /legal-admin.
      navigate({ to: "/legal-admin", replace: true });
      return;
    }
    if (u?.isPlatformAdmin) {
      navigate({ to: "/platform", replace: true });
    }
  }, [navigate]);

  // Misma query que PendingLegalGate (mismo queryKey, cache compartida —
  // no genera fetch extra). Mientras haya documentos legales pendientes
  // de aceptar, NO arrancamos el tour: el modal bloqueante ocupa toda
  // la pantalla y un tour encima sería un sándwich de capas confuso.
  // Cuando el usuario acepta el último doc, la query se invalida desde
  // PendingLegalGate, hasPendingLegal pasa a false y el tour arranca
  // limpiamente 1.5s después (suficiente para que el modal se desmonte).
  const { data: legalPending, isLoading: legalLoading } = useQuery({
    queryKey: ["legal-pending", user?.id],
    queryFn: () => api.legalMyPending(),
    enabled: !!user && !user.isLegalAdmin,
    refetchOnWindowFocus: false,
    staleTime: 60_000,
  });
  const hasPendingLegal = (legalPending?.pending ?? []).length > 0;

  // Tour de bienvenida — auto-arranca la primera vez que el psicólogo
  // entra al dashboard. La lógica idempotente de useAutoTour evita
  // que se vuelva a disparar después.
  useAutoTour(TOUR_NAMES.welcome, welcomeTour, {
    enabled: !legalLoading && !hasPendingLegal,
  });
  return (
    <AppShell>
      <AdminDashboard />
    </AppShell>
  );
}
