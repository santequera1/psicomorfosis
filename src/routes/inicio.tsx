import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";
import { LandingHeader } from "@/components/landing/LandingHeader";
import { Hero } from "@/components/landing/Hero";
import { Features } from "@/components/landing/Features";
import { WhyUs } from "@/components/landing/WhyUs";
import { DemoForm } from "@/components/landing/DemoForm";
import { LandingFooter } from "@/components/landing/LandingFooter";

/**
 * Landing page pública. Sin auth, sin AppShell. La usa marketing
 * para presentar la plataforma (rifa de mayo 26 y siguientes).
 *
 * Diseño:
 *  - Tema claro forzado (no respetamos preferencia de usuario para
 *    no romper la estética curada de la landing).
 *  - Animaciones con CSS + Intersection Observer (sin GSAP).
 *  - Hero con video en bucle. Resto stagger en scroll.
 */
export const Route = createFileRoute("/inicio")({
  head: () => ({
    meta: [
      { title: "Psicomorfosis · La consulta clínica sin WhatsApp ni Excel" },
      { name: "description", content: "Plataforma clínica integral para psicólogas colombianas: agenda, historia clínica, tests psicométricos, firma electrónica y portal del paciente." },
      { property: "og:title", content: "Psicomorfosis · Plataforma clínica para psicólogas" },
      { property: "og:description", content: "Agenda, historia, tests, firma, portal del paciente. Hecha con psicólogas reales en Colombia." },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://psico.wailus.co/inicio" },
    ],
  }),
  component: InicioPage,
});

function InicioPage() {
  // Forzamos tema claro para la landing — la mezcla de dark + dashboards
  // se ve confusa en una página comercial. Limpiamos al desmontar.
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
        <Features />
        <WhyUs />
        <DemoForm />
      </main>
      <LandingFooter />
    </div>
  );
}
