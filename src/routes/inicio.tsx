import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";
import { LandingHeader } from "@/components/landing/LandingHeader";
import { LandingBackdrop } from "@/components/landing/LandingBackdrop";
import { Hero } from "@/components/landing/Hero";
import { BeforeAfter } from "@/components/landing/BeforeAfter";
import { Features } from "@/components/landing/Features";
import { ThemeShowcase } from "@/components/landing/ThemeShowcase";
import { WhyUs } from "@/components/landing/WhyUs";
import { FinalCTA } from "@/components/landing/FinalCTA";
import { DemoForm } from "@/components/landing/DemoForm";
import { LandingFooter } from "@/components/landing/LandingFooter";

/**
 * Landing pública. Forzamos tema claro + smooth scroll mientras
 * esté montada. Orden de secciones:
 *   Hero → Antes/Después → Capacidades → Estilo → Por qué → Final CTA → Form.
 *
 * El LandingBackdrop vive detrás de todo (position fixed) con blobs
 * de gradiente animados muy desaturados. El resto de secciones usa
 * fondos transparentes para que esos blobs respiren.
 */
export const Route = createFileRoute("/inicio")({
  head: () => ({
    meta: [
      { title: "Psicomorfosis · La consulta clínica sin WhatsApp ni Excel" },
      {
        name: "description",
        content:
          "Menos tiempo administrando. Más tiempo atendiendo pacientes. La nueva generación de herramientas clínicas para psicólogos en Colombia.",
      },
      { property: "og:title", content: "Psicomorfosis · Plataforma clínica para psicólogos" },
      {
        property: "og:description",
        content:
          "Organiza pacientes, sesiones, historia clínica y seguimiento terapéutico desde un solo lugar. Hecha con psicólogas reales en Colombia.",
      },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://psico.wailus.co/inicio" },
    ],
  }),
  component: InicioPage,
});

function InicioPage() {
  useEffect(() => {
    const root = document.documentElement;
    const hadDark = root.classList.contains("dark");
    const prevScrollBehavior = root.style.scrollBehavior;
    root.classList.remove("dark");
    root.style.scrollBehavior = "smooth";
    return () => {
      if (hadDark) root.classList.add("dark");
      root.style.scrollBehavior = prevScrollBehavior;
    };
  }, []);

  return (
    <div className="min-h-screen text-ink-900 relative">
      <LandingBackdrop />
      <LandingHeader />
      <main>
        <Hero />
        <BeforeAfter />
        <Features />
        <ThemeShowcase />
        <WhyUs />
        <FinalCTA />
        <DemoForm />
      </main>
      <LandingFooter />
    </div>
  );
}
