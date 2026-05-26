import { cn } from "@/lib/utils";
import { Heart, MessageSquareQuote } from "lucide-react";
import { useScrollReveal } from "./useScrollReveal";
import { SectionHeader } from "./Features";

/**
 * Sección de credibilidad / "por qué nosotros".
 * Mini-cita testimonio (Nathaly) — anónima como acordamos. Si más
 * adelante tenemos su consentimiento explícito ponemos su nombre.
 */
export function WhyUs() {
  const { ref, revealed } = useScrollReveal<HTMLDivElement>();
  return (
    <section id="why" className="py-20 sm:py-28">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <SectionHeader
          eyebrow="Por qué Psicomorfosis"
          title="No es Notion con plantillas. Es la primera plataforma clínica que entiende la consulta colombiana."
        />

        <div
          ref={ref}
          className={cn(
            "mt-16 grid grid-cols-1 md:grid-cols-2 gap-6",
            "transition-all duration-700 ease-out",
            revealed ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8",
          )}
        >
          {/* Bloque 1: testimonio */}
          <div className="rounded-2xl bg-brand-50/40 border border-brand-700/15 p-8">
            <MessageSquareQuote className="h-7 w-7 text-brand-700" />
            <p className="mt-4 font-serif text-xl text-ink-900 leading-relaxed">
              "Antes pasaba dos horas al día solo gestionando WhatsApps, agendando citas y pasando tests al Excel. Ahora todo está aquí — y mis pacientes también."
            </p>
            <p className="mt-4 text-sm text-ink-500">
              — Psicóloga clínica usando Psicomorfosis hace 6 semanas
            </p>
          </div>

          {/* Bloque 2: hecho en Colombia / con psicólogas */}
          <div className="rounded-2xl bg-bg-50/40 border border-line-200 p-8">
            <Heart className="h-7 w-7 text-brand-700" />
            <h3 className="mt-4 font-serif text-2xl text-ink-900 leading-tight">
              Hecha en Colombia, con psicólogas reales
            </h3>
            <p className="mt-3 text-sm text-ink-700 leading-relaxed">
              Cada función nace de una conversación con una psicóloga clínica en ejercicio.
              No suponemos qué necesitas: nos lo dices y lo construimos.
            </p>
            <ul className="mt-5 space-y-2 text-sm text-ink-700">
              <li className="flex items-start gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-brand-700 mt-2 shrink-0" />
                Soporte directo por WhatsApp (no tickets)
              </li>
              <li className="flex items-start gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-brand-700 mt-2 shrink-0" />
                Plantillas pre-configuradas para consulta colombiana
              </li>
              <li className="flex items-start gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-brand-700 mt-2 shrink-0" />
                Cumple normativa local sin pasos extra
              </li>
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}
