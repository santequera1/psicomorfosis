import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";
import { LandingHeader } from "@/components/landing/LandingHeader";
import { Hero } from "@/components/landing/Hero";
import { BeforeAfter } from "@/components/landing/BeforeAfter";
import { Features } from "@/components/landing/Features";
import { ThemeShowcase } from "@/components/landing/ThemeShowcase";
import { WhyUs } from "@/components/landing/WhyUs";
import { DemoForm } from "@/components/landing/DemoForm";
import { LandingFooter } from "@/components/landing/LandingFooter";

/**
 * Landing pública. Forzamos tema claro y mostramos en este orden:
 *  Hero → Antes/Después → Capacidades (showcase) → Estilo (modos)
 *  → Manifiesto/Por qué → Formulario.
 *
 * Antes/Después va arriba a propósito: conecta emocional antes de
 * mostrar pantallas. El usuario llega ya con apetito por la solución.
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
    root.classList.remove("dark");
    return () => {
      if (hadDark) root.classList.add("dark");
    };
  }, []);

  return (
    <div className="bg-bg min-h-screen text-ink-900">
      <LandingHeader />
      <main>
        <Hero />
        <BeforeAfter />
        <Features />
        <ThemeShowcase />
        <WhyUs />
        <DemoForm />
      </main>
      <LandingFooter />
    </div>
  );
}
