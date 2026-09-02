import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";
import { LandingHeader } from "@/components/landing/LandingHeader";
import { MobileBottomNav } from "@/components/landing/MobileBottomNav";
import { LandingBackdrop } from "@/components/landing/LandingBackdrop";
import { Hero2 } from "@/components/landing/Hero2";
import { FeatureLinks } from "@/components/landing/FeatureLinks";
import { Features } from "@/components/landing/Features";
import { TareasShowcase } from "@/components/landing/TareasShowcase";
import { ThemeShowcase } from "@/components/landing/ThemeShowcase";
import { Pricing2 } from "@/components/landing/Pricing2";
import { LegalTrust } from "@/components/landing/LegalTrust";
import { SignupCTA } from "@/components/landing/SignupCTA";
import { LauraLandingChat } from "@/components/landing/LauraLandingChat";
import { LandingFooter } from "@/components/landing/LandingFooter";

/**
 * Landing pública OFICIAL — la v2 promovida el 2 sep 2026 tras iterar
 * en /inicio2 (que ahora solo redirige aquí). Orden de secciones:
 *   Hero → Capacidades (hover desktop / carrusel móvil) → Tablero de
 *   Tareas interactivo → Estilo (temas por scroll) → Precios → Legal →
 *   Registro. Laura flota como demo guiada y se abre sola al llegar
 *   al final.
 */
export const Route = createFileRoute("/inicio")({
  head: () => ({
    meta: [
      { title: "Psicomorfosis · App para psicólogos" },
      {
        name: "description",
        content:
          "Una plataforma para toda tu práctica clínica. Pacientes, agenda, historia clínica, documentos, psicometría y seguimiento terapéutico en un solo lugar — conectada con Google Calendar, Meet y WhatsApp.",
      },
      { property: "og:title", content: "Psicomorfosis · App para psicólogos" },
      {
        property: "og:description",
        content:
          "Una plataforma para toda tu práctica clínica. Pacientes, agenda, historia clínica, documentos, psicometría y seguimiento terapéutico en un solo lugar.",
      },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://psicomorfosis.co/inicio" },
      { property: "og:image", content: "https://psicomorfosis.co/landing/og-psicomorfosis.jpg" },
      { property: "og:image:secure_url", content: "https://psicomorfosis.co/landing/og-psicomorfosis.jpg" },
      { property: "og:image:type", content: "image/jpeg" },
      { property: "og:image:width", content: "1200" },
      { property: "og:image:height", content: "698" },
      {
        property: "og:image:alt",
        content: "Psicomorfosis — Una plataforma para toda tu práctica clínica.",
      },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:image", content: "https://psicomorfosis.co/landing/og-psicomorfosis.jpg" },
    ],
  }),
  component: InicioPage,
});

function InicioPage() {
  // La landing siempre en light + tema "clinico", restaurando lo que el
  // usuario tuviera al salir (ver bootstrap en __root para el primer paint).
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
        <Hero2 />
        {/* Ancla compartida: FeatureLinks vive solo en desktop y Features
            (el carrusel) solo en móvil — el ancla #capabilities debe
            funcionar en ambos. */}
        <div id="capabilities" className="scroll-mt-24" aria-hidden />
        <FeatureLinks />
        <div className="md:hidden">
          <Features
            sectionId="capabilities-movil"
            title="Todo tu consultorio, una sola pestaña."
            subtitle="Cada sección nació de conversaciones con psicólogos en Colombia. Desliza y mírala por dentro."
          />
        </div>
        <TareasShowcase />
        <ThemeShowcase scrollDriven />
        <Pricing2 />
        <LegalTrust />
        <SignupCTA />
      </main>
      <LauraLandingChat />
      <LandingFooter />
    </div>
  );
}
