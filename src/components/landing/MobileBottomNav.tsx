import { motion } from "framer-motion";
import { Home, LayoutGrid, Palette, Users, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { easeOutExpo } from "./motion";

/**
 * Bottom-nav fijo solo en mobile. En desktop el LandingHeader cumple
 * la función; en mobile el header se ve solo arriba y desaparece al
 * hacer scroll del usuario hacia abajo, así que necesitamos una
 * forma de saltar entre secciones sin volver al top.
 *
 * Estilo "iOS tab bar": píldora flotante con backdrop blur, sombra
 * suave, íconos compactos. Solo md:hidden.
 */
const ITEMS: { href: string; label: string; icon: typeof Home }[] = [
  { href: "#hero", label: "Inicio", icon: Home },
  { href: "#capabilities", label: "Plataforma", icon: LayoutGrid },
  { href: "#estilo", label: "Estilo", icon: Palette },
  { href: "#developers", label: "Nosotros", icon: Users },
  { href: "#demo", label: "Acceso", icon: ArrowRight },
];

export function MobileBottomNav() {
  return (
    <motion.nav
      initial={{ y: 80, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.6, ease: easeOutExpo, delay: 1.5 }}
      className={cn(
        "md:hidden fixed bottom-3 inset-x-3 z-40",
        "rounded-2xl border border-line-200/70 bg-surface/85 backdrop-blur-md",
        "shadow-2xl shadow-black/10",
      )}
      aria-label="Navegación rápida"
    >
      <ul className="flex items-center justify-around h-14 px-2">
        {ITEMS.map((item) => (
          <li key={item.href} className="flex-1">
            <a
              href={item.href}
              className="flex flex-col items-center justify-center gap-0.5 h-full text-ink-700 hover:text-brand-700 active:scale-95 transition-all"
            >
              <item.icon className="h-4 w-4" />
              <span className="text-[10px] font-medium leading-none">
                {item.label}
              </span>
            </a>
          </li>
        ))}
      </ul>
    </motion.nav>
  );
}
