import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app/AppShell";
import { AdminDashboard } from "@/components/dashboards/AdminDashboard";

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
  return (
    <AppShell>
      <AdminDashboard />
    </AppShell>
  );
}
