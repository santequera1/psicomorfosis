import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";
import { LandingHeader } from "@/components/landing/LandingHeader";
import { MobileBottomNav } from "@/components/landing/MobileBottomNav";
import { LandingBackdrop } from "@/components/landing/LandingBackdrop";
import { Hero } from "@/components/landing/Hero";
import { BeforeAfter } from "@/components/landing/BeforeAfter";
import { Features } from "@/components/landing/Features";
import { VoiceDictation } from "@/components/landing/VoiceDictation";
import { ThemeShowcase } from "@/components/landing/ThemeShowcase";
import { WhyUs } from "@/components/landing/WhyUs";
import { LegalTrust } from "@/components/landing/LegalTrust";
import { FinalCTA } from "@/components/landing/FinalCTA";
// import { Developers } from "@/components/landing/Developers"; // oculta temporalmente
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
      { title: "Psicomorfosis · App para psicólogos" },
      {
        name: "description",
        content:
          "Una plataforma diseñada para el día a día del psicólogo. Organiza tus sesiones, administra pacientes, registra información clínica, aplica evaluaciones y mantén el control de tu práctica profesional desde una única herramienta.",
      },
      { property: "og:title", content: "Psicomorfosis · App para psicólogos" },
      {
        property: "og:description",
        content:
          "Una plataforma diseñada para el día a día del psicólogo. Organiza tus sesiones, administra pacientes, registra información clínica, aplica evaluaciones y mantén el control de tu práctica profesional desde una única herramienta.",
      },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://psico.wailus.co/inicio" },
      { property: "og:image", content: "https://psico.wailus.co/landing/preview-psicoapp.jpg" },
      { property: "og:image:secure_url", content: "https://psico.wailus.co/landing/preview-psicoapp.jpg" },
      { property: "og:image:type", content: "image/jpeg" },
      { property: "og:image:width", content: "1920" },
      { property: "og:image:height", content: "1117" },
      {
        property: "og:image:alt",
        content: "Psicomorfosis — App para psicólogos. Diseñada para el día a día del psicólogo.",
      },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:image", content: "https://psico.wailus.co/landing/preview-psicoapp.jpg" },
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
      <MobileBottomNav />
      <main>
        <Hero />
        <BeforeAfter />
        <Features />
        <VoiceDictation />
        <ThemeShowcase />
        <WhyUs />
        <LegalTrust />
        <FinalCTA />
        {/* <Developers /> oculta temporalmente */}
        <DemoForm />
      </main>
      <LandingFooter />
    </div>
  );
}
