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
  // La landing siempre debe verse en light + tema "clinico".
  // Si el usuario llega desde la app con dark/aurora activos, hay que
  // limpiar TODOS los atributos del <html> que controlan tokens, no
  // solo la clase .dark. Si solo limpias .dark, aurora se queda con
  // sus tokens oscuros y los textos quedan casi invisibles sobre el
  // fondo claro de la landing (bug que vimos en mobile).
  useEffect(() => {
    const root = document.documentElement;
    const prev = {
      dark: root.classList.contains("dark"),
      mode: root.getAttribute("data-mode"),
      theme: root.getAttribute("data-theme"),
      scrollBehavior: root.style.scrollBehavior,
    };
    root.classList.remove("dark");
    root.setAttribute("data-mode", "light");
    root.setAttribute("data-theme", "clinico");
    root.style.scrollBehavior = "smooth";
    return () => {
      if (prev.dark) root.classList.add("dark");
      if (prev.mode) root.setAttribute("data-mode", prev.mode);
      else root.removeAttribute("data-mode");
      if (prev.theme) root.setAttribute("data-theme", prev.theme);
      else root.removeAttribute("data-theme");
      root.style.scrollBehavior = prev.scrollBehavior;
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
