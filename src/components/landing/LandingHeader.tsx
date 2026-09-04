import { Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { UserRound, LogIn, UserPlus } from "lucide-react";
import { cn } from "@/lib/utils";
import { Logo } from "@/components/app/Logo";
import { WhatsAppIcon } from "./BrandIcons";
import { useScrolledPast } from "./useScrollReveal";

/**
 * Header sticky de la landing. Transparente arriba, gana fondo con
 * backdrop-blur al hacer scroll (igual que webs tipo Linear / Synex).
 * Sticky para que siempre esté disponible el botón de login.
 */
export function LandingHeader() {
  const scrolled = useScrolledPast(40);
  // Menú de cuenta en móvil: en pantallas chicas "Iniciar sesión" +
  // "Registrarse" no cabían (el botón quedaba cortado). Un ícono de
  // usuario despliega las dos opciones.
  const [userOpen, setUserOpen] = useState(false);
  const userRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!userOpen) return;
    const close = (e: PointerEvent) => {
      if (!userRef.current?.contains(e.target as Node)) setUserOpen(false);
    };
    window.addEventListener("pointerdown", close);
    return () => window.removeEventListener("pointerdown", close);
  }, [userOpen]);
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
        <Link
          to="/inicio"
          className="inline-flex items-center gap-2 text-ink-900 -m-2 p-2 rounded-md"
          aria-label="Ir al inicio"
        >
          <Logo className="h-7 w-7 text-brand-700" />
          <span className="font-serif text-lg">Psicomorfosis</span>
        </Link>
        <nav className="hidden md:flex items-center text-sm text-ink-700">
          <a href="#capabilities" className="px-4 hover:text-brand-700 transition-colors">Plataforma</a>
          <span className="h-3 w-px bg-line-200" aria-hidden />
          <a href="#flujo" className="px-4 hover:text-brand-700 transition-colors">Cómo funciona</a>
          <span className="h-3 w-px bg-line-200" aria-hidden />
          <a href="#estilo" className="px-4 hover:text-brand-700 transition-colors">Estilo</a>
          <span className="h-3 w-px bg-line-200" aria-hidden />
          <a href="#precios" className="px-4 hover:text-brand-700 transition-colors">Precios</a>
          <span className="h-3 w-px bg-line-200" aria-hidden />
          <a href="#demo" className="px-4 hover:text-brand-700 transition-colors">Acceso</a>
        </nav>
        {/* Desktop: texto + botón, como siempre */}
        <div className="hidden sm:flex items-center gap-2">
          <Link
            to="/login"
            className="inline-flex h-9 px-3 rounded-md text-sm text-ink-700 hover:text-ink-900 hover:bg-bg-100/60 items-center transition-colors whitespace-nowrap"
          >
            Iniciar sesión
          </Link>
          <a
            href="#demo"
            className="h-9 px-4 rounded-md bg-brand-700 text-white text-sm font-medium hover:bg-brand-800 inline-flex items-center gap-1.5 transition-colors whitespace-nowrap"
          >
            Registrarse
          </a>
        </div>

        {/* Móvil: contacto + ícono de usuario con menú */}
        <div className="flex sm:hidden items-center gap-1.5">
          <a
            href="https://wa.me/573127268780"
            target="_blank"
            rel="noreferrer"
            aria-label="Escríbenos por WhatsApp"
            className="h-9 w-9 rounded-md border border-line-200 bg-surface text-[#25D366] inline-flex items-center justify-center active:scale-95 transition-transform"
          >
            <WhatsAppIcon className="h-4 w-4" />
          </a>
          <div ref={userRef} className="relative">
            <button
              type="button"
              onClick={() => setUserOpen((v) => !v)}
              aria-label="Cuenta"
              aria-expanded={userOpen}
              className={cn(
                "h-9 w-9 rounded-md inline-flex items-center justify-center transition-colors",
                userOpen ? "bg-brand-700 text-white" : "bg-brand-700/10 text-brand-800 border border-brand-200",
              )}
            >
              <UserRound className="h-4 w-4" />
            </button>
            {userOpen && (
              <div className="absolute right-0 top-full mt-2 w-44 rounded-xl border border-line-200 bg-surface shadow-xl overflow-hidden">
                <Link
                  to="/login"
                  onClick={() => setUserOpen(false)}
                  className="flex items-center gap-2.5 px-3.5 py-3 text-sm text-ink-800 hover:bg-bg-50 border-b border-line-100"
                >
                  <LogIn className="h-4 w-4 text-ink-400" /> Iniciar sesión
                </Link>
                <a
                  href="#demo"
                  onClick={() => setUserOpen(false)}
                  className="flex items-center gap-2.5 px-3.5 py-3 text-sm font-medium text-brand-800 hover:bg-brand-50"
                >
                  <UserPlus className="h-4 w-4 text-brand-700" /> Registrarse gratis
                </a>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
