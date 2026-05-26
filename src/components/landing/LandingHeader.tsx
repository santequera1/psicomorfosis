import { Link } from "@tanstack/react-router";
import { cn } from "@/lib/utils";
import { Logo } from "@/components/app/Logo";
import { useScrolledPast } from "./useScrollReveal";

/**
 * Header sticky de la landing. Transparente arriba, gana fondo con
 * backdrop-blur al hacer scroll (igual que webs tipo Linear / Synex).
 * Sticky para que siempre esté disponible el botón de login.
 */
export function LandingHeader() {
  const scrolled = useScrolledPast(40);
  return (
    <header
      className={cn(
        "fixed top-0 inset-x-0 z-50 transition-all duration-300",
        scrolled
          ? "bg-surface/85 backdrop-blur-md border-b border-line-100"
          : "bg-transparent border-b border-transparent",
      )}
    >
      <div className="max-w-7xl mx-auto h-16 px-4 sm:px-6 lg:px-8 flex items-center justify-between gap-4">
        <a
          href="#hero"
          className="inline-flex items-center gap-2 text-ink-900"
          aria-label="Ir al inicio"
        >
          <Logo className="h-7 w-7 text-brand-700" />
          <span className="font-serif text-lg">Psicomorfosis</span>
        </a>
        <nav className="hidden md:flex items-center gap-7 text-sm text-ink-700">
          <a href="#features" className="hover:text-brand-700 transition-colors">Funciones</a>
          <a href="#why" className="hover:text-brand-700 transition-colors">Por qué</a>
          <a href="#demo" className="hover:text-brand-700 transition-colors">Solicitar demo</a>
        </nav>
        <div className="flex items-center gap-2">
          <Link
            to="/login"
            className="hidden sm:inline-flex h-9 px-3 rounded-md text-sm text-ink-700 hover:text-ink-900 hover:bg-bg-100/60 items-center transition-colors"
          >
            Iniciar sesión
          </Link>
          <a
            href="#demo"
            className="h-9 px-4 rounded-md bg-brand-700 text-white text-sm font-medium hover:bg-brand-800 inline-flex items-center gap-1.5 transition-colors"
          >
            Solicitar demo
          </a>
        </div>
      </div>
    </header>
  );
}
