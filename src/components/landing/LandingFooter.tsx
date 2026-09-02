import { Link } from "@tanstack/react-router";
import { Logo } from "@/components/app/Logo";
import { Mail, Heart } from "lucide-react";
import { WhatsAppIcon } from "./BrandIcons";

/**
 * Footer de la landing (rediseño 2 sep 2026): bloque de marca +
 * columnas Producto / Cuenta / Legal, y barra inferior de copyright.
 * Todos los anclajes apuntan a secciones que existen en la landing
 * actual. En móvil conserva el pb extra para el bottom-nav fijo.
 */

const PRODUCTO = [
  { href: "#capabilities", label: "La plataforma" },
  { href: "#flujo", label: "Así fluye una cita" },
  { href: "#estilo", label: "Temas y estilo" },
  { href: "#precios", label: "Precios" },
];

const CUENTA = [
  { href: "#demo", label: "Crear mi cuenta", anchor: true },
  { to: "/login", label: "Iniciar sesión" },
  { to: "/p/login", label: "Portal del paciente" },
];

export function LandingFooter() {
  return (
    <footer className="border-t border-line-100 bg-bg-50 pb-24 md:pb-0">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-10 md:gap-8">
          {/* Marca */}
          <div className="md:col-span-5 max-w-sm">
            <div className="flex items-center gap-3">
              <Logo className="h-8 w-8 text-brand-700" />
              <div>
                <p className="font-serif text-xl text-ink-900 leading-none">Psicomorfosis</p>
                <p className="text-xs text-ink-500 mt-1">Plataforma clínica para psicólogos · Colombia 🇨🇴</p>
              </div>
            </div>
            <p className="mt-4 text-sm text-ink-500 leading-relaxed">
              Pacientes, agenda, historia clínica, documentos, psicometría y
              seguimiento terapéutico en un solo lugar — construida con
              psicólogos colombianos.
            </p>
            <div className="mt-5 flex items-center gap-2">
              <a
                href="mailto:hola@psicomorfosis.co"
                className="inline-flex items-center gap-2 h-9 px-3.5 rounded-lg border border-line-200 bg-surface text-xs font-medium text-ink-700 hover:border-brand-400 hover:text-brand-700 transition-colors"
              >
                <Mail className="h-3.5 w-3.5" /> hola@psicomorfosis.co
              </a>
              <a
                href="https://wa.me/573127268780"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 h-9 px-3.5 rounded-lg border border-line-200 bg-surface text-xs font-medium text-ink-700 hover:border-brand-400 hover:text-brand-700 transition-colors"
              >
                <WhatsAppIcon className="h-3.5 w-3.5 text-[#25D366]" /> WhatsApp
              </a>
            </div>
          </div>

          {/* Columnas de enlaces */}
          <div className="md:col-span-7 grid grid-cols-2 sm:grid-cols-3 gap-8">
            <nav aria-label="Producto">
              <p className="text-[11px] uppercase tracking-widest text-ink-400 font-semibold mb-3.5">Producto</p>
              <ul className="space-y-2.5 text-sm">
                {PRODUCTO.map((l) => (
                  <li key={l.href}>
                    <a href={l.href} className="text-ink-700 hover:text-brand-700 transition-colors">{l.label}</a>
                  </li>
                ))}
              </ul>
            </nav>
            <nav aria-label="Cuenta">
              <p className="text-[11px] uppercase tracking-widest text-ink-400 font-semibold mb-3.5">Cuenta</p>
              <ul className="space-y-2.5 text-sm">
                {CUENTA.map((l) => (
                  <li key={l.label}>
                    {"to" in l && l.to ? (
                      <Link to={l.to} className="text-ink-700 hover:text-brand-700 transition-colors">{l.label}</Link>
                    ) : (
                      <a href={l.href} className="text-ink-700 hover:text-brand-700 transition-colors">{l.label}</a>
                    )}
                  </li>
                ))}
              </ul>
            </nav>
            <nav aria-label="Legal">
              <p className="text-[11px] uppercase tracking-widest text-ink-400 font-semibold mb-3.5">Legal</p>
              <ul className="space-y-2.5 text-sm">
                <li>
                  <Link to="/privacidad" className="text-ink-700 hover:text-brand-700 transition-colors">Política de privacidad</Link>
                </li>
                <li>
                  <Link to="/terminos" className="text-ink-700 hover:text-brand-700 transition-colors">Términos de uso</Link>
                </li>
              </ul>
              <p className="mt-5 text-[11px] text-ink-400 leading-relaxed">
                Habeas Data (Ley 1581/2012) · Historia clínica (Res. 1995/1999) · Secreto profesional
              </p>
            </nav>
          </div>
        </div>

        {/* Barra inferior */}
        <div className="mt-12 pt-6 border-t border-line-100 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs text-ink-400">
          <p>© {new Date().getFullYear()} Psicomorfosis · Todos los derechos reservados</p>
          <p className="inline-flex items-center gap-1.5">
            Hecho con <Heart className="h-3 w-3 text-brand-700" aria-label="amor" /> en Cartagena, Colombia
          </p>
        </div>
      </div>
    </footer>
  );
}
