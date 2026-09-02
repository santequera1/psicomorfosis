import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";
import { LandingHeader } from "@/components/landing/LandingHeader";
import { MobileBottomNav } from "@/components/landing/MobileBottomNav";
import { LandingBackdrop } from "@/components/landing/LandingBackdrop";
import { Hero2 } from "@/components/landing/Hero2";
import { FeatureLinks } from "@/components/landing/FeatureLinks";
import { Features } from "@/components/landing/Features";
import { FlowTimeline } from "@/components/landing/FlowTimeline";
import { ThemeShowcase } from "@/components/landing/ThemeShowcase";
import { Pricing2 } from "@/components/landing/Pricing2";
import { LegalTrust } from "@/components/landing/LegalTrust";
import { SignupCTA } from "@/components/landing/SignupCTA";
import { LauraLandingChat } from "@/components/landing/LauraLandingChat";
import { LandingFooter } from "@/components/landing/LandingFooter";

/**
 * Landing v2 — EXPERIMENTO (1 sep 2026), conviviendo con /inicio para
 * comparar. Cambios frente a la v1:
 *   - Hero sin el ángulo "sin WhatsApp ni Excel": ahora habla de lo que
 *     la plataforma ES, con fila de integraciones reales.
 *   - Capacidades como lista interactiva con hover (FeatureLinks) en
 *     lugar de la sección larga de Features.
 *   - Sección de precios con el precio de mercado tachado y "Gratis
 *     durante todo el 2026".
 *   - Fuera Antes/Después, Dictado por voz y Por qué → página más corta.
 *
 * noindex: mientras sea experimento no debe competir con /inicio en
 * Google (acabamos de armar sitemap + Search Console).
 */
export const Route = createFileRoute("/inicio2")({
  head: () => ({
    meta: [
      { title: "Psicomorfosis · App para psicólogos" },
      { name: "robots", content: "noindex, nofollow" },
      {
        name: "description",
        content:
          "Una plataforma para toda tu práctica clínica. Pacientes, agenda, historia clínica, documentos, psicometría y seguimiento terapéutico en un solo lugar.",
      },
    ],
  }),
  component: Inicio2Page,
});

function Inicio2Page() {
  // Igual que /inicio: la landing siempre en light + tema "clinico",
  // restaurando lo que el usuario tuviera al salir.
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
            (el carrusel original) solo en móvil — el ancla #capabilities
            debe funcionar en ambos. */}
        <div id="capabilities" className="scroll-mt-24" aria-hidden />
        <FeatureLinks />
        <div className="md:hidden">
          <Features
            sectionId="capabilities-movil"
            title="Todo tu consultorio, una sola pestaña."
            subtitle="Cada sección nació de conversaciones con psicólogos en Colombia. Desliza y mírala por dentro."
          />
        </div>
        <FlowTimeline />
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
