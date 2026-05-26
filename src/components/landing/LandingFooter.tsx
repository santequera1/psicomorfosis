import { Link } from "@tanstack/react-router";
import { Logo } from "@/components/app/Logo";
import { Mail, Heart } from "lucide-react";

/**
 * Footer mobile-first. En mobile: logo arriba, links en grid 2 cols
 * compacto, copyright al fondo. Añadimos pb extra en mobile para
 * dejar espacio al bottom-nav fijo que vive sobre el footer.
 */
export function LandingFooter() {
  return (
    <footer className="border-t border-line-100 bg-bg-50 pb-24 md:pb-0">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-12">
        {/* Mobile layout */}
        <div className="md:hidden space-y-7">
          <div className="flex items-center gap-3">
            <Logo className="h-7 w-7 text-brand-700" />
            <div>
              <p className="font-serif text-lg text-ink-900 leading-none">Psicomorfosis</p>
              <p className="text-xs text-ink-500 mt-1">Plataforma clínica · Colombia 🇨🇴</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-y-3 gap-x-4 text-sm">
            <a href="#capabilities" className="text-ink-700 hover:text-brand-700 transition-colors">Plataforma</a>
            <a href="#estilo" className="text-ink-700 hover:text-brand-700 transition-colors">Estilo</a>
            <a href="#why" className="text-ink-700 hover:text-brand-700 transition-colors">Por qué</a>
            <a href="#developers" className="text-ink-700 hover:text-brand-700 transition-colors">Nosotros</a>
            <a href="#demo" className="text-ink-700 hover:text-brand-700 transition-colors">Acceso</a>
            <a
              href="mailto:stivenantequera@gmail.com"
              className="inline-flex items-center gap-1.5 text-ink-700 hover:text-brand-700 transition-colors"
            >
              <Mail className="h-3.5 w-3.5" /> Contacto
            </a>
          </div>

          <div className="flex items-center gap-4 text-xs text-ink-500">
            <Link to="/privacidad" className="hover:text-ink-900 transition-colors">Privacidad</Link>
            <span className="h-3 w-px bg-line-200" />
            <Link to="/terminos" className="hover:text-ink-900 transition-colors">Términos</Link>
          </div>

          <div className="pt-5 border-t border-line-100 space-y-2 text-xs text-ink-400">
            <p>© {new Date().getFullYear()} Psicomorfosis</p>
            <p className="inline-flex items-center gap-1.5">
              Hecho con <Heart className="h-3 w-3 text-brand-700" /> en Cartagena
            </p>
          </div>
        </div>

        {/* Desktop layout — el original sin cambios */}
        <div className="hidden md:block">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
            <div className="flex items-center gap-3">
              <Logo className="h-7 w-7 text-brand-700" />
              <div>
                <p className="font-serif text-lg text-ink-900 leading-none">Psicomorfosis</p>
                <p className="text-xs text-ink-500 mt-1">Plataforma clínica · Colombia 🇨🇴</p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-x-6 gap-y-3 text-sm">
              <a href="#capabilities" className="text-ink-500 hover:text-ink-900 transition-colors">Plataforma</a>
              <a href="#demo" className="text-ink-500 hover:text-ink-900 transition-colors">Quiero acceso</a>
              <Link to="/privacidad" className="text-ink-500 hover:text-ink-900 transition-colors">Privacidad</Link>
              <Link to="/terminos" className="text-ink-500 hover:text-ink-900 transition-colors">Términos</Link>
              <a
                href="mailto:stivenantequera@gmail.com"
                className="inline-flex items-center gap-1.5 text-ink-500 hover:text-ink-900 transition-colors"
              >
                <Mail className="h-3.5 w-3.5" /> Contacto
              </a>
            </div>
          </div>
          <div className="mt-8 pt-6 border-t border-line-100 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-ink-400">
            <p>© {new Date().getFullYear()} Psicomorfosis · Todos los derechos reservados</p>
            <p className="inline-flex items-center gap-1.5">
              Hecho con <Heart className="h-3 w-3 text-brand-700" /> en Cartagena
            </p>
          </div>
        </div>
      </div>
    </footer>
  );
}
